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

/** 今日用量聚合（src/host/state.js L273-283；v2.2 models 由 {} 占位桶转正为 RouteAgg[]，可空容错旧宿主） */
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
  /** v2.2 当日按路由聚合 Top6（可空：容错旧宿主） */
  models?: RouteUsage[];
  /** v2.2 当日工具调用计数（可空：容错旧宿主） */
  tools?: { name: string; count: number; durMs: number }[];
  /** v2.2 趋势切片：14 天 / 24 小时（可空：容错旧宿主） */
  trend?: { days: TrendDay[]; hours: TrendHour[] };
}

/** 阈值警报（evaluateAlerts，src/host/dashboard.js L103-125） */
export interface DashboardAlert {
  id: string;
  kind: "day-warn" | "day-hit" | "milestone";
  text: string;
  /** v2.2 触发时阈值原值（milestone 类展示「已达成 N」用；可空容错旧宿主） */
  reached?: number;
}

/** 未决审批（src/host/state.js L251） */
export interface DashboardApproval {
  id: string;
  title: string;
  waitMin: number;
}

/** 黑板结构化 token 字段（Task 7 增量；RAW 数值，格式化在客户端 fmtTokens/拼装） */
export interface SummaryTokens {
  /** 请求输入口径：inputTokens + cacheReadTokens（与 UsageSnapshot.requestTotal 同源同值） */
  requestTotal: number;
  /** 缓存命中（今日，跨会话累加） */
  cacheRead: number;
  /** 命中率百分数原值 = cacheRead/requestTotal*100（分母 0 记 0）；客户端 toFixed(1) 后与 tokensText 内百分数逐位一致 */
  hitPct: number;
  /** 产出（今日） */
  output: number;
  /** 用户输入启发式估算（今日） */
  userEst: number;
}

/** 工具 Top3 行（与 toolsText 同序：次数降序截断；ms 为跨会话累计耗时，0 时客户端省略耗时段） */
export interface SummaryToolRow {
  name: string;
  count: number;
  ms: number;
}

/** 黑板汇总（summarize + Task 7 结构化增量，src/host/dashboard.js L141-208 / src/host/state.js buildDashboard）。
 *  zh 字符串字段保留：滚动兜底展示 + test/dashboard.test.mjs 29 用例字节契约不动；
 *  黑板行正文由客户端经结构化字段 t()+fmtTokens 双语拼装（src/client/boardrows.ts）。 */
export interface DashboardSummary {
  sessions: number;
  turns: number;
  errors: number;
  /** zh token 汇总（保留字段：客户端仅在需要兜底文案时使用） */
  tokensText: string;
  /** zh 工具 Top3 汇总（保留字段，同上） */
  toolsText: string;
  /** zh 最长单 turn 汇总（保留字段，同上） */
  longestText: string;
  // ---- Task 7 结构化增量（黑板行双语拼装输入；RAW 数值）----
  tokens: SummaryTokens;
  toolRows: SummaryToolRow[];
  /** 最长单 turn；无已计量 turn 时 null（客户端按「0 秒」桶展示，与 zh longestText 口径一致） */
  longest: { ms: number } | null;
}

export interface DashboardSnapshot {
  /** paceEnabled=false 时为 null（客户端据此清掉旧档位） */
  pace: PaceSnapshot | null;
  usage: UsageSnapshot;
  alerts: DashboardAlert[];
  approvals: DashboardApproval[];
  summary: DashboardSummary;
}

// ---- v2.2 类型增量（/state rev、usage.models/tools/trend、/dashboard/range；Task 8）----
/** 当日按「路由(provider/model)」聚合行（宿主 RouteAgg 同形，buildDashboard usage.models） */
export interface RouteUsage { route: string; provider: string; model: string; requestTotal: number; cacheRead: number; outputTokens: number }
/** 日趋势切片（byDay；hitPct 分母 0 记 0） */
export interface TrendDay { key: string; dayTotal: number; requestTotal: number; cacheRead: number; outputTokens: number; hitPct: number; requestCount: number }
/** 小时趋势切片（近 24h） */
export interface TrendHour { key: string; dayTotal: number; requestTotal: number; requestCount: number }
/** /dashboard/range 区间汇总（宿主 range.js RangeSummary 同形） */
export interface RangeSummary { from: string; to: string; days: TrendDay[]; totals: { requestTotal: number; cacheRead: number; outputTokens: number; userEst: number; hitPct: number; requestCount: number }; models: RouteUsage[]; tools: { name: string; count: number; durMs: number }[] }

/** 区间用量汇总（R3；from/to 为 YYYY-MM-DD，宿主闭区间） */
export async function apiGetRange(from: string, to: string): Promise<RangeSummary> {
  return apiGet<RangeSummary>(`/dashboard/range?from=${from}&to=${to}`);
}

export interface StateSnapshot {
  seq: number;
  /** v2.2 P3 快照修订号（与 numeric seq 独立递增；客户端轮询 since 短路凭据） */
  rev?: string;
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
