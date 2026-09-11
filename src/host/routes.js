// routes.js — 私有路由族（全部挂 /dyn-pet-foxbell/ 前缀下）。
// 既有 /state /ack /client-diag 语义不变（/state 快照扩展 activePet/pets/guard，
// voices 改为当前激活宠物的语音清单）；新增宠物列表/资产/导入/管理/激活/Petdex 代理。
// 错误统一 JSON {code, params, detail}；POST 路由做 Origin 校验（同源页面才可信）。
import fs from 'node:fs'
import path from 'node:path'
import { PetError, internal, statusOfCode } from './errors.js'
import { validatePetId, petIdProblem, BUILTIN_PET_ID } from './petid.js'
import { loadManifest, writeManifest, parseManifest, isVoiceRel, VOICE_GROUPS, AUDIO_EXTS, SHEET_FILE, MANIFEST_FILE, MAX_AUDIO_BYTES } from './manifest.js'
import { scanPet, listPets, listCodexPets, renamePet, deletePet, validatePetName, isRealPetDir } from './scan.js'
import { stageFromFolder, stageFromZip, stageFromCodex, listStagedVoice, writeAudioInto, removeAudio, finalizeImport, cancelImport, stagingDirOf, uid } from './staging.js'
import { checkPet } from './guard.js'
import * as petdex from './petdex.js'

export const ROUTE_PREFIX = '/dyn-pet-foxbell'
const MAX_JSON_BODY = 1 * 1024 * 1024          // JSON 请求体上限 1MB
const MAX_FOLDER_UPLOAD_BODY = 140 * 1024 * 1024 // 文件夹上传（base64 JSON）：100MB 逻辑上限 × 4/3 编码膨胀 + 余量
const MAX_ZIP_UPLOAD = 100 * 1024 * 1024        // zip 上传上限（与解压总量上限同值）

const AUDIO_CONTENT_TYPE = {
  m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
  ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
}

function json(res, body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const bytes = Buffer.byteLength(text)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(bytes), 'cache-control': 'no-store' })
  res.end(text)
}

function errJson(res, err) {
  const e = err instanceof PetError ? err : internal(String(err && err.message || err))
  json(res, { code: e.code, params: e.params || {}, detail: e.detail }, statusOfCode(e.code))
}

/** 限长读请求体为 Buffer（zip/音频上传）；超限抛 PetError */
function readBodyBytes(req, cap, code) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (c) => {
      total += c.length
      if (total > cap) {
        reject(new PetError(code, `请求体超限（>${cap} 字节）`).with('limit', String(cap)))
        try { req.destroy() } catch { /* ignore */ }
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', (e) => reject(internal(`读取请求体失败: ${e.message}`)))
  })
}

async function readJsonBody(req, cap = MAX_JSON_BODY) {
  const bytes = await readBodyBytes(req, cap, 'manifest-too-large')
  if (bytes.length === 0) return {}
  try { return JSON.parse(bytes.toString('utf8')) } catch (e) {
    throw new PetError('manifest-parse-failed', `请求体不是合法 JSON: ${e.message}`).with('err', e.message)
  }
}

/** Origin 校验：带 Origin 头的跨源 POST 一律拒绝（同源/无 Origin 的老客户端放行） */
function originOk(req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return true
  const host = req.headers.host
  if (typeof host !== 'string') return true
  try {
    const u = new URL(origin)
    return u.host === host
  } catch { return false }
}

function sendFile(res, filePath, contentType, cache) {
  let st
  // lstat：symlink 叶子不跟随（voice/sheet 文件被链到商店外时拒绝伺服）
  try { st = fs.lstatSync(filePath) } catch {
    throw new PetError('pet-not-found', `文件不存在: ${filePath}`)
  }
  if (st.isSymbolicLink() || !st.isFile()) throw new PetError('pet-not-found', `不是文件: ${filePath}`)
  const bytes = fs.readFileSync(filePath)
  res.writeHead(200, { 'content-type': contentType, 'content-length': String(bytes.length), 'cache-control': cache })
  res.end(bytes)
}

