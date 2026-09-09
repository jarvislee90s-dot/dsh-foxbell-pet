// staging.js — 导入暂存管线：四来源暂存（folder/zip/codex/petdex 下载产物共用）、
// 暂存区音频增删、finalize 原子落地、cancel 清理。对齐 MAM services/pet/import.rs。
import fs from 'node:fs'
import path from 'node:path'
import { PetError } from './errors.js'
import { isVoiceRel, isAudioExt, nameFromRel, writeManifest, parseManifest, SHEET_FILE, SCHEMA_VERSION, VOICE_GROUPS } from './manifest.js'
import { validatePetId } from './petid.js'
import { safeUnzip } from './zip.js'
import { validatePetName, listPets } from './scan.js'

/** 暂存 id：时间戳-pid-计数 三段（pid 段防跨进程/重启后同毫秒碰撞，MAM issue #32-2） */
let uidCounter = 0
export function uid() {
  return `${Date.now()}-${process.pid}-${uidCounter++}`
}

function sanitizeName(raw) {
  return String(raw || '').split('').map((c) => (/[A-Za-z0-9_-]/.test(c) ? c : '-')).join('')
}

function stagingDirOf(stagingRootDir, stagingId) {
  if (typeof stagingId !== 'string' || stagingId.includes('..') || stagingId.includes('/') || stagingId.includes('\\') || stagingId.length === 0) {
    throw new PetError('staging-id-invalid', '非法暂存区 id')
  }
  const d = path.join(stagingRootDir, stagingId)
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
    throw new PetError('staging-not-found', '暂存区不存在')
  }
  return d
}

/** 在根目录或一层子目录内定位 spritesheet.webp（根优先，MAM locate_sheet） */
export function locateSheet(srcDir) {
  const direct = path.join(srcDir, SHEET_FILE)
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct
  let entries
  try { entries = fs.readdirSync(srcDir, { withFileTypes: true }) } catch { return null }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const p = path.join(srcDir, e.name, SHEET_FILE)
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  return null
}

/** 复制 voice/ 子树：仅 voice/<group>/<file> 三段合规的合法音频；symlink 跳过、目录链接不入栈 */
function copyVoiceTree(baseDir, dir, destBase) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) { copyVoiceTree(baseDir, p, destBase); continue }
    if (!e.isFile()) continue
    if (!isAudioExt(p)) continue
    const rel = path.relative(baseDir, p).split(path.sep).join('/')
    if (!isVoiceRel(`voice/${rel}`)) continue
    const dest = path.join(destBase, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    try {
      fs.copyFileSync(p, dest)
    } catch (err) {
      throw new PetError('copy-failed', `复制音频失败: ${err.message}`).with('err', err.message)
    }
  }
}

/** 暂存区内收集 voice 文件清单（仅三段合规；symlink 跳过） */
export function listStagedVoice(staging) {
  const out = []
  const stack = [path.join(staging, 'voice')]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) { stack.push(p); continue }
      if (!e.isFile()) continue
      const rel = path.relative(staging, p).split(path.sep).join('/')
      if (!isVoiceRel(rel)) continue
      let size = 0
      try { size = fs.statSync(p).size } catch { continue }
      out.push({ group: rel.split('/')[1], name: nameFromRel(rel), file: rel, sizeBytes: size })
    }
  }
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  return out
}

function finishStaged(staging, suggestedName, suggestedDisplayName, spriteVersionNumber) {
  let sheetSize = 0
  try { sheetSize = fs.statSync(path.join(staging, SHEET_FILE)).size } catch { /* 缺失时 0，finalize 会拒 */ }
  return {
    stagingId: path.basename(staging),
    suggestedName,
    suggestedDisplayName,
    spriteVersionNumber,
    spritesheetSize: sheetSize,
    voiceFiles: listStagedVoice(staging),
  }
}

/** 读来源目录 pet.json（codex 元数据透传；仅用于向导预填） */
function codexMeta(dir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf8'))
    const displayName = typeof j.displayName === 'string' ? j.displayName : ''
    const v = j.spriteVersionNumber === 1 || j.spriteVersionNumber === 2 ? j.spriteVersionNumber : 0
    return [displayName, v]
  } catch { return ['', 0] }
}

/**
 * 文件夹来源暂存：定位图集 → 复制图集 + voice/ → 返回暂存描述。
 * 任何复制失败整体回滚（删暂存目录）。
 */
