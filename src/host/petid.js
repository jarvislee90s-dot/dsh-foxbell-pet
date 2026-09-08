// petid.js — 宠物 id（=文件夹名）统一校验（对齐 MAM services/pet/mod.rs validate_pet_id）。
// id 即目录名，仓库路径是裸 join：不设卡则 `../`、绝对路径均可逃逸出仓库。
// 前后端双重校验：客户端 src/client/validate.ts 有同规则镜像（实时预检），此处为权威。
import { PetError } from './errors.js'

/** 宠物 id 长度上限（MAM MAX_PET_ID_LEN） */
export const MAX_PET_ID_LEN = 64

/** 内置宠物保留 id */
export const BUILTIN_PET_ID = 'foxbell'

/** Windows 保留设备名（大小写不敏感；id 白名单字符集不含点，仅需全名匹配） */
export const WINDOWS_RESERVED_DEVICES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]

const ID_CHARSET_RE = /^[A-Za-z0-9_-]+$/

/**
 * 静态 id 规则（拒绝顺序与 MAM 一致）：
 * 空 → 点前缀 → 字符集 → 长度 → Windows 保留设备名 → foxbell 保留字。
 * @returns {PetError|null} null = 合法
 */
export function petIdProblem(id) {
  if (typeof id !== 'string' || id.length === 0) return new PetError('pet-name-empty', '宠物名不能为空')
  if (id.startsWith('.')) return new PetError('pet-name-dot-prefix', `宠物名不能以点开头: ${id}`)
  if (!ID_CHARSET_RE.test(id)) return new PetError('pet-name-illegal', `宠物名仅支持字母/数字/连字符/下划线: ${id}`)
  if (id.length > MAX_PET_ID_LEN) return new PetError('pet-name-too-long', `宠物名过长（≤${MAX_PET_ID_LEN} 字符）`).with('max', MAX_PET_ID_LEN)
  if (WINDOWS_RESERVED_DEVICES.some((d) => d.toLowerCase() === id.toLowerCase())) {
    return new PetError('pet-name-reserved-device', `宠物名与 Windows 保留设备名冲突: ${id}`)
  }
  if (id.toLowerCase() === BUILTIN_PET_ID) return new PetError('pet-name-reserved', 'foxbell 为内置宠物保留名')
  return null
}

/** 校验失败即抛（路由入口统一使用） */
export function validatePetId(id) {
  const p = petIdProblem(id)
  if (p) throw p
}

/**
 * 客户端镜像用的「首问题」判定（不含仓库查重；查重需要磁盘，由调用方叠加）。
 * 与 MAM petValidation.ts petNameProblem 语义一致：too-long 先于 charset。
 * @returns {'too-long'|'charset'|'reserved-device'|'reserved'|'duplicate'|'empty'|null}
 */
export function petNameProblem(name, { existingIds = [], selfId = null } = {}) {
  if (typeof name !== 'string' || name.length === 0) return 'empty'
  if (name.length > MAX_PET_ID_LEN) return 'too-long'
  if (!ID_CHARSET_RE.test(name)) return 'charset'
  if (WINDOWS_RESERVED_DEVICES.some((d) => d.toLowerCase() === name.toLowerCase())) return 'reserved-device'
  if (name.toLowerCase() === BUILTIN_PET_ID) return 'reserved'
  const others = existingIds.filter((id) => id !== selfId)
  if (others.some((id) => String(id).toLowerCase() === name.toLowerCase())) return 'duplicate'
  return null
}
