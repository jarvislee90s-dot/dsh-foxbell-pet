// config.ts — 配置存储（localStorage + settings RPC 双后端，乐观更新；v1.3.0 语义不变）。
// v2 新增 scale（三档缩放）与 activePetId（激活宠物，默认 foxbell）。
// v2.1（dsh 0.2 适配）：0.1.x 的客户端 settingsScope 服务在 0.2 已删除，配置后端改为
// settings/describe + settings/update HTTP RPC 适配器（createHttpSettingsScope）——两个
// RPC 的线缆形状在 0.1/0.2 一致，仅 ns 语义不同（0.1 = 注册命名空间 'foxbell-pet'；
// 0.2 = Loader entry id，本包 cordis.patch.yml 的 insert id 'dsh-foxbell-pet'），ns 由
// describe 动态发现（discoverNs：候选 id 优先，标记字段兜底）。
// 旧保存配置（无 scale/activePetId）加载即得默认值，零报错。
// localStorage 键沿用 dyn-pet-foxbell-* / dyn-foxbell-pet:* 前缀（不迁移，不碰 MAM 的 mam-* 键）。
import { POSE_KEYS } from "./animations";

export type PetAction = "jumping" | "waving" | "failed" | "waiting" | "review" | "running";
export type PetScale = 0.75 | 1 | 1.25;

export interface PetConfig {
  muted: boolean;
  talkative: boolean;
  doneAction: PetAction;
  dblAction: PetAction;
  approvalAction: PetAction;
  errorAction: PetAction;
  runningAction: PetAction;
  gravity: boolean;
  scale: PetScale;
  activePetId: string;
  // ---- v2.1 效率看板 12 键（键名/默认值逐字对齐 v1.4.0 Config 契约与宿主 src/host/index.js Config schema）----
  paceEnabled: boolean;
  paceIntenseEvents: number;
  paceLongrunMin: number;
  paceLoafStartMin: number;
  usageEnabled: boolean;
  dayLimitTokens: number;
  milestoneUnit: number;
  approvalFlickerMin: number;
  summaryEnabled: boolean;
  summaryEntrySec: number;
  boardTtlSec: number;
  ttsEnabled: boolean;
  // exportPose=导出立绘姿态：'random'（ANIM 随机行首帧）或 animations.ANIM 键（白名单 POSE_KEYS）。
  // v2.2.1：dashboardSidebarEntry（侧栏入口固定不注册）/usageEnabled（恒 true）/ttsEnabled（暂无消费）
  // 三开关已从设置卡移除——类型保留兼容旧 yaml，设置卡不再展示
  exportPose: string;
}

export const STORE_KEY = "dyn-pet-foxbell-visible";
export const CFG_KEY = "dyn-foxbell-pet:state-v1";
/** 位置记忆 v2：{x,y}（视口为工作区）。v1 的 dyn-pet-foxbell-x 仍被读取作兜底（不迁移） */
export const POS_KEY = "dyn-pet-foxbell-pos";
export const X_KEY = "dyn-pet-foxbell-x";
/** 闪切保护持久标记（编辑激活中宠物时暂切 foxbell；MAM FLASH_SWITCHED_KEY 同语义） */
export const FLASH_SWITCHED_KEY = "dyn-pet-foxbell-flash-switched";
/** 守卫「忽略」持久标记：按宠物 id + 问题签名记忆，签名变化再次弹出 */
export const GUARD_IGNORED_KEY = "dyn-pet-foxbell-guard-ignored";

export const CFG_ACTIONS: PetAction[] = ["jumping", "waving", "failed", "waiting", "review", "running"];
export const CFG_SCALES: PetScale[] = [0.75, 1, 1.25];
export const ACTION_KEYS = ["doneAction", "dblAction", "approvalAction", "errorAction", "runningAction"] as const;