export function stageFromFolder(petsRootDir, stagingRootDir, srcDir) {
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    throw new PetError('source-not-folder', '来源不是文件夹')
  }
  const sheet = locateSheet(srcDir)
  if (sheet === null) throw new PetError('sheet-not-found', '未找到 spritesheet.webp（根目录或一层子目录）')
  const sheetRoot = path.dirname(sheet)
  const staging = path.join(stagingRootDir, uid())
  fs.mkdirSync(staging, { recursive: true })
  try {
    fs.copyFileSync(sheet, path.join(staging, SHEET_FILE))
    const voiceRoot = path.join(sheetRoot, 'voice')
    if (fs.existsSync(voiceRoot) && fs.statSync(voiceRoot).isDirectory()) {
      copyVoiceTree(voiceRoot, voiceRoot, path.join(staging, 'voice'))
    }
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw e
  }
  const [disp, ver] = codexMeta(sheetRoot)
  const suggestedName = sanitizeName(path.basename(sheetRoot)) || 'pet'
  return finishStaged(staging, suggestedName, disp, ver)
}

/** zip 来源暂存：解压到 staging 下 extract 目录 → 复用文件夹管线 → 清理 */
export async function stageFromZip(petsRootDir, stagingRootDir, zipPath) {
  if (!fs.existsSync(zipPath) || !fs.statSync(zipPath).isFile()) {
    throw new PetError('source-not-folder', '压缩包不存在')
  }
  const extract = path.join(stagingRootDir, `extract-${uid()}`)
  try {
    await safeUnzip(zipPath, extract)
  } catch (e) {
    fs.rmSync(extract, { recursive: true, force: true })
    throw e
  }
  let staged
  try {
    staged = stageFromFolder(petsRootDir, stagingRootDir, extract)
  } finally {
    fs.rmSync(extract, { recursive: true, force: true })
  }
  return staged
}

/** codex 来源暂存：~/.codex/pets/<id> 走文件夹管线 */
export function stageFromCodex(petsRootDir, stagingRootDir, codexRootDir, codexId) {
  validatePetId(codexId) // 防 `../x` 读侧逃逸
  const src = path.join(codexRootDir, codexId)
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    throw new PetError('pet-not-found', `codex 宠物不存在: ${codexId}`).with('id', codexId)
  }
  return stageFromFolder(petsRootDir, stagingRootDir, src)
}

/** 组目录内选一个不存在的落盘名：原名 → -2 → -3…（跳过已占位序号，不覆盖不留空洞） */
export function uniqueDest(groupDir, fileName) {
  const candidate = path.join(groupDir, fileName)
  if (!fs.existsSync(candidate)) return candidate
  const ext = path.extname(fileName)
  const stem = path.basename(fileName, ext)
  for (let n = 2; ; n++) {
    const c = path.join(groupDir, `${stem}-${n}${ext}`)
    if (!fs.existsSync(c)) return c
  }
}

/**
 * 单个音频复制进目标 voice/<group>/（暂存与正式目录共用）。
 * @param destVoice <base>/voice 目录
 * @param srcPath 源音频文件绝对路径
 * @param group 分组名
 */
export function copyAudioInto(destVoice, srcPath, group) {
  if (!VOICE_GROUPS.includes(group)) {
    throw new PetError('group-invalid', `非法分组: ${group}`).with('group', group)
  }
  if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) {
    throw new PetError('audio-not-found', `音频文件不存在: ${srcPath}`).with('path', srcPath)
  }
  if (!isAudioExt(srcPath)) {
    throw new PetError('audio-format-unsupported', `不支持的音频格式: ${srcPath}`).with('path', srcPath)
  }
  const fileName = path.basename(srcPath)
  const groupDir = path.join(destVoice, group)
  fs.mkdirSync(groupDir, { recursive: true })
  const dest = uniqueDest(groupDir, fileName)
  try {
    fs.copyFileSync(srcPath, dest)
  } catch (e) {
    throw new PetError('copy-failed', `复制音频失败: ${e.message}`).with('err', e.message)
  }
  const destName = path.basename(dest)
  let size = 0
  try { size = fs.statSync(dest).size } catch { /* keep 0 */ }
  return { group, name: nameFromRel(destName), file: `voice/${group}/${destName}`, sizeBytes: size }
}

/**
 * 浏览器上传的音频字节直接落盘（WebUI 无本地文件路径可用，区别于 MAM 的 src_paths）。
 * 与 copyAudioInto 同一去重/校验规则；文件名来自上传方，先做基名净化。
 */
