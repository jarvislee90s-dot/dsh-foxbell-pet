// voiceowner.ts — v2.2.1 唯一发声方（多标签页语音重叠修复）。
// Web Locks 选主：同时打开的多个 DSH 页面只有持锁页播放“自动播报”（状态切换语音/警报音）；
// 持锁页关闭后其余页面 3s 内自动接手；不支持 navigator.locks 的环境退化为现状（每页可发声，绝不变静音）。
// 范围：仅自动播报。用户手势（双击说话等）不仲裁——在哪页交互就在哪页发声。
// 可见优先：发声方页面转 hidden 主动让位，可见页面立即尝试接手（用户看着的页面优先出声）。

let owner = false;
const listeners = new Set<() => void>();
let started = false;
let generation = 0;
let pending = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let release: (() => void) | null = null; // 持锁期间的 resolver（hidden 让位时提前 resolve 释放锁）

interface LockManagerLike {
  request(name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void>): Promise<unknown>;
}

export function isVoiceOwner(): boolean {
  return owner;
}

export function onVoiceOwnershipChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit(): void {
  for (const fn of [...listeners]) { try { fn(); } catch { /* ignore */ } }
}

function getLocks(): LockManagerLike | null {
  try {
    const locks = (navigator as unknown as { locks?: LockManagerLike }).locks;
    return locks && typeof locks.request === "function" ? locks : null;
  } catch {
    return null;
  }
}

const LOCK_NAME = "foxbell-voice-owner";

function clearRetry(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
}

function acquire(): void {
  if (!started || pending || release) return;
  clearRetry();
  const locks = getLocks();
  if (!locks) {
    // 没有 Web Locks 时维持旧行为：各页面仍可播放语音。
    if (!owner) { owner = true; emit(); }
    return;
  }
  const epoch = generation;
  const retry = (ms: number) => {
    if (epoch !== generation) return;
    clearRetry();
    retryTimer = setTimeout(acquire, ms);
  };
  pending = true;
  void locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
    if (epoch !== generation) return;
    pending = false;
    if (!lock) {
      if (owner) { owner = false; emit(); }
      retry(2500 + Math.floor(Math.random() * 1000));
      return;
    }
    await new Promise<void>((resolve) => {
      release = resolve;
      owner = true;
      emit();
    });
    if (epoch !== generation) return;
    release = null;
    if (owner) { owner = false; emit(); }
    if (typeof document !== "undefined" && !document.hidden) retry(0);
  }).catch(() => {
    if (epoch !== generation) return;
    pending = false;
    retry(3000);
  });
}

function onVisibility(): void {
  const hidden = typeof document !== "undefined" && document.hidden;
  if (hidden && owner && release) {
    const r = release;
    release = null;
    r(); // 让位：可见页面（含本页回到可见时）将接手
  } else if (!hidden && !owner) {
    acquire(); // 回到可见且非发声方：立即尝试接手（不等重试周期）
  }
}

export function startVoiceOwnership(): void {
  if (started) return;
  started = true;
  try {
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", onVisibility);
    }
  } catch { /* ignore */ }
  acquire();
}

export function stopVoiceOwnership(): void {
  if (!started) return;
  started = false;
  generation += 1;
  pending = false;
  clearRetry();
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  const done = release;
  release = null;
  done?.();
  if (owner) { owner = false; emit(); }
}
