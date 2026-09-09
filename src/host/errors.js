// errors.js — 结构化错误（对齐 MAM PetRpcError 码表）。
// 路由错误统一 JSON 形状 { code, params, detail }：
//   code   稳定错误码（客户端 zh/en 字典键）
//   params 插值参数（字符串键值）
//   detail 开发者可读原文（日志用，客户端不直接展示）
export class PetError extends Error {
  constructor(code, detail, params = {}) {
    super(code)
    this.name = 'PetError'
    this.code = code
    this.detail = String(detail ?? code)
    this.params = params
  }
  with(key, val) {
    this.params[key] = String(val)
    return this
  }
  toJSON() {
    return { code: this.code, params: this.params, detail: this.detail }
  }
  /** HTTP 状态映射：未命中表 → 500 */
  get status() { return statusOfCode(this.code) }
}

/** 未映射的底层 IO/网络错误统一收敛（对齐 MAM PetRpcError::internal） */
export function internal(detail) {
  return new PetError('internal', detail)
}

const STATUS_404 = new Set(['pet-not-found', 'staging-not-found', 'pet-dir-missing', 'audio-not-found', 'sheet-not-found'])
const STATUS_500 = new Set(['internal', 'copy-failed', 'delete-failed', 'rename-failed', 'finalize-move-failed',
  'finalize-scan-failed', 'manifest-write-failed', 'manifest-backup-failed', 'staging-create-failed',
  'tmp-write-failed', 'download-failed', 'manifest-request-failed'])

export function statusOfCode(code) {
  if (STATUS_404.has(code)) return 404
  if (STATUS_500.has(code)) return 500
  return 400
}

/** 错误码全表（与客户端 src/client/errors.ts 的 KNOWN_RPC_CODES 一一对应，validate 校验两侧一致）。
 *  基线 = MAM error.rs ALL_RPC_CODES（49 码）去掉 OS 级 reveal-failed（Web 无「打开回收站/文件夹」
 *  能力，改为 /pets 响应直接返回 dir 路径），加上本插件新增的 manifest-invalid / origin-forbidden。 */
export const ALL_RPC_CODES = [
  'audio-format-unsupported',
  'audio-not-found',
  'audio-relpath-invalid',
  'copy-failed',
  'delete-failed',
  'download-failed',
  'download-status',
  'download-too-large',
  'download-url-invalid',
  'finalize-move-failed',
  'finalize-scan-failed',
  'group-invalid',
  'host-forbidden',
  'internal',
  'manifest-backup-failed',
  'manifest-invalid',
  'manifest-parse-failed',
  'manifest-request-failed',
  'manifest-status',
  'manifest-too-large',
  'manifest-write-failed',
  'origin-forbidden',
  'pet-dir-missing',
  'pet-exists',
  'pet-name-dot-prefix',
  'pet-name-empty',
  'pet-name-illegal',
  'pet-name-reserved',
  'pet-name-reserved-device',
  'pet-name-too-long',
  'pet-not-found',
  'pet-not-on-petdex',
  'petdex-no-zip',
  'redirect-forbidden',
  'redirect-too-many',
  'sheet-not-found',
  'slug-invalid',
  'slug-parse-failed',
  'source-not-folder',
  'staging-create-failed',
  'staging-id-invalid',
  'staging-missing-sheet',
  'staging-not-found',
  'tmp-write-failed',
  'zip-entry-illegal-path',
  'zip-open-failed',
  'zip-read-failed',
  'zip-too-many-entries',
  'zip-total-over-limit',
]
