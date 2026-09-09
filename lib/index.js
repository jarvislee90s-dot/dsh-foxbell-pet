// src/host/index.js
import { fileURLToPath } from "node:url";
import fs8 from "node:fs";
import os2 from "node:os";
import path8 from "node:path";
import z from "@deepseek-ai/schemastery";

// src/host/paths.js
import os from "node:os";
import path from "node:path";
function dshHome(env = process.env) {
  const configured = env.DSH_HOME;
  if (typeof configured === "string" && configured.length > 0) return configured;
  return path.join(os.homedir(), ".dsh");
}
function storeRoot(env = process.env) {
  return path.join(dshHome(env), "foxbell-pet");
}
function petsRoot(env = process.env) {
  return path.join(storeRoot(env), "pets");
}
function stagingRoot(env = process.env) {
  return path.join(petsRoot(env), ".import-staging");
}
function trashRoot(env = process.env) {
  return path.join(storeRoot(env), ".trash");
}
function codexRoot(env = process.env) {
  return path.join(os.homedir(), ".codex", "pets");
}

// src/host/state.js
function blocksText(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks.filter((b) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
}
function estimateTokens(s) {
  let n = 0;
  let word = false;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 19968 && c <= 40959) {
      n += 1;
      word = false;
    } else if (/\s/.test(ch)) {
      word = false;
    } else {
      if (!word) {
        n += 1;
        word = true;
      }
    }
  }
  return n;
}
function truncate(s, maxTokens) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (estimateTokens(t) <= maxTokens) return t;
  let n = 0;
  let word = false;
  let cut = t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 19968 && c <= 40959) {
      n += 1;
      word = false;
    } else if (/\s/.test(t[i])) {
      word = false;
    } else {
      if (!word) {
        n += 1;
        word = true;
      }
    }
    if (n >= maxTokens) {
      cut = i + 1;
      break;
    }
  }
  return t.slice(0, cut).trim() + "\u2026";
}
function readEvents(session) {
  if (!session || typeof session.snapshotEvents !== "function") return [];
  try {
    const snap = session.snapshotEvents();
    return Array.isArray(snap) ? snap : [];
  } catch {
    return [];
  }
}
function scanSession(session, getTitle) {
  let title = null;
  if (typeof getTitle === "function") {
    try {
      const snap = getTitle(session);
      if (snap && typeof snap.title === "string" && snap.title) title = snap.title;
    } catch {
    }
  }
  const lines = [];
  let lastEnd = null;
  let latestTurnStartSeq = null;
  let pendingApproval = false;
  const events = readEvents(session);
  const decidedIds = /* @__PURE__ */ new Set();
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const d = ev && ev.data;
    if (!d) continue;
    if (ev.type === "approval/decided" && typeof d.id === "string") decidedIds.add(d.id);
    if (ev.type === "turn/start" && latestTurnStartSeq === null) latestTurnStartSeq = ev.seq;
    if (ev.type === "turn/end" && lastEnd === null) {
      const r = d.reason;
      lastEnd = {
        seq: ev.seq,
        kind: r && r.kind ? r.kind : "unknown",
        error: r && r.kind === "error" && r.error ? String(r.error.message || r.error.code || "error") : null
      };
    }
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const d = ev && ev.data;
    if (!d) continue;
    if (ev.type === "approval/asked" && typeof d.id === "string" && !decidedIds.has(d.id)) pendingApproval = true;
    if (lines.length >= 2) continue;
    let text = "";
    if (ev.type === "user/message") text = blocksText(d.content);
    else if (ev.type === "assistant/message") text = blocksText(d.message && d.message.content);
    else if (ev.type === "tool/result") text = blocksText(d.message && d.message.content);
    else if (ev.type === "tool/call" && typeof d.name === "string") text = "\u8FD0\u884C " + d.name + (typeof d.arguments === "string" ? " " + d.arguments : "");
    if (!text) continue;
    const ls = text.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let k = ls.length - 1; k >= 0 && lines.length < 2; k--) lines.push(truncate(ls[k], 24));
  }
  return { title, lines, lastEnd, latestTurnStartSeq, pendingApproval };
}
function derive(a, info, prev, newCompletion) {
  const endIsError = info.lastEnd !== null && (info.lastEnd.kind === "error" || info.lastEnd.kind === "interrupted");
  const hasNewerTurn = info.latestTurnStartSeq !== null && info.lastEnd !== null && info.latestTurnStartSeq > info.lastEnd.seq;
  if (endIsError && !hasNewerTurn) {
    const fresh = prev === void 0 ? true : info.lastEnd.seq > (prev.lastTurnEndSeq || -1);
    const keepUnread = prev !== void 0 && prev.status === "error" && prev.unread;
    if (fresh || keepUnread) {
      const lines = ["\u672C\u8F6E\u8FD0\u884C\u5931\u8D25"];
      if (info.lines[0]) lines.push(info.lines[0]);
      return { status: "error", unread: true, title: info.title, lines };
    }
    return null;
  }
  if (info.pendingApproval) {
    const lines = ["\u7B49\u5F85\u6279\u51C6"];
    if (info.lines[0]) lines.push(info.lines[0]);
    return { status: "approval", unread: true, title: info.title, lines };
  }
  if (a.status === "running") {
    return { status: "running", unread: false, title: info.title, lines: info.lines };
  }
  if (newCompletion || prev !== void 0 && prev.status === "done" && prev.unread) {
    return { status: "done", unread: true, title: info.title, lines: ["\u5DF2\u5B8C\u6210"] };
  }
  return null;
}
function createStateEngine(deps) {
  const projects = /* @__PURE__ */ new Map();
  const queue = [];
  let seq = 0;
  const compute = () => {
    const roots = (() => {
      try {
        return deps.roots() || [];
      } catch {
        return [];
      }
    })();
    const seen = /* @__PURE__ */ new Set();
    const now = deps.now();
    for (const a of roots) {
      if (!a || a.id === void 0 || a.id === null) continue;
      seen.add(a.id);
      let info = { title: null, lines: [], lastEnd: null, latestTurnStartSeq: null, pendingApproval: false };
      try {
        const session = deps.getSession(a.id);
        if (session) info = scanSession(session, deps.getTitle);
      } catch {
      }
      const prev = projects.get(a.id);
      const newCompletion = prev !== void 0 && info.lastEnd !== null && info.lastEnd.seq > (prev.lastTurnEndSeq || -1);
      const derived = derive(a, info, prev, newCompletion);
      projects.set(a.id, {
        lastTurnEndSeq: info.lastEnd !== null ? info.lastEnd.seq : prev ? prev.lastTurnEndSeq : -1,
        status: derived ? derived.status : null,
        unread: derived ? derived.unread : false,
        title: derived && derived.title ? derived.title : prev && prev.title ? prev.title : a.id,
        lines: derived ? derived.lines : [],
        vanishAt: null
      });
      if (derived !== null && derived.status === "done" && newCompletion) {
        queue.push({ seq: ++seq, at: now, agentId: a.id });
        if (queue.length > 8) queue.shift();
      }
    }
    for (const [id, p] of projects) {
      if (seen.has(id)) {
        p.vanishAt = null;
        continue;
      }
      if (p.status === "running") {
        p.status = "error";
        p.unread = true;
        p.lines = ["\u65AD\u8054"];
      } else if (p.status === "done" || p.status === null) {
        p.status = null;
        p.unread = false;
      }
      p.vanishAt = p.vanishAt || now;
      if (now - p.vanishAt > 6e4) projects.delete(id);
    }
  };
  const list = () => {
    const out = [];
    for (const [id, p] of projects) {
      if (!p || !p.status) continue;
      out.push({ id, title: p.title || id, lines: p.lines || [], status: p.status, unread: !!p.unread });
    }
    const rank = { error: 0, approval: 1, running: 2, done: 3 };
    out.sort((a, b) => rank[a.status] - rank[b.status] || String(a.title).localeCompare(String(b.title), "zh"));
    return out;
  };
  return {
    compute,
    list,
    projects,
    queue,
    ack(agentId) {
      const p = projects.get(agentId);
      if (p) p.unread = false;
    },
    nextSeq: () => seq
  };
}

// src/host/manifest.js
import fs from "node:fs";
import path2 from "node:path";

// src/host/errors.js
var PetError = class extends Error {
  constructor(code, detail, params = {}) {
    super(code);
    this.name = "PetError";
    this.code = code;
    this.detail = String(detail ?? code);
    this.params = params;
  }
  with(key, val) {
    this.params[key] = String(val);
    return this;
  }
  toJSON() {
    return { code: this.code, params: this.params, detail: this.detail };
  }
  /** HTTP 状态映射：未命中表 → 500 */
  get status() {
    return statusOfCode(this.code);
  }
};
function internal(detail) {
  return new PetError("internal", detail);
}
var STATUS_404 = /* @__PURE__ */ new Set(["pet-not-found", "staging-not-found", "pet-dir-missing", "audio-not-found", "sheet-not-found"]);
var STATUS_500 = /* @__PURE__ */ new Set([
  "internal",
  "copy-failed",
  "delete-failed",
  "rename-failed",
  "finalize-move-failed",
  "finalize-scan-failed",
  "manifest-write-failed",
  "manifest-backup-failed",
  "staging-create-failed",
  "tmp-write-failed",
  "download-failed",
  "manifest-request-failed"
]);
function statusOfCode(code) {
  if (STATUS_404.has(code)) return 404;
  if (STATUS_500.has(code)) return 500;
  return 400;
}

// src/host/petid.js
var MAX_PET_ID_LEN = 64;
var BUILTIN_PET_ID = "foxbell";
var WINDOWS_RESERVED_DEVICES = [
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
];
var ID_CHARSET_RE = /^[A-Za-z0-9_-]+$/;
function petIdProblem(id) {
  if (typeof id !== "string" || id.length === 0) return new PetError("pet-name-empty", "\u5BA0\u7269\u540D\u4E0D\u80FD\u4E3A\u7A7A");
  if (id.startsWith(".")) return new PetError("pet-name-dot-prefix", `\u5BA0\u7269\u540D\u4E0D\u80FD\u4EE5\u70B9\u5F00\u5934: ${id}`);
  if (!ID_CHARSET_RE.test(id)) return new PetError("pet-name-illegal", `\u5BA0\u7269\u540D\u4EC5\u652F\u6301\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26/\u4E0B\u5212\u7EBF: ${id}`);
  if (id.length > MAX_PET_ID_LEN) return new PetError("pet-name-too-long", `\u5BA0\u7269\u540D\u8FC7\u957F\uFF08\u2264${MAX_PET_ID_LEN} \u5B57\u7B26\uFF09`).with("max", MAX_PET_ID_LEN);
  if (WINDOWS_RESERVED_DEVICES.some((d) => d.toLowerCase() === id.toLowerCase())) {
    return new PetError("pet-name-reserved-device", `\u5BA0\u7269\u540D\u4E0E Windows \u4FDD\u7559\u8BBE\u5907\u540D\u51B2\u7A81: ${id}`);
  }
  if (id.toLowerCase() === BUILTIN_PET_ID) return new PetError("pet-name-reserved", "foxbell \u4E3A\u5185\u7F6E\u5BA0\u7269\u4FDD\u7559\u540D");
  return null;
}
function validatePetId(id) {
  const p = petIdProblem(id);
  if (p) throw p;
}

