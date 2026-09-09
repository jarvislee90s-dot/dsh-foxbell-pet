// errors.ts — 客户端错误形状与分流（对齐 MAM petErrors.ts）。
// 宿主路由错误统一 {code, params, detail} JSON；客户端按插件内部 zh/en 字典映射文案，
// 内联呈现于对话框（不引入 toast，不集成 harness locale service）。

/** 宿主 RPC 错误（fetch 层从 JSON body 重建） */
export interface PetRpcErrorLike {
  code: string
  params?: Record<string, string>
  detail?: string
}

/** 客户端本地错误码（图集/音频探测，MAM PetErrCode 同表） */
export type PetErrCode =
  | "sheet-missing"
  | "sheet-bad-size"
  | "sheet-load-fail"
  | "sheet-timeout"
  | "audio-timeout"
  | "audio-bad-duration"
  | "audio-load-fail"
  | "scan-fail";

export class PetError extends Error {
  constructor(
    public code: PetErrCode,
    public params?: Record<string, string | number>
  ) {
    super(code);
  }
}

/** 已知 RPC 错误码白名单（与宿主 src/host/errors.js ALL_RPC_CODES 一一对应，validate 锁两侧不漂移） */
export const KNOWN_RPC_CODES = [
  "audio-format-unsupported",
  "audio-not-found",
  "audio-relpath-invalid",
  "copy-failed",
  "delete-failed",
  "download-failed",
  "download-status",
  "download-too-large",
  "download-url-invalid",
  "finalize-move-failed",
  "finalize-scan-failed",
  "group-invalid",
  "host-forbidden",
  "internal",
  "manifest-backup-failed",
  "manifest-invalid",
  "manifest-parse-failed",
  "manifest-request-failed",
  "manifest-status",
  "manifest-too-large",
  "manifest-write-failed",
  "origin-forbidden",
  "pet-dir-missing",
  "pet-exists",
  "pet-name-dot-prefix",
  "pet-name-empty",
  "pet-name-illegal",
  "pet-name-reserved",
  "pet-name-reserved-device",
  "pet-name-too-long",
  "pet-not-found",
  "pet-not-on-petdex",
  "petdex-no-zip",
  "redirect-forbidden",
  "redirect-too-many",
  "sheet-not-found",
  "slug-invalid",
  "slug-parse-failed",
  "source-not-folder",
  "staging-create-failed",
  "staging-id-invalid",
  "staging-missing-sheet",
  "staging-not-found",
  "tmp-write-failed",
  "zip-entry-illegal-path",
  "zip-open-failed",
  "zip-read-failed",
  "zip-too-many-entries",
  "zip-total-over-limit",
] as const;

export function isPetRpcError(e: unknown): e is PetRpcErrorLike {
  // PetError 也携带 string code，必须显式排除（MAM 第八轮同款分流修正）
  if (e instanceof PetError) return false;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { code?: unknown }).code === "string" &&
    (e as { code?: unknown }).code !== ""
  );
}
