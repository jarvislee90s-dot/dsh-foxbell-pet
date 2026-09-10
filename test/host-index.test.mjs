// index.js 接线集成测试：真实 apply()（假 ctx/webServer，helper 与 routes.test.mjs 同款）
// 驱动 GET /state，断言 v2.1 效率看板 dashboard 下发与 12 项 Config 默认值（键名逐字契约）。
// DSH_HOME 重定向到临时目录（paths.js 尊重该变量），测试不触碰真实 ~/.dsh。
import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { apply, Config } from "../src/host/index.js";
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
  it("usage 四桶零值：day/requestTotal/cacheHitRate/userEst/grandTotal + session + models {}", async () => {
    const r = await d("/state");
    const u = r.body.dashboard.usage;
    expect(u.day).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(u.requestTotal).toBe(0);
    expect(u.cacheHitRate).toBe(0);
    expect(u.userEst).toBe(0);
    expect(u.grandTotal).toBe(0);
    expect(u.session).toBe(null);
    expect(u.models).toEqual({});
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