export const CFG_DEFAULT: PetConfig = {
  muted: false,
  talkative: true,
  doneAction: "jumping",
  dblAction: "waving",
  approvalAction: "waiting",
  errorAction: "failed",
  runningAction: "running",
  gravity: true,
  scale: 1,
  activePetId: "foxbell",
  // v2.1 看板 12 键默认（前 8 项为看板引擎门/阈值；后 4 项为客户端门）
  paceEnabled: true,
  paceIntenseEvents: 12,
  paceLongrunMin: 3,
  paceLoafStartMin: 15,
  usageEnabled: true,
  dayLimitTokens: 0,
  milestoneUnit: 1000000,
  approvalFlickerMin: 5,
  summaryEnabled: true,
  summaryEntrySec: 15,
  boardTtlSec: 15,
  ttsEnabled: false, // v2.2.1：开关移除（当前无 TTS 消费；键保留兼容旧 yaml）
  exportPose: "random", // v2.2 R8 导出立绘姿态（宿主 settings 同名键镜像）
};

// ---- v2.1 看板数值键钳制表（v1.4.0 client.js NUM_KEYS/NUM_RANGE/clampNum 原样移植）----
export const NUM_KEYS = [
  "paceIntenseEvents", "paceLongrunMin", "paceLoafStartMin", "dayLimitTokens",
  "milestoneUnit", "approvalFlickerMin", "summaryEntrySec", "boardTtlSec",
] as const;
export type NumKey = (typeof NUM_KEYS)[number];
export const NUM_RANGE: Record<NumKey, [number, number]> = {
  paceIntenseEvents: [1, 1000],
  paceLongrunMin: [1, 120],
  paceLoafStartMin: [1, 240],
  dayLimitTokens: [0, 1e9],
  milestoneUnit: [0, 1e9],
  approvalFlickerMin: [0, 120],
  summaryEntrySec: [5, 60],
  boardTtlSec: [5, 120],
};

const clampNum = (k: NumKey, v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return CFG_DEFAULT[k];
  const [lo, hi] = NUM_RANGE[k];
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

const isAction = (v: unknown): v is PetAction => CFG_ACTIONS.includes(v as PetAction);
const isScale = (v: unknown): v is PetScale => CFG_SCALES.includes(v as PetScale);
const isPetIdStr = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);

export function sanitizeValue(k: keyof PetConfig, v: unknown): PetConfig[keyof PetConfig] {
  if ((ACTION_KEYS as readonly string[]).includes(k)) return isAction(v) ? v : CFG_DEFAULT[k as typeof ACTION_KEYS[number]];
  if ((NUM_KEYS as readonly string[]).includes(k)) return clampNum(k as NumKey, v);
  if (k === "scale") return isScale(v) ? v : 1;
  if (k === "activePetId") return isPetIdStr(v) ? v : "foxbell";
  // v2.2 R8 字符串键：不得落入末尾的布尔真值化（否则 "模板文本" 会被写成 true 静默丢配）；exportPose 白名单校验
  if (k === "exportPose") return typeof v === "string" && POSE_KEYS.includes(v) ? v : "random";
  return !!v; // booleans（含 paceEnabled/usageEnabled/summaryEnabled/ttsEnabled——v2 以直落布尔真值化代替 v1.4.0 的 BOOL_KEYS 表）
}

export function sanitizeConfig(raw: unknown): PetConfig {
  const out: PetConfig = { ...CFG_DEFAULT };
  if (raw && typeof raw === "object") {
    const p = raw as Record<string, unknown>;
    for (const k of Object.keys(CFG_DEFAULT) as (keyof PetConfig)[]) {
      if (k in p) (out[k] as unknown) = sanitizeValue(k, p[k]);
    }
  }
  return out;
}

