// 路由族集成测试：假 webServer/ctx 直接驱动 handler。
// 覆盖：/state 快照形状（activePet/pets/guard/voices）、/ack、资产路由、四来源导入闭环、
// 改名/删除/清单更新/激活守卫、安全拒绝（../ id、绝对路径、非 allowlist 域、跨源 Origin）。
import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { registerRoutes, ROUTE_PREFIX } from "../src/host/routes.js";
import { createStateEngine } from "../src/host/state.js";
import { writeManifest, parseManifest } from "../src/host/manifest.js";
import { buildZip } from "./helpers/zipwriter.mjs";

// ---- 假 cordis ctx + webServer ----
function makeCtx() {
  const routes = { exact: new Map(), prefix: [] };
  const webServer = {
    register(route) {
      if (route.kind === "exact") {
        if (routes.exact.has(route.path)) throw new Error(`duplicate ${route.path}`);
        routes.exact.set(route.path, route.handler);
      } else {
        routes.prefix.push({ path: route.path, handler: route.handler });
        routes.prefix.sort((a, b) => b.path.length - a.path.length);
      }
      return () => { routes.exact.delete(route.path); };
    },
  };
  const ctx = {
    get: (name) => (name === "webServer" ? webServer : undefined),
    effect: (fn) => { fn(); },
  };
  const dispatch = async (method, url, { body = null, headers = {} } = {}) => {
    const u = new URL(url, "http://localhost:3080");
    const handler = routes.exact.get(u.pathname)
      ?? routes.prefix.find((p) => u.pathname === p.path || u.pathname.startsWith(p.path + "/") || u.pathname.startsWith(p.path))?.handler;
    if (!handler) return { status: 404, body: null, headers: {} };
    const req = Object.assign(Readable.from(body ? [Buffer.isBuffer(body) ? body : Buffer.from(body)] : []), {
      method,
      url: u.pathname + u.search,
      headers: { host: "localhost:3080", ...headers },
    });
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
  return { ctx, dispatch, routes };
}

function makeEnv(root) {
  const petsRoot = path.join(root, "pets");
  const stagingRoot = path.join(petsRoot, ".import-staging");
  const trashRoot = path.join(root, ".trash");
  const codexRootDir = path.join(root, "codex-pets");
  const tmpDir = path.join(root, "tmp");
  for (const d of [petsRoot, stagingRoot, trashRoot, codexRootDir, tmpDir]) fs.mkdirSync(d, { recursive: true });

  // 内置素材目录（假包）
  const assetDir = path.join(root, "assets");
  fs.mkdirSync(path.join(assetDir, "voice/general"), { recursive: true });
  fs.writeFileSync(path.join(assetDir, "spritesheet.webp"), "builtin-sheet");
  fs.writeFileSync(path.join(assetDir, "voice/general/你好.m4a"), "builtin-audio");
  const builtinManifest = parseManifest({
    schemaVersion: 2, id: "foxbell", displayName: "Foxbell·测试", description: "", source: "builtin",
    spriteVersionNumber: 2, spritesheetSizeBytes: 13, hasVoice: true, hasSubtitle: true,
    voices: [{ group: "general", name: "你好", file: "voice/general/你好.m4a", sizeBytes: 13, durationMs: 3000 }],
  }, { id: "foxbell" });

  const engine = createStateEngine({ roots: () => [], getSession: () => undefined, getTitle: () => undefined, now: () => Date.now() });
  const diag = { computeCount: 0, clientVisible: null };
  let activePetId = "foxbell";
  const env = {
    pkgDir: root,
    petsRoot, stagingRoot, trashRoot,
    codexRoot: codexRootDir,
    tmpDir,
    stateEngine: engine,
    builtin: { manifest: builtinManifest, assetDir, voices: builtinManifest.voices, spriteBytes: Buffer.from("builtin-sheet") },
    getActivePetId: () => activePetId,
    setActivePetId: (id) => { activePetId = id; },
    diag,
    spriteBytes: Buffer.from("builtin-sheet"),
    snapshotExtra: () => {
      engine.compute();
      diag.computeCount += 1;
      const projects = engine.list();
      const id = activePetId;
      const m = id === "foxbell" ? builtinManifest : (() => { try { return JSON.parse(fs.readFileSync(path.join(petsRoot, id, "manifest.json"), "utf8")); } catch { return null; } })();
      return {
        seq: engine.nextSeq(),
        completions: engine.queue,
        runningSessions: projects.filter((p) => p.status === "running").length,
        projects,
        voices: (m ? m.voices : []).map((v, i) => ({ index: i, group: v.group, name: v.name, file: v.file, url: `${ROUTE_PREFIX}/pets/${id}/voice/${v.group}/${encodeURIComponent(v.file.split("/").pop())}` })),
        activePet: { id, name: m ? m.displayName : id, hasVoice: m ? m.hasVoice : false, hasSubtitle: m ? m.hasSubtitle : false, spriteVersionNumber: m ? m.spriteVersionNumber : 0, spriteUrl: `${ROUTE_PREFIX}/pets/${id}/spritesheet.webp`, rev: "test" },
        pets: [{ id: "foxbell", displayName: builtinManifest.displayName, builtin: true, hasVoice: true, hasSubtitle: true, manifestExists: true, spritesheetExists: true, spriteVersionNumber: 2, source: "builtin", description: "" }],
        guard: [],
        assetDir,
        spriteBytes: 13,
        diag,
      };
    },
  };
  return env;
}

let root, env, dispatch;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-routes-"));
  env = makeEnv(root);
  const made = makeCtx();
  registerRoutes(made.ctx, env);
  dispatch = made.dispatch;
});