// src/host/manifest.js
var MANIFEST_FILE = "manifest.json";
var BACKUP_FILE = "manifest.json.bak";
var TMP_FILE = "manifest.json.tmp";
var SHEET_FILE = "spritesheet.webp";
var SCHEMA_VERSION = 2;
var ACCEPTED_SCHEMA_VERSIONS = [1, 2];
var VOICE_GROUPS = ["general", "approval", "done", "error"];
var AUDIO_EXTS = ["m4a", "mp3", "wav", "ogg", "opus", "flac", "aac"];
var MAX_AUDIO_BYTES = 10 * 1024 * 1024;
function isVoiceRel(rel) {
  if (typeof rel !== "string") return false;
  const segs = rel.split("/");
  return segs.length === 3 && segs[0] === "voice" && VOICE_GROUPS.includes(segs[1]) && segs[2].length > 0 && !segs[2].includes("..");
}
function extOf(rel) {
  const i = rel.lastIndexOf(".");
  return i >= 0 ? rel.slice(i + 1).toLowerCase() : "";
}
function isAudioExt(rel) {
  return AUDIO_EXTS.includes(extOf(rel));
}
function nameFromRel(rel) {
  const base = rel.split("/").pop() ?? rel;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}
function isU64(v) {
  return Number.isInteger(v) && v >= 0;
}
function parseManifest(raw, { id = null } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PetError("manifest-invalid", "manifest \u4E0D\u662F\u5BF9\u8C61");
  }
  const fail = (detail) => {
    throw new PetError("manifest-invalid", detail);
  };
  const sv = raw.schemaVersion;
  if (!ACCEPTED_SCHEMA_VERSIONS.includes(sv)) fail(`schemaVersion \u975E\u6CD5: ${sv}`);
  const mid = raw.id;
  if (typeof mid !== "string" || mid.length === 0) fail("id \u7F3A\u5931");
  if (id !== null && mid !== id) fail(`id \u4E0E\u76EE\u5F55\u4E0D\u4E00\u81F4: ${mid} != ${id}`);
  if (mid !== BUILTIN_PET_ID) {
    const p = petIdProblem(mid);
    if (p) fail(`id \u975E\u6CD5: ${p.detail}`);
  }
  if (typeof raw.displayName !== "string" || raw.displayName.length === 0) fail("displayName \u7F3A\u5931");
  const description = raw.description === void 0 ? "" : raw.description;
  if (typeof description !== "string") fail("description \u975E\u5B57\u7B26\u4E32");
  const source = raw.source === void 0 ? "" : raw.source;
  if (typeof source !== "string" || source !== "" && !["codex", "petdex", "folder", "zip", "builtin"].includes(source)) {
    fail(`source \u975E\u6CD5: ${source}`);
  }
  const svn = raw.spriteVersionNumber;
  if (![0, 1, 2].includes(svn)) fail(`spriteVersionNumber \u975E\u6CD5: ${svn}`);
  const ssb = raw.spritesheetSizeBytes === void 0 ? 0 : raw.spritesheetSizeBytes;
  if (!isU64(ssb)) fail("spritesheetSizeBytes \u975E\u6CD5");
  if (typeof raw.hasVoice !== "boolean") fail("hasVoice \u975E\u5E03\u5C14");
  if (typeof raw.hasSubtitle !== "boolean") fail("hasSubtitle \u975E\u5E03\u5C14");
  const rawVoices = raw.voices === void 0 ? [] : raw.voices;
  if (!Array.isArray(rawVoices)) fail("voices \u975E\u6570\u7EC4");
  const voices = [];
  const seen = /* @__PURE__ */ new Set();
  for (const v of rawVoices) {
    if (!v || typeof v !== "object") fail("voice \u6761\u76EE\u975E\u5BF9\u8C61");
    if (!VOICE_GROUPS.includes(v.group)) fail(`voice \u5206\u7EC4\u975E\u6CD5: ${v.group}`);
    if (typeof v.name !== "string") fail("voice.name \u975E\u5B57\u7B26\u4E32");
    if (!isVoiceRel(v.file)) fail(`voice.file \u975E\u6CD5: ${v.file}`);
    if (!isU64(v.sizeBytes)) fail(`voice.sizeBytes \u975E\u6CD5: ${v.file}`);
    if (!isU64(v.durationMs)) fail(`voice.durationMs \u975E\u6CD5: ${v.file}`);
    if (seen.has(v.file)) fail(`voice.file \u91CD\u590D: ${v.file}`);
    seen.add(v.file);
    voices.push({ group: v.group, name: v.name, file: v.file, sizeBytes: v.sizeBytes, durationMs: v.durationMs });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: mid,
    displayName: raw.displayName,
    description,
    source,
    spriteVersionNumber: svn,
    spritesheetSizeBytes: ssb,
    hasVoice: raw.hasVoice,
    hasSubtitle: raw.hasSubtitle && raw.hasVoice,
    voices
  };
}
function loadManifest(dir, { id = null } = {}) {
  let text;
  try {
    text = fs.readFileSync(path2.join(dir, MANIFEST_FILE), "utf8");
  } catch {
    return null;
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  try {
    return parseManifest(raw, { id });
  } catch {
    return null;
  }
}
function writeManifest(dir, manifest, { backup = true } = {}) {
  const target = path2.join(dir, MANIFEST_FILE);
  try {
    if (backup && fs.existsSync(target)) fs.copyFileSync(target, path2.join(dir, BACKUP_FILE));
  } catch (e) {
    throw new PetError("manifest-backup-failed", `\u5907\u4EFD manifest \u5931\u8D25: ${e.message}`).with("err", e.message);
  }
  const text = JSON.stringify(manifest, null, 2);
  const tmp = path2.join(dir, TMP_FILE);
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, target);
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
    }
    throw new PetError("manifest-write-failed", `\u5199\u5165 manifest \u5931\u8D25: ${e.message}`).with("err", e.message);
  }
}

