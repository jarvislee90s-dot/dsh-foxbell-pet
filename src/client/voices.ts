// voices.ts — 语音系统（MAM petVoices.ts 移植）：manifest 解析、组内随机不重复、
// 字幕时长对齐、预载播放。URL 由宿主 /state 快照下发（/pets/<id>/voice/…）。
import type { VoiceGroup } from "./validation";

export interface VoiceEntry {
  index: number;
  group: VoiceGroup;
  name: string;
  file: string;
  url: string;
}

// v2.1：+usage（看板警报三优先级语音组；playable 全集见 validation.PLAY_GROUPS）
const GROUPS: VoiceGroup[] = ["general", "approval", "done", "error", "usage"];

/** 组内随机、不与上次连续重复（spec E3） */
export function pickIndex(len: number, lastIndex: number): number {
  if (len <= 0) return -1;
  if (len === 1) return 0;
  let i = Math.floor(Math.random() * len);
  while (i === lastIndex) i = Math.floor(Math.random() * len);
  return i;
}

export const MIN_SPEECH_MS = 2500;

/** 字幕时长 = max(2.5s, 音频时长+0.25s)（spec E4） */
export function subtitleMs(durationSec: number): number {
  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : 0;
  return Math.max(MIN_SPEECH_MS, d + 250);
}

/**
 * 播放器：每条语音一个预载 Audio 元素（即时出声）。
 * muted 只拦声音；talkative/hasSubtitle 由调用方决定是否传 onSubtitle。
 * unlock：首次用户手势内 muted 试播，解除浏览器自动播放限制（spec E6）。
 */
export class VoicePlayer {
  private entries: VoiceEntry[] = [];
  private els: HTMLAudioElement[] = [];
  private lastIdx: Partial<Record<VoiceGroup, number>> = {};
  private shared: HTMLAudioElement | null = null;
  private unlocked = false;

  load(entries: VoiceEntry[]): void {
    this.dispose();
    this.entries = entries;
    try {
      this.els = entries.map((v) => {
        const a = new Audio(v.url);
        a.preload = "auto";
        a.load();
        return a;
      });
    } catch {
      this.els = []; // 无音频环境：静默降级
    }
  }

  /** 组内挑一条（组空时仅 general 回落全池；其余组返回 null，spec E5） */
  pick(group: VoiceGroup): VoiceEntry | null {
    const list = this.entries.filter((v) => v.group === group);
    const pool = list.length > 0 ? list : group === "general" ? this.entries : [];
    if (pool.length === 0) return null;
    const i = pickIndex(pool.length, this.lastIdx[group] ?? -1);
    this.lastIdx[group] = i;
    return pool[i];
  }

  /** 播放 + 字幕回调（ms 后隐藏字幕由调用方定时） */
  play(
    entry: VoiceEntry,
    opts: { muted: boolean; onSubtitle?: (name: string, ms: number) => void }
  ): void {
    if (opts.muted) return;
    const el = this.els[entry.index];
    try {
      if (el) {
        for (const a of this.els) if (a !== el && !a.paused) a.pause();
        el.currentTime = 0;
        const pr = el.play();
        if (pr && typeof pr.catch === "function") pr.catch(() => { /* blocked：等 unlock */ });
        const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
        opts.onSubtitle?.(entry.name, subtitleMs(dur));
      } else {
        if (!this.shared) this.shared = new Audio();
        this.shared.src = entry.url;
        const pr = this.shared.play();
        if (pr && typeof pr.catch === "function") pr.catch(() => { /* ignore */ });
        const s = this.shared;
        const dur = Number.isFinite(s.duration) && s.duration > 0 ? s.duration : 0;
        opts.onSubtitle?.(entry.name, subtitleMs(dur));
      }
    } catch {
      // ignore
    }
  }

  /** 首次手势内调用：muted 试播解锁自动播放（spec E6） */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    const el = this.els[0] ?? this.shared;
    try {
      if (el) {
        el.muted = true;
        const pr = el.play();
        if (pr && typeof pr.catch === "function") pr.catch(() => {});
        el.pause();
        el.muted = false;
      }
    } catch {
      // ignore
    }
  }

  dispose(): void {
    for (const a of this.els) {
      try { a.pause(); a.src = ""; } catch { /* ignore */ }
    }
    this.els = [];
    this.entries = [];
    this.lastIdx = {};
  }
}

export { GROUPS };
