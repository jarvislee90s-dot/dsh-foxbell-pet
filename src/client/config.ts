// config.ts — 配置存储（localStorage + settings scope 双后端，乐观更新；v1.3.0 语义不变）。
// v2 新增 scale（三档缩放）与 activePetId（激活宠物，默认 foxbell）。
// 旧保存配置（无 scale/activePetId）加载即得默认值，零报错。
// localStorage 键沿用 dyn-pet-foxbell-* / dyn-foxbell-pet:* 前缀（不迁移，不碰 MAM 的 mam-* 键）。

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
};

const isAction = (v: unknown): v is PetAction => CFG_ACTIONS.includes(v as PetAction);
const isScale = (v: unknown): v is PetScale => CFG_SCALES.includes(v as PetScale);
const isPetIdStr = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);

export function sanitizeValue(k: keyof PetConfig, v: unknown): PetConfig[keyof PetConfig] {
  if ((ACTION_KEYS as readonly string[]).includes(k)) return isAction(v) ? v : CFG_DEFAULT[k as typeof ACTION_KEYS[number]];
  if (k === "scale") return isScale(v) ? v : 1;
  if (k === "activePetId") return isPetIdStr(v) ? v : "foxbell";
  return !!v; // booleans
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

// ---- settings scope 类型（客户端 settingsScope.bind 返回形状，rc.1 仍在）----
export interface SettingsScopeLike {
  getSnapshot(): { status: string; value?: Record<string, unknown>; user?: Record<string, unknown> };
  subscribe(fn: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
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
   * HTTP 直写（/api/settings/update，与 settings/update RPC 同一宿主端点）。
   * scope 的 fiber 被 dispose（模块热重载/面板重挂）后 scope.set 静默 resolve、
   * 永不发网络请求；此时用这条带 cookie 的直写通道兜底，保证切换仍生效。
   */
  const httpWrite = (k: string, v: unknown): Promise<void> =>
    fetch("/api/settings/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: `foxbell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        method: "settings/update",
        payload: { args: { ns: "foxbell-pet", patch: { [k]: v } } },
      }),
    }).then((r) => {
      if (!r.ok) throw new Error(`settings update HTTP ${r.status}`);
    });

  /**
   * 真实校验：HTTP describe 读 user 层当前值。scope 快照是 mirror 缓存，
   * fiber 死后永不更新，不能作为收敛判据。
   */
  const readUser = (k: string): Promise<unknown | null> =>
    fetch("/api/settings/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: `foxbell-desc-${Date.now().toString(36)}`,
        method: "settings/describe",
        payload: { args: {} },
      }),
    }).then((r) => r.json())
      .then((j) => {
        const ns = (j?.result?.value?.namespaces || []).find((n: { ns: string }) => n.ns === "foxbell-pet");
        const user = ns?.user && typeof ns.user === "object" ? ns.user : null;
        return user && k in user ? user[k] : null;
      });

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
