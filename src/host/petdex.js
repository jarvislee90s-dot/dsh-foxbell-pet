// petdex.js — Petdex 在线仓库宿主侧代理：链接解析、清单匹配、zip 下载。
// 对齐 MAM services/pet/petdex.rs；网络栈换 Node fetch（rc.1 宿主 = Node ≥18）。
// 安全面：强制 https + 域名 allowlist（每跳重定向重新校验）、响应大小上限、8s 超时。
import fs from 'node:fs'
import { PetError } from './errors.js'

export const MANIFEST_URL = 'https://petdex.dev/api/manifest'
/** 任务口径：列表与下载均 8s 超时（MAM 为 30s/120s；WebUI 侧收紧，见 NOTES） */
export const PETDEX_TIMEOUT_MS = 8000
/** 下载/清单响应体积上限（MAM P1-1 同值） */
export const MAX_ZIP_BYTES = 50 * 1024 * 1024
export const MAX_MANIFEST_BYTES = 20 * 1024 * 1024
export const MAX_REDIRECTS = 5

/** 仅允许 petdex 域（页面域 + 资产域 + 子域；petdex.dev.evil.com / evil-petdex.dev 均拒） */
export function allowedHost(host) {
  return host === 'petdex.dev' || host === 'www.petdex.dev' || host.endsWith('.petdex.dev')
}

/** 完整 URL 合法性：强制 https + host 白名单（重定向每跳同样适用） */
export function urlAllowed(u) {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && allowedHost(url.hostname)
  } catch { return false }
}

/** 从宠物页链接解析 slug：/pets/<slug>（兼容 /en/pets/<slug>、尾斜杠、query/hash） */
export function parseSlug(rawUrl) {
  let path
  try {
    path = new URL(rawUrl).pathname
  } catch {
    path = String(rawUrl || '').split('?')[0].split('#')[0]
  }
  const segs = path.split('/').filter((s) => s.length > 0)
  const i = segs.indexOf('pets')
  if (i < 0) return null
  const slug = segs[i + 1]
  if (!slug) return null
  if (!/^[A-Za-z0-9-]+$/.test(slug)) return null
  return slug
}

/**
 * 手动跟随重定向的受限 fetch：每跳重新校验 https+白名单，跳数 ≤ MAX_REDIRECTS。
 * Node fetch 的 redirect:'follow' 无法逐跳校验域名，故用 redirect:'manual'。
 */
async function fetchGuarded(url, { timeoutMs, fetchImpl }) {
  let current = url
  for (let hop = 0; ; hop++) {
    if (!urlAllowed(current)) {
      let host = ''
      try { host = new URL(current).hostname } catch { /* keep '' */ }
      if (hop === 0) {
        // 首跳非法：区分「URL 非法」与「域被禁」
        try { new URL(current) } catch (e) {
          throw new PetError('download-url-invalid', `下载地址非法: ${e.message}`).with('err', e.message)
        }
        throw new PetError('host-forbidden', `拒绝非 petdex 域下载: ${current}`).with('host', host)
      }
      throw new PetError('redirect-forbidden', `重定向目标不在 petdex 白名单内: ${current}`).with('host', host)
    }
    if (hop > MAX_REDIRECTS) throw new PetError('redirect-too-many', '重定向次数过多')
    let resp
    try {
      resp = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) {
      const detail = String(e && e.message || e)
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        throw new PetError('download-failed', `请求超时（${timeoutMs}ms）: ${current}`).with('err', detail)
      }
      throw new PetError('download-failed', `下载失败: ${detail}`).with('err', detail)
    }
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location')
      if (!loc) throw new PetError('download-failed', `重定向缺少 location（${resp.status}）`)
      current = new URL(loc, current).toString()
      continue
    }
    return resp
  }
}