const postJson = (p, body, headers) => dispatch("POST", `${ROUTE_PREFIX}${p}`, { body: JSON.stringify(body ?? {}), headers: { "content-type": "application/json", ...headers } });
const get = (p) => dispatch("GET", `${ROUTE_PREFIX}${p}`);

describe("/state /ack /client-diag（既有语义）", () => {
  it("/state returns v1 fields + v2 extensions", async () => {
    const r = await get("/state");
    expect(r.status).toBe(200);
    for (const k of ["seq", "completions", "runningSessions", "projects", "voices", "assetDir", "spriteBytes", "diag"]) {
      expect(k in r.body, `missing ${k}`).toBe(true);
    }
    for (const k of ["activePet", "pets", "guard"]) expect(k in r.body, `missing v2 field ${k}`).toBe(true);
    expect(r.body.activePet.id).toBe("foxbell");
    expect(Array.isArray(r.body.guard) && r.body.guard).toHaveLength(0);
    expect(r.body.voices[0].url).toContain("/pets/foxbell/voice/general/");
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("/ack marks unread false, tolerant to unknown ids", async () => {
    const r = await get("/ack?agentId=whatever");
    expect(r.body).toEqual({ ok: true });
  });
  it("/client-diag records visibility", async () => {
    await get("/client-diag?visible=0");
    expect(env.diag.clientVisible).toBe("0");
    await get("/client-diag?visible=1");
    expect(env.diag.clientVisible).toBe("1");
  });
});

describe("资产路由（内置 foxbell 映射包内 assets）", () => {
  it("GET /pets lists builtin + external", async () => {
    const r = await get("/pets");
    expect(r.body.pets[0].id).toBe("foxbell");
    expect(r.body.pets[0].builtin).toBe(true);
  });
  it("serves builtin manifest/sheet/voice", async () => {
    const m = await get("/pets/foxbell/manifest.json");
    expect(m.body.id).toBe("foxbell");
    expect(m.body.schemaVersion).toBe(2);
    const sheet = await get("/pets/foxbell/spritesheet.webp");
    expect(sheet.status).toBe(200);
    expect(sheet.raw.toString()).toBe("builtin-sheet");
    expect(sheet.headers["content-type"]).toBe("image/webp");
    const voice = await get(`/pets/foxbell/voice/general/${encodeURIComponent("你好.m4a")}`);
    expect(voice.raw.toString()).toBe("builtin-audio");
  });
  it("rejects traversal in asset path segments", async () => {
    const r1 = await dispatch("GET", `${ROUTE_PREFIX}/pets/${encodeURIComponent("../evil")}/manifest.json`);
    expect([400, 404]).toContain(r1.status);
    expect(r1.body?.code ?? "pet-name-dot-prefix").toMatch(/pet-name|pet-not-found/);
    const r2 = await dispatch("GET", `${ROUTE_PREFIX}/pets/foxbell/voice/general/${encodeURIComponent("../../index.js")}`);
    expect(r2.status).toBeGreaterThanOrEqual(400);
  });
  it("unknown external pet → pet-not-found(404)", async () => {
    const r = await get("/pets/ghost/manifest.json");
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("pet-not-found");
  });
});

describe("安全拒绝（任务目标 5）", () => {
  it("../ 与绝对路径形态的 id 全部被拒且返回对应错误码", async () => {
    for (const [id, code] of [["../x", "pet-name-dot-prefix"], ["/etc", "pet-name-illegal"], ["a/b", "pet-name-illegal"], ["foxbell-edit", null]]) {
      const r = await postJson("/api/scan", { id });
      if (code === null) continue;
      expect(r.status).toBe(400);
      expect(r.body.code).toBe(code);
    }
  });
  it("rename/delete/voice 对内置 foxbell 拒绝（pet-name-reserved）", async () => {
    expect((await postJson("/api/rename", { oldId: "foxbell", newId: "other" })).body.code).toBe("pet-name-reserved");
    expect((await postJson("/api/delete", { id: "foxbell" })).body.code).toBe("pet-name-reserved");
    const r = await dispatch("POST", `${ROUTE_PREFIX}/api/voice-remove`, { body: JSON.stringify({ id: "foxbell", rel: "voice/general/x.m4a" }), headers: { "content-type": "application/json" } });
    expect(r.body.code).toBe("pet-name-reserved");
  });
  it("跨源 Origin 的 POST 被拒（origin-forbidden）", async () => {
    const r = await postJson("/api/scan", { id: "foxbell" }, { origin: "https://evil.example.com" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("origin-forbidden");
  });
  it("同源 Origin 放行", async () => {
    const r = await postJson("/api/scan", { id: "foxbell" }, { origin: "http://localhost:3080" });
    expect(r.status).toBe(200);
  });
  it("错误形状统一 {code, params, detail}", async () => {
    const r = await postJson("/api/scan", { id: "ghost-pet" });
    expect(r.body).toMatchObject({ code: "pet-not-found", params: { id: "ghost-pet" } });
    expect(typeof r.body.detail).toBe("string");
  });
  it("import-folder 拒绝相对路径", async () => {
    const r = await postJson("/api/import-folder", { path: "relative/dir" });
    expect(r.body.code).toBe("source-not-folder");
  });
  it("import-folder-files 拒绝穿越 rel 与缺图集", async () => {
    const evil = await postJson("/api/import-folder-files", {
      files: [{ rel: "../../evil.webp", name: "spritesheet.webp", size: 1, data: Buffer.from("x").toString("base64") }],
    });
    expect(evil.body.code).toBe("zip-entry-illegal-path");
    const nosheet = await postJson("/api/import-folder-files", {
      files: [{ rel: "voice/general/a.m4a", name: "a.m4a", size: 1, data: Buffer.from("x").toString("base64") }],
    });
    expect(nosheet.body.code).toBe("sheet-not-found");
  });
});

describe("导入闭环（zip 上传 → 向导 → finalize → 资产伺服 → 改名 → 删除）", () => {
  let stagingId = null;
  it("zip 上传暂存（一层包装自动脱壳）", async () => {
    const zip = buildZip([
      { name: "star-pet/spritesheet.webp", data: "external-sheet-bytes" },
      { name: "star-pet/voice/general/g.m4a", data: "g-audio" },
      { name: "star-pet/voice/approval/a.m4a", data: "a-audio" },
      { name: "star-pet/voice/done/d.m4a", data: "d-audio" },
      { name: "star-pet/voice/error/e.m4a", data: "e-audio" },
      { name: "star-pet/pet.json", data: JSON.stringify({ displayName: "星星", spriteVersionNumber: 2 }) },
    ]);
    const r = await dispatch("POST", `${ROUTE_PREFIX}/api/import-zip`, { body: zip });
    expect(r.status).toBe(200);
    expect(r.body.suggestedName).toBe("star-pet");
    expect(r.body.suggestedDisplayName).toBe("星星");
    expect(r.body.spriteVersionNumber).toBe(2);
    expect(r.body.voiceFiles).toHaveLength(4);
    stagingId = r.body.stagingId;
  });
  it("暂存资产可伺服（向导预览/探测）", async () => {
    const sheet = await get(`/staging/${stagingId}/spritesheet.webp`);
    expect(sheet.raw.toString()).toBe("external-sheet-bytes");
    const voice = await get(`/staging/${stagingId}/voice/general/g.m4a`);
    expect(voice.raw.toString()).toBe("g-audio");
    const list = await get(`/staging/${stagingId}/list`);
    expect(list.body.voiceFiles).toHaveLength(4);
  });
  it("暂存音频增删（去重 + 拒绝非法分组/路径）", async () => {
    const addUrl = `${ROUTE_PREFIX}/api/staging-voice-add?sid=${stagingId}&group=general&name=${encodeURIComponent("新增 hi.m4a")}`;
    const added = await dispatch("POST", addUrl, { body: Buffer.from("new-audio") });
    expect(added.body.added.file).toBe("voice/general/新增 hi.m4a");
    const again = await dispatch("POST", addUrl, { body: Buffer.from("new-audio") });
    expect(again.body.added.file).toBe("voice/general/新增 hi-2.m4a");
    const badGroup = await dispatch("POST", `${ROUTE_PREFIX}/api/staging-voice-add?sid=${stagingId}&group=nope&name=x.m4a`, { body: Buffer.from("x") });
    expect(badGroup.body.code).toBe("group-invalid");
    const rm = await postJson("/api/staging-voice-remove", { sid: stagingId, rel: "voice/general/新增 hi-2.m4a" });
    expect(rm.body.ok).toBe(true);
    const rmBad = await postJson("/api/staging-voice-remove", { sid: stagingId, rel: "../../x" });
    expect(rmBad.body.code).toBe("audio-relpath-invalid");
  });
  it("finalize：非法名被拒（前后端双重校验的服务端权威面）", async () => {
    const voiceFileOf = { general: "g.m4a", approval: "a.m4a", done: "d.m4a", error: "e.m4a" };
    const manifest = (name) => ({
      schemaVersion: 2, id: name, displayName: "星星", description: "", source: "zip",
      spriteVersionNumber: 2, spritesheetSizeBytes: "external-sheet-bytes".length,
      hasVoice: true, hasSubtitle: true,
      voices: [
        ...["general", "approval", "done", "error"].map((g) => ({
          group: g, name: g, file: `voice/${g}/${voiceFileOf[g]}`,
          sizeBytes: fs.statSync(path.join(env.stagingRoot, stagingId, `voice/${g}/${voiceFileOf[g]}`)).size,
          durationMs: 3000,
        })),
        // 前一用例经 staging-voice-add 落盘的额外文件也必须入清单（否则守卫报 voice-extra）
        { group: "general", name: "新增 hi", file: "voice/general/新增 hi.m4a", sizeBytes: "new-audio".length, durationMs: 3000 },
      ],
    });
    for (const bad of ["../escape", "foxbell", "CON", ""]) {
      const r = await postJson("/api/import-finalize", { stagingId, name: bad, manifest: manifest(bad) });
      expect(r.status).toBe(400);
      expect(r.body.code).toMatch(/pet-name/);
    }
    const okr = await postJson("/api/import-finalize", { stagingId, name: "star-pet", manifest: manifest("star-pet") });
    expect(okr.status).toBe(200);
    expect(okr.body.id).toBe("star-pet");
    expect(fs.existsSync(path.join(env.petsRoot, "star-pet", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(env.stagingRoot, stagingId))).toBe(false); // 原子落地后暂存腾空
    // 重复导入同名 → pet-exists
    const dupZip = buildZip([{ name: "spritesheet.webp", data: "external-sheet-bytes" }]);
    const s2 = await dispatch("POST", `${ROUTE_PREFIX}/api/import-zip`, { body: dupZip });
    const dup = await postJson("/api/import-finalize", { stagingId: s2.body.stagingId, name: "star-pet", manifest: { schemaVersion: 2 } });
    expect(dup.body.code).toBe("pet-exists");
    await postJson("/api/import-cancel", { stagingId: s2.body.stagingId });
  });
  it("导入后资产伺服 + /pets 列表收录", async () => {
    const sheet = await get("/pets/star-pet/spritesheet.webp");
    expect(sheet.raw.toString()).toBe("external-sheet-bytes");
    const list = await get("/pets");
    expect(list.body.pets.map((p) => p.id)).toContain("star-pet");
  });
  it("激活校验：clean → activated", async () => {
    const r = await postJson("/api/activate", { id: "star-pet" });
    expect(r.body.status).toBe("activated");
    expect(r.body.voiceCap).toBe(true);
  });
  it("激活守卫：删图集 → invalid-sheet；改语音 → mismatch+plan；删清单 → mismatch manifest-missing", async () => {
    // 语音变动
    fs.writeFileSync(path.join(env.petsRoot, "star-pet/voice/general/g.m4a"), "tampered-longer");
    let r = await postJson("/api/activate", { id: "star-pet" });
    expect(r.body.status).toBe("mismatch");
    expect(r.body.issues.map((i) => i.kind)).toContain("voice-changed");
    expect(r.body.plan.reprobes.map((x) => x.rel)).toContain("voice/general/g.m4a");
    // 修复：清单更新（客户端重探后回写；宿主复核磁盘一致）
    const m = JSON.parse(fs.readFileSync(path.join(env.petsRoot, "star-pet/manifest.json"), "utf8"));
    m.voices = m.voices.map((v) => v.file === "voice/general/g.m4a"
      ? { ...v, sizeBytes: fs.statSync(path.join(env.petsRoot, "star-pet", v.file)).size }
      : v);
    const upd = await postJson("/api/manifest-update", { id: "star-pet", manifest: m, backup: true });
    expect(upd.body.ok).toBe(true);
    expect(fs.existsSync(path.join(env.petsRoot, "star-pet/manifest.json.bak"))).toBe(true);
    r = await postJson("/api/activate", { id: "star-pet" });
    expect(r.body.status).toBe("activated");
    // 清单缺失
    fs.rmSync(path.join(env.petsRoot, "star-pet/manifest.json"));
    fs.rmSync(path.join(env.petsRoot, "star-pet/manifest.json.bak"));
    r = await postJson("/api/activate", { id: "star-pet" });
    expect(r.body.status).toBe("mismatch");
    expect(r.body.issues.map((i) => i.kind)).toEqual(["manifest-missing"]);
    // 重建清单再激活
    m.spritesheetSizeBytes = fs.statSync(path.join(env.petsRoot, "star-pet/spritesheet.webp")).size;
    m.voices = m.voices.map((v) => ({ ...v, sizeBytes: fs.statSync(path.join(env.petsRoot, "star-pet", v.file)).size }));
    await postJson("/api/manifest-update", { id: "star-pet", manifest: m, backup: false });
    // 图集被删 → invalid-sheet（fatal）
    fs.rmSync(path.join(env.petsRoot, "star-pet/spritesheet.webp"));
    r = await postJson("/api/activate", { id: "star-pet" });
    expect(r.body.status).toBe("invalid-sheet");
    fs.writeFileSync(path.join(env.petsRoot, "star-pet/spritesheet.webp"), "external-sheet-bytes");
  });
  it("manifest-update 拒绝与磁盘不一致的清单（防伪造）", async () => {
    const m = JSON.parse(fs.readFileSync(path.join(env.petsRoot, "star-pet/manifest.json"), "utf8"));
    m.spritesheetSizeBytes = 999999;
    const r = await postJson("/api/manifest-update", { id: "star-pet", manifest: m });
    expect(r.body.code).toBe("manifest-invalid");
  });
  it("改名：目录 + manifest.id 同步；冲突拒绝", async () => {
    const r = await postJson("/api/rename", { oldId: "star-pet", newId: "star-pet-2" });
    expect(r.body.ok).toBe(true);
    expect(fs.existsSync(path.join(env.petsRoot, "star-pet-2"))).toBe(true);
    const m = JSON.parse(fs.readFileSync(path.join(env.petsRoot, "star-pet-2/manifest.json"), "utf8"));
    expect(m.id).toBe("star-pet-2");
    const bad = await postJson("/api/rename", { oldId: "star-pet-2", newId: "../x" });
    expect(bad.body.code).toBe("pet-name-dot-prefix");
  });
  it("安全删除：移入 .trash 不物理删除", async () => {
    const r = await postJson("/api/delete", { id: "star-pet-2" });
    expect(r.body.ok).toBe(true);
    expect(fs.existsSync(path.join(env.petsRoot, "star-pet-2"))).toBe(false);
    const trashed = fs.readdirSync(env.trashRoot);
    expect(trashed.some((n) => n.startsWith("star-pet-2-"))).toBe(true);
    const dest = path.join(env.trashRoot, trashed.find((n) => n.startsWith("star-pet-2-")));
    expect(fs.existsSync(path.join(dest, "manifest.json"))).toBe(true); // 可恢复
  });
});

describe("codex 来源", () => {
  it("codex-list 只收录含图集目录并标注 imported", async () => {
    const codexPet = path.join(env.codexRoot, "codex-alpha");
    fs.mkdirSync(path.join(codexPet, "voice/general"), { recursive: true });
    fs.writeFileSync(path.join(codexPet, "spritesheet.webp"), "codex-sheet");
    fs.writeFileSync(path.join(codexPet, "voice/general/c.m4a"), "codex-audio");
    fs.writeFileSync(path.join(codexPet, "pet.json"), JSON.stringify({ displayName: "阿尔法", spriteVersionNumber: 1 }));
    fs.mkdirSync(path.join(env.codexRoot, "no-sheet"));
    const r = await postJson("/api/codex-list");
    expect(r.body.pets).toHaveLength(1);
    expect(r.body.pets[0]).toMatchObject({ id: "codex-alpha", displayName: "阿尔法", spriteVersionNumber: 1, imported: false });
    const st = await postJson("/api/import-codex", { id: "codex-alpha" });
    expect(st.body.suggestedName).toBe("codex-alpha");
    expect(st.body.suggestedDisplayName).toBe("阿尔法");
    await postJson("/api/import-cancel", { stagingId: st.body.stagingId });
    const escape = await postJson("/api/import-codex", { id: "../../etc" });
    expect(escape.body.code).toBe("pet-name-dot-prefix");
  });
});

describe("petdex 路由（mock fetch 注入 env.fetchImpl）", () => {
  it("非 allowlist 域 zipUrl 被拒（host-forbidden），且不产生暂存目录", async () => {
    const MANIFEST_URL = "https://petdex.dev/api/manifest";
    env.fetchImpl = async (url) => {
      if (url === MANIFEST_URL) {
        const body = Buffer.from(JSON.stringify({
          pets: [{ slug: "evilpet", displayName: "E", zipUrl: "https://evil.com/x.zip", spriteVersionNumber: 2 }],
        }));
        return { ok: true, status: 200, headers: new Map([["content-length", String(body.length)]]), body: null, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
      }
      throw new Error(`unexpected fetch ${url}`); // allowlist 拦截应在 fetch 之前
    };
    const before = fs.readdirSync(env.stagingRoot).length;
    const r = await postJson("/api/import-petdex", { url: "https://petdex.dev/pets/evilpet" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("host-forbidden");
    expect(r.body.params.host).toBe("evil.com");
    expect(fs.readdirSync(env.stagingRoot).length).toBe(before); // 无暂存残留
    delete env.fetchImpl;
  });
  it("无法解析的链接 → slug-parse-failed（不触网）", async () => {
    const r = await postJson("/api/import-petdex", { url: "https://petdex.dev/collections" });
    expect(r.body.code).toBe("slug-parse-failed");
  });
  it("petdex-search 走宿主代理（mock 清单过滤）", async () => {
    const MANIFEST_URL = "https://petdex.dev/api/manifest";
    env.fetchImpl = async (url) => {
      if (url !== MANIFEST_URL) throw new Error(`unexpected ${url}`);
      const body = Buffer.from(JSON.stringify([
        { slug: "capvolt", displayName: "Pikachu", zipUrl: "https://assets.petdex.dev/x.zip", spriteVersionNumber: 1 },
        { slug: "other", displayName: "Other", zipUrl: "", spriteVersionNumber: 0 },
      ]));
      return { ok: true, status: 200, headers: new Map([["content-length", String(body.length)]]), body: null, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
    };
    const r = await postJson("/api/petdex-search", { q: "pika" });
    expect(r.body.pets.map((p) => p.slug)).toEqual(["capvolt"]);
    expect(r.body.pets[0].hasZip).toBe(true);
    delete env.fetchImpl;
  });
});

describe("check-name 预检", () => {
  it("reserved/illegal/dup 全部给出问题码", async () => {
    expect((await postJson("/api/check-name", { name: "foxbell" })).body.problem).toBe("pet-name-reserved");
    expect((await postJson("/api/check-name", { name: "../x" })).body.problem).toBe("pet-name-dot-prefix");
    expect((await postJson("/api/check-name", { name: "con" })).body.problem).toBe("pet-name-reserved-device");
    expect((await postJson("/api/check-name", { name: "brand-new" })).body).toEqual({ ok: true });
  });
});

describe("store-info", () => {
  it("exposes plugin-private dirs (查看目录路径)", async () => {
    const r = await postJson("/api/store-info");
    expect(r.body.petsRoot.endsWith(path.join("pets"))).toBe(true);
    expect(r.body.trashRoot.endsWith(".trash")).toBe(true);
  });
});

// ---- R2 自审补强：symlink 不逃逸（按 id 寻址不出商店根）----
describe("symlink 不逃逸（R2 安全自查）", () => {
  it("pets/<id> 为符号链接目录：manifest/sheet 路由 404，不入清单，激活/scan 拒绝", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-outside-"));
    fs.writeFileSync(path.join(outside, "spritesheet.webp"), "OUTSIDE-SECRET");
    fs.writeFileSync(path.join(outside, "manifest.json"), JSON.stringify({
      schemaVersion: 2, id: "linked", displayName: "逃逸", source: "folder",
      spriteVersionNumber: 2, spritesheetSizeBytes: 14, hasVoice: false, hasSubtitle: false, voices: [],
    }));
    fs.symlinkSync(outside, path.join(env.petsRoot, "linked"), "dir");

    const m = await get("/pets/linked/manifest.json");
    expect(m.status).toBe(404);
    expect(m.body.code).toBe("pet-not-found");
    const s = await get("/pets/linked/spritesheet.webp");
    expect(s.status).toBe(404);
    expect(s.raw.toString()).not.toContain("OUTSIDE-SECRET");
    const list = await get("/pets");
    expect(list.body.pets.some((p) => p.id === "linked")).toBe(false);
    const act = await postJson("/api/activate", { id: "linked" });
    expect(act.status).toBe(404);
    expect(act.body.code).toBe("pet-not-found");
    const scan = await postJson("/api/scan", { id: "linked" });
    expect(scan.status).toBe(404);
    expect(scan.body.code).toBe("pet-not-found");
  });
  it("真实宠物目录内符号链接语音文件：sendFile lstat 拒绝跟随；真实文件不受影响", async () => {
    const dir = path.join(env.petsRoot, "realpet");
    fs.mkdirSync(path.join(dir, "voice/general"), { recursive: true });
    fs.writeFileSync(path.join(dir, "spritesheet.webp"), "real-sheet");
    const outsideFile = path.join(root, `secret-${Date.now()}.m4a`);
    fs.writeFileSync(outsideFile, "SECRET-AUDIO");
    fs.symlinkSync(outsideFile, path.join(dir, "voice/general/link.m4a"));

    const r = await get("/pets/realpet/voice/general/link.m4a");
    expect(r.status).toBe(404);
    expect(r.raw.toString()).not.toContain("SECRET-AUDIO");

    fs.writeFileSync(path.join(dir, "voice/general/ok.m4a"), "real-audio");
    const ok = await get("/pets/realpet/voice/general/ok.m4a");
    expect(ok.status).toBe(200);
    expect(ok.raw.toString()).toBe("real-audio");
  });
});

// ---- R2 边界自查 3a：空商店/损坏商店首启三态 ----
describe("空商店首启三态（R2 边界自查 3a）", () => {
  it("态一：pets 根目录不存在 → /state 200、/pets 仅内置、不抛异常", async () => {
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-empty-"));
    const env2 = makeEnv(root2);
    fs.rmSync(env2.petsRoot, { recursive: true, force: true });
    const made = makeCtx();
    registerRoutes(made.ctx, env2);
    const st = await made.dispatch("GET", `${ROUTE_PREFIX}/state`);
    expect(st.status).toBe(200);
    expect(st.body.activePet.id).toBe("foxbell");
    const list = await made.dispatch("GET", `${ROUTE_PREFIX}/pets`);
    expect(list.status).toBe(200);
    expect(list.body.pets).toHaveLength(1);
    expect(list.body.pets[0].id).toBe("foxbell");
  });
  it("态二：含损坏 manifest.json → /state 200、列表以 id 兜底、manifest 路由 400 可读、激活 mismatch", async () => {
    const dir = path.join(env.petsRoot, "brokenman");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "spritesheet.webp"), "sheet-bytes");
    fs.writeFileSync(path.join(dir, "manifest.json"), "{{{ not json");

    const st = await get("/state");
    expect(st.status).toBe(200);
    const list = await get("/pets");
    const row = list.body.pets.find((p) => p.id === "brokenman");
    expect(row).toBeTruthy();
    expect(row.manifestExists).toBe(false);
    expect(row.displayName).toBe("brokenman"); // id 兜底
    const m = await get("/pets/brokenman/manifest.json");
    expect(m.status).toBe(400);
    expect(m.body.code).toBe("manifest-parse-failed");
    const act = await postJson("/api/activate", { id: "brokenman" });
    expect(act.body.status).toBe("mismatch");
    expect(act.body.issues.map((i) => i.kind)).toContain("manifest-missing");
    expect(act.body.plan.canRepair).toBe(true); // 图集在 → 可修复（直投首建）
  });
  it("态三：半成品目录（有目录无图集）→ /state 200、列表标注缺图集、激活 invalid-sheet 拒绝", async () => {
    const dir = path.join(env.petsRoot, "halfbuilt");
    fs.mkdirSync(path.join(dir, "voice/general"), { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      schemaVersion: 2, id: "halfbuilt", displayName: "半成品", source: "folder",
      spriteVersionNumber: 2, spritesheetSizeBytes: 99, hasVoice: false, hasSubtitle: false, voices: [],
    }));

    const st = await get("/state");
    expect(st.status).toBe(200);
    const list = await get("/pets");
    const row = list.body.pets.find((p) => p.id === "halfbuilt");
    expect(row.spritesheetExists).toBe(false);
    const act = await postJson("/api/activate", { id: "halfbuilt" });
    expect(act.body.status).toBe("invalid-sheet");
    expect(act.body.issues.map((i) => i.kind)).toContain("spritesheet-missing");
    expect(act.body.plan).toBeUndefined(); // fatal 无修复计划
  });
});

// ---- R3 验收补链：TUI/无 webServer 降级（registerRoutes 面）----
describe("无 webServer 降级（回归项，任务目标 6/8）", () => {
  it("ctx.get('webServer') 缺席 → registerRoutes 静默返回，零路由注册、不抛错", () => {
    const ctxNoWeb = {
      get: () => undefined, // webServer 不在场（TUI/无 web 部署）
      // 反证钩子：若 registerRoutes 仍尝试注册任何路由，effect 被调即抛 → 用例失败
      effect: () => { throw new Error("must not register any route without webServer"); },
    };
    expect(() => registerRoutes(ctxNoWeb, env)).not.toThrow();
    // 对照：webServer 在场时同一 env 正常注册全部路由
    const made = makeCtx();
    registerRoutes(made.ctx, env);
    expect(made.routes.exact.size).toBeGreaterThanOrEqual(3); // /state /ack /client-diag 起步
    expect(made.routes.prefix.length).toBeGreaterThanOrEqual(2); // /pets /staging
  });
});
