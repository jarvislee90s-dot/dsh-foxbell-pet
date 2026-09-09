// manifest.js — 清单 v2 格式：结构、校验、原子写 + 一层 .bak 备份。
// 字段与 MAM services/pet/manifest.rs 对齐（camelCase JSON）：
//   schemaVersion / id / displayName / description / source(codex|petdex|folder|zip)
//   spriteVersionNumber(1=9行 2=11行 0=未知) / spritesheetSizeBytes / hasVoice / hasSubtitle
//   voices[{group,name,file,sizeBytes,durationMs}]
// schemaVersion 取值：本插件写出 2（任务口径「清单 v2」）；读取兼容 1（MAM 产出的
// zip 包互操作），其余值拒绝。见 IMPLEMENTATION_NOTES「清单 schemaVersion」决策。
import fs from 'node:fs'
import path from 'node:path'
import { PetError } from './errors.js'
import { petIdProblem, BUILTIN_PET_ID } from './petid.js'

export const MANIFEST_FILE = 'manifest.json'
export const BACKUP_FILE = 'manifest.json.bak'
export const TMP_FILE = 'manifest.json.tmp'
export const SHEET_FILE = 'spritesheet.webp'
export const SCHEMA_VERSION = 2
/** 读取时接受的 schemaVersion 集合（1 = MAM 基线写出值，2 = 本插件 v2 清单） */
export const ACCEPTED_SCHEMA_VERSIONS = [1, 2]

/** 四个固定语音分组（与 foxbell 语音系统一致） */
export const VOICE_GROUPS = ['general', 'approval', 'done', 'error']

/** 允许的音频扩展名（MAM AUDIO_EXTS 七种） */
export const AUDIO_EXTS = ['m4a', 'mp3', 'wav', 'ogg', 'opus', 'flac', 'aac']

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024
export const MIN_DURATION_MS = 1000
export const MAX_DURATION_MS = 20000

/**
 * voice 相对路径唯一合规形态：voice/<group>/<file> 三段且 group ∈ VOICE_GROUPS。
 * scan/暂存收集/复制/remove 四处共用（MAM manifest::is_voice_rel 同源规则）。
 */
export function isVoiceRel(rel) {
  if (typeof rel !== 'string') return false
  const segs = rel.split('/')
  return segs.length === 3
    && segs[0] === 'voice'
    && VOICE_GROUPS.includes(segs[1])
    && segs[2].length > 0
    && !segs[2].includes('..')
}

export function extOf(rel) {
  const i = rel.lastIndexOf('.')
  return i >= 0 ? rel.slice(i + 1).toLowerCase() : ''
}

export function isAudioExt(rel) {
  return AUDIO_EXTS.includes(extOf(rel))
}

/** 字幕文本 = 文件名去扩展名（MAM EP8） */
export function nameFromRel(rel) {
  const base = rel.split('/').pop() ?? rel
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(0, i) : base
}

function isU64(v) { return Number.isInteger(v) && v >= 0 }

/**
 * 结构校验：返回规范化 manifest 对象；非法抛 PetError('manifest-invalid')。
 * 宽松读（缺省字段回落默认），严格写（写盘前必须过此关）。
 */
export function parseManifest(raw, { id = null } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PetError('manifest-invalid', 'manifest 不是对象')
  }
  const fail = (detail) => { throw new PetError('manifest-invalid', detail) }
  const sv = raw.schemaVersion
  if (!ACCEPTED_SCHEMA_VERSIONS.includes(sv)) fail(`schemaVersion 非法: ${sv}`)
  const mid = raw.id
  if (typeof mid !== 'string' || mid.length === 0) fail('id 缺失')
  if (id !== null && mid !== id) fail(`id 与目录不一致: ${mid} != ${id}`)
  if (mid !== BUILTIN_PET_ID) {
    const p = petIdProblem(mid)
    if (p) fail(`id 非法: ${p.detail}`)
  }
  if (typeof raw.displayName !== 'string' || raw.displayName.length === 0) fail('displayName 缺失')
  const description = raw.description === undefined ? '' : raw.description
  if (typeof description !== 'string') fail('description 非字符串')
  const source = raw.source === undefined ? '' : raw.source
  if (typeof source !== 'string' || (source !== '' && !['codex', 'petdex', 'folder', 'zip', 'builtin'].includes(source))) {
    fail(`source 非法: ${source}`)
  }
  const svn = raw.spriteVersionNumber
  if (![0, 1, 2].includes(svn)) fail(`spriteVersionNumber 非法: ${svn}`)
  const ssb = raw.spritesheetSizeBytes === undefined ? 0 : raw.spritesheetSizeBytes
  if (!isU64(ssb)) fail('spritesheetSizeBytes 非法')
  if (typeof raw.hasVoice !== 'boolean') fail('hasVoice 非布尔')
  if (typeof raw.hasSubtitle !== 'boolean') fail('hasSubtitle 非布尔')
  const rawVoices = raw.voices === undefined ? [] : raw.voices
  if (!Array.isArray(rawVoices)) fail('voices 非数组')
  const voices = []
  const seen = new Set()
  for (const v of rawVoices) {
    if (!v || typeof v !== 'object') fail('voice 条目非对象')
    if (!VOICE_GROUPS.includes(v.group)) fail(`voice 分组非法: ${v.group}`)
    if (typeof v.name !== 'string') fail('voice.name 非字符串')
    if (!isVoiceRel(v.file)) fail(`voice.file 非法: ${v.file}`)
    if (!isU64(v.sizeBytes)) fail(`voice.sizeBytes 非法: ${v.file}`)
    if (!isU64(v.durationMs)) fail(`voice.durationMs 非法: ${v.file}`)
    if (seen.has(v.file)) fail(`voice.file 重复: ${v.file}`)
    seen.add(v.file)
    voices.push({ group: v.group, name: v.name, file: v.file, sizeBytes: v.sizeBytes, durationMs: v.durationMs })
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: mid,
    displayName: raw.displayName,
    description,
    source,
    spriteVersionNumber: svn,
    spritesheetSizeBytes: ssb,
    hasVoice: raw.hasVoice,
    hasSubtitle: raw.hasSubtitle && raw.hasVoice,
    voices,
  }
}

/** 读取 manifest.json；任何失败（缺失/损坏/非法）返回 null，由调用方决定生成或修复 */
export function loadManifest(dir, { id = null } = {}) {
  let text
  try { text = fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8') } catch { return null }
  let raw
  try { raw = JSON.parse(text) } catch { return null }
  try { return parseManifest(raw, { id }) } catch { return null }
}

/**
 * 写 manifest.json：backup=true 且旧文件存在时先复制为 manifest.json.bak（仅保留最近一份）；
 * 原子写 = 同目录 tmp + rename（进程中途被杀不留半截文件）。
 */
export function writeManifest(dir, manifest, { backup = true } = {}) {
  const target = path.join(dir, MANIFEST_FILE)
  try {
    if (backup && fs.existsSync(target)) fs.copyFileSync(target, path.join(dir, BACKUP_FILE))
  } catch (e) {
    throw new PetError('manifest-backup-failed', `备份 manifest 失败: ${e.message}`).with('err', e.message)
  }
  const text = JSON.stringify(manifest, null, 2)
  const tmp = path.join(dir, TMP_FILE)
  try {
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, target)
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
    throw new PetError('manifest-write-failed', `写入 manifest 失败: ${e.message}`).with('err', e.message)
  }
}
