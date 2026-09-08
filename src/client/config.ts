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
export const ACTION_KEYS = ["doneAction", "dblAction", "approvalAction", "errorAction"] as const;

export const CFG_DEFAULT: PetConfig = {
  muted: false,
  talkative: true,
  doneAction: "jumping",
  dblAction: "waving",
  approvalAction: "waiting",
  errorAction: "failed",
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
      if (scope !== null) {
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) continue;
          pending[k] = v;
          scope.set(k, v).then(
            () => { delete pending[k]; emit(); },
            () => { delete pending[k]; emit(); },
          );
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
              s.set(k, legacy[k as keyof PetConfig]).then(
                () => { delete pending[k]; emit(); },
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
