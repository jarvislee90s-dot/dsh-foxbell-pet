// scan.js — 磁盘扫描：单宠物 stat 快扫、仓库清单、codex 目录清单、暂存区清扫。
// 对齐 MAM services/pet/scan.rs 与 mod.rs（sweep/rename/delete）。
// 文件系统一律 node:fs（rc.1 的 ctx.fs 沙箱可写根不含 ~/.dsh，且无 mkdir/remove/二进制写；
// harness 先例：anonymous-user-id、settings-file 均直接用 node:fs 写 ~/.dsh）。
import fs from 'node:fs'
import path from 'node:path'
import { PetError } from './errors.js'
import { isVoiceRel, isAudioExt, loadManifest, writeManifest, SHEET_FILE, MANIFEST_FILE } from './manifest.js'
import { validatePetId, petIdProblem } from './petid.js'

/** stat 一个相对路径 → {rel, exists, size}（symlink 视为不存在：不跟随，MAM issue #32-5） */
export function statRel(root, rel) {
  try {
    const st = fs.lstatSync(path.join(root, rel))
    if (st.isSymbolicLink()) return { rel, exists: false, size: 0 }
    if (st.isFile()) return { rel, exists: true, size: st.size }
    return { rel, exists: false, size: 0 }
  } catch {
    return { rel, exists: false, size: 0 }
  }
}

/**
 * 收集 voice/ 下合规文件（仅 voice/<group>/<file> 三段；深层子目录与非分组目录
 * 对宠物系统不可见）。symlink 一律跳过、目录型链接不入栈（防环）。
 */
export function walkVoice(petDir) {
  const out = []
  const stack = [path.join(petDir, 'voice')]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) { stack.push(p); continue }
      if (!e.isFile()) continue
      const rel = path.relative(petDir, p).split(path.sep).join('/')
      if (!isVoiceRel(rel)) continue
      let size = 0
      try { size = fs.statSync(p).size } catch { continue }
      out.push({ rel, exists: true, size })
    }
  }
  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  return out
}

/** 宠物目录必须是不透明真实目录：symlink 目录视为不存在（不跟随，防按 id 寻址逃逸商店根；
 *  与 statRel 的 MAM issue #32-5 口径一致） */
export function isRealPetDir(dir) {
  try { return fs.lstatSync(dir).isDirectory() } catch { return false }
}

/** 单宠物 stat 快扫（统一校验算法输入） */
export function scanPet(petsDir, id) {
  validatePetId(id)
  const dir = path.join(petsDir, id)
  if (!isRealPetDir(dir)) {
    throw new PetError('pet-not-found', `宠物不存在: ${id}`).with('id', id)
  }
  return {
    id,
    dir,
    spritesheet: statRel(dir, SHEET_FILE),
    voiceFiles: walkVoice(dir),
  }
}