export function writeAudioInto(destVoice, fileName, bytes, group) {
  if (!VOICE_GROUPS.includes(group)) {
    throw new PetError('group-invalid', `非法分组: ${group}`).with('group', group)
  }
  const rawName = String(fileName || '')
  const base = path.basename(rawName.replace(/\\/g, '/'))
  // 穿越形态显式拒绝（纵深防御：即使 basename 已能中和，也按任务安全口径回错误码）
  if (base.length === 0 || base === '.' || base === '..' || rawName.includes('..') || rawName.includes('/') || rawName.includes('\\')) {
    throw new PetError('audio-relpath-invalid', '非法音频文件名')
  }
  if (!isAudioExt(base)) {
    throw new PetError('audio-format-unsupported', `不支持的音频格式: ${base}`).with('path', base)
  }
  const groupDir = path.join(destVoice, group)
  fs.mkdirSync(groupDir, { recursive: true })
  const dest = uniqueDest(groupDir, base)
  fs.writeFileSync(dest, bytes)
  const destName = path.basename(dest)
  return { group, name: nameFromRel(destName), file: `voice/${group}/${destName}`, sizeBytes: bytes.length }
}

/**
 * 删除音频（暂存区或正式目录）。rel 必须形如 voice/<group>/<file>、分组 ∈ 四固定分组
 * 且无穿越（MAM remove_audio_in：三段规则 + `..`/反斜杠显式拒绝纵深防御）。
 */
export function removeAudio(baseDir, rel) {
  if (typeof rel !== 'string' || rel.includes('..') || rel.includes('\\') || !isVoiceRel(rel)) {
    throw new PetError('audio-relpath-invalid', '非法音频路径')
  }
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    throw new PetError('pet-dir-missing', '目录不存在')
  }
  const p = path.join(baseDir, rel)
  // 包含关系复核（纵深防御）
  const relCheck = path.relative(baseDir, p)
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    throw new PetError('audio-relpath-invalid', '非法音频路径')
  }
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    try {
      fs.unlinkSync(p)
    } catch (e) {
      throw new PetError('delete-failed', `删除音频失败: ${e.message}`).with('err', e.message)
    }
  }
}

/**
 * finalize：校验宠物名 → 暂存区图集存在 → 写 manifest（服务端复核 voices×磁盘一致）
 * → 同盘 rename 原子落地 → 返回清单摘要。
 * manifest 由客户端向导组装（含浏览器探测的 durationMs），服务端 parseManifest 结构校验
 * + sizeBytes×磁盘 stat 复核（防伪造清单），并强制 schemaVersion/id。
 */
export function finalizeImport(petsRootDir, stagingRootDir, stagingId, name, clientManifest) {
  validatePetName(petsRootDir, name)
  const staging = stagingDirOf(stagingRootDir, stagingId)
  if (!fs.existsSync(path.join(staging, SHEET_FILE)) || !fs.statSync(path.join(staging, SHEET_FILE)).isFile()) {
    throw new PetError('staging-missing-sheet', '暂存区缺少 spritesheet.webp')
  }
  const m = parseManifest({ ...clientManifest, schemaVersion: SCHEMA_VERSION, id: name }, { id: name })
  // 服务端复核：清单 voices 与暂存磁盘一一对应（file 存在、size 一致）；图集大小一致
  const sheetSize = fs.statSync(path.join(staging, SHEET_FILE)).size
  if (m.spritesheetSizeBytes !== sheetSize) {
    throw new PetError('manifest-invalid', `spritesheetSizeBytes 与磁盘不一致: ${m.spritesheetSizeBytes} != ${sheetSize}`)
  }
  const onDisk = new Map(listStagedVoice(staging).map((f) => [f.file, f.sizeBytes]))
  for (const v of m.voices) {
    if (!onDisk.has(v.file)) throw new PetError('manifest-invalid', `清单语音不在暂存磁盘: ${v.file}`)
    if (onDisk.get(v.file) !== v.sizeBytes) throw new PetError('manifest-invalid', `清单语音大小不一致: ${v.file}`)
  }
  writeManifest(staging, m, { backup: false })
  const dest = path.join(petsRootDir, name)
  try {
    fs.renameSync(staging, dest)
  } catch (e) {
    throw new PetError('finalize-move-failed', `落地失败: ${e.message}`).with('err', e.message)
  }
  const summary = listPets(petsRootDir).find((s) => s.id === name)
  if (!summary) throw new PetError('finalize-scan-failed', '落地后读取宠物信息失败')
  return summary
}

/** 取消导入：清理暂存区（不存在时静默成功） */
export function cancelImport(stagingRootDir, stagingId) {
  let staging
  try { staging = stagingDirOf(stagingRootDir, stagingId) } catch { return }
  fs.rmSync(staging, { recursive: true, force: true })
}

export { stagingDirOf }
