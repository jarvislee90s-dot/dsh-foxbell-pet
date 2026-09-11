// store.ts — 客户端全局单例：宿主 /state 轮询（P3 since 短路；可见 1.5s / 隐藏 5s 降频 P4）、
// petStore 显隐、cfgStore、对话框开关、激活宠物运行时（VoicePlayer 热替换）。
// 轮询与显隐解耦：隐藏宠物时仍轮询（v1.3.0 语义），但语音线整条不生效（playVoice 闸门）。
import { createConfigStore, loadVisible, saveVisible, type ConfigStore, type PetConfig } from "./config";
import { apiGet, ROUTE_PREFIX, type StateSnapshot, type VoiceSnapshotEntry } from "./api";
import { VoicePlayer, type VoiceEntry } from "./voices";
import { rowsFromSize, type PetManifestView } from "./validation";
import type { SettingsScopeLike } from "./config";

export const STATE_URL = `${ROUTE_PREFIX}/state`;
export const ACK_URL = `${ROUTE_PREFIX}/ack`;
export const DIAG_URL = `${ROUTE_PREFIX}/client-diag`;
export const POLL_INTERVAL_MS = 1500;
/** P4 页面不可见时轮询降频间隔（visibilitychange 由 index.tsx 注册重排） */
export const POLL_INTERVAL_HIDDEN_MS = 5000;

export const reportVisible = (v: boolean): void => {
  try { fetch(`${DIAG_URL}?visible=${v ? "1" : "0"}`).catch(() => {}); } catch { /* ignore */ }
};

export const ackProject = (agentId: string): void => {
  try { fetch(`${ACK_URL}?agentId=${encodeURIComponent(agentId)}`).catch(() => {}); } catch { /* ignore */ }
};

// ---- 显隐（侧栏 🦊 开关语义不变）----
type Listener = () => void;
const visibleListeners = new Set<Listener>();
let visible = loadVisible();

export const petStore = {
  get visible(): boolean { return visible; },
  set(v: boolean): void {
    visible = !!v;
    saveVisible(visible);
    reportVisible(visible);
    for (const l of [...visibleListeners]) l();
  },
  subscribe(l: Listener): () => void {
    visibleListeners.add(l);
    return () => { visibleListeners.delete(l); };
  },
};

export const cfgStore: ConfigStore = createConfigStore();

// ---- 激活宠物运行时（热切换：精灵/语音/清单热替换，无需刷新页面）----
export interface ActivePetRuntime {
  id: string;
  name: string;
  rows: 9 | 11;
  spriteUrl: string | null;
  hasVoice: boolean;
  hasSubtitle: boolean;
  rev: string;
}

const FOXBELL_RUNTIME: ActivePetRuntime = {
  id: "foxbell",
  name: "Foxbell",
  rows: 11,
  spriteUrl: `${ROUTE_PREFIX}/pets/foxbell/spritesheet.webp`,
  hasVoice: true,
  hasSubtitle: true,
  rev: "builtin",
};

export const voicePlayer = new VoicePlayer();

interface AppState {
  snapshot: StateSnapshot | null;
  runtime: ActivePetRuntime;
}

const listeners = new Set<() => void>();
const state: AppState = { snapshot: null, runtime: { ...FOXBELL_RUNTIME } };
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastSeq: number | null = null;
let lastRev: string | null = null; // P3：上轮全量快照修订号；仅全量路径更新，unchanged 响应不改写
let loadedKey = ""; // `${id}#${rev}` — 激活宠物或清单修订变化才重建 VoicePlayer

/** P3：unchanged 响应仅合并 ages（行序与全量 projects 一致），其余沿用旧快照。导出供测试。 */
export function mergeUnchanged(cur: StateSnapshot, res: { rev: string; unchanged: true; ages: string[]; seq: number }): StateSnapshot {
  const projects = (cur.projects || []).map((p, i) => ({ ...p, age: (res.ages && res.ages[i]) || p.age }));
  return { ...cur, seq: res.seq, rev: res.rev, projects };
}

/** P4 可变间隔调度：立即拉一次，其后每轮按当轮页面可见性选间隔（可见 1.5s / 隐藏 5s）。
 *  visibilitychange 时由 index.tsx 重入以立刻切换节奏（node 测试环境无 document，读取处全程守卫）。 */
export const schedulePoll = (): void => {
  if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null; }
  void pollOnce();
  const hidden = typeof document !== "undefined" && document.hidden;
  pollTimer = setTimeout(function tick() {
    void pollOnce().finally(() => {
      const h = typeof document !== "undefined" && document.hidden;
      pollTimer = setTimeout(tick, h ? POLL_INTERVAL_HIDDEN_MS : POLL_INTERVAL_MS);
    });
  }, hidden ? POLL_INTERVAL_HIDDEN_MS : POLL_INTERVAL_MS);
};

