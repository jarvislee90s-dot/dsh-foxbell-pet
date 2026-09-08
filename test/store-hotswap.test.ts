// store-hotswap.test.ts — 浏览器侧热切换/图集自适应/能力标志链（R2 自审补强）。
// node 环境最小桩：localStorage / Audio / Image / fetch（store.ts 的浏览器面全部有
// try/catch 守护，桩只为驱动决策逻辑，不 mock 文件系统）。
import { describe, expect, it, vi } from "vitest";

// ---- 环境桩（必须在 import store 之前装好：模块加载期会读 localStorage）----
const lsStore = new Map<string, string>();
(globalThis as unknown as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (lsStore.has(k) ? lsStore.get(k)! : null),
  setItem: (k: string, v: string) => { lsStore.set(k, String(v)); },
  removeItem: (k: string) => { lsStore.delete(k); },
};

class FakeAudio {
  static instances: FakeAudio[] = [];
  src = "";
  preload = "";
  constructor(src?: string) { this.src = src ?? ""; FakeAudio.instances.push(this); }
  load(): Promise<void> { return Promise.resolve(); }
  play(): Promise<void> { return Promise.resolve(); }
  pause(): void { /* noop */ }
}
const images: FakeImage[] = [];
class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  get src(): string { return this._src; }
  set src(v: string) { this._src = v; } // 测试手动触发 onload/onerror（模拟解码完成）
  constructor() { images.push(this); }
}
(globalThis as unknown as Record<string, unknown>).Audio = FakeAudio;
(globalThis as unknown as Record<string, unknown>).Image = FakeImage;

// /state 响应由测试逐轮替换
let nextSnapshot: unknown = null;
let fetchCalls = 0;
(globalThis as unknown as Record<string, unknown>).fetch = (async () => {
  fetchCalls += 1;
  return { ok: true, status: 200, json: async () => nextSnapshot };
}) as unknown;

const { appStore, pollOnce, resolveRows, voicePlayer } = await import("../src/client/store");

// ---- 快照工厂（StateSnapshot 形状；只填 pollOnce 消费的字段）----
const snap = (activePet: Record<string, unknown>, voices: unknown[] = [], seq = 1) => ({
  seq, completions: [], runningSessions: 0, projects: [], voices,
  activePet, pets: [], guard: [], assetDir: null, spriteBytes: null, diag: {},
});
const pet = (id: string, rev: string, over: Record<string, unknown> = {}) => ({
  id, name: id, hasVoice: true, hasSubtitle: true,
  spriteVersionNumber: 2, spriteUrl: `/dyn-pet-foxbell/pets/${id}/spritesheet.webp`, rev, ...over,
});

describe("resolveRows（图集 9/11 行运行时自适应）", () => {
  it("v2 快路径 → 11 行；v1 快路径 → 9 行（不触发 Image 探测）", async () => {
    const before = images.length;
    expect(await resolveRows(2, "u")).toBe(11);
    expect(await resolveRows(1, "u")).toBe(9);
    expect(images.length).toBe(before); // 零探测
  });
  it("version=0 且无 URL → 兜底 11", async () => {
    expect(await resolveRows(0, null)).toBe(11);
  });
  it("version=0 → Image 探测：1536×1872 → 9 行；1536×2288 → 11 行", async () => {
    const p1 = resolveRows(0, "sheet-a");
    const img1 = images[images.length - 1];
    img1.naturalWidth = 1536; img1.naturalHeight = 1872;
    img1.onload?.();
    expect(await p1).toBe(9);
    const p2 = resolveRows(0, "sheet-b");
    const img2 = images[images.length - 1];
    img2.naturalWidth = 1536; img2.naturalHeight = 2288;
    img2.onload?.();
    expect(await p2).toBe(11);
  });
  it("探测 onerror → 兜底 11（不裂图）", async () => {
    const p = resolveRows(0, "broken");
    images[images.length - 1].onerror?.();
    expect(await p).toBe(11);
  });
});