/**
 * 注册全部路由。
 * @param ctx cordis 上下文（webServer 在场才调用）
 * @param env {
 *   pkgDir, petsRoot, stagingRoot, trashRoot, codexRoot, tmpDir,
 *   stateEngine, snapshotExtra(), builtin: { manifest, assetDir },
 *   getActivePetId(), diag
 * }
 */
export function registerRoutes(ctx, env) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const reg = (route) => ctx.effect(() => webServer.register(route))

  /** 宠物目录解析：内置 foxbell → 包内 assets；外部 → petsRoot/<id>（id 白名单校验 +
   *  symlink 目录视为不存在——按 id 寻址不逃逸商店根） */
  const petDirOf = (id) => {
    if (id === BUILTIN_PET_ID) return env.builtin.assetDir
    validatePetId(id)
    const dir = path.join(env.petsRoot, id)
    if (!isRealPetDir(dir)) throw new PetError('pet-not-found', `宠物不存在: ${id}`).with('id', id)
    return dir
  }

  const manifestOf = (id) => {
    if (id === BUILTIN_PET_ID) return env.builtin.manifest
    return loadManifest(path.join(env.petsRoot, id), { id })
  }

  // ---------- 既有路由（语义不变；/state 快照扩展） ----------
  reg({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/state`,
    handler(req, res) {
      try {
        // ?pet=<id> 仅为无 settings 服务降级部署的激活提示（白名单校验在宿主 index.js）；
        // settings 在场时被忽略（配置为唯一事实源）——既有 GET /state 语义不变。
        // ?since=<rev>（v2.2 Task 6 / P3）：内容修订号命中 → 微型响应。
        let hint = null
        let since = null
        try {
          const u = new URL(req.url || '/', 'http://x')
          hint = u.searchParams.get('pet')
          since = u.searchParams.get('since')
        } catch { /* ignore */ }
        // P3 短路（Task 6）：聚合每轮必跑（P1 指纹缓存已把 compute 降为廉价操作）——
        // 短路省的是 JSON.stringify + 传输 + 客户端解析，不是聚合。ages 现取自本轮
        // compute 后的 list()，绝不复用上一轮的旧 ages（age 不参与 rev，时钟推进时
        // rev 不变而 ages 刷新）。无 since 参数的旧客户端完全不进此分支（行为逐字节不变）。
        const engine = env.stateEngine
        const revEngine = engine && typeof engine.contentRev === 'function' ? engine : null
        if (revEngine !== null && since !== null) {
          revEngine.compute()
          const rev = revEngine.contentRev()
          if (typeof rev === 'string' && since === rev) {
            json(res, { rev, unchanged: true, ages: revEngine.list().map((p) => p.age || ''), seq: revEngine.nextSeq() })
            return
          }
        }
        const body = env.snapshotExtra(hint)
        // 全量快照：既有数值 seq（completions 序号）保持不变（客户端 snap.seq typeof 校验），
        // 顶层附加字符串 rev 供 Task 8 客户端下一轮 ?since 回传（additive，不改既有形状）
        if (revEngine !== null) {
          const rev = revEngine.contentRev()
          if (typeof rev === 'string') body.rev = rev
        }
        json(res, body)
      } catch (e) { errJson(res, e) }
    },
  })
  reg({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/ack`,
    handler(req, res) {
      let agentId = null
      try {
        const u = new URL(req.url || '/', 'http://x')
        agentId = u.searchParams.get('agentId')
      } catch { /* ignore */ }
      if (typeof agentId === 'string') env.stateEngine.ack(agentId)
      json(res, { ok: true })
    },
  })
  reg({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/client-diag`,
    handler(req, res) {
      try {
        const u = new URL(req.url || '/', 'http://x')
        const v = u.searchParams.get('visible')
        if (v === '0' || v === '1') env.diag.clientVisible = v
      } catch { /* ignore */ }
      json(res, { ok: true })
    },
  })

  // ---------- 效率看板跨日区间（v2.2 Task 6 / R3）：Task 2 summarizeRange 形状 ----------
  reg({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/dashboard/range`,
    handler(req, res) {
      try {
        const u = new URL(req.url || '/', 'http://x')
        const from = u.searchParams.get('from') || ''
        const to = u.searchParams.get('to') || ''
        // 格式 + 真实日历日（2026-02-30 型拒绝，防下游 shiftDayKey 静默滚日）+ from<=to
        const cal = (s) => {
          const d = new Date(s + 'T00:00:00')
          return !Number.isNaN(d.getTime())
            && d.getFullYear() === Number(s.slice(0, 4))
            && d.getMonth() + 1 === Number(s.slice(5, 7))
            && d.getDate() === Number(s.slice(8, 10))
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !cal(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !cal(to) || from > to) {
          throw new PetError('bad-request', 'from/to 需为真实日历日 YYYY-MM-DD 且 from<=to').with('from', from).with('to', to)
        }
        // 跨度天数（本地零点之差；DST 23/25h 日由 round 吸收），含首尾，上限 31
        const days = Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000) + 1
        if (days > 31) throw new PetError('bad-request', '跨度最长 31 天').with('days', String(days))
        json(res, env.stateEngine.rangeSummary(from, to))
      } catch (e) { errJson(res, e) }
    },
  })

  // ---------- 宠物资产（GET，prefix 派发；内置 foxbell 映射到包内 assets） ----------
  reg({
    kind: 'prefix',
    path: `${ROUTE_PREFIX}/pets`,
    handler(req, res) {
      try {
        const u = new URL(req.url || '/', 'http://x')
        const segs = decodeURIComponent(u.pathname).split('/').filter(Boolean)
        // segs: ['dyn-pet-foxbell','pets', ...rest]
        const rest = segs.slice(2)
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new PetError('origin-forbidden', '资产路由仅支持 GET')
        if (rest.length === 0) {
          // GET /pets → 已安装摘要（内置 foxbell 恒第一张）
          const builtinSummary = {
            id: BUILTIN_PET_ID,
            displayName: env.builtin.manifest ? env.builtin.manifest.displayName : 'Foxbell',
            description: env.builtin.manifest ? env.builtin.manifest.description : '',
            source: 'builtin',
            spriteVersionNumber: env.builtin.manifest ? env.builtin.manifest.spriteVersionNumber : 2,
            hasVoice: env.builtin.manifest ? env.builtin.manifest.hasVoice : true,
            hasSubtitle: env.builtin.manifest ? env.builtin.manifest.hasSubtitle : true,
            manifestExists: env.builtin.manifest !== null,
            spritesheetExists: env.builtin.spriteBytes !== null,
            dir: env.builtin.assetDir,
            builtin: true,
          }
          const external = listPets(env.petsRoot).map((s) => ({ ...s, builtin: false }))
          json(res, { pets: [builtinSummary, ...external] })
          return
        }
        const id = rest[0]
        const dir = petDirOf(id)
        if (rest.length === 2 && rest[1] === 'manifest.json') {
          const m = id === BUILTIN_PET_ID ? env.builtin.manifest : loadManifest(dir, { id })
          if (!m) throw new PetError('manifest-parse-failed', `manifest 缺失或损坏: ${id}`)
          json(res, m)
          return
        }
        if (rest.length === 2 && rest[1] === SHEET_FILE) {
          sendFile(res, path.join(dir, SHEET_FILE), 'image/webp', id === BUILTIN_PET_ID ? 'public, max-age=3600' : 'no-store')
          return
        }
        if (rest.length === 4 && rest[1] === 'voice' && VOICE_GROUPS.includes(rest[2])) {
          const file = rest[3]
          const rel = `voice/${rest[2]}/${file}`
          if (!isVoiceRel(rel)) throw new PetError('audio-relpath-invalid', '非法音频路径')
          const p = path.join(dir, rel)
          const relCheck = path.relative(dir, p)
          if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) throw new PetError('audio-relpath-invalid', '非法音频路径')
          const ext = path.extname(file).slice(1).toLowerCase()
          sendFile(res, p, AUDIO_CONTENT_TYPE[ext] || 'application/octet-stream', id === BUILTIN_PET_ID ? 'public, max-age=3600' : 'no-store')
          return
        }
        throw new PetError('pet-not-found', `未知资产路径: /${rest.join('/')}`)
      } catch (e) { errJson(res, e) }
    },
  })

  // ---------- 暂存区资产（GET，向导图集预览与音频时长探测） ----------
  reg({
    kind: 'prefix',
    path: `${ROUTE_PREFIX}/staging`,
    handler(req, res) {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new PetError('origin-forbidden', '暂存资产路由仅支持 GET')
        const u = new URL(req.url || '/', 'http://x')
        const segs = decodeURIComponent(u.pathname).split('/').filter(Boolean).slice(2)
        if (segs.length < 2) throw new PetError('staging-id-invalid', '非法暂存区路径')
        const staging = stagingDirOf(env.stagingRoot, segs[0])
        const rest = segs.slice(1)
        if (rest.length === 1 && rest[0] === SHEET_FILE) {
          sendFile(res, path.join(staging, SHEET_FILE), 'image/webp', 'no-store')
          return
        }
        if (rest.length === 3 && rest[0] === 'voice' && VOICE_GROUPS.includes(rest[1])) {
          const rel = `voice/${rest[1]}/${rest[2]}`
          if (!isVoiceRel(rel)) throw new PetError('audio-relpath-invalid', '非法音频路径')
          const ext = path.extname(rest[2]).slice(1).toLowerCase()
          sendFile(res, path.join(staging, rel), AUDIO_CONTENT_TYPE[ext] || 'application/octet-stream', 'no-store')
          return
        }
        if (rest.length === 1 && rest[0] === 'list') {
          json(res, { stagingId: segs[0], voiceFiles: listStagedVoice(staging), spritesheet: fs.existsSync(path.join(staging, SHEET_FILE)) })
          return
        }
        throw new PetError('staging-not-found', `未知暂存路径: /${rest.join('/')}`)
      } catch (e) { errJson(res, e) }
    },
  })

  // ---------- 音效静态（v2.2 Task 6 / R7 前置）：包内 assets/sounds/<file>，白名单防穿越 ----------
  // path 无尾斜杠：harness matcher 的 prefix 语义是 p === pathname 或 pathname 以 p+'/' 开头
  // （注册 p 带尾斜杠则永远不派发——E2E 真机发现的 404）；handler 自行切段（3 段校验不受影响）。
  reg({
    kind: 'prefix',
    path: `${ROUTE_PREFIX}/sounds`,
    handler(req, res) {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new PetError('origin-forbidden', '音效路由仅支持 GET')
        const u = new URL(req.url || '/', 'http://x')
        let segs
        try { segs = decodeURIComponent(u.pathname).split('/').filter(Boolean) } catch {
          throw new PetError('bad-request', '非法音效路径')
        }
        // segs: ['dyn-pet-foxbell','sounds', <file>]；单段小写字母数字连字符 + .wav
        // （白名单拒绝路径分隔/穿越/大写/空格；文件名不含目录成分，path.join 无逃逸面）
        const file = segs.length === 3 ? segs[2] : ''
        if (!/^[a-z0-9-]+\.wav$/.test(file)) throw new PetError('bad-request', '非法音效文件名').with('file', file)
        // sendFile 与姊妹资产路由同管道：lstat 拒绝符号链接叶子，缺失 → pet-not-found(404)
        sendFile(res, path.join(env.pkgDir, 'assets', 'sounds', file), 'audio/wav', 'public, max-age=86400')
      } catch (e) { errJson(res, e) }
    },
  })

  // ---------- 导入与管理 API（POST 一律 Origin 校验 + 异步包裹） ----------
  const api = (name, handler) => reg({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/api/${name}`,
    async handler(req, res) {
      try {
        if (req.method !== 'POST') {
          if (handler.get) { json(res, await handler.get(req)); return }
          throw new PetError('origin-forbidden', `${name} 仅支持 POST`)
        }
        if (!originOk(req)) throw new PetError('origin-forbidden', '拒绝跨源请求')
        json(res, await handler.post(req))
      } catch (e) { errJson(res, e) }
    },
  })

  // 四来源导入：folder / zip / codex / petdex
  api('import-folder', {
    async post(req) {
      const body = await readJsonBody(req)
      const src = String(body.path || '')
      if (!path.isAbsolute(src)) throw new PetError('source-not-folder', '需要服务端绝对路径')
      return stageFromFolder(env.petsRoot, env.stagingRoot, src)
    },
  })
  api('import-zip', {
    async post(req) {
      const bytes = await readBodyBytes(req, MAX_ZIP_UPLOAD, 'zip-total-over-limit')
      fs.mkdirSync(env.stagingRoot, { recursive: true })
      const tmp = path.join(env.stagingRoot, `upload-${uid()}.zip`)
      try {
        fs.writeFileSync(tmp, bytes)
        return await stageFromZip(env.petsRoot, env.stagingRoot, tmp)
      } finally {
        try { fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
      }
    },
  })
  // 浏览器文件夹上传（webkitdirectory）：JSON {files:[{rel,name,size,data(base64)}]}
  // 宿主按 folder 同管线落暂存：仅收 spritesheet.webp / pet.json / voice/<group>/<file>，
  // 条目路径防穿越（rel 净化 + 白名单形态），总量/文件数与 zip 同限。
  api('import-folder-files', {
    async post(req) {
      const body = await readJsonBody(req, MAX_FOLDER_UPLOAD_BODY)
      const files = Array.isArray(body.files) ? body.files : []
      if (files.length === 0) throw new PetError('source-not-folder', '上传文件列表为空')
      if (files.length > 200) throw new PetError('zip-too-many-entries', '上传文件数超限（>200）').with('limit', '200')
      fs.mkdirSync(env.stagingRoot, { recursive: true })
      // 落一个临时目录再复用 folder 管线（图集定位/voice 三段规则/pet.json 预填同源）
      const tmpRoot = path.join(env.stagingRoot, `upload-dir-${uid()}`)
      let total = 0
      try {
        let hasSheet = false
        for (const f of files) {
          const rel = String(f && f.rel || '').replace(/\\/g, '/')
          const segs = rel.split('/').filter((s) => s.length > 0)
          if (segs.some((s) => s === '..' || s === '.') || path.isAbsolute(rel)) {
            throw new PetError('zip-entry-illegal-path', `上传含非法路径: ${rel}`).with('name', rel)
          }
          const clean = segs.join('/')
          const allowed =
            clean === SHEET_FILE ||
            clean === 'pet.json' ||
            (clean.startsWith('voice/') && isVoiceRel(clean) && AUDIO_EXTS.some((ext) => clean.toLowerCase().endsWith('.' + ext)))
          if (!allowed) continue // 白名单之外的文件静默跳过（与 folder 管线复制规则一致）
          const data = typeof f.data === 'string' ? Buffer.from(f.data, 'base64') : Buffer.alloc(0)
          total += data.length
          if (total > 100 * 1024 * 1024) {
            throw new PetError('zip-total-over-limit', '上传总量超限（>100MB）').with('limit', '100MB')
          }
          const dest = path.join(tmpRoot, clean)
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          fs.writeFileSync(dest, data)
          if (clean === SHEET_FILE) hasSheet = true
        }
        if (!hasSheet) throw new PetError('sheet-not-found', '未找到 spritesheet.webp（根目录或一层子目录）')
        return stageFromFolder(env.petsRoot, env.stagingRoot, tmpRoot)
      } finally {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
      }
    },
  })
  api('codex-list', {
    async post() {
      return { pets: listCodexPets(env.codexRoot, env.petsRoot) }
    },
  })
  api('import-codex', {
    async post(req) {
      const body = await readJsonBody(req)
      return stageFromCodex(env.petsRoot, env.stagingRoot, env.codexRoot, String(body.id || ''))
    },
  })
  api('petdex-search', {
    async post(req) {
      const body = await readJsonBody(req)
      return { pets: await petdex.searchPets(String(body.q || ''), { limit: 100, ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}) }) }
    },
  })
  api('import-petdex', {
    async post(req) {
      const body = await readJsonBody(req)
      fs.mkdirSync(env.stagingRoot, { recursive: true })
      return petdex.stageFromPetdex(String(body.url || body.slug || ''), {
        staging: { stageFromZipPath: (p) => stageFromZip(env.petsRoot, env.stagingRoot, p) },
        tmpDir: env.tmpDir,
        ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}),
      })
    },
  })

  // 暂存区音频增删（浏览器上传字节，非本地路径）
  api('staging-voice-add', {
    async post(req) {
      const u = new URL(req.url || '/', 'http://x')
      const sid = u.searchParams.get('sid') || ''
      const group = u.searchParams.get('group') || ''
      const name = u.searchParams.get('name') || 'audio.m4a'
      const staging = stagingDirOf(env.stagingRoot, sid)
      const bytes = await readBodyBytes(req, MAX_AUDIO_BYTES, 'audio-format-unsupported')
      if (bytes.length > MAX_AUDIO_BYTES) {
        throw new PetError('audio-format-unsupported', `音频超过 ${MAX_AUDIO_BYTES} 字节上限`)
      }
      const added = writeAudioInto(path.join(staging, 'voice'), name, bytes, group)
      return { added }
    },
  })
  api('staging-voice-remove', {
    async post(req) {
      const body = await readJsonBody(req)
      const staging = stagingDirOf(env.stagingRoot, String(body.sid || ''))
      removeAudio(staging, String(body.rel || ''))
      return { ok: true }
    },
  })

  // 完成/取消导入
  api('import-finalize', {
    async post(req) {
      const body = await readJsonBody(req)
      return finalizeImport(env.petsRoot, env.stagingRoot, String(body.stagingId || ''), String(body.name || ''), body.manifest || {})
    },
  })
  api('import-cancel', {
    async post(req) {
      const body = await readJsonBody(req)
      cancelImport(env.stagingRoot, String(body.stagingId || ''))
      return { ok: true }
    },
  })

  // 正式宠物：语音增删（管理对话框按组编辑，直写正式目录）
  api('voice-add', {
    async post(req) {
      const u = new URL(req.url || '/', 'http://x')
      const id = u.searchParams.get('id') || ''
      const group = u.searchParams.get('group') || ''
      const name = u.searchParams.get('name') || 'audio.m4a'
      if (id === BUILTIN_PET_ID) throw new PetError('pet-name-reserved', '内置宠物不可编辑')
      validatePetId(id)
      const dir = path.join(env.petsRoot, id)
      if (!fs.existsSync(dir)) throw new PetError('pet-not-found', `宠物不存在: ${id}`).with('id', id)
      const bytes = await readBodyBytes(req, MAX_AUDIO_BYTES, 'audio-format-unsupported')
      const added = writeAudioInto(path.join(dir, 'voice'), name, bytes, group)
      return { added }
    },
  })
  api('voice-remove', {
    async post(req) {
      const body = await readJsonBody(req)
      const id = String(body.id || '')
      if (id === BUILTIN_PET_ID) throw new PetError('pet-name-reserved', '内置宠物不可编辑')
      validatePetId(id)
      const dir = path.join(env.petsRoot, id)
      if (!fs.existsSync(dir)) throw new PetError('pet-not-found', `宠物不存在: ${id}`).with('id', id)
      removeAudio(dir, String(body.rel || ''))
      return { ok: true }
    },
  })

  // 清单更新（修复对话「更新清单」/ 管理对话框「保存」；客户端组装 manifest，
  // 含浏览器探测时长；宿主结构校验 + 磁盘大小复核 + 原子写 + .bak）
  api('manifest-update', {
    async post(req) {
      const body = await readJsonBody(req)
      const id = String(body.id || '')
      if (id === BUILTIN_PET_ID) throw new PetError('pet-name-reserved', '内置宠物不可编辑')
      validatePetId(id)
      const dir = path.join(env.petsRoot, id)
      if (!fs.existsSync(dir)) throw new PetError('pet-not-found', `宠物不存在: ${id}`).with('id', id)
      const scan = scanPet(env.petsRoot, id)
      const m = parseManifest({ ...body.manifest, id }, { id })
      // 磁盘复核：清单 voices 与磁盘一一对应；图集大小一致（manifest 缺失修复路径允许 spriteVersionNumber=0 由客户端探测回填）
      if (scan.spritesheet.exists && m.spritesheetSizeBytes > 0 && m.spritesheetSizeBytes !== scan.spritesheet.size) {
        throw new PetError('manifest-invalid', `spritesheetSizeBytes 与磁盘不一致: ${m.spritesheetSizeBytes} != ${scan.spritesheet.size}`)
      }
      const onDisk = new Map(scan.voiceFiles.map((f) => [f.rel, f.size]))
      for (const v of m.voices) {
        if (!onDisk.has(v.file)) throw new PetError('manifest-invalid', `清单语音不在磁盘: ${v.file}`)
        if (onDisk.get(v.file) !== v.sizeBytes) throw new PetError('manifest-invalid', `清单语音大小不一致: ${v.file}`)
      }
      writeManifest(dir, m, { backup: body.backup !== false })
      return { ok: true, manifest: m }
    },
  })

  // 改名（id 同步目录与 manifest）
  api('rename', {
    async post(req) {
      const body = await readJsonBody(req)
      renamePet(env.petsRoot, String(body.oldId || ''), String(body.newId || ''))
      return { ok: true }
    },
  })

  // 安全删除（二次确认在客户端；宿主移入 .trash，不物理删除）
  api('delete', {
    async post(req) {
      const body = await readJsonBody(req)
      const id = String(body.id || '')
      if (id === BUILTIN_PET_ID) throw new PetError('pet-name-reserved', '内置宠物不可删除')
      const dest = deletePet(env.petsRoot, env.trashRoot, id)
      return { ok: true, trashPath: dest }
    },
  })

  // 扫描（管理对话框/修复对话读磁盘现状）
  api('scan', {
    async post(req) {
      const body = await readJsonBody(req)
      const id = String(body.id || '')
      if (id === BUILTIN_PET_ID) {
        const dir = env.builtin.assetDir
        return { id, dir, spritesheet: { rel: SHEET_FILE, exists: env.builtin.spriteBytes !== null, size: env.builtin.spriteBytes ? env.builtin.spriteBytes.length : 0 }, voiceFiles: [], builtin: true }
      }
      return scanPet(env.petsRoot, id)
    },
  })

  // 激活切换：即时完整性校验（MAM activatePet 的宿主半；指针写在客户端 settings）
  api('activate', {
    async post(req) {
      const body = await readJsonBody(req)
      const id = String(body.id || '')
      if (id === BUILTIN_PET_ID) return { status: 'activated', id, voiceCap: true }
      validatePetId(id)
      if (!isRealPetDir(path.join(env.petsRoot, id))) {
        throw new PetError('pet-not-found', `宠物不存在: ${id}`).with('id', id)
      }
      const g = checkPet(env.petsRoot, id)
      if (g.fatal) return { status: 'invalid-sheet', id, issues: g.issues }
      if (g.issues.length > 0) {
        const manifest = manifestOf(id)
        return { status: 'mismatch', id, issues: g.issues, plan: g.plan, manifest }
      }
      const manifest = manifestOf(id)
      return { status: 'activated', id, voiceCap: manifest ? manifest.hasVoice : false }
    },
  })

  // 名称预检（向导实时校验的服务端权威面；客户端已有同规则镜像）
  api('check-name', {
    async post(req) {
      const body = await readJsonBody(req)
      const name = String(body.name || '')
      const selfId = body.selfId === undefined ? null : String(body.selfId)
      const existing = [BUILTIN_PET_ID, ...listPets(env.petsRoot).map((s) => s.id)]
      const p = petIdProblem(name)
      if (p) return { ok: false, problem: p.code }
      const others = existing.filter((id) => id !== selfId)
      if (others.some((id) => id.toLowerCase() === name.toLowerCase())) return { ok: false, problem: 'pet-exists' }
      return { ok: true }
    },
  })

  // 商店目录信息（管理对话框「查看目录路径」）
  api('store-info', {
    async post() {
      return {
        petsRoot: env.petsRoot,
        stagingRoot: env.stagingRoot,
        trashRoot: env.trashRoot,
        codexRoot: env.codexRoot,
      }
    },
  })

  // 校验 helper 复用导出（validate.mjs 静态检查用）
  void validatePetName
  void MANIFEST_FILE
}
