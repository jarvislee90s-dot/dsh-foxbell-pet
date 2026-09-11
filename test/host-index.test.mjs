// index.js 接线集成测试：真实 apply()（假 ctx/webServer，helper 与 routes.test.mjs 同款）
// 驱动 GET /state，断言 v2.1 效率看板 dashboard 下发与 12 项 Config 默认值（键名逐字契约）。
// DSH_HOME 重定向到临时目录（paths.js 尊重该变量），测试不触碰真实 ~/.dsh。
import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { apply, Config, __testables } from "../src/host/index.js";
import { ROUTE_PREFIX } from "../src/host/routes.js";

// ---- 假 cordis ctx + webServer（mock 注册表 + 直调 handler，routes.test.mjs 同款）----
function makeCtx() {
  const routes = { exact: new Map(), prefix: [] };
  const webServer = {
    register(route) {
      if (route.kind === "exact") routes.exact.set(route.path, route.handler);
      else routes.prefix.push({ path: route.path, handler: route.handler });
      return () => { routes.exact.delete(route.path); };
    },
  };
  const ctx = {
    get: (name) => (name === "webServer" ? webServer : undefined),
    effect: (fn) => { fn(); },
    // settings 不在场：ctx.inject 无操作（不调 cb），走降级分支静默跳过 installSection
    inject: () => {},
  };
  const dispatch = async (method, url) => {
    const u = new URL(url, "http://localhost:3080");
    const handler = routes.exact.get(u.pathname)
      ?? routes.prefix.find((p) => u.pathname === p.path || u.pathname.startsWith(p.path + "/") || u.pathname.startsWith(p.path))?.handler;
    if (!handler) return { status: 404, body: null, headers: {} };
    const req = Object.assign(Readable.from([]), { method, url: u.pathname + u.search, headers: { host: "localhost:3080" } });
    let status = 200;
    let respHeaders = {};
    const chunks = [];
    const res = {
      writeHead(s, h) { status = s; respHeaders = h ?? {}; },
      end(b) { if (b) chunks.push(Buffer.isBuffer(b) ? b : Buffer.from(b)); },
    };
    await handler(req, res);
    const raw = Buffer.concat(chunks);
    let parsed = null;
    if (String(respHeaders["content-type"] ?? "").includes("json")) {
      try { parsed = JSON.parse(raw.toString("utf8")); } catch { parsed = null; }
    }
    return { status, body: parsed, raw, headers: respHeaders };
  };
  return { ctx, dispatch };
}

/** 在隔离 DSH_HOME 下真实挂载插件并返回 dispatch（config 直通 apply） */
async function mount(config) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-index-"));
  process.env.DSH_HOME = home;
  const made = makeCtx();
  await apply(made.ctx, config);
  return { home, dispatch: (p) => made.dispatch("GET", `${ROUTE_PREFIX}${p}`) };
}

beforeAll(() => {
  // 兜底：任何未被 mount 覆盖的 paths 调用也绝不落到真实 ~/.dsh
  process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-index-base-"));
});

// ---- 12 项 Config 默认值（键名逐字契约：typo 会静默破坏客户端持久化）----
describe("Config 12 字段（v2.1 效率看板）", () => {
  it("键名与默认值逐字对齐计划契约", () => {
    const resolved = Config({});
    expect(resolved.paceEnabled).toBe(true);
    expect(resolved.paceIntenseEvents).toBe(12);
    expect(resolved.paceLongrunMin).toBe(3);
    expect(resolved.paceLoafStartMin).toBe(15);
    expect(resolved.usageEnabled).toBe(true);
    expect(resolved.dayLimitTokens).toBe(0);
    expect(resolved.milestoneUnit).toBe(1000000);
    expect(resolved.approvalFlickerMin).toBe(5);
    expect(resolved.summaryEnabled).toBe(true);
    expect(resolved.summaryEntrySec).toBe(15);
    expect(resolved.boardTtlSec).toBe(15);
    expect(resolved.ttsEnabled).toBe(false);
  });
  it("旧配置无看板字段 → schema default 自动补齐，既有键不受影响", () => {
    const resolved = Config({ muted: true, scale: 0.75 });
    expect(resolved.muted).toBe(true);
    expect(resolved.scale).toBe(0.75);
    expect(resolved.paceEnabled).toBe(true);
    expect(resolved.ttsEnabled).toBe(false);
  });
});