/** 流式读取响应体并封顶：Content-Length 预检 + 按块累计，超限即中断（防 OOM） */
async function readCapped(resp, cap, tooLargeCode, what) {
  const cl = Number(resp.headers.get('content-length'))
  if (Number.isFinite(cl) && cl > cap) {
    throw new PetError(tooLargeCode, `${what}体积超限: ${cl} 字节（上限 ${cap}）`)
      .with('actual', String(cl)).with('limit', String(cap))
  }
  const chunks = []
  let total = 0
  const reader = resp.body ? resp.body.getReader() : null
  if (!reader) {
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length > cap) {
      throw new PetError(tooLargeCode, `${what}体积超限（上限 ${cap} 字节）`)
        .with('actual', String(buf.length)).with('limit', String(cap))
    }
    return buf
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > cap) {
      try { await reader.cancel() } catch { /* ignore */ }
      throw new PetError(tooLargeCode, `${what}体积超限（上限 ${cap} 字节）`)
        .with('actual', String(total)).with('limit', String(cap))
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

/** 清单响应双形态（MAM 第九轮 Bug1）：包装对象 {generatedAt,total,pets:[...]} 优先，裸数组兼容 */
export function parseManifestPayload(bytes) {
  let json
  try { json = JSON.parse(bytes.toString('utf8')) } catch (e) {
    throw new PetError('manifest-parse-failed', `petdex 清单解析失败: ${e.message}`).with('err', e.message)
  }
  let list
  if (Array.isArray(json)) list = json
  else if (json && typeof json === 'object' && Array.isArray(json.pets)) list = json.pets
  else throw new PetError('manifest-parse-failed', 'petdex 清单形态未知（既非数组也非 {pets:[]}）')
  return list
    .filter((e) => e && typeof e === 'object' && typeof e.slug === 'string')
    .map((e) => ({
      slug: e.slug,
      displayName: typeof e.displayName === 'string' ? e.displayName : '',
      zipUrl: typeof e.zipUrl === 'string' ? e.zipUrl : '',
      spriteVersionNumber: e.spriteVersionNumber === 1 || e.spriteVersionNumber === 2 ? e.spriteVersionNumber : 0,
    }))
}

/** 拉全量清单（宿主代理；客户端不直连外网） */
export async function fetchManifestList({ fetchImpl = fetch } = {}) {
  let resp
  try {
    resp = await fetchGuarded(MANIFEST_URL, { timeoutMs: PETDEX_TIMEOUT_MS, fetchImpl })
  } catch (e) {
    if (e instanceof PetError && e.code.startsWith('redirect-')) throw e
    if (e instanceof PetError && (e.code === 'download-failed')) {
      throw new PetError('manifest-request-failed', `petdex 清单请求失败: ${e.detail}`).with('err', e.detail)
    }
    throw e
  }
  if (!resp.ok) {
    throw new PetError('manifest-status', `petdex 清单响应异常: HTTP ${resp.status}`).with('err', `HTTP ${resp.status}`)
  }
  const bytes = await readCapped(resp, MAX_MANIFEST_BYTES, 'manifest-too-large', 'petdex 清单')
  return parseManifestPayload(bytes)
}

/** 按 slug 匹配清单条目 */
export async function fetchEntry(slug, opts = {}) {
  const list = await fetchManifestList(opts)
  const hit = list.find((e) => e.slug === slug)
  if (!hit) throw new PetError('pet-not-on-petdex', `petdex 上未找到宠物: ${slug}`).with('slug', slug)
  return hit
}

/** 搜索代理：清单按 slug/displayName 子串过滤（大小写不敏感），截断到 limit */
export async function searchPets(query, { limit = 100, fetchImpl = fetch } = {}) {
  const list = await fetchManifestList({ fetchImpl })
  const q = String(query || '').trim().toLowerCase()
  const hits = q.length === 0
    ? list
    : list.filter((e) => e.slug.toLowerCase().includes(q) || e.displayName.toLowerCase().includes(q))
  return hits.slice(0, limit).map((e) => ({ ...e, hasZip: e.zipUrl.length > 0 }))
}

/** 下载 zip 字节（首跳 https + 白名单，重定向每跳校验，流式封顶） */
export async function downloadZip(zipUrl, { fetchImpl = fetch } = {}) {
  const resp = await fetchGuarded(zipUrl, { timeoutMs: PETDEX_TIMEOUT_MS, fetchImpl })
  if (!resp.ok) {
    throw new PetError('download-status', `下载响应异常: HTTP ${resp.status}`).with('err', `HTTP ${resp.status}`)
  }
  return readCapped(resp, MAX_ZIP_BYTES, 'download-too-large', '下载内容')
}

/** 临时 zip 落盘名（slug 白名单 [a-z0-9-]，pid+计数随机段防并发互踩/路径注入，MAM issue #32-4） */
let tmpCounter = 0
export function tmpZipName(slug) {
  if (typeof slug !== 'string' || slug.length === 0 || !/^[a-z0-9-]+$/.test(slug)) {
    throw new PetError('slug-invalid', '无效的 petdex 标识（仅支持小写字母/数字/连字符）').with('slug', String(slug))
  }
  return `foxbell-petdex-${slug}-${process.pid}-${tmpCounter++}.zip`
}

/**
 * 链接/slug → 暂存：解析 slug → 清单匹配 → 下载 zip → 临时落盘 → 统一 zip 管线。
 * @returns staged + petdex 元数据覆写（suggestedName=slug 等）
 */
export async function stageFromPetdex(urlOrSlug, { staging, tmpDir, fetchImpl = fetch }) {
  const slug = /^[a-z0-9-]+$/.test(String(urlOrSlug || '')) ? String(urlOrSlug) : parseSlug(urlOrSlug)
  if (!slug) throw new PetError('slug-parse-failed', '无法从链接解析宠物标识（期望 https://petdex.dev/pets/<slug>）')
  const entry = await fetchEntry(slug, { fetchImpl })
  if (!entry.zipUrl) throw new PetError('petdex-no-zip', '该宠物没有可下载的压缩包')
  const bytes = await downloadZip(entry.zipUrl, { fetchImpl })
  const tmp = tmpZipName(slug)
  const tmpPath = `${tmpDir}/${tmp}`
  try {
    fs.writeFileSync(tmpPath, bytes)
  } catch (e) {
    throw new PetError('tmp-write-failed', `临时文件写入失败: ${e.message}`).with('err', e.message)
  }
  let staged
  try {
    staged = await staging.stageFromZipPath(tmpPath)
  } finally {
    try { fs.rmSync(tmpPath, { force: true }) } catch { /* best effort */ }
  }
  staged.suggestedName = slug
  if (entry.displayName) staged.suggestedDisplayName = entry.displayName
  staged.spriteVersionNumber = entry.spriteVersionNumber
  return staged
}