// ---- settings scope 类型（store 的远端后端接口；0.1.x 由 settingsScope.bind 提供，
// ---- 0.2.x 由下方 createHttpSettingsScope 的 RPC 适配器提供）----
export interface SettingsScopeLike {
  getSnapshot(): { status: string; value?: Record<string, unknown>; user?: Record<string, unknown> };
  subscribe(fn: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
}

// ---- settings RPC 底座（0.2 适配）----

/** describe 响应里本插件配置节的候选 ns：0.1 注册命名空间在前，0.2 entry id 在后 */
export const NS_CANDIDATES = ["foxbell-pet", "dsh-foxbell-pet"] as const;
/** 标记字段（schema 独有组合）：entry id 改名/自定义安装名时的兜底匹配 */
const NS_MARKER_KEYS = ["activePetId", "doneAction"];

export interface SettingsNamespaceRow {
  ns: string;
  value?: unknown;
  user?: Record<string, unknown>;
}
export interface SettingsDescribeView {
  namespaces?: SettingsNamespaceRow[];
}

/** 宿主 web RPC 响应信封：{result: {ok, value}}（错误时 ok=false / 无 value） */
export interface RpcEnvelope<T> {
  result?: { ok?: boolean; value?: T };
}

/** 读出 describe 信封里的视图（无效/缺失 → null） */
function describeViewOf(j: RpcEnvelope<SettingsDescribeView> | null | undefined): SettingsDescribeView | null {
  const v = j?.result?.value;
  return v && typeof v === "object" ? v : null;
}

let rpcSeq = 0;
const nextRpcId = (tag: string): string =>
  `foxbell-${tag}-${Date.now().toString(36)}-${(rpcSeq++).toString(36)}`;

/** settings RPC POST（带 cookie 的 /api/settings/* 直连；与宿主 web RPC 同一端点）。
 *  fetch 全局缺失（极端沙箱）时同步抛错转为 rejected promise，调用方统一走拒绝分支。 */
function settingsRpc<T>(method: string, args: unknown): Promise<T> {
  try {
    return fetch(`/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: nextRpcId("rpc"), method, payload: { args } }),
    }).then((r) => {
      if (!r.ok) throw new Error(`settings RPC ${method} HTTP ${r.status}`);
      return r.json() as Promise<T>;
    });
  } catch (err) {
    return Promise.reject(err);
  }
}

/** 从 describe 视图发现本插件配置节的 ns；找不到返回 null（宿主未加载本插件/无 settings） */
export function discoverNs(view: SettingsDescribeView | null | undefined): string | null {
  const list = Array.isArray(view?.namespaces) ? (view as SettingsDescribeView).namespaces! : [];
  const known = new Set(list.map((n) => n?.ns));
  for (const c of NS_CANDIDATES) if (known.has(c)) return c;
  for (const n of list) {
    const v = n?.value;
    if (v && typeof v === "object" && NS_MARKER_KEYS.every((k) => k in (v as Record<string, unknown>))) return n.ns;
  }
  return null;
}

/** 当前已发现的 ns（读写路径共用；首次 describe 成功前为 null） */
let resolvedNs: string | null = null;

/** @internal 测试隔离用：重置 ns 发现缓存（模块级单例状态，跨用例泄漏防护） */
export function __resetDiscoveredNsForTest(): void {
  resolvedNs = null;
}

/** 读一次 describe 以发现并记忆 ns（已发现时直接返回） */
function ensureNs(): Promise<string | null> {
  if (resolvedNs !== null) return Promise.resolve(resolvedNs);
  return settingsRpc<RpcEnvelope<SettingsDescribeView>>("settings/describe", {})
    .then((j) => {
      resolvedNs = discoverNs(describeViewOf(j));
      return resolvedNs;
    })
    .catch(() => null);
}

export interface ConfigStore {
  getSnapshot(): PetConfig;
  subscribe(fn: () => void): () => void;
  set(patch: Partial<PetConfig>): void;
  attachScope(s: SettingsScopeLike | null): () => void;
}

export function createConfigStore(): ConfigStore {
  let scope: SettingsScopeLike | null = null;
  let pending: Record<string, unknown> = {};
  let prevUnsub: (() => void) | null = null;
  const listeners = new Set<() => void>();
  /** 每个 settings 字段独立的写序号：回调只认自己发起后的最新值，过期 settle 不回读 */
  const writeSeq: Record<string, number> = {};
  /** scope 死引用探测：连续无响应的 scope.set 次数，超过阈值后直写 HTTP */
  let scopeSilent = 0;
  const SCOPE_SILENT_MAX = 2;

  /**
   * HTTP 直写（settings/update RPC；0.1 = 命名空间，0.2 = entry id，ns 由 ensureNs 发现）。
   * scope 的 fiber 被 dispose（模块热重载/面板重挂）后 scope.set 可能静默 resolve、
   * 永不发网络请求；此时用这条直写通道兜底，保证切换仍生效。
   */
  const httpWrite = (k: string, v: unknown): Promise<void> =>
    ensureNs().then((ns) => {
      if (ns === null) throw new Error("foxbell-pet settings namespace not found");
      return settingsRpc<RpcEnvelope<unknown>>("settings/update", { ns, patch: { [k]: v } }).then((j) => {
        if (j?.result && j.result.ok === false) throw new Error("settings update rejected");
      });
    });

  /**
   * 真实校验：HTTP describe 读 user 层当前值。scope 快照是缓存，
   * fiber 死后永不更新，不能作为收敛判据。
   */
  const readUser = (k: string): Promise<unknown | null> =>
    ensureNs().then((ns) =>
      settingsRpc<RpcEnvelope<SettingsDescribeView>>("settings/describe", {}).then((j) => {
        const view = describeViewOf(j);
        const row = ns === null ? null : (view?.namespaces ?? []).find((n: SettingsNamespaceRow) => n.ns === ns);
        const user = row?.user && typeof row.user === "object" ? row.user : null;
        return user && k in user ? user[k] : null;
      }),
    );

  /** scope.set settle 后回读校验：以真实 describe 为准，scope 缓存不可信 */
  const verifyWrite = (k: string, v: unknown, seq: number, tries: number): void => {
    // 该字段在此期间又有新写入：交给那次写的回调校验
    if (writeSeq[k] !== seq) return;
    void readUser(k).then((actual) => {
      if (writeSeq[k] !== seq) return;
      if (actual === v) { scopeSilent = 0; delete pending[k]; emit(); return; }
      // 真实 user 层不是我们的值 → 写被吞/scope 死：直接 HTTP 直写兜底（最多 3 轮）
      if (tries <= 0) { delete pending[k]; emit(); return; }
      httpWrite(k, v).then(
        () => verifyWrite(k, v, seq, tries - 1),
        () => { delete pending[k]; emit(); },
      );
    }).catch(() => {
      if (tries <= 0) { delete pending[k]; emit(); return; }
      setTimeout(() => verifyWrite(k, v, seq, tries - 1), 400);
    });
  };

  const loadLocal = (): Partial<PetConfig> => {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (!raw) return {};
      const p = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(CFG_DEFAULT)) if (k in p) out[k] = sanitizeValue(k as keyof PetConfig, p[k]);
      return out as Partial<PetConfig>;
    } catch {
      return {};
    }
  };
  const saveLocal = (v: PetConfig) => {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(v)); } catch { /* ignore */ }
  };
  let local: PetConfig = { ...CFG_DEFAULT, ...loadLocal() };
  const emit = () => { for (const fn of [...listeners]) fn(); };

  const resolve = (): PetConfig => {
    if (scope === null) return local;
    const sv = scope.getSnapshot();
    if (!sv || sv.status !== "ready" || !sv.value || typeof sv.value !== "object") return local;
    // 只取 CFG_DEFAULT 的键（scope 里可能残留已移除字段，不并入）
    const merged: PetConfig = { ...CFG_DEFAULT, ...local };
    (merged.usageEnabled as unknown) = true; // v2.2.1 恒开：遗留 yaml false 不再生效（悬浮窗内容完整性）
    for (const k of Object.keys(CFG_DEFAULT) as (keyof PetConfig)[]) {
      if (pending[k] !== undefined) (merged[k] as unknown) = pending[k];
      else if (sv.value[k] !== undefined) (merged[k] as unknown) = sanitizeValue(k, sv.value[k]);
    }
    return merged;
  };

  return {
    getSnapshot: resolve,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    set(patch) {
      const next = { ...local };
      for (const k of Object.keys(CFG_DEFAULT) as (keyof PetConfig)[]) {
        if (patch[k] !== undefined) (next[k] as unknown) = sanitizeValue(k, patch[k]);
      }
      local = next;
      saveLocal(local);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        pending[k] = v;
        const seq = (writeSeq[k] ?? 0) + 1;
        writeSeq[k] = seq;
        // scope 死引用（fiber dispose 后 scope.set 静默 resolve、零网络请求）：
        // 探测到后跳过 scope 直接 HTTP 直写；scope 健在则仍走 scope（享受 revision 栅栏）。
        // 超时保护：scope.set 的 promise 可能因队列卡死/通道挂起永不 settle，超时后 HTTP 直写兜底。
        if (scope === null || scopeSilent >= SCOPE_SILENT_MAX) {
          httpWrite(k, v).then(
            () => { delete pending[k]; emit(); },
            () => { delete pending[k]; emit(); },
          );
        } else {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            verifyWrite(k, v, seq, 5);
          };
          scope.set(k, v).then(finish, () => { delete pending[k]; emit(); });
          // scope 写 3s 未 settle（队列死锁/通道挂起）→ HTTP 直写兜底
          setTimeout(() => {
            if (settled) return;
            if (writeSeq[k] !== seq) return;
            httpWrite(k, v).then(
              () => { delete pending[k]; emit(); },
              () => { delete pending[k]; emit(); },
            );
          }, 3000);
        }
      }
      emit();
    },
    attachScope(s) {
      if (s === null) {
        if (prevUnsub) { prevUnsub(); prevUnsub = null; }
        scope = null;
        pending = {};
        emit();
        return () => {};
      }
      if (scope === s) return () => {};
      if (prevUnsub) { prevUnsub(); prevUnsub = null; }
      let seeded = false;
      const sync = () => {
        const sv = s.getSnapshot();
        // 首次 ready 时做一次性 seed：localStorage 里 user 层没有的字段写进 scope
        if (!seeded && sv && sv.status === "ready") {
          seeded = true;
          const user = sv.user && typeof sv.user === "object" ? sv.user : {};
          const legacy = loadLocal();
          for (const k of Object.keys(CFG_DEFAULT)) {
            if (legacy[k as keyof PetConfig] !== undefined && !(k in user)) {
              pending[k] = legacy[k as keyof PetConfig];
              const seq = (writeSeq[k] ?? 0) + 1;
              writeSeq[k] = seq;
              s.set(k, legacy[k as keyof PetConfig]).then(
                () => verifyWrite(k, legacy[k as keyof PetConfig], seq, 5),
                () => { delete pending[k]; emit(); },
              );
            }
          }
        }
        emit();
      };
      scope = s;
      prevUnsub = s.subscribe(sync);
      sync();
      return () => { if (prevUnsub) prevUnsub(); prevUnsub = null; scope = null; pending = {}; emit(); };
    },
  };
}

// ---- HTTP RPC 版 settings scope（v2.1 / dsh 0.2 适配）----
// 0.1.x 的客户端 settingsScope 服务在 0.2 已删除；本适配器用 settings/describe +
// settings/update RPC 提供同形 scope（getSnapshot/subscribe/set），store 逻辑零改动。
// subscribe 以 8s 轮询 describe 模拟推送（双窗口配置同步；宿主侧 describe 每次全量
// 投影，不宜更高频）；轮询仅在存在订阅者时运行，最后一个退订即停止。

/** 适配器 describe 轮询间隔（ms）；导出供测试断言/覆盖 */
export const SCOPE_POLL_MS = 8000;

export function createHttpSettingsScope(): SettingsScopeLike {
  const listeners = new Set<() => void>();
  let snap: { status: string; value?: Record<string, unknown>; user?: Record<string, unknown> } = { status: "pending" };
  let timer: ReturnType<typeof setInterval> | null = null;

  const refresh = (): Promise<void> => {
    try {
      return settingsRpc<RpcEnvelope<SettingsDescribeView>>("settings/describe", {})
        .then((j) => {
          const view = describeViewOf(j);
          if (resolvedNs === null) resolvedNs = discoverNs(view);
          const row = resolvedNs === null
            ? null
            : (view?.namespaces ?? []).find((n) => n.ns === resolvedNs) ?? null;
          // 命中配置节才 ready（value = 宿主 resolved 配置投影）；未命中保持 pending，
          // 下轮重试（插件行尚未激活/宿主无 settings 的降级场景）。
          snap = row && row.value && typeof row.value === "object"
            ? {
                status: "ready",
                value: row.value as Record<string, unknown>,
                user: (row.user ?? {}) as Record<string, unknown>,
              }
            : { status: "pending" };
          for (const fn of [...listeners]) fn();
        })
        .catch(() => { /* 网络抖动/宿主不在场：保持上一次快照 */ });
    } catch {
      return Promise.resolve(); // fetch 全局缺失（极端环境）：静默，纯 localStorage 后端
    }
  };

  const startTimer = () => {
    if (timer !== null || typeof setInterval !== "function") return;
    timer = setInterval(() => { void refresh(); }, SCOPE_POLL_MS);
  };
  const stopTimer = () => {
    if (timer !== null) { clearInterval(timer); timer = null; }
  };

  return {
    getSnapshot: () => snap,
    subscribe(fn) {
      listeners.add(fn);
      startTimer();
      void refresh();
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) stopTimer();
      };
    },
    set(field, value) {
      return ensureNs().then((ns) => {
        if (ns === null) throw new Error("foxbell-pet settings namespace not found");
        return settingsRpc<RpcEnvelope<unknown>>("settings/update", { ns, patch: { [field]: value } }).then((j) => {
          if (j?.result && j.result.ok === false) throw new Error("settings update rejected");
        });
      });
    },
  };
}

// ---- 显隐 / 位置 / 闪切 / 守卫忽略（localStorage 小件）----

export function loadVisible(): boolean {
  try { return localStorage.getItem(STORE_KEY) !== "0"; } catch { return true; }
}
export function saveVisible(v: boolean): void {
  try { localStorage.setItem(STORE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
}

export interface PetPosition { x: number; y: number }

export function loadPosition(): PetPosition | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { x?: unknown; y?: unknown };
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return { x: p.x as number, y: p.y as number };
    }
    // v1 兜底：只存了 x（y 由调用方按地面落点补）
    const vx = parseInt(localStorage.getItem(X_KEY) ?? "", 10);
    if (Number.isFinite(vx) && vx >= 0) return { x: vx, y: NaN };
  } catch { /* ignore */ }
  return null;
}

export function savePosition(pos: PetPosition): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }));
    localStorage.setItem(X_KEY, String(Math.round(pos.x))); // v1 键同步维护（回归兼容）
  } catch { /* ignore */ }
}

export function loadFlashSwitched(): string | null {
  try { return localStorage.getItem(FLASH_SWITCHED_KEY); } catch { return null; }
}
export function saveFlashSwitched(id: string): void {
  try { localStorage.setItem(FLASH_SWITCHED_KEY, id); } catch { /* ignore */ }
}
export function clearFlashSwitched(): void {
  try { localStorage.removeItem(FLASH_SWITCHED_KEY); } catch { /* ignore */ }
}

/** 守卫忽略签名：id + 问题 kind/detail 排序串。签名一致不再弹；素材再变动会改变签名 */
export function guardSignature(id: string, issues: { kind: string; detail: string }[]): string {
  const sig = issues.map((i) => `${i.kind}:${i.detail}`).sort().join("|");
  return `${id}#${sig}`;
}
export function loadGuardIgnored(): string | null {
  try { return localStorage.getItem(GUARD_IGNORED_KEY); } catch { return null; }
}
export function saveGuardIgnored(sig: string): void {
  try { localStorage.setItem(GUARD_IGNORED_KEY, sig); } catch { /* ignore */ }
}
export function clearGuardIgnored(): void {
  try { localStorage.removeItem(GUARD_IGNORED_KEY); } catch { /* ignore */ }
}
