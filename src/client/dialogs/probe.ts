// dialogs/probe.ts — 音频时长并行探测（MAM useVoiceDurationProbe + petRuntime.probeAudioDurationMs 移植）。
// Audio.preload="metadata" 只读头部；8s 超时；失败重试 ≤2 次（500ms 间隔）。
import { PetError } from "../errors";

export const PROBE_TIMEOUT_MS = 8000;
export const PROBE_RETRY_DELAY_MS = 500;
export const PROBE_MAX_AUTO_RETRIES = 2;

/** 音频时长探测（毫秒）；失败抛 PetError（audio-timeout / audio-bad-duration / audio-load-fail） */
export function probeAudioDurationMs(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<number> {
  return new Promise((resolve, reject) => {
    const a = new Audio();
    a.preload = "metadata";
    const timer = setTimeout(() => {
      a.src = "";
      reject(new PetError("audio-timeout"));
    }, timeoutMs);
    a.onloadedmetadata = () => {
      clearTimeout(timer);
      const d = a.duration;
      a.src = "";
      if (Number.isFinite(d) && d > 0) resolve(Math.round(d * 1000));
      else reject(new PetError("audio-bad-duration"));
    };
    a.onerror = () => {
      clearTimeout(timer);
      a.src = "";
      reject(new PetError("audio-load-fail"));
    };
    a.src = url;
  });
}

/** 图集行数探测（Image 解码，8s 超时；MAM probeSheetRows） */
export function probeSheetSize(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = "";
      reject(new PetError("sheet-timeout"));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new PetError("sheet-load-fail"));
    };
    img.src = url;
  });
}

/** 带重试的探测：失败 → 500ms 后重试，至多 2 次自动重试；仍失败返回 null */
export async function probeWithRetry(url: string): Promise<number | null> {
  for (let attempt = 0; attempt <= PROBE_MAX_AUTO_RETRIES; attempt++) {
    try {
      return await probeAudioDurationMs(url);
    } catch {
      if (attempt < PROBE_MAX_AUTO_RETRIES) await new Promise((r) => setTimeout(r, PROBE_RETRY_DELAY_MS));
    }
  }
  return null;
}

/** 并行探测一组 {rel,url}（Promise.all 全量并行，MAM 同策略）；返回 rel → durationMs|null */
export async function probeAll(
  items: { rel: string; url: string }[]
): Promise<Map<string, number | null>> {
  const results = await Promise.all(
    items.map(async (it) => [it.rel, await probeWithRetry(it.url)] as [string, number | null])
  );
  return new Map(results);
}