describe("GET /state 下发 dashboard（默认配置，无会话）", () => {
  let d;
  beforeAll(async () => { ({ dispatch: d } = await mount({})); });

  it("dashboard.pace.tier === 'idle' 且 alerts/approvals 为空", async () => {
    const r = await d("/state");
    expect(r.status).toBe(200);
    expect("dashboard" in r.body).toBe(true);
    expect(r.body.dashboard.pace.tier).toBe("idle");
    expect(r.body.dashboard.pace.sinceMs).toBe(null);
    expect(r.body.dashboard.alerts).toEqual([]);
    expect(r.body.dashboard.approvals).toEqual([]);
  });
  it("usage 四桶零值：day/requestTotal/cacheHitRate/userEst/grandTotal + session + models 空数组", async () => {
    const r = await d("/state");
    const u = r.body.dashboard.usage;
    expect(u.day).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(u.requestTotal).toBe(0);
    expect(u.cacheHitRate).toBe(0);
    expect(u.userEst).toBe(0);
    expect(u.grandTotal).toBe(0);
    expect(u.session).toBe(null);
    // v2.2 Task 4：usage.models 由 {} 二期占位桶转正为 RouteAgg[]（无会话 → 空数组）
    expect(u.models).toEqual([]);
  });
  it("summary.tokensText 含「请求输入 0（缓存命中 0 · 0.0%）」", async () => {
    const r = await d("/state");
    expect(r.body.dashboard.summary.tokensText).toContain("请求输入 0（缓存命中 0 · 0.0%）");
    expect(r.body.dashboard.summary.sessions).toBe(0);
  });
  it("回归：既有 /state 字段全部仍在（v1 + v2 扩展）", async () => {
    const r = await d("/state");
    for (const k of ["seq", "completions", "runningSessions", "projects", "voices", "activePet", "pets", "guard", "assetDir", "spriteBytes", "diag"]) {
      expect(k in r.body, `missing ${k}`).toBe(true);
    }
    expect(r.headers["cache-control"]).toBe("no-store");
  });
});

describe("readConfig 接线（引擎消费 live 配置）", () => {
  it("paceEnabled: false 透传引擎 → dashboard.pace 为 null（关闭语义）", async () => {
    const { dispatch } = await mount({ paceEnabled: false });
    const r = await dispatch("/state");
    expect(r.status).toBe(200);
    expect(r.body.dashboard.pace).toBe(null);
    // 其余看板块不受 pace 门影响
    expect(r.body.dashboard.usage.requestTotal).toBe(0);
    expect(r.body.dashboard.summary.tokensText).toContain("请求输入 0");
  });
});

// ---- v2.2 Config 新增 3 键（R6 侧栏入口 / R8 导出评语与姿态；客户端 Task 10/13/14 消费同名键）----
describe("Config v2.2 新增 3 键（键名与默认值契约）", () => {
  it("dashboardSidebarEntry/exportQuote/exportPose 默认值", () => {
    const resolved = Config({});
    expect(resolved.dashboardSidebarEntry).toBe(false);
    expect(resolved.exportQuote).toBe("");
    expect(resolved.exportPose).toBe("random");
  });
  it("旧配置无新键 → schema default 自动补齐，既有键不受影响", () => {
    const resolved = Config({ muted: true, ttsEnabled: true });
    expect(resolved.dashboardSidebarEntry).toBe(false);
    expect(resolved.exportQuote).toBe("");
    expect(resolved.exportPose).toBe("random");
    expect(resolved.muted).toBe(true);
    expect(resolved.ttsEnabled).toBe(true);
  });
});

