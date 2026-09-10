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
  /** v2.1 卡片年龄标注（ageLabel(距最后事件秒)，无事件时 ''；宿主 state.js list() 下发） */
  age: string;
}

// ---- v2.1 效率看板契约（形状逐一镜像宿主 buildDashboard：src/host/state.js L210-288）----
export type PaceTier = "intense" | "active" | "longrun" | "idle" | "loaf1" | "loaf2" | "loaf3" | "loaf4";

/** derivePaceTier 结果（src/host/dashboard.js L27-43） */
export interface PaceSnapshot {
  tier: PaceTier;
  /** 距最后事件静默毫秒数；无任何事件时为 null */
  sinceMs: number | null;
  label: string;
}

/** token 四分账桶（zeroUsage 同形状，src/host/dashboard.js L55-56） */
export interface UsageBucket {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** 最后活跃会话的今日分账（src/host/state.js L248 + L279-281 的 requestTotal 派生） */
export interface SessionUsageSnapshot extends UsageBucket {
  title: string;
  requestTotal: number;
}

/** 今日用量聚合（src/host/state.js L273-283；models 为二期预留空桶） */
export interface UsageSnapshot {
  day: UsageBucket;
  /** 请求输入口径：inputTokens + cacheReadTokens（2026-09-10 用户裁定） */
  requestTotal: number;
  /** 命中率 = 缓存命中 / 请求输入，分母 0 记 0（hitRate） */
  cacheHitRate: number;
  /** 用户输入启发式估算（今日，跨会话累加） */
  userEst: number;
  session: SessionUsageSnapshot | null;
  grandTotal: number;
  models: Record<string, unknown>;
}

/** 阈值警报（evaluateAlerts，src/host/dashboard.js L103-125） */
export interface DashboardAlert {
  id: string;
  kind: "day-warn" | "day-hit" | "milestone";
  text: string;
}

/** 未决审批（src/host/state.js L251） */
export interface DashboardApproval {
  id: string;
  title: string;
  waitMin: number;
}

/** 黑板汇总（summarize，src/host/dashboard.js L160-170；Task 7 将重构为结构化数值字段） */
export interface DashboardSummary {
  sessions: number;
  turns: number;
  errors: number;
  tokensText: string;
  toolsText: string;
  longestText: string;
}

export interface DashboardSnapshot {
  /** paceEnabled=false 时为 null（客户端据此清掉旧档位） */
  pace: PaceSnapshot | null;
  usage: UsageSnapshot;
  alerts: DashboardAlert[];
  approvals: DashboardApproval[];
  summary: DashboardSummary;
}

export interface StateSnapshot {
  seq: number;
  completions: { seq: number; at: number; agentId: string }[];
  runningSessions: number;
  projects: ProjectCard[];
  /** v2.1 效率看板聚合；引擎首轮 compute 前为 null */
  dashboard: DashboardSnapshot | null;
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
