// api.ts — 宿主私有路由族 fetch 封装。错误统一重建为 PetRpcErrorLike（{code,params,detail}），
// 展示层经 petErrMsg 按内部字典翻译、内联呈现于对话框。
import { isPetRpcError, PetError, type PetRpcErrorLike } from "./errors";

export const ROUTE_PREFIX = "/dyn-pet-foxbell";

export class ApiError extends Error implements PetRpcErrorLike {
  code: string;
  params: Record<string, string>;
  detail: string;
  status: number;
  constructor(code: string, detail: string, params: Record<string, string>, status: number) {
    super(code);
    this.code = code;
    this.detail = detail;
    this.params = params;
    this.status = status;
  }
}

async function toError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try { body = await res.json(); } catch { /* 非 JSON */ }
  if (isPetRpcError(body)) {
    const b = body as PetRpcErrorLike;
    return new ApiError(b.code, b.detail ?? "", (b.params ?? {}) as Record<string, string>, res.status);
  }
  return new ApiError("internal", `HTTP ${res.status}`, {}, res.status);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(ROUTE_PREFIX + path);
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(ROUTE_PREFIX + path, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

/** 二进制上传（zip / 音频字节） */
export async function apiPostBytes<T>(path: string, bytes: ArrayBuffer | Blob): Promise<T> {
  const res = await fetch(ROUTE_PREFIX + path, { method: "POST", body: bytes });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

/** PetError → t("err.<code>")；ApiError/RpcError → 白名单内 t("rpc.<code>")，白名单外收敛 internal；
 *  普通 Error → message 透传；其余 → scan-fail 兜底（MAM petErrMsg 同款分流） */
export function petErrMsg(e: unknown, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (e instanceof PetError) return t(`err.${e.code}`, e.params);
  if (isPetRpcError(e)) {
    const code = (e as PetRpcErrorLike).code;
    const params = ((e as PetRpcErrorLike).params ?? {}) as Record<string, string>;
    return t(`rpc.${code}`, params);
  }
  if (e instanceof Error && e.message) return e.message;
  return t("err.scan-fail");
}

// ---- 路由族类型 ----
export interface PetSummary {
  id: string;
  displayName: string;
  description: string;
  source: string;
  spriteVersionNumber: number;
  hasVoice: boolean;
  hasSubtitle: boolean;
  manifestExists: boolean;
  spritesheetExists: boolean;
  builtin: boolean;
  dir?: string;
}

export interface VoiceSnapshotEntry {
  index: number;
  group: string;
  name: string;
  file: string;
  url: string;
}

export interface ActivePetSnapshot {
  id: string;
  name: string;
  hasVoice: boolean;
  hasSubtitle: boolean;
  spriteVersionNumber: number;
  spriteUrl: string | null;
  rev: string;
}

export interface GuardIssue {
  kind: string;
  detail: string;
  fatal?: boolean;
}

export interface ProjectCard {
  id: string;
  title: string;
  lines: string[];
  status: "running" | "approval" | "error" | "done";
  unread: boolean;
}

export interface StateSnapshot {
  seq: number;
  completions: { seq: number; at: number; agentId: string }[];
  runningSessions: number;
  projects: ProjectCard[];
  voices: VoiceSnapshotEntry[];
  activePet: ActivePetSnapshot;
  pets: PetSummary[];
  guard: GuardIssue[];
  assetDir: string | null;
  spriteBytes: number | null;
  diag?: Record<string, unknown>;
}

export interface StagedVoiceFile {
  group: string;
  name: string;
  file: string;
  sizeBytes: number;
}

export interface StagedPet {
  stagingId: string;
  suggestedName: string;
  suggestedDisplayName: string;
  spriteVersionNumber: number;
  spritesheetSize: number;
  voiceFiles: StagedVoiceFile[];
}

export interface CodexPetInfo {
  id: string;
  displayName: string;
  spriteVersionNumber: number;
  imported: boolean;
}

export interface PetdexHit {
  slug: string;
  displayName: string;
  zipUrl: string;
  spriteVersionNumber: number;
  hasZip: boolean;
}

export interface ActivateResult {
  status: "activated" | "mismatch" | "invalid-sheet";
  id: string;
  voiceCap?: boolean;
  issues?: GuardIssue[];
  plan?: {
    issues: GuardIssue[];
    canRepair: boolean;
    manifestMissing: boolean;
    keepVoices: { group: string; name: string; file: string; sizeBytes: number; durationMs: number }[];
    reprobes: { rel: string; sizeBytes: number; hadEntry: boolean }[];
    spritesheetSizeBytes: number;
  };
  manifest?: unknown;
}

export const stagingSheetUrl = (sid: string) => `${ROUTE_PREFIX}/staging/${encodeURIComponent(sid)}/spritesheet.webp`;
export const stagingVoiceUrl = (sid: string, rel: string) =>
  `${ROUTE_PREFIX}/staging/${encodeURIComponent(sid)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
export const petSheetUrl = (id: string, rev?: string) =>
  `${ROUTE_PREFIX}/pets/${encodeURIComponent(id)}/spritesheet.webp${rev ? `?rev=${encodeURIComponent(rev)}` : ""}`;