export const appStore = {
  getSnapshot: () => state.snapshot,
  getRuntime: () => state.runtime,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  emit() { for (const fn of [...listeners]) fn(); },
  /** 手动触发一次拉取（对话框落盘操作后即时刷新） */
  refresh() { void pollOnce(); },
  start() {
    schedulePoll();
  },
  stop() {
    if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null; }
  },
  /** 设置 scope 接线（settingsScope 不在场时静默，纯 localStorage 后端） */
  attachSettings(scope: SettingsScopeLike | null) {
    return cfgStore.attachScope(scope);
  },
};

/** 图集行数运行时自适应：spriteVersionNumber 可信则直取；0/缺失走 Image 解码探测。
 *  （导出供测试：v1=9 行 / v2=11 行快路径 + 探测回退是纯决策逻辑） */
export function resolveRows(spriteVersionNumber: number, spriteUrl: string | null): Promise<9 | 11> {
  if (spriteVersionNumber === 2) return Promise.resolve(11);
  if (spriteVersionNumber === 1) return Promise.resolve(9);
  if (!spriteUrl) return Promise.resolve(11);
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ""; resolve(11); }, 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(rowsFromSize(img.naturalWidth, img.naturalHeight) ?? 11);
    };
    img.onerror = () => { clearTimeout(timer); resolve(11); };
    img.src = spriteUrl;
  });
}

function entriesFromSnapshot(voices: VoiceSnapshotEntry[]): VoiceEntry[] {
  return voices.map((v, i) => ({
    index: i,
    group: v.group as VoiceEntry["group"],
    name: v.name,
    file: v.file,
    url: v.url,
  }));
}

/** 单次轮询（导出供测试驱动；生产由 schedulePoll 的可变间隔定时器调用） */
export async function pollOnce(): Promise<void> {
  let snap: StateSnapshot;
  try {
    // ?pet= 仅为宿主无 settings 服务时的降级提示（宿主白名单校验；settings 在场时被忽略）
    const hint = cfgStore.getSnapshot().activePetId;
    // P3 since 短路：携带上轮全量 rev，宿主未变时仅回 ages，省全量快照序列化
    const since = lastRev !== null ? `&since=${encodeURIComponent(lastRev)}` : "";
    snap = await apiGet<StateSnapshot>(`/state?pet=${encodeURIComponent(hint)}${since}`);
  } catch {
    return; // 宿主不在场/网络抖动：静默，下一轮再试
  }
  if (!snap || typeof snap.seq !== "number") return;
  if ((snap as { unchanged?: boolean }).unchanged === true) {
    state.snapshot = mergeUnchanged(state.snapshot!, snap as never);
    appStore.emit();
    return;
  }
  lastRev = typeof snap.rev === "string" ? snap.rev : null;
  state.snapshot = snap;

  // 激活宠物热替换：id 或清单修订变化才重建（防每轮轮询重载音频）
  const ap = snap.activePet;
  const key = ap ? `${ap.id}#${ap.rev}` : "";
  if (ap && key !== loadedKey) {
    loadedKey = key;
    const rows = await resolveRows(ap.spriteVersionNumber, ap.spriteUrl);
    // 后到者胜：探测期间又切换则丢弃本次结果
    if (loadedKey !== key) return;
    // 运行时能力以快照为准（宿主已按 manifest×磁盘可信度收敛；无语音宠物 = 只播动画不出声）
    state.runtime = {
      id: ap.id,
      name: ap.name,
      rows,
      spriteUrl: ap.spriteUrl,
      hasVoice: ap.hasVoice,
      hasSubtitle: ap.hasSubtitle,
      rev: ap.rev,
    };
    voicePlayer.load(entriesFromSnapshot(snap.voices));
  } else if (ap && state.runtime.id === ap.id) {
    // 同宠物：能力标志仍随快照刷新（管理对话框保存后 hasVoice 可能变化）
    state.runtime = { ...state.runtime, name: ap.name, hasVoice: ap.hasVoice, hasSubtitle: ap.hasSubtitle };
  }
  lastSeq = snap.seq;
  appStore.emit();
}

export function lastCompletionSeq(): number | null { return lastSeq; }

/** 当前激活宠物的 manifest（管理/修复用；内置从 /pets/foxbell/manifest.json 拉） */
export async function fetchManifest(id: string): Promise<PetManifestView | null> {
  try {
    return await apiGet<PetManifestView>(`/pets/${encodeURIComponent(id)}/manifest.json`);
  } catch {
    return null;
  }
}

export type { PetConfig };