/** 仓库清单（跳过 . 开头隐藏目录如 .import-staging/.trash；无 manifest 用 id 兜底展示名） */
export function listPets(petsDir) {
  const out = []
  let entries
  try { entries = fs.readdirSync(petsDir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const id = e.name
    if (id.startsWith('.')) continue
    if (petIdProblem(id) !== null) continue // 非法名目录不进清单（防御：手工放坏的目录）
    const dir = path.join(petsDir, id)
    const m = loadManifest(dir, { id })
    out.push({
      id,
      displayName: m ? m.displayName : id,
      description: m ? m.description : '',
      source: m ? m.source : '',
      spriteVersionNumber: m ? m.spriteVersionNumber : 0,
      hasVoice: m ? m.hasVoice : false,
      hasSubtitle: m ? m.hasSubtitle : false,
      manifestExists: m !== null,
      spritesheetExists: fs.existsSync(path.join(dir, SHEET_FILE)),
      dir,
    })
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return out
}

/** codex 宠物清单：仅收录含 spritesheet.webp 的目录，并标注是否已导入 */
export function listCodexPets(codexDir, petsDir) {
  const out = []
  let entries
  try { entries = fs.readdirSync(codexDir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const id = e.name
    const p = path.join(codexDir, id)
    if (!fs.existsSync(path.join(p, SHEET_FILE))) continue
    let displayName = ''
    let spriteVersionNumber = 0
    try {
      const j = JSON.parse(fs.readFileSync(path.join(p, 'pet.json'), 'utf8'))
      if (typeof j.displayName === 'string') displayName = j.displayName
      if (j.spriteVersionNumber === 1 || j.spriteVersionNumber === 2) spriteVersionNumber = j.spriteVersionNumber
    } catch { /* pet.json 可选 */ }
    out.push({ id, displayName, spriteVersionNumber, imported: fs.existsSync(path.join(petsDir, id)) })
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return out
}

/** 启动清扫暂存区残留（崩溃自愈）：仅清 .import-staging，不触碰宠物目录 */
export function sweepStaging(stagingDir) {
  let entries
  try { entries = fs.readdirSync(stagingDir, { withFileTypes: true }) } catch { return 0 }
  let n = 0
  for (const e of entries) {
    const p = path.join(stagingDir, e.name)
    try {
      fs.rmSync(p, { recursive: true, force: true })
      n += 1
    } catch (err) {
      console.warn('[foxbell-pet] sweep staging leftover failed:', p, String(err && err.message || err))
    }
  }
  return n
}

/**
 * 重命名宠物 = 目录 rename + manifest.id 同步（备份旧 manifest）。
 * 顺序：先 rename 目录再写 manifest —— rename 失败零副作用；manifest 写失败非致命
 * （身份以文件夹名为准，下次激活/修复兜底），与 MAM rename_pet_in 一致。
 */
export function renamePet(petsDir, oldId, newId) {
  validatePetId(oldId)
  if (oldId === newId) return
  const oldDir = path.join(petsDir, oldId)
  if (!fs.existsSync(oldDir)) throw new PetError('pet-not-found', `宠物不存在: ${oldId}`).with('id', oldId)
  validatePetName(petsDir, newId)
  const newDir = path.join(petsDir, newId)
  try {
    fs.renameSync(oldDir, newDir)
  } catch (e) {
    throw new PetError('rename-failed', `重命名失败: ${e.message}`).with('err', e.message)
  }
  const m = loadManifest(newDir)
  if (m) {
    m.id = newId
    try { writeManifest(newDir, m, { backup: true }) } catch (err) {
      console.warn(`[foxbell-pet] manifest.id 同步失败（目录已改名 ${oldId} → ${newId}）:`, String(err && err.message || err))
    }
  }
}

/** 安全删除：整目录移入 <storeRoot>/.trash/<id>-<ts>（不物理删除；MAM 用系统回收站，
 *  Web 插件无 OS 回收站依赖，落插件私有 .trash，语义等价：可手动恢复） */
export function deletePet(petsDir, trashDir, id) {
  validatePetId(id)
  const dir = path.join(petsDir, id)
  if (!fs.existsSync(dir)) throw new PetError('pet-not-found', `宠物不存在: ${id}`).with('id', id)
  try {
    fs.mkdirSync(trashDir, { recursive: true })
    const dest = path.join(trashDir, `${id}-${Date.now()}`)
    fs.renameSync(dir, dest)
    return dest
  } catch (e) {
    // rename 跨设备等原因失败时退化为复制+删除（仍进 .trash，不物理粉碎）
    try {
      const dest = path.join(trashDir, `${id}-${Date.now()}`)
      fs.cpSync(dir, dest, { recursive: true })
      fs.rmSync(dir, { recursive: true, force: true })
      return dest
    } catch (e2) {
      throw new PetError('delete-failed', `删除失败: ${e2.message}`).with('err', e2.message)
    }
  }
}

/** 宠物名（=文件夹名）严格校验：静态规则 + 仓库内查重 */
export function validatePetName(petsDir, name) {
  validatePetId(name)
  if (fs.existsSync(path.join(petsDir, name))) {
    throw new PetError('pet-exists', `宠物已存在: ${name}`).with('name', name)
  }
}

export { MANIFEST_FILE, SHEET_FILE }