// ---- v2.2 P2：宠物目录/清单 mtime 指纹缓存（spec R1）----
describe("listPetsCached mtime 指纹缓存", () => {
  it("同 root 两次调用返回同一数组引用（缓存命中 = 未重扫）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-p2-"));
    try {
      const a = __testables.listPetsCached(dir);
      const b = __testables.listPetsCached(dir);
      expect(Array.isArray(a)).toBe(true);
      expect(a).toBe(b); // 同一数组引用 = 未重扫
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("root mtime 变化后重扫：返回新引用且内容反映新目录", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-p2-"));
    try {
      const a = __testables.listPetsCached(dir);
      fs.mkdirSync(path.join(dir, "pet-a"));
      const b = __testables.listPetsCached(dir);
      expect(b).not.toBe(a); // 目录 mtime 已变 → 必须重扫
      expect(b.map((p) => p.id)).toContain("pet-a");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- v2.2 P2 评审修复：清单编辑即时失效（逐宠物 manifest mtime 复验）----
// listPets 把 manifest 派生字段（displayName/description/…）烤进每个条目（scan.js），而
// manifest 编辑路由在 <PETS_ROOT>/<petId>/ 内 tmp+rename 原子重写——只动 manifest 与宠物
// 子目录的 mtime，PETS_ROOT 的 mtime 不变 → pets[] 缓存必须逐宠物复验 manifest.json mtime。
// mtime 粒度不确定性用 fs.utimesSync 显式设置两个可区分 mtime 消除（确定性、不掩盖语义）。
const MANIFEST_MTIME_BASE_MS = 1_700_000_000_000;

/** 最小合法 manifest（parseManifest 宽松读口径：description/source/spritesheetSizeBytes/voices 可省略） */
function makeManifest(id, displayName) {
  return { schemaVersion: 2, id, displayName, description: "", hasVoice: false, hasSubtitle: false, spriteVersionNumber: 1 };
}

/** writeManifest 同款原子写（同目录 tmp + rename，只动宠物子目录/manifest 的 mtime）+ utimesSync 强制可区分 mtime */
function writeManifestAtomic(petDir, manifest, mtimeMs) {
  const target = path.join(petDir, "manifest.json");
  const tmp = path.join(petDir, "manifest.json.tmp");
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, target);
  fs.utimesSync(target, new Date(mtimeMs), new Date(mtimeMs));
}

describe("listPetsCached/loadManifestCached 清单编辑即时失效（评审修复）", () => {
  it("清单编辑后 PETS_ROOT mtime 不变，listPetsCached 仍反映新 displayName（旧实现返回陈旧条目）", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-p2-"));
    try {
      const petDir = path.join(root, "pet-a");
      fs.mkdirSync(petDir);
      writeManifestAtomic(petDir, makeManifest("pet-a", "Old Name"), MANIFEST_MTIME_BASE_MS);
      const before = __testables.listPetsCached(root);
      expect(before.find((p) => p.id === "pet-a").displayName).toBe("Old Name");
      // 同宠物目录内 tmp+rename：manifest 与 pet-a 子目录 mtime 变，PETS_ROOT mtime 不变
      const rootMtimeBefore = fs.statSync(root).mtimeMs;
      writeManifestAtomic(petDir, makeManifest("pet-a", "New Name"), MANIFEST_MTIME_BASE_MS + 60_000);
      expect(fs.statSync(root).mtimeMs).toBe(rootMtimeBefore); // 前提成立：root 指纹确实未变
      const after = __testables.listPetsCached(root);
      expect(after.find((p) => p.id === "pet-a").displayName).toBe("New Name");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("loadManifestCached：同目录清单原子重写后下次调用反映新 displayName", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-p2-"));
    try {
      const petDir = path.join(root, "pet-a");
      fs.mkdirSync(petDir);
      writeManifestAtomic(petDir, makeManifest("pet-a", "Old Name"), MANIFEST_MTIME_BASE_MS);
      const before = __testables.loadManifestCached(petDir, { id: "pet-a" });
      expect(before.displayName).toBe("Old Name");
      writeManifestAtomic(petDir, makeManifest("pet-a", "New Name"), MANIFEST_MTIME_BASE_MS + 60_000);
      const after = __testables.loadManifestCached(petDir, { id: "pet-a" });
      expect(after.displayName).toBe("New Name");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