// src/host/scan.js
import fs2 from "node:fs";
import path3 from "node:path";
function statRel(root, rel) {
  try {
    const st = fs2.lstatSync(path3.join(root, rel));
    if (st.isSymbolicLink()) return { rel, exists: false, size: 0 };
    if (st.isFile()) return { rel, exists: true, size: st.size };
    return { rel, exists: false, size: 0 };
  } catch {
    return { rel, exists: false, size: 0 };
  }
}
function walkVoice(petDir) {
  const out = [];
  const stack = [path3.join(petDir, "voice")];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs2.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path3.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        stack.push(p);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path3.relative(petDir, p).split(path3.sep).join("/");
      if (!isVoiceRel(rel)) continue;
      let size = 0;
      try {
        size = fs2.statSync(p).size;
      } catch {
        continue;
      }
      out.push({ rel, exists: true, size });
    }
  }
  out.sort((a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);
  return out;
}
function isRealPetDir(dir) {
  try {
    return fs2.lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
}
function scanPet(petsDir, id) {
  validatePetId(id);
  const dir = path3.join(petsDir, id);
  if (!isRealPetDir(dir)) {
    throw new PetError("pet-not-found", `\u5BA0\u7269\u4E0D\u5B58\u5728: ${id}`).with("id", id);
  }
  return {
    id,
    dir,
    spritesheet: statRel(dir, SHEET_FILE),
    voiceFiles: walkVoice(dir)
  };
}
function listPets(petsDir) {
  const out = [];
  let entries;
  try {
    entries = fs2.readdirSync(petsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    if (id.startsWith(".")) continue;
    if (petIdProblem(id) !== null) continue;
    const dir = path3.join(petsDir, id);
    const m = loadManifest(dir, { id });
    out.push({
      id,
      displayName: m ? m.displayName : id,
      description: m ? m.description : "",
      source: m ? m.source : "",
      spriteVersionNumber: m ? m.spriteVersionNumber : 0,
      hasVoice: m ? m.hasVoice : false,
      hasSubtitle: m ? m.hasSubtitle : false,
      manifestExists: m !== null,
      spritesheetExists: fs2.existsSync(path3.join(dir, SHEET_FILE)),
      dir
    });
  }
  out.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return out;
}
function listCodexPets(codexDir, petsDir) {
  const out = [];
  let entries;
  try {
    entries = fs2.readdirSync(codexDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    const p = path3.join(codexDir, id);
    if (!fs2.existsSync(path3.join(p, SHEET_FILE))) continue;
    let displayName = "";
    let spriteVersionNumber = 0;
    try {
      const j = JSON.parse(fs2.readFileSync(path3.join(p, "pet.json"), "utf8"));
      if (typeof j.displayName === "string") displayName = j.displayName;
      if (j.spriteVersionNumber === 1 || j.spriteVersionNumber === 2) spriteVersionNumber = j.spriteVersionNumber;
    } catch {
    }
    out.push({ id, displayName, spriteVersionNumber, imported: fs2.existsSync(path3.join(petsDir, id)) });
  }
  out.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return out;
}
function sweepStaging(stagingDir) {
  let entries;
  try {
    entries = fs2.readdirSync(stagingDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let n = 0;
  for (const e of entries) {
    const p = path3.join(stagingDir, e.name);
    try {
      fs2.rmSync(p, { recursive: true, force: true });
      n += 1;
    } catch (err) {
      console.warn("[foxbell-pet] sweep staging leftover failed:", p, String(err && err.message || err));
    }
  }
  return n;
}
function renamePet(petsDir, oldId, newId) {
  validatePetId(oldId);
  if (oldId === newId) return;
  const oldDir = path3.join(petsDir, oldId);
  if (!fs2.existsSync(oldDir)) throw new PetError("pet-not-found", `\u5BA0\u7269\u4E0D\u5B58\u5728: ${oldId}`).with("id", oldId);
  validatePetName(petsDir, newId);
  const newDir = path3.join(petsDir, newId);
  try {
    fs2.renameSync(oldDir, newDir);
  } catch (e) {
    throw new PetError("rename-failed", `\u91CD\u547D\u540D\u5931\u8D25: ${e.message}`).with("err", e.message);
  }
  const m = loadManifest(newDir);
  if (m) {
    m.id = newId;
    try {
      writeManifest(newDir, m, { backup: true });
    } catch (err) {
      console.warn(`[foxbell-pet] manifest.id \u540C\u6B65\u5931\u8D25\uFF08\u76EE\u5F55\u5DF2\u6539\u540D ${oldId} \u2192 ${newId}\uFF09:`, String(err && err.message || err));
    }
  }
}
function deletePet(petsDir, trashDir, id) {
  validatePetId(id);
  const dir = path3.join(petsDir, id);
  if (!fs2.existsSync(dir)) throw new PetError("pet-not-found", `\u5BA0\u7269\u4E0D\u5B58\u5728: ${id}`).with("id", id);
  try {
    fs2.mkdirSync(trashDir, { recursive: true });
    const dest = path3.join(trashDir, `${id}-${Date.now()}`);
    fs2.renameSync(dir, dest);
    return dest;
  } catch (e) {
    try {
      const dest = path3.join(trashDir, `${id}-${Date.now()}`);
      fs2.cpSync(dir, dest, { recursive: true });
      fs2.rmSync(dir, { recursive: true, force: true });
      return dest;
    } catch (e2) {
      throw new PetError("delete-failed", `\u5220\u9664\u5931\u8D25: ${e2.message}`).with("err", e2.message);
    }
  }
}
function validatePetName(petsDir, name2) {
  validatePetId(name2);
  if (fs2.existsSync(path3.join(petsDir, name2))) {
    throw new PetError("pet-exists", `\u5BA0\u7269\u5DF2\u5B58\u5728: ${name2}`).with("name", name2);
  }
}

// src/host/guard.js
import fs3 from "node:fs";
import path4 from "node:path";
function diffManifestVsScan(m, s) {
  const issues = [];
  if (!s.spritesheet.exists) {
    issues.push({ kind: "spritesheet-missing", detail: SHEET_FILE });
  } else if (m && m.spritesheetSizeBytes > 0 && s.spritesheet.size !== m.spritesheetSizeBytes) {
    issues.push({ kind: "spritesheet-changed", detail: `${m.spritesheetSizeBytes} \u2192 ${s.spritesheet.size}` });
  }
  if (!m) {
    issues.push({ kind: "manifest-missing", detail: "manifest.json" });
    return issues;
  }
  const onDisk = new Map(s.voiceFiles.map((f) => [f.rel, f.size]));
  for (const v of m.voices) {
    if (!onDisk.has(v.file)) issues.push({ kind: "voice-missing", detail: v.file });
    else if (onDisk.get(v.file) !== v.sizeBytes) issues.push({ kind: "voice-changed", detail: v.file });
  }
  const known = new Set(m.voices.map((v) => v.file));
  for (const f of s.voiceFiles) {
    if (isAudioExt(f.rel) && isVoiceRel(f.rel) && !known.has(f.rel)) {
      issues.push({ kind: "voice-extra", detail: f.rel });
    }
  }
  return issues;
}
function repairPlan(manifest, scan) {
  const issues = diffManifestVsScan(manifest, scan);
  const sheetOk = scan.spritesheet.exists;
  const m = manifest;
  const keepVoices = [];
  const reprobeFiles = [];
  if (m) {
    const disk = new Map(scan.voiceFiles.map((f) => [f.rel, f.size]));
    for (const v of m.voices) {
      if (disk.has(v.file) && disk.get(v.file) === v.sizeBytes) keepVoices.push(v);
    }
    const known = new Set(m.voices.map((v) => v.file));
    for (const f of scan.voiceFiles) {
      if (!isAudioExt(f.rel) || !isVoiceRel(f.rel)) continue;
      const kept = keepVoices.some((v) => v.file === f.rel);
      if (!kept) reprobeFiles.push({ rel: f.rel, sizeBytes: f.size, hadEntry: known.has(f.rel) });
    }
  } else {
    for (const f of scan.voiceFiles) {
      if (!isAudioExt(f.rel) || !isVoiceRel(f.rel)) continue;
      reprobeFiles.push({ rel: f.rel, sizeBytes: f.size, hadEntry: false });
    }
  }
  return {
    issues,
    canRepair: sheetOk,
    manifestMissing: m === null,
    keepVoices,
    reprobes: reprobeFiles,
    spritesheetSizeBytes: scan.spritesheet.exists ? scan.spritesheet.size : 0
  };
}
function checkPet(petsDir, id) {
  if (id !== BUILTIN_PET_ID) validatePetId(id);
  let scan;
  try {
    scan = scanPet(petsDir, id);
  } catch (e) {
    return { id, issues: [{ kind: "pet-dir-missing", detail: String(e && e.code || "pet-not-found") }], fatal: true };
  }
  const manifest = loadManifest(path4.join(petsDir, id), { id });
  const plan = repairPlan(manifest, scan);
  const fatal = !scan.spritesheet.exists;
  return { id, issues: plan.issues, fatal, plan: fatal ? void 0 : plan };
}

// src/host/routes.js
import fs7 from "node:fs";
import path7 from "node:path";

// src/host/staging.js
import fs5 from "node:fs";
import path6 from "node:path";

// src/host/zip.js
import fs4 from "node:fs";
import path5 from "node:path";
import yauzl from "yauzl";
var MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024;
var MAX_ZIP_FILES = 200;
function fmtLimit(bytes) {
  const MIB = 1024 * 1024;
  return bytes % MIB === 0 ? `${bytes / MIB}MB` : `${bytes}B`;
}
function safeEntryPath(name2) {
  if (typeof name2 !== "string" || name2.length === 0) return null;
  const norm = name2.replace(/\\/g, "/");
  if (norm.startsWith("/")) return null;
  if (/^[A-Za-z]:/.test(norm)) return null;
  const segs = norm.split("/");
  const out = [];
  for (const s of segs) {
    if (s === "" || s === ".") continue;
    if (s === "..") return null;
    out.push(s);
  }
  if (out.length === 0) return null;
  return out.join("/");
}
function isIllegalNameError(err) {
  const m = String(err && err.message || err);
  return /absolute path|\.\.|relative path/i.test(m) && /entry|filename|path/i.test(m);
}
function safeUnzip(zipPath, dest, opts = {}) {
  const maxTotal = opts.maxTotalBytes ?? MAX_ZIP_TOTAL_BYTES;
  const maxFiles = opts.maxFiles ?? MAX_ZIP_FILES;
  return new Promise((resolve, reject) => {
    const fail = (err) => {
      try {
        fs4.rmSync(dest, { recursive: true, force: true });
      } catch {
      }
      reject(err);
    };
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err) {
        fail(new PetError("zip-open-failed", `\u6253\u5F00\u538B\u7F29\u5305\u5931\u8D25: ${err.message}`).with("err", err.message));
        return;
      }
      const run = () => {
        if (zipfile.entryCount > maxFiles) {
          try {
            zipfile.close();
          } catch {
          }
          fail(new PetError("zip-too-many-entries", `\u538B\u7F29\u5305\u6587\u4EF6\u6570\u8D85\u9650\uFF08>${maxFiles}\uFF09`).with("limit", String(maxFiles)));
          return;
        }
        fs4.mkdirSync(dest, { recursive: true });
        let total = 0;
        zipfile.on("entry", (entry) => {
          const rel = safeEntryPath(entry.fileName);
          if (rel === null) {
            try {
              zipfile.close();
            } catch {
            }
            fail(new PetError("zip-entry-illegal-path", `\u538B\u7F29\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\u6761\u76EE: ${entry.fileName}`).with("name", entry.fileName));
            return;
          }
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
            return;
          }
          const outPath = path5.join(dest, rel);
          const relCheck = path5.relative(dest, outPath);
          if (relCheck.startsWith("..") || path5.isAbsolute(relCheck)) {
            try {
              zipfile.close();
            } catch {
            }
            fail(new PetError("zip-entry-illegal-path", `\u538B\u7F29\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\u6761\u76EE: ${entry.fileName}`).with("name", entry.fileName));
            return;
          }
          zipfile.openReadStream(entry, (e2, readStream) => {
            if (e2) {
              try {
                zipfile.close();
              } catch {
              }
              fail(new PetError("zip-read-failed", `\u8BFB\u53D6\u538B\u7F29\u5305\u5931\u8D25: ${e2.message}`).with("err", e2.message));
              return;
            }
            fs4.mkdirSync(path5.dirname(outPath), { recursive: true });
            const out = fs4.createWriteStream(outPath);
            let written = 0;
            let over = false;
            readStream.on("data", (chunk) => {
              written += chunk.length;
              total += chunk.length;
              if (total > maxTotal) {
                over = true;
                readStream.destroy();
                out.destroy();
                try {
                  zipfile.close();
                } catch {
                }
                try {
                  fs4.rmSync(outPath, { force: true });
                } catch {
                }
                fail(new PetError("zip-total-over-limit", `\u538B\u7F29\u5305\u89E3\u538B\u603B\u91CF\u8D85\u9650\uFF08>${fmtLimit(maxTotal)}\uFF09`).with("limit", fmtLimit(maxTotal)));
              }
            });
            readStream.on("error", (e3) => {
              if (over) return;
              try {
                zipfile.close();
              } catch {
              }
              out.destroy();
              fail(new PetError("zip-read-failed", `\u8BFB\u53D6\u538B\u7F29\u5305\u5931\u8D25: ${e3.message}`).with("err", e3.message));
            });
            out.on("error", (e4) => {
              if (over) return;
              try {
                zipfile.close();
              } catch {
              }
              fail(new PetError("internal", `\u5199\u5165\u89E3\u538B\u6587\u4EF6\u5931\u8D25: ${e4.message}`));
            });
            readStream.pipe(out);
            out.on("close", () => {
              if (over) return;
              zipfile.readEntry();
            });
          });
        });
        zipfile.on("end", () => {
          try {
            zipfile.close();
          } catch {
          }
          resolve({ entries: zipfile.entryCount, totalBytes: total });
        });
        zipfile.on("error", (e5) => {
          try {
            zipfile.close();
          } catch {
          }
          if (isIllegalNameError(e5)) {
            fail(new PetError("zip-entry-illegal-path", `\u538B\u7F29\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\u6761\u76EE: ${e5.message}`).with("name", e5.message));
            return;
          }
          fail(new PetError("zip-read-failed", `\u8BFB\u53D6\u538B\u7F29\u5305\u5931\u8D25: ${e5.message}`).with("err", e5.message));
        });
        zipfile.readEntry();
      };
      run();
    });
  });
}

// src/host/staging.js
var uidCounter = 0;
function uid() {
  return `${Date.now()}-${process.pid}-${uidCounter++}`;
}
function sanitizeName(raw) {
  return String(raw || "").split("").map((c) => /[A-Za-z0-9_-]/.test(c) ? c : "-").join("");
}
function stagingDirOf(stagingRootDir, stagingId) {
  if (typeof stagingId !== "string" || stagingId.includes("..") || stagingId.includes("/") || stagingId.includes("\\") || stagingId.length === 0) {
    throw new PetError("staging-id-invalid", "\u975E\u6CD5\u6682\u5B58\u533A id");
  }
  const d = path6.join(stagingRootDir, stagingId);
  if (!fs5.existsSync(d) || !fs5.statSync(d).isDirectory()) {
    throw new PetError("staging-not-found", "\u6682\u5B58\u533A\u4E0D\u5B58\u5728");
  }
  return d;
}
function locateSheet(srcDir) {
  const direct = path6.join(srcDir, SHEET_FILE);
  if (fs5.existsSync(direct) && fs5.statSync(direct).isFile()) return direct;
  let entries;
  try {
    entries = fs5.readdirSync(srcDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = path6.join(srcDir, e.name, SHEET_FILE);
    if (fs5.existsSync(p) && fs5.statSync(p).isFile()) return p;
  }
  return null;
}
function copyVoiceTree(baseDir, dir, destBase) {
  let entries;
  try {
    entries = fs5.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path6.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      copyVoiceTree(baseDir, p, destBase);
      continue;
    }
    if (!e.isFile()) continue;
    if (!isAudioExt(p)) continue;
    const rel = path6.relative(baseDir, p).split(path6.sep).join("/");
    if (!isVoiceRel(`voice/${rel}`)) continue;
    const dest = path6.join(destBase, rel);
    fs5.mkdirSync(path6.dirname(dest), { recursive: true });
    try {
      fs5.copyFileSync(p, dest);
    } catch (err) {
      throw new PetError("copy-failed", `\u590D\u5236\u97F3\u9891\u5931\u8D25: ${err.message}`).with("err", err.message);
    }
  }
}
function listStagedVoice(staging) {
  const out = [];
  const stack = [path6.join(staging, "voice")];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs5.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path6.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        stack.push(p);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path6.relative(staging, p).split(path6.sep).join("/");
      if (!isVoiceRel(rel)) continue;
      let size = 0;
      try {
        size = fs5.statSync(p).size;
      } catch {
        continue;
      }
      out.push({ group: rel.split("/")[1], name: nameFromRel(rel), file: rel, sizeBytes: size });
    }
  }
  out.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return out;
}
function finishStaged(staging, suggestedName, suggestedDisplayName, spriteVersionNumber) {
  let sheetSize = 0;
  try {
    sheetSize = fs5.statSync(path6.join(staging, SHEET_FILE)).size;
  } catch {
  }
  return {
    stagingId: path6.basename(staging),
    suggestedName,
    suggestedDisplayName,
    spriteVersionNumber,
    spritesheetSize: sheetSize,
    voiceFiles: listStagedVoice(staging)
  };
}
function codexMeta(dir) {
  try {
    const j = JSON.parse(fs5.readFileSync(path6.join(dir, "pet.json"), "utf8"));
    const displayName = typeof j.displayName === "string" ? j.displayName : "";
    const v = j.spriteVersionNumber === 1 || j.spriteVersionNumber === 2 ? j.spriteVersionNumber : 0;
    return [displayName, v];
  } catch {
    return ["", 0];
  }
}
function stageFromFolder(petsRootDir, stagingRootDir, srcDir) {
  if (!fs5.existsSync(srcDir) || !fs5.statSync(srcDir).isDirectory()) {
    throw new PetError("source-not-folder", "\u6765\u6E90\u4E0D\u662F\u6587\u4EF6\u5939");
  }
  const sheet = locateSheet(srcDir);
  if (sheet === null) throw new PetError("sheet-not-found", "\u672A\u627E\u5230 spritesheet.webp\uFF08\u6839\u76EE\u5F55\u6216\u4E00\u5C42\u5B50\u76EE\u5F55\uFF09");
  const sheetRoot = path6.dirname(sheet);
  const staging = path6.join(stagingRootDir, uid());
  fs5.mkdirSync(staging, { recursive: true });
  try {
    fs5.copyFileSync(sheet, path6.join(staging, SHEET_FILE));
    const voiceRoot = path6.join(sheetRoot, "voice");
    if (fs5.existsSync(voiceRoot) && fs5.statSync(voiceRoot).isDirectory()) {
      copyVoiceTree(voiceRoot, voiceRoot, path6.join(staging, "voice"));
    }
  } catch (e) {
    fs5.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  const [disp, ver] = codexMeta(sheetRoot);
  const suggestedName = sanitizeName(path6.basename(sheetRoot)) || "pet";
  return finishStaged(staging, suggestedName, disp, ver);
}
async function stageFromZip(petsRootDir, stagingRootDir, zipPath) {
  if (!fs5.existsSync(zipPath) || !fs5.statSync(zipPath).isFile()) {
    throw new PetError("source-not-folder", "\u538B\u7F29\u5305\u4E0D\u5B58\u5728");
  }
  const extract = path6.join(stagingRootDir, `extract-${uid()}`);
  try {
    await safeUnzip(zipPath, extract);
  } catch (e) {
    fs5.rmSync(extract, { recursive: true, force: true });
    throw e;
  }
  let staged;
  try {
    staged = stageFromFolder(petsRootDir, stagingRootDir, extract);
  } finally {
    fs5.rmSync(extract, { recursive: true, force: true });
  }
  return staged;
}
function stageFromCodex(petsRootDir, stagingRootDir, codexRootDir, codexId) {
  validatePetId(codexId);
  const src = path6.join(codexRootDir, codexId);
  if (!fs5.existsSync(src) || !fs5.statSync(src).isDirectory()) {
    throw new PetError("pet-not-found", `codex \u5BA0\u7269\u4E0D\u5B58\u5728: ${codexId}`).with("id", codexId);
  }
  return stageFromFolder(petsRootDir, stagingRootDir, src);
}
function uniqueDest(groupDir, fileName) {
  const candidate = path6.join(groupDir, fileName);
  if (!fs5.existsSync(candidate)) return candidate;
  const ext = path6.extname(fileName);
  const stem = path6.basename(fileName, ext);
  for (let n = 2; ; n++) {
    const c = path6.join(groupDir, `${stem}-${n}${ext}`);
    if (!fs5.existsSync(c)) return c;
  }
}
function writeAudioInto(destVoice, fileName, bytes, group) {
  if (!VOICE_GROUPS.includes(group)) {
    throw new PetError("group-invalid", `\u975E\u6CD5\u5206\u7EC4: ${group}`).with("group", group);
  }
  const rawName = String(fileName || "");
  const base = path6.basename(rawName.replace(/\\/g, "/"));
  if (base.length === 0 || base === "." || base === ".." || rawName.includes("..") || rawName.includes("/") || rawName.includes("\\")) {
    throw new PetError("audio-relpath-invalid", "\u975E\u6CD5\u97F3\u9891\u6587\u4EF6\u540D");
  }
  if (!isAudioExt(base)) {
    throw new PetError("audio-format-unsupported", `\u4E0D\u652F\u6301\u7684\u97F3\u9891\u683C\u5F0F: ${base}`).with("path", base);
  }
  const groupDir = path6.join(destVoice, group);
  fs5.mkdirSync(groupDir, { recursive: true });
  const dest = uniqueDest(groupDir, base);
  fs5.writeFileSync(dest, bytes);
  const destName = path6.basename(dest);
  return { group, name: nameFromRel(destName), file: `voice/${group}/${destName}`, sizeBytes: bytes.length };
}
function removeAudio(baseDir, rel) {
  if (typeof rel !== "string" || rel.includes("..") || rel.includes("\\") || !isVoiceRel(rel)) {
    throw new PetError("audio-relpath-invalid", "\u975E\u6CD5\u97F3\u9891\u8DEF\u5F84");
  }
  if (!fs5.existsSync(baseDir) || !fs5.statSync(baseDir).isDirectory()) {
    throw new PetError("pet-dir-missing", "\u76EE\u5F55\u4E0D\u5B58\u5728");
  }
  const p = path6.join(baseDir, rel);
  const relCheck = path6.relative(baseDir, p);
  if (relCheck.startsWith("..") || path6.isAbsolute(relCheck)) {
    throw new PetError("audio-relpath-invalid", "\u975E\u6CD5\u97F3\u9891\u8DEF\u5F84");
  }
  if (fs5.existsSync(p) && fs5.statSync(p).isFile()) {
    try {
      fs5.unlinkSync(p);
    } catch (e) {
      throw new PetError("delete-failed", `\u5220\u9664\u97F3\u9891\u5931\u8D25: ${e.message}`).with("err", e.message);
    }
  }
}
function finalizeImport(petsRootDir, stagingRootDir, stagingId, name2, clientManifest) {
  validatePetName(petsRootDir, name2);
  const staging = stagingDirOf(stagingRootDir, stagingId);
  if (!fs5.existsSync(path6.join(staging, SHEET_FILE)) || !fs5.statSync(path6.join(staging, SHEET_FILE)).isFile()) {
    throw new PetError("staging-missing-sheet", "\u6682\u5B58\u533A\u7F3A\u5C11 spritesheet.webp");
  }
  const m = parseManifest({ ...clientManifest, schemaVersion: SCHEMA_VERSION, id: name2 }, { id: name2 });
  const sheetSize = fs5.statSync(path6.join(staging, SHEET_FILE)).size;
  if (m.spritesheetSizeBytes !== sheetSize) {
    throw new PetError("manifest-invalid", `spritesheetSizeBytes \u4E0E\u78C1\u76D8\u4E0D\u4E00\u81F4: ${m.spritesheetSizeBytes} != ${sheetSize}`);
  }
  const onDisk = new Map(listStagedVoice(staging).map((f) => [f.file, f.sizeBytes]));
  for (const v of m.voices) {
    if (!onDisk.has(v.file)) throw new PetError("manifest-invalid", `\u6E05\u5355\u8BED\u97F3\u4E0D\u5728\u6682\u5B58\u78C1\u76D8: ${v.file}`);
    if (onDisk.get(v.file) !== v.sizeBytes) throw new PetError("manifest-invalid", `\u6E05\u5355\u8BED\u97F3\u5927\u5C0F\u4E0D\u4E00\u81F4: ${v.file}`);
  }
  writeManifest(staging, m, { backup: false });
  const dest = path6.join(petsRootDir, name2);
  try {
    fs5.renameSync(staging, dest);
  } catch (e) {
    throw new PetError("finalize-move-failed", `\u843D\u5730\u5931\u8D25: ${e.message}`).with("err", e.message);
  }
  const summary = listPets(petsRootDir).find((s) => s.id === name2);
  if (!summary) throw new PetError("finalize-scan-failed", "\u843D\u5730\u540E\u8BFB\u53D6\u5BA0\u7269\u4FE1\u606F\u5931\u8D25");
  return summary;
}
function cancelImport(stagingRootDir, stagingId) {
  let staging;
  try {
    staging = stagingDirOf(stagingRootDir, stagingId);
  } catch {
    return;
  }
  fs5.rmSync(staging, { recursive: true, force: true });
}

// src/host/petdex.js
import fs6 from "node:fs";
var MANIFEST_URL = "https://petdex.dev/api/manifest";
var PETDEX_TIMEOUT_MS = 8e3;
var MAX_ZIP_BYTES = 50 * 1024 * 1024;
var MAX_MANIFEST_BYTES = 20 * 1024 * 1024;
var MAX_REDIRECTS = 5;
function allowedHost(host) {
  return host === "petdex.dev" || host === "www.petdex.dev" || host.endsWith(".petdex.dev");
}
function urlAllowed(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && allowedHost(url.hostname);
  } catch {
    return false;
  }
}
function parseSlug(rawUrl) {
  let path9;
  try {
    path9 = new URL(rawUrl).pathname;
  } catch {
    path9 = String(rawUrl || "").split("?")[0].split("#")[0];
  }
  const segs = path9.split("/").filter((s) => s.length > 0);
  const i = segs.indexOf("pets");
  if (i < 0) return null;
  const slug = segs[i + 1];
  if (!slug) return null;
  if (!/^[A-Za-z0-9-]+$/.test(slug)) return null;
  return slug;
}
async function fetchGuarded(url, { timeoutMs, fetchImpl }) {
  let current = url;
  for (let hop = 0; ; hop++) {
    if (!urlAllowed(current)) {
      let host = "";
      try {
        host = new URL(current).hostname;
      } catch {
      }
      if (hop === 0) {
        try {
          new URL(current);
        } catch (e) {
          throw new PetError("download-url-invalid", `\u4E0B\u8F7D\u5730\u5740\u975E\u6CD5: ${e.message}`).with("err", e.message);
        }
        throw new PetError("host-forbidden", `\u62D2\u7EDD\u975E petdex \u57DF\u4E0B\u8F7D: ${current}`).with("host", host);
      }
      throw new PetError("redirect-forbidden", `\u91CD\u5B9A\u5411\u76EE\u6807\u4E0D\u5728 petdex \u767D\u540D\u5355\u5185: ${current}`).with("host", host);
    }
    if (hop > MAX_REDIRECTS) throw new PetError("redirect-too-many", "\u91CD\u5B9A\u5411\u6B21\u6570\u8FC7\u591A");
    let resp;
    try {
      resp = await fetchImpl(current, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      const detail = String(e && e.message || e);
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new PetError("download-failed", `\u8BF7\u6C42\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09: ${current}`).with("err", detail);
      }
      throw new PetError("download-failed", `\u4E0B\u8F7D\u5931\u8D25: ${detail}`).with("err", detail);
    }
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) throw new PetError("download-failed", `\u91CD\u5B9A\u5411\u7F3A\u5C11 location\uFF08${resp.status}\uFF09`);
      current = new URL(loc, current).toString();
      continue;
    }
    return resp;
  }
}
async function readCapped(resp, cap, tooLargeCode, what) {
  const cl = Number(resp.headers.get("content-length"));
  if (Number.isFinite(cl) && cl > cap) {
    throw new PetError(tooLargeCode, `${what}\u4F53\u79EF\u8D85\u9650: ${cl} \u5B57\u8282\uFF08\u4E0A\u9650 ${cap}\uFF09`).with("actual", String(cl)).with("limit", String(cap));
  }
  const chunks = [];
  let total = 0;
  const reader = resp.body ? resp.body.getReader() : null;
  if (!reader) {
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > cap) {
      throw new PetError(tooLargeCode, `${what}\u4F53\u79EF\u8D85\u9650\uFF08\u4E0A\u9650 ${cap} \u5B57\u8282\uFF09`).with("actual", String(buf.length)).with("limit", String(cap));
    }
    return buf;
  }
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      try {
        await reader.cancel();
      } catch {
      }
      throw new PetError(tooLargeCode, `${what}\u4F53\u79EF\u8D85\u9650\uFF08\u4E0A\u9650 ${cap} \u5B57\u8282\uFF09`).with("actual", String(total)).with("limit", String(cap));
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
function parseManifestPayload(bytes) {
  let json2;
  try {
    json2 = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    throw new PetError("manifest-parse-failed", `petdex \u6E05\u5355\u89E3\u6790\u5931\u8D25: ${e.message}`).with("err", e.message);
  }
  let list;
  if (Array.isArray(json2)) list = json2;
  else if (json2 && typeof json2 === "object" && Array.isArray(json2.pets)) list = json2.pets;
  else throw new PetError("manifest-parse-failed", "petdex \u6E05\u5355\u5F62\u6001\u672A\u77E5\uFF08\u65E2\u975E\u6570\u7EC4\u4E5F\u975E {pets:[]}\uFF09");
  return list.filter((e) => e && typeof e === "object" && typeof e.slug === "string").map((e) => ({
    slug: e.slug,
    displayName: typeof e.displayName === "string" ? e.displayName : "",
    zipUrl: typeof e.zipUrl === "string" ? e.zipUrl : "",
    spriteVersionNumber: e.spriteVersionNumber === 1 || e.spriteVersionNumber === 2 ? e.spriteVersionNumber : 0
  }));
}
async function fetchManifestList({ fetchImpl = fetch } = {}) {
  let resp;
  try {
    resp = await fetchGuarded(MANIFEST_URL, { timeoutMs: PETDEX_TIMEOUT_MS, fetchImpl });
  } catch (e) {
    if (e instanceof PetError && e.code.startsWith("redirect-")) throw e;
    if (e instanceof PetError && e.code === "download-failed") {
      throw new PetError("manifest-request-failed", `petdex \u6E05\u5355\u8BF7\u6C42\u5931\u8D25: ${e.detail}`).with("err", e.detail);
    }
    throw e;
  }
  if (!resp.ok) {
    throw new PetError("manifest-status", `petdex \u6E05\u5355\u54CD\u5E94\u5F02\u5E38: HTTP ${resp.status}`).with("err", `HTTP ${resp.status}`);
  }
  const bytes = await readCapped(resp, MAX_MANIFEST_BYTES, "manifest-too-large", "petdex \u6E05\u5355");
  return parseManifestPayload(bytes);
}
async function fetchEntry(slug, opts = {}) {
  const list = await fetchManifestList(opts);
  const hit = list.find((e) => e.slug === slug);
  if (!hit) throw new PetError("pet-not-on-petdex", `petdex \u4E0A\u672A\u627E\u5230\u5BA0\u7269: ${slug}`).with("slug", slug);
  return hit;
}
async function searchPets(query, { limit = 100, fetchImpl = fetch } = {}) {
  const list = await fetchManifestList({ fetchImpl });
  const q = String(query || "").trim().toLowerCase();
  const hits = q.length === 0 ? list : list.filter((e) => e.slug.toLowerCase().includes(q) || e.displayName.toLowerCase().includes(q));
  return hits.slice(0, limit).map((e) => ({ ...e, hasZip: e.zipUrl.length > 0 }));
}
async function downloadZip(zipUrl, { fetchImpl = fetch } = {}) {
  const resp = await fetchGuarded(zipUrl, { timeoutMs: PETDEX_TIMEOUT_MS, fetchImpl });
  if (!resp.ok) {
    throw new PetError("download-status", `\u4E0B\u8F7D\u54CD\u5E94\u5F02\u5E38: HTTP ${resp.status}`).with("err", `HTTP ${resp.status}`);
  }
  return readCapped(resp, MAX_ZIP_BYTES, "download-too-large", "\u4E0B\u8F7D\u5185\u5BB9");
}
var tmpCounter = 0;
function tmpZipName(slug) {
  if (typeof slug !== "string" || slug.length === 0 || !/^[a-z0-9-]+$/.test(slug)) {
    throw new PetError("slug-invalid", "\u65E0\u6548\u7684 petdex \u6807\u8BC6\uFF08\u4EC5\u652F\u6301\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26\uFF09").with("slug", String(slug));
  }
  return `foxbell-petdex-${slug}-${process.pid}-${tmpCounter++}.zip`;
}
async function stageFromPetdex(urlOrSlug, { staging, tmpDir, fetchImpl = fetch }) {
  const slug = /^[a-z0-9-]+$/.test(String(urlOrSlug || "")) ? String(urlOrSlug) : parseSlug(urlOrSlug);
  if (!slug) throw new PetError("slug-parse-failed", "\u65E0\u6CD5\u4ECE\u94FE\u63A5\u89E3\u6790\u5BA0\u7269\u6807\u8BC6\uFF08\u671F\u671B https://petdex.dev/pets/<slug>\uFF09");
  const entry = await fetchEntry(slug, { fetchImpl });
  if (!entry.zipUrl) throw new PetError("petdex-no-zip", "\u8BE5\u5BA0\u7269\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684\u538B\u7F29\u5305");
  const bytes = await downloadZip(entry.zipUrl, { fetchImpl });
  const tmp = tmpZipName(slug);
  const tmpPath = `${tmpDir}/${tmp}`;
  try {
    fs6.writeFileSync(tmpPath, bytes);
  } catch (e) {
    throw new PetError("tmp-write-failed", `\u4E34\u65F6\u6587\u4EF6\u5199\u5165\u5931\u8D25: ${e.message}`).with("err", e.message);
  }
  let staged;
  try {
    staged = await staging.stageFromZipPath(tmpPath);
  } finally {
    try {
      fs6.rmSync(tmpPath, { force: true });
    } catch {
    }
  }
  staged.suggestedName = slug;
  if (entry.displayName) staged.suggestedDisplayName = entry.displayName;
  staged.spriteVersionNumber = entry.spriteVersionNumber;
  return staged;
}