describe("pollOnce 热切换（${id}#${rev} 键控，无需刷新页面）", () => {
  it("首轮：内置 foxbell v2 → runtime rows=11，voicePlayer 装载语音", async () => {
    const loadSpy = vi.spyOn(voicePlayer, "load");
    nextSnapshot = snap(pet("foxbell", "builtin"), [
      { index: 0, group: "general", name: "你好", file: "voice/general/你好.m4a", url: "/u0" },
    ]);
    await pollOnce();
    const rt = appStore.getRuntime();
    expect(rt.id).toBe("foxbell");
    expect(rt.rows).toBe(11);
    expect(rt.hasVoice).toBe(true);
    expect(appStore.getSnapshot()?.seq).toBe(1);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    loadSpy.mockRestore();
  });
  it("切换到外部 v1（9 行）宠物：runtime 与语音整链热替换（load 再次触发）", async () => {
    const loadSpy = vi.spyOn(voicePlayer, "load");
    nextSnapshot = snap(pet("oldpet", "111", { spriteVersionNumber: 1 }), [
      { index: 0, group: "done", name: "a", file: "voice/done/a.m4a", url: "/a" },
    ], 2);
    await pollOnce();
    const rt = appStore.getRuntime();
    expect(rt.id).toBe("oldpet");
    expect(rt.rows).toBe(9); // v1 图集 → 9 行（look 行缺失由本体静默跳过）
    expect(loadSpy).toHaveBeenCalledTimes(1);
    loadSpy.mockRestore();
  });
  it("同宠物同修订再轮询：不重建 voicePlayer（防每轮重载音频）", async () => {
    const loadSpy = vi.spyOn(voicePlayer, "load");
    nextSnapshot = snap(pet("oldpet", "111", { spriteVersionNumber: 1 }), [], 3);
    await pollOnce();
    expect(loadSpy).not.toHaveBeenCalled();
    expect(appStore.getRuntime().id).toBe("oldpet");
    loadSpy.mockRestore();
  });
  it("同宠物清单修订变化（rev 111→222）：仍触发重建（管理保存后语音热更新）", async () => {
    const loadSpy = vi.spyOn(voicePlayer, "load");
    nextSnapshot = snap(pet("oldpet", "222", { spriteVersionNumber: 1 }), [], 4);
    await pollOnce();
    expect(loadSpy).toHaveBeenCalledTimes(1);
    loadSpy.mockRestore();
  });
  it("无语音+无字幕宠物：runtime 能力标志随快照收敛（静音闸门输入）", async () => {
    nextSnapshot = snap(pet("mute", "900", { hasVoice: false, hasSubtitle: false }), [], 5);
    await pollOnce();
    const rt = appStore.getRuntime();
    expect(rt.id).toBe("mute");
    expect(rt.hasVoice).toBe(false);
    expect(rt.hasSubtitle).toBe(false);
  });
  it("后到者胜：探测中途再次切换 → 旧探测结果被丢弃", async () => {
    // petB version=0 → 走 Image 探测（挂起）
    nextSnapshot = snap(pet("petB", "b1", { spriteVersionNumber: 0 }), [], 6);
    const p1 = pollOnce();
    const pending = images[images.length - 1];
    // 探测未决期间切到 petC（v2 快路径，立即完成）
    nextSnapshot = snap(pet("petC", "c1"), [], 7);
    await pollOnce();
    expect(appStore.getRuntime().id).toBe("petC");
    // 旧探测姗姗来迟：9 行结果不得覆盖 petC
    pending.naturalWidth = 1536; pending.naturalHeight = 1872;
    pending.onload?.();
    await p1;
    const rt = appStore.getRuntime();
    expect(rt.id).toBe("petC");
    expect(rt.rows).toBe(11);
  });
  it("宿主不在场（fetch 抛错）：静默返回，runtime 保持上一轮", async () => {
    const before = appStore.getRuntime();
    (globalThis as unknown as Record<string, unknown>).fetch = (async () => { throw new Error("network down"); }) as unknown;
    await pollOnce(); // 不抛
    expect(appStore.getRuntime()).toBe(before);
    (globalThis as unknown as Record<string, unknown>).fetch = (async () => ({
      ok: true, status: 200, json: async () => nextSnapshot,
    })) as unknown;
  });
  it("轮询 URL 携带 ?pet= 降级提示（settings 不在场时宿主角色的 hint）", async () => {
    let seenUrl = "";
    (globalThis as unknown as Record<string, unknown>).fetch = (async (url: string) => {
      seenUrl = url;
      return { ok: true, status: 200, json: async () => nextSnapshot };
    }) as unknown;
    nextSnapshot = snap(pet("petC", "c1"), [], 8);
    await pollOnce();
    expect(seenUrl).toContain("/dyn-pet-foxbell/state?pet=");
  });
});