// src/host/routes.js
var ROUTE_PREFIX = "/dyn-pet-foxbell";
var MAX_JSON_BODY = 1 * 1024 * 1024;
var MAX_FOLDER_UPLOAD_BODY = 140 * 1024 * 1024;
var MAX_ZIP_UPLOAD = 100 * 1024 * 1024;
var AUDIO_CONTENT_TYPE = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac"
};
function json(res, body, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const bytes = Buffer.byteLength(text);
  res.writeHead(status, { "content-type": "application/json", "content-length": String(bytes), "cache-control": "no-store" });
  res.end(text);
}
function errJson(res, err) {
  const e = err instanceof PetError ? err : internal(String(err && err.message || err));
  json(res, { code: e.code, params: e.params || {}, detail: e.detail }, statusOfCode(e.code));
}
function readBodyBytes(req, cap, code) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > cap) {
        reject(new PetError(code, `\u8BF7\u6C42\u4F53\u8D85\u9650\uFF08>${cap} \u5B57\u8282\uFF09`).with("limit", String(cap)));
        try {
          req.destroy();
        } catch {
        }
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", (e) => reject(internal(`\u8BFB\u53D6\u8BF7\u6C42\u4F53\u5931\u8D25: ${e.message}`)));
  });
}
async function readJsonBody(req, cap = MAX_JSON_BODY) {
  const bytes = await readBodyBytes(req, cap, "manifest-too-large");
  if (bytes.length === 0) return {};
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    throw new PetError("manifest-parse-failed", `\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON: ${e.message}`).with("err", e.message);
  }
}
function originOk(req) {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin === "" || origin === "null") return true;
  const host = req.headers.host;
  if (typeof host !== "string") return true;
  try {
    const u = new URL(origin);
    return u.host === host;
  } catch {
    return false;
  }
}
function sendFile(res, filePath, contentType, cache) {
  let st;
  try {
    st = fs7.lstatSync(filePath);
  } catch {
    throw new PetError("pet-not-found", `\u6587\u4EF6\u4E0D\u5B58\u5728: ${filePath}`);
  }
  if (st.isSymbolicLink() || !st.isFile()) throw new PetError("pet-not-found", `\u4E0D\u662F\u6587\u4EF6: ${filePath}`);
  const bytes = fs7.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType, "content-length": String(bytes.length), "cache-control": cache });
  res.end(bytes);
}
function registerRoutes(ctx, env) {
  const webServer = ctx.get("webServer");
  if (webServer === void 0) return;
  const reg = (route) => ctx.effect(() => webServer.register(route));
  const petDirOf = (id) => {
    if (id === BUILTIN_PET_ID) return env.builtin.assetDir;
    validatePetId(id);
    const dir = path7.join(env.petsRoot, id);
    if (!isRealPetDir(dir)) throw new PetError("pet-not-found", `\u5BA0\u7269\u4E0D\u5B58\u5728: ${id}`).with("id", id);
    return dir;
  };
  const manifestOf = (id) => {
    if (id === BUILTIN_PET_ID) return env.builtin.manifest;
    return loadManifest(path7.join(env.petsRoot, id), { id });
  };
  reg({
    kind: "exact",
    path: `${ROUTE_PREFIX}/state`,
    handler(req, res) {
      try {
        let hint = null;
        try {
          const u = new URL(req.url || "/", "http://x");
          hint = u.searchParams.get("pet");
        } catch {
        }
        json(res, env.snapshotExtra(hint));
      } catch (e) {
        errJson(res, e);
      }
    }
  });
  reg({
    kind: "exact",
    path: `${ROUTE_PREFIX}/ack`,
    handler(req, res) {
      let agentId = null;
      try {
        const u = new URL(req.url || "/", "http://x");
        agentId = u.searchParams.get("agentId");
      } catch {
      }
      if (typeof agentId === "string") env.stateEngine.ack(agentId);
      json(res, { ok: true });
    }
  });
  reg({
    kind: "exact",
    path: `${ROUTE_PREFIX}/client-diag`,
    handler(req, res) {
      try {
        const u = new URL(req.url || "/", "http://x");
        const v = u.searchParams.get("visible");
        if (v === "0" || v === "1") env.diag.clientVisible = v;
      } catch {
      }
      json(res, { ok: true });
    }
  });
  reg({
    kind: "prefix",
    path: `${ROUTE_PREFIX}/pets`,
    handler(req, res) {
      try {
        const u = new URL(req.url || "/", "http://x");
        const segs = decodeURIComponent(u.pathname).split("/").filter(Boolean);
        const rest = segs.slice(2);
        if (req.method !== "GET" && req.method !== "HEAD") throw new PetError("origin-forbidden", "\u8D44\u4EA7\u8DEF\u7531\u4EC5\u652F\u6301 GET");
        if (rest.length === 0) {
          const builtinSummary = {
            id: BUILTIN_PET_ID,
            displayName: env.builtin.manifest ? env.builtin.manifest.displayName : "Foxbell",
            description: env.builtin.manifest ? env.builtin.manifest.description : "",
            source: "builtin",
            spriteVersionNumber: env.builtin.manifest ? env.builtin.manifest.spriteVersionNumber : 2,
            hasVoice: env.builtin.manifest ? env.builtin.manifest.hasVoice : true,
            hasSubtitle: env.builtin.manifest ? env.builtin.manifest.hasSubtitle : true,
            manifestExists: env.builtin.manifest !== null,
            spritesheetExists: env.builtin.spriteBytes !== null,
            dir: env.builtin.assetDir,
            builtin: true
          };
          const external = listPets(env.petsRoot).map((s) => ({ ...s, builtin: false }));
          json(res, { pets: [builtinSummary, ...external] });
          return;
        }
        const id = rest[0];
        const dir = petDirOf(id);
        if (rest.length === 2 && rest[1] === "manifest.json") {
          const m = id === BUILTIN_PET_ID ? env.builtin.manifest : loadManifest(dir, { id });
          if (!m) throw new PetError("manifest-parse-failed", `manifest \u7F3A\u5931\u6216\u635F\u574F: ${id}`);
          json(res, m);
          return;
        }
        if (rest.length === 2 && rest[1] === SHEET_FILE) {
          sendFile(res, path7.join(dir, SHEET_FILE), "image/webp", id === BUILTIN_PET_ID ? "public, max-age=3600" : "no-store");
          return;
        }
        if (rest.length === 4 && rest[1] === "voice" && VOICE_GROUPS.includes(rest[2])) {
          const file = rest[3];
          const rel = `voice/${rest[2]}/${file}`;
          if (!isVoiceRel(rel)) throw new PetError("audio-relpath-invalid", "\u975E\u6CD5\u97F3\u9891\u8DEF\u5F84");
          const p = path7.join(dir, rel);
          const relCheck = path7.relative(dir, p);
          if (relCheck.startsWith("..") || path7.isAbsolute(relCheck)) throw new PetError("audio-relpath-invalid", "\u975E\u6CD5\u97F3\u9891\u8DEF\u5F84");
          const ext = path7.extname(file).slice(1).toLowerCase();
          sendFile(res, p, AUDIO_CONTENT_TYPE[ext] || "application/octet-stream", id === BUILTIN_PET_ID ? "public, max-age=3600" : "no-store");
          return;
        }
        throw new PetError("pet-not-found", `\u672A\u77E5\u8D44\u4EA7\u8DEF\u5F84: /${rest.join("/")}`);
      } catch (e) {
        errJson(res, e);
      }
    }
  });
  reg({
    kind: "prefix",
    path: `${ROUTE_PREFIX}/staging`,
    handler(req, res) {
      try {
        if (req.method !== "GET" && req.method !== "HEAD") throw new PetError("origin-forbidden", "\u6682\u5B58\u8D44\u4EA7\u8DEF\u7531\u4EC5\u652F\u6301 GET");
        const u = new URL(req.url || "/", "http://x");
        const segs = decodeURIComponent(u.pathname).split("/").filter(Boolean).slice(2);
        if (segs.length < 2) throw new PetError("staging-id-invalid", "\u975E\u6CD5\u6682\u5B58\u533A\u8DEF\u5F84");
        const staging = stagingDirOf(env.stagingRoot, segs[0]);
        const rest = segs.slice(1);
        if (rest.length === 1 && rest[0] === SHEET_FILE) {
          sendFile(res, path7.join(staging, SHEET_FILE), "image/webp", "no-store");
          return;
        }
        if (rest.length === 3 && rest[0] === "voice" && VOICE_GROUPS.includes(rest[1])) {
          const rel = `voice/${rest[1]}/${rest[2]}`;
          if (!isVoiceRel(rel)) throw new PetError("audio-relpath-invalid", "\u975E\u6CD5\u97F3\u9891\u8DEF\u5F84");
          const ext = path7.extname(rest[2]).slice(1).toLowerCase();
          sendFile(res, path7.join(staging, rel), AUDIO_CONTENT_TYPE[ext] || "application/octet-stream", "no-store");
          return;
        }
        if (rest.length === 1 && rest[0] === "list") {
          json(res, { stagingId: segs[0], voiceFiles: listStagedVoice(staging), spritesheet: fs7.existsSync(path7.join(staging, SHEET_FILE)) });
          return;
        }
        throw new PetError("staging-not-found", `\u672A\u77E5\u6682\u5B58\u8DEF\u5F84: /${rest.join("/")}`);
      } catch (e) {
        errJson(res, e);
      }
    }
  });
  const api = (name2, handler) => reg({
    kind: "exact",
    path: `${ROUTE_PREFIX}/api/${name2}`,
    async handler(req, res) {
      try {
        if (req.method !== "POST") {
          if (handler.get) {
            json(res, await handler.get(req));
            return;
          }
          throw new PetError("origin-forbidden", `${name2} \u4EC5\u652F\u6301 POST`);
        }
        if (!originOk(req)) throw new PetError("origin-forbidden", "\u62D2\u7EDD\u8DE8\u6E90\u8BF7\u6C42");
        json(res, await handler.post(req));
      } catch (e) {
        errJson(res, e);
      }
    }
  });
  api("import-folder", {
    async post(req) {
      const body = await readJsonBody(req);
      const src = String(body.path || "");
      if (!path7.isAbsolute(src)) throw new PetError("source-not-folder", "\u9700\u8981\u670D\u52A1\u7AEF\u7EDD\u5BF9\u8DEF\u5F84");
      return stageFromFolder(env.petsRoot, env.stagingRoot, src);
    }
  });
  api("import-zip", {
    async post(req) {
      const bytes = await readBodyBytes(req, MAX_ZIP_UPLOAD, "zip-total-over-limit");
      fs7.mkdirSync(env.stagingRoot, { recursive: true });
      const tmp = path7.join(env.stagingRoot, `upload-${uid()}.zip`);
      try {
        fs7.writeFileSync(tmp, bytes);
        return await stageFromZip(env.petsRoot, env.stagingRoot, tmp);
      } finally {
        try {
          fs7.rmSync(tmp, { force: true });
        } catch {
        }
      }
    }
  });
  api("import-folder-files", {
    async post(req) {
      const body = await readJsonBody(req, MAX_FOLDER_UPLOAD_BODY);
      const files = Array.isArray(body.files) ? body.files : [];
      if (files.length === 0) throw new PetError("source-not-folder", "\u4E0A\u4F20\u6587\u4EF6\u5217\u8868\u4E3A\u7A7A");
      if (files.length > 200) throw new PetError("zip-too-many-entries", "\u4E0A\u4F20\u6587\u4EF6\u6570\u8D85\u9650\uFF08>200\uFF09").with("limit", "200");
      fs7.mkdirSync(env.stagingRoot, { recursive: true });
      const tmpRoot = path7.join(env.stagingRoot, `upload-dir-${uid()}`);
      let total = 0;
      try {
        let hasSheet = false;
        for (const f of files) {
          const rel = String(f && f.rel || "").replace(/\\/g, "/");
          const segs = rel.split("/").filter((s) => s.length > 0);
          if (segs.some((s) => s === ".." || s === ".") || path7.isAbsolute(rel)) {
            throw new PetError("zip-entry-illegal-path", `\u4E0A\u4F20\u542B\u975E\u6CD5\u8DEF\u5F84: ${rel}`).with("name", rel);
          }
          const clean = segs.join("/");
          const allowed = clean === SHEET_FILE || clean === "pet.json" || clean.startsWith("voice/") && isVoiceRel(clean) && AUDIO_EXTS.some((ext) => clean.toLowerCase().endsWith("." + ext));
          if (!allowed) continue;
          const data = typeof f.data === "string" ? Buffer.from(f.data, "base64") : Buffer.alloc(0);
          total += data.length;
          if (total > 100 * 1024 * 1024) {
            throw new PetError("zip-total-over-limit", "\u4E0A\u4F20\u603B\u91CF\u8D85\u9650\uFF08>100MB\uFF09").with("limit", "100MB");
          }
          const dest = path7.join(tmpRoot, clean);
          fs7.mkdirSync(path7.dirname(dest), { recursive: true });
          fs7.writeFileSync(dest, data);
          if (clean === SHEET_FILE) hasSheet = true;
        }
        if (!hasSheet) throw new PetError("sheet-not-found", "\u672A\u627E\u5230 spritesheet.webp\uFF08\u6839\u76EE\u5F55\u6216\u4E00\u5C42\u5B50\u76EE\u5F55\uFF09");
        return stageFromFolder(env.petsRoot, env.stagingRoot, tmpRoot);
      } finally {
        try {
          fs7.rmSync(tmpRoot, { recursive: true, force: true });
        } catch {
        }
      }
    }
  });
  api("codex-list", {
    async post() {
      return { pets: listCodexPets(env.codexRoot, env.petsRoot) };
    }
  });
  api("import-codex", {
    async post(req) {
      const body = await readJsonBody(req);
      return stageFromCodex(env.petsRoot, env.stagingRoot, env.codexRoot, String(body.id || ""));
    }
  });
  api("petdex-search", {
    async post(req) {
      const body = await readJsonBody(req);
      return { pets: await searchPets(String(body.q || ""), { limit: 100, ...env.fetchImpl ? { fetchImpl: env.fetchImpl } : {} }) };
    }
  });
  api("import-petdex", {
    async post(req) {
      const body = await readJsonBody(req);
      fs7.mkdirSync(env.stagingRoot, { recursive: true });
      return stageFromPetdex(String(body.url || body.slug || ""), {
        staging: { stageFromZipPath: (p) => stageFromZip(env.petsRoot, env.stagingRoot, p) },
        tmpDir: env.tmpDir,
        ...env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}
      });
    }
  });
  api("staging-voice-add", {
    async post(req) {
      const u = new URL(req.url || "/", "http://x");
      const sid = u.searchParams.get("sid") || "";
      const group = u.searchParams.get("group") || "";
      const name2 = u.searchParams.get("name") || "audio.m4a";
      const staging = stagingDirOf(env.stagingRoot, sid);
      const bytes = await readBodyBytes(req, MAX_AUDIO_BYTES, "audio-format-unsupported");
      if (bytes.length > MAX_AUDIO_BYTES) {
        throw new PetError("audio-format-unsupported", `\u97F3\u9891\u8D85\u8FC7 ${MAX_AUDIO_BYTES} \u5B57\u8282\u4E0A\u9650`);
      }
      const added = writeAudioInto(path7.join(staging, "voice"), name2, bytes, group);
      return { added };
    }
  });
  api("staging-voice-remove", {
    async post(req) {
      const body = await readJsonBody(req);
      const staging = stagingDirOf(env.stagingRoot, String(body.sid || ""));
      removeAudio(staging, String(body.rel || ""));
      return { ok: true };
    }
  });
  api("import-finalize", {
    async post(req) {
      const body = await readJsonBody(req);
      return finalizeImport(env.petsRoot, env.stagingRoot, String(body.stagingId || ""), String(body.name || ""), body.manifest || {});
    }
  });
  api("import-cancel", {
    async post(req) {
      const body = await readJsonBody(req);
      cancelImport(env.stagingRoot, String(body.stagingId || ""));
      return { ok: true };
    }
  });
  api("voice-add", {
    async post(req) {
      const u = new URL(req.url || "/", "http://x");
      const id = u.searchParams.get("id") || "";
      const group = u.searchParams.get("group") || "";
      const name2 = u.searchParams.get("name") || "audio.m4a";
      if (id === BUILTIN_PET_ID) throw new PetError("pet-name-reserved", "\u5185\u7F6E\u5BA0\u7269\u4E0D\u53EF\u7F16\u8F91");
      validatePetId(id);
      const dir = path7.join(env.petsRoot, id);
      if (!fs7.existsSync(dir)) throw new PetError("pet-not-found", `\u5BA0\u7269\u4E0D\u5B58\u5728: ${id}`).with("id", id);
      const bytes = await readBodyBytes(req, MAX_AUDIO_BYTES, "audio-format-unsupported");
      const added = writeAudioInto(path7.join(dir, "voice"), name2, bytes, group);
      return { added };
    }
  });
  api("voice-remove", {
    async post(req) {
      const body = await readJsonBody(req);
      const id = String(body.id || "");
      if (id === BUILTIN_PET_ID) throw new PetError("pet-name-reserved", "\u5185\u7F6E\u5BA0\u7269\u4E0D\u53EF\u7F16\u8F91");
      validatePetId(id);
      const dir = path7.join(env.petsRoot, id);
      if (!fs7.existsSync(dir)) throw new PetError("pet-not-found", `\u5BA0\u7269\u4E0D\u5B58\u5728: ${id}`).with("id", id);
      removeAudio(dir, String(body.rel || ""));
      return { ok: true };
    }
  });
  api("manifest-update", {
    async post(req) {
      const body = await readJsonBody(req);
      const id = String(body.id || "");
      if (id === BUILTIN_PET_ID) throw new PetError("pet-name-reserved", "\u5185\u7F6E\u5BA0\u7269\u4E0D\u53EF\u7F16\u8F91");
      validatePetId(id);
      const dir = path7.join(env.petsRoot, id);
      if (!fs7.existsSync(dir)) throw new PetError("pet-not-found", `\u5BA0\u7269\u4E0D\u5B58\u5728: ${id}`).with("id", id);
      const scan = scanPet(env.petsRoot, id);
      const m = parseManifest({ ...body.manifest, id }, { id });
      if (scan.spritesheet.exists && m.spritesheetSizeBytes > 0 && m.spritesheetSizeBytes !== scan.spritesheet.size) {
        throw new PetError("manifest-invalid", `spritesheetSizeBytes \u4E0E\u78C1\u76D8\u4E0D\u4E00\u81F4: ${m.spritesheetSizeBytes} != ${scan.spritesheet.size}`);
      }
      const onDisk = new Map(scan.voiceFiles.map((f) => [f.rel, f.size]));
      for (const v of m.voices) {
        if (!onDisk.has(v.file)) throw new PetError("manifest-invalid", `\u6E05\u5355\u8BED\u97F3\u4E0D\u5728\u78C1\u76D8: ${v.file}`);
        if (onDisk.get(v.file) !== v.sizeBytes) throw new PetError("manifest-invalid", `\u6E05\u5355\u8BED\u97F3\u5927\u5C0F\u4E0D\u4E00\u81F4: ${v.file}`);
      }
      writeManifest(dir, m, { backup: body.backup !== false });
      return { ok: true, manifest: m };
    }
  });
  api("rename", {
    async post(req) {
      const body = await readJsonBody(req);
      renamePet(env.petsRoot, String(body.oldId || ""), String(body.newId || ""));
      return { ok: true };
    }
  });
  api("delete", {
    async post(req) {
      const body = await readJsonBody(req);
      const id = String(body.id || "");
      if (id === BUILTIN_PET_ID) throw new PetError("pet-name-reserved", "\u5185\u7F6E\u5BA0\u7269\u4E0D\u53EF\u5220\u9664");
      const dest = deletePet(env.petsRoot, env.trashRoot, id);
      return { ok: true, trashPath: dest };
    }
  });
  api("scan", {
    async post(req) {
      const body = await readJsonBody(req);
      const id = String(body.id || "");
      if (id === BUILTIN_PET_ID) {
        const dir = env.builtin.assetDir;
        return { id, dir, spritesheet: { rel: SHEET_FILE, exists: env.builtin.spriteBytes !== null, size: env.builtin.spriteBytes ? env.builtin.spriteBytes.length : 0 }, voiceFiles: [], builtin: true };
      }
      return scanPet(env.petsRoot, id);
    }
  });
  api("activate", {
    async post(req) {
      const body = await readJsonBody(req);
      const id = String(body.id || "");
      if (id === BUILTIN_PET_ID) return { status: "activated", id, voiceCap: true };
      validatePetId(id);
      if (!isRealPetDir(path7.join(env.petsRoot, id))) {
        throw new PetError("pet-not-found", `\u5BA0\u7269\u4E0D\u5B58\u5728: ${id}`).with("id", id);
      }
      const g = checkPet(env.petsRoot, id);
      if (g.fatal) return { status: "invalid-sheet", id, issues: g.issues };
      if (g.issues.length > 0) {
        const manifest2 = manifestOf(id);
        return { status: "mismatch", id, issues: g.issues, plan: g.plan, manifest: manifest2 };
      }
      const manifest = manifestOf(id);
      return { status: "activated", id, voiceCap: manifest ? manifest.hasVoice : false };
    }
  });
  api("check-name", {
    async post(req) {
      const body = await readJsonBody(req);
      const name2 = String(body.name || "");
      const selfId = body.selfId === void 0 ? null : String(body.selfId);
      const existing = [BUILTIN_PET_ID, ...listPets(env.petsRoot).map((s) => s.id)];
      const p = petIdProblem(name2);
      if (p) return { ok: false, problem: p.code };
      const others = existing.filter((id) => id !== selfId);
      if (others.some((id) => id.toLowerCase() === name2.toLowerCase())) return { ok: false, problem: "pet-exists" };
      return { ok: true };
    }
  });
  api("store-info", {
    async post() {
      return {
        petsRoot: env.petsRoot,
        stagingRoot: env.stagingRoot,
        trashRoot: env.trashRoot,
        codexRoot: env.codexRoot
      };
    }
  });
  void validatePetName;
  void MANIFEST_FILE;
}

// src/host/index.js
var name = "dsh-foxbell-pet";
var FOXBELL_PET_NS = "foxbell-pet";
var ACTION_IDS = ["jumping", "waving", "failed", "waiting", "review", "running"];
var Action = z.union(ACTION_IDS);
var Config = z.object({
  muted: z.boolean().default(false),
  talkative: z.boolean().default(true),
  doneAction: Action.default("jumping"),
  dblAction: Action.default("waving"),
  approvalAction: Action.default("waiting"),
  runningAction: Action.default("running"),
  errorAction: Action.default("failed"),
  gravity: z.boolean().default(true),
  // v2 新增：三档缩放（精灵/卡片/菜单整体）与激活宠物 id。
  // 旧保存配置无这两个字段 → schema default 自动补齐，无需用户干预。
  scale: z.union([0.75, 1, 1.25]).default(1),
  activePetId: z.string().default(BUILTIN_PET_ID)
});
var inject = ["webServer", "fs", "agents", "sessions", "sessionTitle"];
async function apply(ctx, config) {
  let entry;
  try {
    entry = Config(config ?? {});
  } catch {
    entry = Config({});
  }
  let configSource = () => entry;
  let settingsAttached = false;
  const readConfig = () => {
    try {
      const v = configSource();
      return v && typeof v === "object" ? v : entry;
    } catch {
      return entry;
    }
  };
  try {
    ctx.inject(["settings"], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, FOXBELL_PET_NS, Config, entry, {
        setSource: (current) => {
          configSource = current;
          settingsAttached = true;
        },
        onChange: () => {
        }
      });
    });
  } catch (err) {
    console.warn("[foxbell-pet] settings installSection unavailable:", String(err && err.message || err));
  }
  const PETS_ROOT = petsRoot();
  const STAGING_ROOT = stagingRoot();
  const TRASH_ROOT = trashRoot();
  const CODEX_ROOT = codexRoot();
  const TMP_DIR = os2.tmpdir();
  try {
    fs8.mkdirSync(PETS_ROOT, { recursive: true });
    fs8.mkdirSync(STAGING_ROOT, { recursive: true });
  } catch (err) {
    console.warn("[foxbell-pet] store mkdir failed (\u5916\u90E8\u5BA0\u7269\u4F53\u7CFB\u964D\u7EA7):", String(err && err.message || err));
  }
  let sweptCount = 0;
  try {
    sweptCount = sweepStaging(STAGING_ROOT);
  } catch {
  }
  const PKG_DIR = fileURLToPath(new URL("../", import.meta.url));
  const sp = ctx.get("sandboxPolicy");
  const workspaceRoot = sp && typeof sp === "object" && typeof sp.workspaceRoot === "string" ? sp.workspaceRoot : null;
  const candidates = [PKG_DIR + "assets"];
  if (workspaceRoot) candidates.push(workspaceRoot + "/foxbell");
  let spriteBytes = null;
  let ASSET_DIR = null;
  const builtinVoices = [];
  const diag = { fsAvailable: false, workspaceRoot, probes: candidates.slice(), loadError: null, computeCount: 0, clientVisible: null, storeRoot: storeRoot(), petsRoot: PETS_ROOT, sweptStaging: sweptCount };
  try {
    const fsSvc = ctx.get("fs");
    if (fsSvc === void 0) {
      diag.loadError = "fs service unavailable via ctx.get(fs)";
    } else {
      diag.fsAvailable = true;
      for (const dir of candidates) {
        try {
          const probe = await fsSvc.resolve(dir + "/" + SHEET_FILE);
          const st = await fsSvc.stat(probe);
          if (st && typeof st.size === "number") {
            ASSET_DIR = dir;
            break;
          }
        } catch (err) {
          diag.loadError = diag.loadError || "probe failed: " + dir + " -> " + String(err && err.message || err);
        }
      }
      if (ASSET_DIR !== null) {
        const spriteTarget = await fsSvc.resolve(ASSET_DIR + "/" + SHEET_FILE);
        const st = await fsSvc.stat(spriteTarget);
        if (st && typeof st.size === "number") spriteBytes = await fsSvc.readBytes(spriteTarget, void 0, st.size + 1);
      }
    }
  } catch (err) {
    diag.loadError = diag.loadError || "asset load failed: " + String(err && err.message || err);
    console.error("asset load failed:", String(err && err.message || err));
  }
  let builtinManifest = null;
  try {
    const raw = JSON.parse(fs8.readFileSync(path8.join(PKG_DIR, "assets", "pet.json"), "utf8"));
    builtinManifest = parseManifest(raw, { id: BUILTIN_PET_ID });
  } catch (err) {
    diag.loadError = diag.loadError || "builtin manifest failed: " + String(err && err.message || err);
  }
  if (builtinManifest === null) {
    builtinManifest = {
      schemaVersion: 2,
      id: BUILTIN_PET_ID,
      displayName: "Foxbell",
      description: "",
      source: "builtin",
      spriteVersionNumber: 2,
      spritesheetSizeBytes: spriteBytes ? spriteBytes.length : 0,
      hasVoice: false,
      hasSubtitle: false,
      voices: []
    };
  }
  for (const v of builtinManifest.voices) builtinVoices.push(v);
  const agents = ctx.get("agents");
  const sessions = ctx.get("sessions");
  const sessionTitle = ctx.get("sessionTitle");
  const engine = createStateEngine({
    roots: () => agents !== void 0 ? agents.roots() : [],
    getSession: (id) => sessions !== void 0 ? sessions.get(id) : void 0,
    getTitle: (session) => sessionTitle !== void 0 ? sessionTitle.get(session) : void 0,
    now: () => Date.now()
  });
  engine.compute();
  const activePetId = (hint) => {
    if (!settingsAttached && typeof hint === "string" && hint.length > 0) {
      if (hint === BUILTIN_PET_ID || petIdProblem(hint) === null) return hint;
    }
    const v = readConfig().activePetId;
    return typeof v === "string" && v.length > 0 ? v : BUILTIN_PET_ID;
  };
  const revOf = (id) => {
    if (id === BUILTIN_PET_ID) return "builtin";
    try {
      return String(fs8.statSync(path8.join(PETS_ROOT, id, "manifest.json")).mtimeMs);
    } catch {
      return "0";
    }
  };
  const voiceUrls = (id, manifest) => (manifest ? manifest.voices : []).map((v, i) => ({
    index: i,
    group: v.group,
    name: v.name,
    file: v.file,
    url: `${ROUTE_PREFIX}/pets/${encodeURIComponent(id)}/voice/${encodeURIComponent(v.group)}/${encodeURIComponent(v.file.split("/").pop())}?rev=${revOf(id)}`
  }));
  const activePetSnapshot = (hint) => {
    const id = activePetId(hint);
    if (id === BUILTIN_PET_ID) {
      return {
        id,
        name: builtinManifest.displayName,
        hasVoice: builtinManifest.hasVoice,
        hasSubtitle: builtinManifest.hasSubtitle,
        spriteVersionNumber: builtinManifest.spriteVersionNumber,
        spriteUrl: `${ROUTE_PREFIX}/pets/${BUILTIN_PET_ID}/${SHEET_FILE}`,
        rev: "builtin"
      };
    }
    const m = loadManifest(path8.join(PETS_ROOT, id), { id });
    const exists = fs8.existsSync(path8.join(PETS_ROOT, id));
    return {
      id,
      name: m ? m.displayName : id,
      hasVoice: m ? m.hasVoice : false,
      hasSubtitle: m ? m.hasSubtitle : false,
      spriteVersionNumber: m ? m.spriteVersionNumber : 0,
      spriteUrl: exists ? `${ROUTE_PREFIX}/pets/${encodeURIComponent(id)}/${SHEET_FILE}?rev=${revOf(id)}` : null,
      rev: revOf(id)
    };
  };
  const guardSnapshot = (hint) => {
    const id = activePetId(hint);
    if (id === BUILTIN_PET_ID) return [];
    try {
      const g = checkPet(PETS_ROOT, id);
      return g.issues.map((i) => ({ kind: i.kind, detail: i.detail, fatal: !!g.fatal }));
    } catch {
      return [];
    }
  };
  const snapshotExtra = (hint) => {
    engine.compute();
    diag.computeCount += 1;
    const active = activePetSnapshot(hint);
    const activeManifest = active.id === BUILTIN_PET_ID ? builtinManifest : loadManifest(path8.join(PETS_ROOT, active.id), { id: active.id });
    const projects = engine.list();
    return {
      seq: engine.nextSeq(),
      completions: engine.queue,
      runningSessions: projects.filter((p) => p.status === "running").length,
      projects,
      // voices 改为当前激活宠物的语音清单（资产 URL 指向 /pets/<id>/…）
      voices: voiceUrls(active.id, activeManifest),
      activePet: active,
      pets: [
        {
          id: BUILTIN_PET_ID,
          displayName: builtinManifest.displayName,
          description: builtinManifest.description,
          source: "builtin",
          spriteVersionNumber: builtinManifest.spriteVersionNumber,
          hasVoice: builtinManifest.hasVoice,
          hasSubtitle: builtinManifest.hasSubtitle,
          manifestExists: true,
          spritesheetExists: spriteBytes !== null,
          builtin: true
        },
        ...listPets(PETS_ROOT).map((s) => ({ ...s, builtin: false, dir: void 0 }))
      ],
      guard: guardSnapshot(hint),
      assetDir: ASSET_DIR,
      spriteBytes: spriteBytes ? spriteBytes.length : null,
      diag
    };
  };
  registerRoutes(ctx, {
    pkgDir: PKG_DIR,
    petsRoot: PETS_ROOT,
    stagingRoot: STAGING_ROOT,
    trashRoot: TRASH_ROOT,
    codexRoot: CODEX_ROOT,
    tmpDir: TMP_DIR,
    stateEngine: engine,
    snapshotExtra,
    builtin: {
      manifest: builtinManifest,
      assetDir: ASSET_DIR || path8.join(PKG_DIR, "assets"),
      voices: builtinVoices,
      get spriteBytes() {
        return spriteBytes;
      }
    },
    getActivePetId: activePetId,
    diag,
    get spriteBytes() {
      return spriteBytes;
    }
  });
  const webServer = ctx.get("webServer");
  if (webServer !== void 0) {
    console.log("[foxbell-pet] host mounted: sprite=" + (spriteBytes ? spriteBytes.length : 0) + " builtinVoices=" + builtinVoices.length + " assetDir=" + ASSET_DIR + " pets=" + listPets(PETS_ROOT).length + " sweptStaging=" + sweptCount);
  }
}
export {
  ACTION_IDS,
  Config,
  FOXBELL_PET_NS,
  apply,
  inject,
  name
};
