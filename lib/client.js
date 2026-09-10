window.__ModuleLoader__.load({ id: "dsh-foxbell-pet", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react11 = __toESM(require("react"), 1);

// src/client/Pet.tsx
var import_react2 = require("react");

// src/client/animations.ts
var FRAME_W = 192;
var FRAME_H = 208;
var SHEET_COLS = 8;
var ANIM = {
  idle: { row: 0, d: [280, 110, 110, 140, 140, 320] },
  "run-right": { row: 1, d: [120, 120, 120, 120, 120, 120, 120, 220] },
  "run-left": { row: 2, d: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, d: [140, 140, 140, 280] },
  jumping: { row: 4, d: [140, 140, 140, 140, 280] },
  failed: { row: 5, d: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, d: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, d: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, d: [150, 150, 150, 150, 150, 280] }
};
var LOOK_FRAMES = Array.from({ length: 16 }, (_, i) => ({
  x: 0 - i % SHEET_COLS * FRAME_W,
  y: 0 - (i < 8 ? 9 : 10) * FRAME_H
}));
function frameStyle(anim, frame, lookFrame, scale, rows = 11) {
  const w = FRAME_W * scale;
  const h = FRAME_H * scale;
  let x;
  let y;
  if (anim === "look") {
    const f = LOOK_FRAMES[Math.max(0, Math.min(LOOK_FRAMES.length - 1, lookFrame))];
    x = f.x * scale;
    y = f.y * scale;
  } else {
    const def = ANIM[anim];
    const i = (frame % def.d.length + def.d.length) % def.d.length;
    x = -i * w;
    y = -def.row * h;
  }
  return {
    backgroundPosition: `${x}px ${y}px`,
    backgroundSize: `${w * SHEET_COLS}px ${h * rows}px`
  };
}

// src/client/physics.ts
var GRAVITY = 1400;
var DAMP = 0.86;
var MIN_VX = 24;
var MAX_DT = 0.05;
var SAMPLE_WINDOW_MS = 150;
var DIR_UP_THRESHOLD = -8;
var DIR_X_THRESHOLD = 6;
function pushSample(samples, t2, x, y) {
  samples.push({ t: t2, x, y });
  while (samples.length > 0 && t2 - samples[0].t > SAMPLE_WINDOW_MS) samples.shift();
}
function throwVelocity(samples) {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = (last.t - first.t) / 1e3;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}
function dragDirection(movedX, movedY) {
  if (movedY < DIR_UP_THRESHOLD) return "jumping";
  if (movedX < -DIR_X_THRESHOLD) return "run-left";
  if (movedX > DIR_X_THRESHOLD) return "run-right";
  return null;
}
function stepFall(s, dtRaw, groundY, minX, maxX) {
  const dt = Math.min(MAX_DT, dtRaw);
  let vy = s.vy + GRAVITY * dt;
  let y = s.y + s.vy * dt + 0.5 * GRAVITY * dt * dt;
  let vx = s.vx * Math.pow(DAMP, dt * 60);
  let x = s.x + vx * dt;
  let landed = s.landed;
  if (y >= groundY) {
    y = groundY;
    landed = true;
  }
  if (x < minX) {
    x = minX;
    vx = 0;
  }
  if (x > maxX) {
    x = maxX;
    vx = 0;
  }
  const rest = landed && Math.abs(vx) < MIN_VX;
  return { x, y, vx, vy, landed, rest };
}
function viewportBounds(vw, vh, frameW, frameH, bottomMargin) {
  return {
    groundY: vh - bottomMargin - frameH,
    minX: 0,
    maxX: Math.max(0, vw - frameW)
  };
}
function clampPos(x, y, frameW, frameH, vw, vh, bottomMargin) {
  const b = viewportBounds(vw, vh, frameW, frameH, bottomMargin);
  return {
    x: Math.max(b.minX, Math.min(b.maxX, x)),
    y: Math.max(0, Math.min(b.groundY, y))
  };
}
var SQUASH_TIMING = {
  squashMs: 60,
  squashScaleY: 0.55,
  bounceMs: 240,
  bounceEasing: "cubic-bezier(.34,1.56,.64,1)",
  settleMs: 260,
  hopAnimMs: 1500
};

// src/client/config.ts
var STORE_KEY = "dyn-pet-foxbell-visible";
var CFG_KEY = "dyn-foxbell-pet:state-v1";
var POS_KEY = "dyn-pet-foxbell-pos";
var X_KEY = "dyn-pet-foxbell-x";
var FLASH_SWITCHED_KEY = "dyn-pet-foxbell-flash-switched";
var GUARD_IGNORED_KEY = "dyn-pet-foxbell-guard-ignored";
var CFG_ACTIONS = ["jumping", "waving", "failed", "waiting", "review", "running"];
var CFG_SCALES = [0.75, 1, 1.25];
var ACTION_KEYS = ["doneAction", "dblAction", "approvalAction", "errorAction", "runningAction"];
var CFG_DEFAULT = {
  muted: false,
  talkative: true,
  doneAction: "jumping",
  dblAction: "waving",
  approvalAction: "waiting",
  errorAction: "failed",
  runningAction: "running",
  gravity: true,
  scale: 1,
  activePetId: "foxbell",
  // v2.1 看板 12 键默认（前 8 项为看板引擎门/阈值；后 4 项为客户端门）
  paceEnabled: true,
  paceIntenseEvents: 12,
  paceLongrunMin: 3,
  paceLoafStartMin: 15,
  usageEnabled: true,
  dayLimitTokens: 0,
  milestoneUnit: 1e6,
  approvalFlickerMin: 5,
  summaryEnabled: true,
  summaryEntrySec: 15,
  boardTtlSec: 15,
  ttsEnabled: false
};
var NUM_KEYS = [
  "paceIntenseEvents",
  "paceLongrunMin",
  "paceLoafStartMin",
  "dayLimitTokens",
  "milestoneUnit",
  "approvalFlickerMin",
  "summaryEntrySec",
  "boardTtlSec"
];
var NUM_RANGE = {
  paceIntenseEvents: [1, 1e3],
  paceLongrunMin: [1, 120],
  paceLoafStartMin: [1, 240],
  dayLimitTokens: [0, 1e9],
  milestoneUnit: [0, 1e9],
  approvalFlickerMin: [0, 120],
  summaryEntrySec: [5, 60],
  boardTtlSec: [5, 120]
};
var clampNum = (k, v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return CFG_DEFAULT[k];
  const [lo, hi] = NUM_RANGE[k];
  return Math.min(hi, Math.max(lo, Math.round(n)));
};
var isAction = (v) => CFG_ACTIONS.includes(v);
var isScale = (v) => CFG_SCALES.includes(v);
var isPetIdStr = (v) => typeof v === "string" && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
function sanitizeValue(k, v) {
  if (ACTION_KEYS.includes(k)) return isAction(v) ? v : CFG_DEFAULT[k];
  if (NUM_KEYS.includes(k)) return clampNum(k, v);
  if (k === "scale") return isScale(v) ? v : 1;
  if (k === "activePetId") return isPetIdStr(v) ? v : "foxbell";
  return !!v;
}
function createConfigStore() {
  let scope = null;
  let pending = {};
  let prevUnsub = null;
  const listeners3 = /* @__PURE__ */ new Set();
  const writeSeq = {};
  let scopeSilent = 0;
  const SCOPE_SILENT_MAX = 2;
  const httpWrite = (k, v) => fetch("/api/settings/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId: `foxbell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      method: "settings/update",
      payload: { args: { ns: "foxbell-pet", patch: { [k]: v } } }
    })
  }).then((r) => {
    if (!r.ok) throw new Error(`settings update HTTP ${r.status}`);
  });
  const readUser = (k) => fetch("/api/settings/describe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId: `foxbell-desc-${Date.now().toString(36)}`,
      method: "settings/describe",
      payload: { args: {} }
    })
  }).then((r) => r.json()).then((j) => {
    const ns = (j?.result?.value?.namespaces || []).find((n) => n.ns === "foxbell-pet");
    const user = ns?.user && typeof ns.user === "object" ? ns.user : null;
    return user && k in user ? user[k] : null;
  });
  const verifyWrite = (k, v, seq, tries) => {
    if (writeSeq[k] !== seq) return;
    void readUser(k).then((actual) => {
      if (writeSeq[k] !== seq) return;
      if (actual === v) {
        scopeSilent = 0;
        delete pending[k];
        emit();
        return;
      }
      if (tries <= 0) {
        delete pending[k];
        emit();
        return;
      }
      httpWrite(k, v).then(
        () => verifyWrite(k, v, seq, tries - 1),
        () => {
          delete pending[k];
          emit();
        }
      );
    }).catch(() => {
      if (tries <= 0) {
        delete pending[k];
        emit();
        return;
      }
      setTimeout(() => verifyWrite(k, v, seq, tries - 1), 400);
    });
  };
  const loadLocal = () => {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (!raw) return {};
      const p = JSON.parse(raw);
      const out = {};
      for (const k of Object.keys(CFG_DEFAULT)) if (k in p) out[k] = sanitizeValue(k, p[k]);
      return out;
    } catch {
      return {};
    }
  };
  const saveLocal = (v) => {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(v));
    } catch {
    }
  };
  let local = { ...CFG_DEFAULT, ...loadLocal() };
  const emit = () => {
    for (const fn of [...listeners3]) fn();
  };
  const resolve = () => {
    if (scope === null) return local;
    const sv = scope.getSnapshot();
    if (!sv || sv.status !== "ready" || !sv.value || typeof sv.value !== "object") return local;
    const merged = { ...CFG_DEFAULT, ...local };
    for (const k of Object.keys(CFG_DEFAULT)) {
      if (pending[k] !== void 0) merged[k] = pending[k];
      else if (sv.value[k] !== void 0) merged[k] = sanitizeValue(k, sv.value[k]);
    }
    return merged;
  };
  return {
    getSnapshot: resolve,
    subscribe(fn) {
      listeners3.add(fn);
      return () => {
        listeners3.delete(fn);
      };
    },
    set(patch) {
      const next = { ...local };
      for (const k of Object.keys(CFG_DEFAULT)) {
        if (patch[k] !== void 0) next[k] = sanitizeValue(k, patch[k]);
      }
      local = next;
      saveLocal(local);
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) continue;
        pending[k] = v;
        const seq = (writeSeq[k] ?? 0) + 1;
        writeSeq[k] = seq;
        if (scope === null || scopeSilent >= SCOPE_SILENT_MAX) {
          httpWrite(k, v).then(
            () => {
              delete pending[k];
              emit();
            },
            () => {
              delete pending[k];
              emit();
            }
          );
        } else {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            verifyWrite(k, v, seq, 5);
          };
          scope.set(k, v).then(finish, () => {
            delete pending[k];
            emit();
          });
          setTimeout(() => {
            if (settled) return;
            if (writeSeq[k] !== seq) return;
            httpWrite(k, v).then(
              () => {
                delete pending[k];
                emit();
              },
              () => {
                delete pending[k];
                emit();
              }
            );
          }, 3e3);
        }
      }
      emit();
    },
    attachScope(s) {
      if (s === null) {
        if (prevUnsub) {
          prevUnsub();
          prevUnsub = null;
        }
        scope = null;
        pending = {};
        emit();
        return () => {
        };
      }
      if (scope === s) return () => {
      };
      if (prevUnsub) {
        prevUnsub();
        prevUnsub = null;
      }
      let seeded = false;
      const sync = () => {
        const sv = s.getSnapshot();
        if (!seeded && sv && sv.status === "ready") {
          seeded = true;
          const user = sv.user && typeof sv.user === "object" ? sv.user : {};
          const legacy = loadLocal();
          for (const k of Object.keys(CFG_DEFAULT)) {
            if (legacy[k] !== void 0 && !(k in user)) {
              pending[k] = legacy[k];
              const seq = (writeSeq[k] ?? 0) + 1;
              writeSeq[k] = seq;
              s.set(k, legacy[k]).then(
                () => verifyWrite(k, legacy[k], seq, 5),
                () => {
                  delete pending[k];
                  emit();
                }
              );
            }
          }
        }
        emit();
      };
      scope = s;
      prevUnsub = s.subscribe(sync);
      sync();
      return () => {
        if (prevUnsub) prevUnsub();
        prevUnsub = null;
        scope = null;
        pending = {};
        emit();
      };
    }
  };
}
function loadVisible() {
  try {
    return localStorage.getItem(STORE_KEY) !== "0";
  } catch {
    return true;
  }
}
function saveVisible(v) {
  try {
    localStorage.setItem(STORE_KEY, v ? "1" : "0");
  } catch {
  }
}
function loadPosition() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return { x: p.x, y: p.y };
    }
    const vx = parseInt(localStorage.getItem(X_KEY) ?? "", 10);
    if (Number.isFinite(vx) && vx >= 0) return { x: vx, y: NaN };
  } catch {
  }
  return null;
}
function savePosition(pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }));
    localStorage.setItem(X_KEY, String(Math.round(pos.x)));
  } catch {
  }
}
function loadFlashSwitched() {
  try {
    return localStorage.getItem(FLASH_SWITCHED_KEY);
  } catch {
    return null;
  }
}
function saveFlashSwitched(id) {
  try {
    localStorage.setItem(FLASH_SWITCHED_KEY, id);
  } catch {
  }
}
function clearFlashSwitched() {
  try {
    localStorage.removeItem(FLASH_SWITCHED_KEY);
  } catch {
  }
}
function guardSignature(id, issues) {
  const sig = issues.map((i) => `${i.kind}:${i.detail}`).sort().join("|");
  return `${id}#${sig}`;
}
function loadGuardIgnored() {
  try {
    return localStorage.getItem(GUARD_IGNORED_KEY);
  } catch {
    return null;
  }
}
function saveGuardIgnored(sig) {
  try {
    localStorage.setItem(GUARD_IGNORED_KEY, sig);
  } catch {
  }
}

// src/client/voices.ts
function pickIndex(len, lastIndex) {
  if (len <= 0) return -1;
  if (len === 1) return 0;
  let i = Math.floor(Math.random() * len);
  while (i === lastIndex) i = Math.floor(Math.random() * len);
  return i;
}
var MIN_SPEECH_MS = 2500;
function subtitleMs(durationSec) {
  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1e3 : 0;
  return Math.max(MIN_SPEECH_MS, d + 250);
}
var VoicePlayer = class {
  constructor() {
    this.entries = [];
    this.els = [];
    this.lastIdx = {};
    this.shared = null;
    this.unlocked = false;
  }
  load(entries) {
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
      this.els = [];
    }
  }
  /** 组内挑一条（组空时仅 general 回落全池；其余组返回 null，spec E5） */
  pick(group) {
    const list = this.entries.filter((v) => v.group === group);
    const pool = list.length > 0 ? list : group === "general" ? this.entries : [];
    if (pool.length === 0) return null;
    const i = pickIndex(pool.length, this.lastIdx[group] ?? -1);
    this.lastIdx[group] = i;
    return pool[i];
  }
  /** 播放 + 字幕回调（ms 后隐藏字幕由调用方定时） */
  play(entry, opts) {
    if (opts.muted) return;
    const el = this.els[entry.index];
    try {
      if (el) {
        for (const a of this.els) if (a !== el && !a.paused) a.pause();
        el.currentTime = 0;
        const pr = el.play();
        if (pr && typeof pr.catch === "function") pr.catch(() => {
        });
        const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
        opts.onSubtitle?.(entry.name, subtitleMs(dur));
      } else {
        if (!this.shared) this.shared = new Audio();
        this.shared.src = entry.url;
        const pr = this.shared.play();
        if (pr && typeof pr.catch === "function") pr.catch(() => {
        });
        const s = this.shared;
        const dur = Number.isFinite(s.duration) && s.duration > 0 ? s.duration : 0;
        opts.onSubtitle?.(entry.name, subtitleMs(dur));
      }
    } catch {
    }
  }
  /** 首次手势内调用：muted 试播解锁自动播放（spec E6） */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const el = this.els[0] ?? this.shared;
    try {
      if (el) {
        el.muted = true;
        const pr = el.play();
        if (pr && typeof pr.catch === "function") pr.catch(() => {
        });
        el.pause();
        el.muted = false;
      }
    } catch {
    }
  }
  dispose() {
    for (const a of this.els) {
      try {
        a.pause();
        a.src = "";
      } catch {
      }
    }
    this.els = [];
    this.entries = [];
    this.lastIdx = {};
  }
};

// src/client/errors.ts
var PetError = class extends Error {
  constructor(code, params) {
    super(code);
    this.code = code;
    this.params = params;
  }
};
function isPetRpcError(e) {
  if (e instanceof PetError) return false;
  return typeof e === "object" && e !== null && typeof e.code === "string" && e.code !== "";
}

// src/client/api.ts
var ROUTE_PREFIX = "/dyn-pet-foxbell";
var ApiError = class extends Error {
  constructor(code, detail, params, status) {
    super(code);
    this.code = code;
    this.detail = detail;
    this.params = params;
    this.status = status;
  }
};
async function toError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
  }
  if (isPetRpcError(body)) {
    const b = body;
    return new ApiError(b.code, b.detail ?? "", b.params ?? {}, res.status);
  }
  return new ApiError("internal", `HTTP ${res.status}`, {}, res.status);
}
async function apiGet(path) {
  const res = await fetch(ROUTE_PREFIX + path);
  if (!res.ok) throw await toError(res);
  return await res.json();
}
async function apiPost(path, body) {
  const res = await fetch(ROUTE_PREFIX + path, {
    method: "POST",
    headers: body === void 0 ? {} : { "content-type": "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  if (!res.ok) throw await toError(res);
  return await res.json();
}
async function apiPostBytes(path, bytes) {
  const res = await fetch(ROUTE_PREFIX + path, { method: "POST", body: bytes });
  if (!res.ok) throw await toError(res);
  return await res.json();
}
function petErrMsg(e, t2) {
  if (e instanceof PetError) return t2(`err.${e.code}`, e.params);
  if (isPetRpcError(e)) {
    const code = e.code;
    const params = e.params ?? {};
    return t2(`rpc.${code}`, params);
  }
  if (e instanceof Error && e.message) return e.message;
  return t2("err.scan-fail");
}
var stagingSheetUrl = (sid) => `${ROUTE_PREFIX}/staging/${encodeURIComponent(sid)}/spritesheet.webp`;
var stagingVoiceUrl = (sid, rel) => `${ROUTE_PREFIX}/staging/${encodeURIComponent(sid)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
var petSheetUrl = (id, rev) => `${ROUTE_PREFIX}/pets/${encodeURIComponent(id)}/spritesheet.webp${rev ? `?rev=${encodeURIComponent(rev)}` : ""}`;

// src/client/validation.ts
var GROUPS = ["general", "approval", "done", "error"];
var PLAY_GROUPS = [...GROUPS, "usage"];
var MAX_AUDIO_BYTES = 10 * 1024 * 1024;
var MIN_DURATION_MS = 1e3;
var MAX_DURATION_MS = 2e4;
var PET_NAME_MAX_LEN = 64;
var BUILTIN_PET_ID = "foxbell";
function groupOfRel(rel) {
  const parts = rel.split("/");
  if (parts.length !== 3 || parts[0] !== "voice") return null;
  return GROUPS.includes(parts[1]) ? parts[1] : null;
}
function nameFromRel(rel) {
  const base = rel.split("/").pop() ?? rel;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}
function voiceRowProblem(r) {
  if (r.durationMs === null) return "no-duration";
  if (r.durationMs <= MIN_DURATION_MS) return "too-short";
  if (r.durationMs >= MAX_DURATION_MS) return "too-long";
  if (r.sizeBytes > MAX_AUDIO_BYTES) return "too-big";
  return null;
}
function judgeVoiceTier(files) {
  const coverage = {};
  for (const g of GROUPS) coverage[g] = 0;
  for (const f of files) {
    if (voiceRowProblem({ group: "", name: "", file: f.rel, sizeBytes: f.size, durationMs: f.durationMs }))
      continue;
    const g = groupOfRel(f.rel);
    if (g) coverage[g] += 1;
  }
  return { hasVoice: GROUPS.every((g) => coverage[g] > 0), coverage };
}
function spriteVersionOf(rows) {
  return rows === 9 ? 1 : 2;
}
function rowsFromSize(w, h) {
  if (w !== 1536) return null;
  if (h === 1872) return 9;
  if (h === 2288) return 11;
  return null;
}
var RESERVED_DEVICE_NAMES = /* @__PURE__ */ new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)
]);
function petNameProblem(name, opts = {}) {
  const max = opts.maxLength ?? PET_NAME_MAX_LEN;
  if (typeof name !== "string" || name.length === 0) return "empty";
  if (name.length > max) return "too-long";
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return "charset";
  if (RESERVED_DEVICE_NAMES.has(name.toUpperCase())) return "reserved-device";
  const selfIsBuiltin = opts.selfId === BUILTIN_PET_ID;
  if (!selfIsBuiltin && name.toLowerCase() === BUILTIN_PET_ID) return "reserved";
  const others = (opts.existingIds ?? []).filter((id) => id !== opts.selfId);
  if (others.some((id) => id.toLowerCase() === name.toLowerCase())) return "duplicate";
  return null;
}
function petNameProblemKey(p) {
  switch (p) {
    case "empty":
      return "import.nameEmpty";
    case "duplicate":
      return "import.nameDup";
    case "reserved-device":
      return "import.nameReserved";
    case "reserved":
      return "import.nameReservedBuiltin";
    case "too-long":
      return "import.nameTooLong";
    case "charset":
      return "import.nameHint";
  }
}
function manifestVoiceCapOnDisk(m, s) {
  const onDisk = m.voices.length > 0 && m.voices.every((v) => s.voiceFiles.some((f) => f.rel === v.file && f.exists && f.size === v.sizeBytes));
  return onDisk ? m.hasVoice : false;
}

// src/client/store.ts
var STATE_URL = `${ROUTE_PREFIX}/state`;
var ACK_URL = `${ROUTE_PREFIX}/ack`;
var DIAG_URL = `${ROUTE_PREFIX}/client-diag`;
var POLL_INTERVAL_MS = 1500;
var reportVisible = (v) => {
  try {
    fetch(`${DIAG_URL}?visible=${v ? "1" : "0"}`).catch(() => {
    });
  } catch {
  }
};
var ackProject = (agentId) => {
  try {
    fetch(`${ACK_URL}?agentId=${encodeURIComponent(agentId)}`).catch(() => {
    });
  } catch {
  }
};
var visibleListeners = /* @__PURE__ */ new Set();
var visible = loadVisible();
var petStore = {
  get visible() {
    return visible;
  },
  set(v) {
    visible = !!v;
    saveVisible(visible);
    reportVisible(visible);
    for (const l of [...visibleListeners]) l();
  },
  subscribe(l) {
    visibleListeners.add(l);
    return () => {
      visibleListeners.delete(l);
    };
  }
};
var cfgStore = createConfigStore();
var FOXBELL_RUNTIME = {
  id: "foxbell",
  name: "Foxbell",
  rows: 11,
  spriteUrl: `${ROUTE_PREFIX}/pets/foxbell/spritesheet.webp`,
  hasVoice: true,
  hasSubtitle: true,
  rev: "builtin"
};
var voicePlayer = new VoicePlayer();
var listeners = /* @__PURE__ */ new Set();
var state = { snapshot: null, runtime: { ...FOXBELL_RUNTIME } };
var pollTimer = null;
var lastSeq = null;
var loadedKey = "";
var appStore = {
  getSnapshot: () => state.snapshot,
  getRuntime: () => state.runtime,
  subscribe(fn) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  emit() {
    for (const fn of [...listeners]) fn();
  },
  /** 手动触发一次拉取（对话框落盘操作后即时刷新） */
  refresh() {
    void pollOnce();
  },
  start() {
    if (pollTimer !== null) return;
    void pollOnce();
    pollTimer = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);
  },
  stop() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },
  /** 设置 scope 接线（settingsScope 不在场时静默，纯 localStorage 后端） */
  attachSettings(scope) {
    return cfgStore.attachScope(scope);
  }
};
function resolveRows(spriteVersionNumber, spriteUrl) {
  if (spriteVersionNumber === 2) return Promise.resolve(11);
  if (spriteVersionNumber === 1) return Promise.resolve(9);
  if (!spriteUrl) return Promise.resolve(11);
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = "";
      resolve(11);
    }, 8e3);
    img.onload = () => {
      clearTimeout(timer);
      resolve(rowsFromSize(img.naturalWidth, img.naturalHeight) ?? 11);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(11);
    };
    img.src = spriteUrl;
  });
}
function entriesFromSnapshot(voices) {
  return voices.map((v, i) => ({
    index: i,
    group: v.group,
    name: v.name,
    file: v.file,
    url: v.url
  }));
}
async function pollOnce() {
  let snap;
  try {
    const hint = cfgStore.getSnapshot().activePetId;
    snap = await apiGet(`/state?pet=${encodeURIComponent(hint)}`);
  } catch {
    return;
  }
  if (!snap || typeof snap.seq !== "number") return;
  state.snapshot = snap;
  const ap = snap.activePet;
  const key = ap ? `${ap.id}#${ap.rev}` : "";
  if (ap && key !== loadedKey) {
    loadedKey = key;
    const rows = await resolveRows(ap.spriteVersionNumber, ap.spriteUrl);
    if (loadedKey !== key) return;
    state.runtime = {
      id: ap.id,
      name: ap.name,
      rows,
      spriteUrl: ap.spriteUrl,
      hasVoice: ap.hasVoice,
      hasSubtitle: ap.hasSubtitle,
      rev: ap.rev
    };
    voicePlayer.load(entriesFromSnapshot(snap.voices));
  } else if (ap && state.runtime.id === ap.id) {
    state.runtime = { ...state.runtime, name: ap.name, hasVoice: ap.hasVoice, hasSubtitle: ap.hasSubtitle };
  }
  lastSeq = snap.seq;
  appStore.emit();
}
async function fetchManifest(id) {
  try {
    return await apiGet(`/pets/${encodeURIComponent(id)}/manifest.json`);
  } catch {
    return null;
  }
}

// src/client/statuscards.ts
function lightOf(p) {
  switch (p.status) {
    case "approval":
      return "approval-red";
    case "running":
      return "running-yellow";
    case "done":
      return "done-green";
    case "error":
    default:
      return "error-darkred";
  }
}
var DOT_COLOR = {
  "approval-red": "#ef4444",
  "running-yellow": "#eab308",
  "done-green": "#22c55e",
  "error-darkred": "#7f1d1d"
};
var DOT_HALO = {
  "approval-red": "rgba(239,68,68,.25)",
  "running-yellow": "rgba(234,179,8,.25)",
  "done-green": "rgba(34,197,94,.25)",
  "error-darkred": "rgba(127,29,29,.3)"
};
function taskPoseOf(cards) {
  const anyApproval = cards.some((c) => c.status === "approval");
  if (anyApproval) return "waiting";
  const anyRunning = cards.some((c) => c.status === "running");
  if (anyRunning) return "running";
  return null;
}

// src/client/i18n.ts
function detectLang() {
  try {
    const l = typeof navigator !== "undefined" && navigator.language || "zh-CN";
    return l.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "zh";
  }
}
var ZH = {
  // ---- 菜单 ----
  "menu.sound": "\u{1F50A} \u51FA\u58F0",
  "menu.subtitle": "\u{1F4AC} \u8BED\u97F3\u5B57\u5E55",
  "menu.physics": "\u{1F9F2} \u7269\u7406\u5760\u843D",
  "menu.size": "\u{1F4CF} \u5927\u5C0F",
  "menu.dblAction": "\u{1F5B1}\uFE0F \u53CC\u51FB\u52A8\u4F5C",
  "menu.approvalAction": "\u{1F534} \u7EA2\u706F\u52A8\u4F5C",
  "menu.runningAction": "\u{1F7E1} \u9EC4\u706F\u52A8\u4F5C",
  "menu.errorAction": "\u{1F7E5} \u6DF1\u7EA2\u706F\u52A8\u4F5C",
  "menu.doneAction": "\u{1F7E2} \u7EFF\u706F\u52A8\u4F5C",
  "menu.switchPet": "\u{1F501} \u5207\u6362\u5BA0\u7269",
  "menu.hide": "\u{1F98A} \u9690\u85CF\u684C\u5BA0",
  "menu.about": "\u2139\uFE0F \u5173\u4E8E",
  "menu.back": "\u2190 \u8FD4\u56DE",
  "menu.on": "\u5F00",
  "menu.off": "\u5173",
  "menu.soundNoCap": "\u8BE5\u5BA0\u7269\u6CA1\u6709\u53EF\u7528\u8BED\u97F3\uFF08\u9700\u56DB\u7EC4\u97F3\u9891\u9F50\u5168\uFF09",
  "menu.subtitleNoCap": "\u8BE5\u5BA0\u7269\u672A\u542F\u7528\u5B57\u5E55\uFF08\u5B57\u5E55=\u97F3\u9891\u6587\u4EF6\u540D\uFF09",
  "scale.small": "\u5C0F",
  "scale.medium": "\u4E2D",
  "scale.large": "\u5927",
  "action.jumping": "\u8DF3\u4E00\u8DF3",
  "action.waving": "\u6325\u6325\u624B",
  "action.failed": "\u59D4\u5C48",
  "action.waiting": "\u7B49\u5F85",
  "action.review": "\u5BA1\u67E5",
  "action.running": "\u5DE5\u4F5C",
  // ---- 状态卡片 ----
  "card.done": "\u5DF2\u5B8C\u6210",
  "card.approval": "\u7B49\u5F85\u64CD\u4F5C",
  "card.running": "\u8FD0\u884C\u4E2D",
  "card.error": "\u672C\u8F6E\u8FD0\u884C\u5931\u8D25",
  "card.disconnected": "\u65AD\u8054",
  "card.more": "\u66F4\u591A",
  // ---- 切换 ----
  "switch.title": "\u5207\u6362\u5BA0\u7269",
  "switch.builtin": "\u5185\u7F6E",
  "switch.activated": "\u5DF2\u5207\u6362\u5230 {name}",
  "switch.invalidSheet": "\u8BE5\u5BA0\u7269\u56FE\u96C6\u7F3A\u5931\u6216\u975E\u6CD5\uFF0C\u65E0\u6CD5\u6FC0\u6D3B",
  "switch.updated": "\u5DF2\u6839\u636E\u73B0\u6709\u7D20\u6750\u66F4\u65B0 manifest \u5E76\u6FC0\u6D3B",
  "switch.mismatchTitle": "\u7D20\u6750\u4E0E manifest \u4E0D\u4E00\u81F4",
  "switch.mismatchUpdate": "\u6839\u636E\u73B0\u6709\u7D20\u6750\u66F4\u65B0\uFF08\u81EA\u52A8\u5907\u4EFD\uFF09",
  "switch.mismatchIgnore": "\u5FFD\u7565\uFF0C\u6309\u78C1\u76D8\u964D\u7EA7\u8FD0\u884C",
  "switch.mismatchCancel": "\u53D6\u6D88\u5207\u6362",
  "switch.pendingFirstCheck": "\u5F85\u9996\u6B21\u6FC0\u6D3B\u6821\u9A8C",
  "switch.ignoredDiff": "\u5DF2\u5FFD\u7565\u5DEE\u5F02\uFF0C\u6309\u5F53\u524D\u7D20\u6750\u8FD0\u884C\uFF08\u4E0B\u6B21\u6821\u9A8C\u4ECD\u4F1A\u63D0\u793A\uFF09",
  "switch.current": "\u5F53\u524D",
  // ---- 守卫/修复 ----
  "startup.title": "\u5BA0\u7269\u7D20\u6750\u6821\u9A8C",
  "startup.fatal": "\u56FE\u96C6\u7F3A\u5931\u6216\u975E\u6CD5\uFF1A{msg}",
  "startup.issuesTitle": "\u4EE5\u4E0B\u7D20\u6750\u4E0E manifest \u4E0D\u4E00\u81F4\uFF1A",
  "startup.update": "\u6839\u636E\u73B0\u6709\u7D20\u6750\u66F4\u65B0 manifest\uFF08\u81EA\u52A8\u5907\u4EFD\uFF09",
  "startup.foxbell": "\u5207\u56DE foxbell",
  "startup.ignore": "\u5FFD\u7565\u5E76\u7EE7\u7EED",
  "startup.hidePet": "\u9690\u85CF\u5BA0\u7269",
  "startup.updated": "manifest \u5DF2\u66F4\u65B0",
  "startup.switched": "\u5DF2\u5207\u56DE foxbell",
  "startup.petHidden": "\u5BA0\u7269\u5DF2\u9690\u85CF",
  "startup.fatalScan": "\u5BA0\u7269\u7D20\u6750\u626B\u63CF\u5931\u8D25\uFF1A{msg}",
  // ---- 导入 ----
  "import.groupGeneral": "\u65E5\u5E38\u95F2\u804A\uFF08\u53CC\u51FB\u8BF4\u8BDD\uFF09",
  "import.groupApproval": "\u9700\u8981\u5BA1\u6279\uFF08\u7EA2\u706F\uFF09",
  "import.groupDone": "\u4EFB\u52A1\u5B8C\u6210\uFF08\u7EFF\u706F\uFF09",
  "import.groupError": "\u51FA\u9519",
  "import.addAudio": "\u6DFB\u52A0\u97F3\u9891",
  "import.remove": "\u79FB\u9664",
  "import.probing": "\u63A2\u6D4B\u4E2D\u2026",
  "import.problems.too-short": "\u65F6\u957F \u22641s",
  "import.problems.too-long": "\u65F6\u957F \u226520s",
  "import.problems.too-big": "\u5927\u4E8E 10MB",
  "import.problems.no-duration": "\u65E0\u6CD5\u8BFB\u53D6\u65F6\u957F",
  "import.reprobeDuration": "\u91CD\u65B0\u8BFB\u53D6\u65F6\u957F",
  "import.coverageOk": "\u56DB\u7EC4\u9F50\u5168\uFF0C\u8BED\u97F3\u53EF\u7528",
  "import.coverageMissing": "\u7F3A\u5C11\u5206\u7EC4\uFF1A{groups}\uFF08\u8BE5\u5BA0\u7269\u5C06\u65E0\u8BED\u97F3\uFF09",
  "import.totalSize": "\u8BED\u97F3\u603B\u5927\u5C0F\uFF1A{size}",
  "import.tooLargeWarn": "\u8BED\u97F3\u603B\u91CF\u8F83\u5927\uFF08>30MB\uFF09\uFF0C\u5EFA\u8BAE\u7CBE\u7B80",
  "import.title": "\u5BFC\u5165\u5BA0\u7269",
  "import.tabCodex": "\u4ECE codex \u5BFC\u5165",
  "import.tabLocal": "\u6587\u4EF6\u5939 / \u538B\u7F29\u5305",
  "import.tabPetdex": "petdex \u5728\u7EBF\u5BFC\u5165",
  "import.codexEmpty": "~/.codex/pets \u4E0B\u6CA1\u6709\u53EF\u7528\u5BA0\u7269",
  "import.codexImported": "\u5DF2\u5BFC\u5165",
  "import.stage": "\u6682\u5B58\u6240\u9009",
  "import.folderHint": "\u586B\u5199\u672C\u673A\uFF08dsh \u6240\u5728\u673A\u5668\uFF09\u7684\u5BA0\u7269\u6587\u4EF6\u5939\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u9700\u542B spritesheet.webp\uFF08\u6839\u76EE\u5F55\u6216\u4E00\u5C42\u5B50\u76EE\u5F55\uFF09",
  "import.folderPath": "\u6587\u4EF6\u5939\u7EDD\u5BF9\u8DEF\u5F84",
  "import.pickFolder": "\u6682\u5B58\u6587\u4EF6\u5939",
  "import.pickZip": "\u9009\u62E9\u538B\u7F29\u5305\u5E76\u6682\u5B58",
  "import.petdexHint": "\u5148\u53BB petdex.dev \u753B\u5ECA\u6311\u9009\uFF0C\u628A\u5BA0\u7269\u9875\u94FE\u63A5\u7C98\u8D34\u5230\u4E0B\u9762\uFF08\u5982 https://petdex.dev/pets/capvolt\uFF09\uFF0C\u6216\u76F4\u63A5\u641C\u7D22",
  "import.petdexBrowse": "\u6D4F\u89C8 petdex.dev",
  "import.petdexSearch": "\u641C\u7D22",
  "import.petdexPlaceholder": "\u5BA0\u7269\u9875\u94FE\u63A5\u6216\u641C\u7D22\u5173\u952E\u8BCD",
  "import.petdexDownload": "\u4E0B\u8F7D\u5E76\u6682\u5B58",
  "import.petdexDownloading": "\u4E0B\u8F7D\u4E2D\u2026",
  "import.petdexNoZip": "\u65E0\u538B\u7F29\u5305",
  "import.configTitle": "\u914D\u7F6E\u786E\u8BA4",
  "import.name": "\u5BA0\u7269\u540D\uFF08\u6587\u4EF6\u5939\u540D\uFF09",
  "import.nameHint": "\u4EC5\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26/\u4E0B\u5212\u7EBF",
  "import.nameDup": "\u5DF2\u5B58\u5728\u540C\u540D\u5BA0\u7269",
  "import.nameReserved": "Windows \u4FDD\u7559\u8BBE\u5907\u540D\u4E0D\u53EF\u7528\uFF08CON/PRN/AUX/NUL/COM1-9/LPT1-9\uFF09",
  "import.nameReservedBuiltin": "foxbell \u4E3A\u5185\u7F6E\u5BA0\u7269\u4FDD\u7559\u540D",
  "import.nameTooLong": "\u540D\u79F0\u4E0D\u80FD\u8D85\u8FC7 64 \u4E2A\u5B57\u7B26",
  "import.nameEmpty": "\u5BA0\u7269\u540D\u4E0D\u80FD\u4E3A\u7A7A",
  "import.displayName": "\u5C55\u793A\u540D",
  "import.description": "\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09",
  "import.preview": "\u56FE\u96C6\u9884\u89C8",
  "import.sheetInvalid": "\u56FE\u96C6\u5C3A\u5BF8\u975E\u6CD5\uFF08\u9700 1536\xD71872 \u6216 1536\xD72288\uFF09",
  "import.sheetProbing": "\u56FE\u96C6\u63A2\u6D4B\u4E2D\u2026",
  "import.subtitle": "\u540C\u6B65\u5BFC\u5165\u5B57\u5E55\uFF08\u5B57\u5E55 = \u97F3\u9891\u6587\u4EF6\u540D\uFF09",
  "import.execute": "\u6267\u884C\u5BFC\u5165",
  "import.cancelImport": "\u53D6\u6D88",
  "import.doneTitle": "\u5BFC\u5165\u6210\u529F",
  "import.doneId": "\u5DF2\u5BFC\u5165\u5BA0\u7269\uFF1A{id}",
  "import.activateNow": "\u7ACB\u5373\u6FC0\u6D3B",
  "import.finish": "\u5B8C\u6210",
  "import.errorStage": "\u6682\u5B58\u5931\u8D25\uFF1A{msg}",
  "import.errorFinalize": "\u5BFC\u5165\u5931\u8D25\uFF1A{msg}",
  // ---- 管理 ----
  "manage.title": "\u7BA1\u7406\u5BA0\u7269",
  "manage.pick": "\u9009\u62E9\u8981\u7BA1\u7406\u7684\u5BA0\u7269",
  "manage.rename": "\u65B0\u540D\u79F0\uFF08\u6587\u4EF6\u5939\u540D\uFF09",
  "manage.renameBtn": "\u91CD\u547D\u540D",
  "manage.renamedToast": "\u5DF2\u91CD\u547D\u540D\u4E3A {name}",
  "manage.subtitle": "\u8BED\u97F3\u5B57\u5E55",
  "manage.save": "\u4FDD\u5B58\u4FEE\u6539",
  "manage.savedToast": "\u5DF2\u4FDD\u5B58\uFF08manifest \u5DF2\u5907\u4EFD\u66F4\u65B0\uFF09",
  "manage.activeSwitchNotice": "\u8BE5\u5BA0\u7269\u6B63\u5728\u4F7F\u7528\uFF0C\u5DF2\u81EA\u52A8\u5207\u56DE foxbell",
  "manage.dirLabel": "\u76EE\u5F55\u8DEF\u5F84",
  "manage.copy": "\u590D\u5236",
  "manage.copied": "\u5DF2\u590D\u5236",
  "manage.delete": "\u5220\u9664\u5BA0\u7269",
  "manage.deleteConfirm": "\u786E\u8BA4\u5220\u9664\uFF1F\u6574\u4E2A\u6587\u4EF6\u5939\u5C06\u79FB\u5165\u56DE\u6536\u76EE\u5F55\uFF08~/.dsh/foxbell-pet/.trash/\uFF0C\u4E0D\u7269\u7406\u5220\u9664\uFF09",
  "manage.deletedToast": "\u5DF2\u5220\u9664 {name}",
  "manage.builtinHint": "\u5185\u7F6E\u5BA0\u7269 foxbell \u968F\u63D2\u4EF6\u5305\u53D1\u5E03\uFF0C\u4E0D\u53EF\u7F16\u8F91",
  // ---- 设置卡 ----
  "settings.cardTitle": "Foxbell \u684C\u5BA0",
  "settings.cardDescription": "\u72B6\u6001\u706F\u76D1\u63A7\u3001\u8BED\u97F3\u63D0\u9192\u4E0E\u5916\u90E8\u5BA0\u7269\u7BA1\u7406\u3002",
  "settings.expand": "\u5C55\u5F00\u8BBE\u7F6E",
  "settings.collapse": "\u6536\u8D77\u8BBE\u7F6E",
  "settings.configSection": "\u914D\u7F6E",
  "settings.petSection": "\u5BA0\u7269\u7BA1\u7406",
  "settings.currentPet": "\u5F53\u524D\u5BA0\u7269",
  "settings.switchPet": "\u5207\u6362\u5BA0\u7269",
  "settings.importPet": "\u5BFC\u5165\u5BA0\u7269",
  "settings.managePet": "\u7BA1\u7406\u5BA0\u7269",
  "settings.petdex": "Petdex \u5BA0\u7269\u753B\u5ECA",
  "settings.muted": "\u58F0\u97F3",
  "settings.talkative": "\u8BED\u97F3\u5B57\u5E55",
  "settings.gravity": "\u843D\u5730\u7269\u7406",
  "settings.scale": "\u5927\u5C0F",
  "settings.dblAction": "\u53CC\u51FB\u52A8\u4F5C",
  "settings.approvalAction": "\u7EA2\u706F\u52A8\u4F5C",
  "settings.runningAction": "\u9EC4\u706F\u52A8\u4F5C",
  "settings.errorAction": "\u6DF1\u7EA2\u706F\u52A8\u4F5C",
  "settings.doneAction": "\u7EFF\u706F\u52A8\u4F5C",
  // ---- 效率看板（五口径名词为行为不变量：请求输入/缓存命中/命中率/产出/你的输入/含子代理）----
  "dash.today": "\u4ECA\u65E5",
  "dash.requestInput": "\u8BF7\u6C42\u8F93\u5165",
  "dash.hit": "\u547D\u4E2D",
  "dash.cacheHit": "\u7F13\u5B58\u547D\u4E2D",
  "dash.output": "\u4EA7\u51FA",
  "dash.yourInput": "\u4F60\u7684\u8F93\u5165",
  "dash.estimateSuffix": "(\u4F30)",
  "dash.withSubagents": "\u542B\u5B50\u4EE3\u7406",
  "dash.sessionReq": "\u672C\u4F1A\u8BDD",
  "dash.summaryTitle": "\u5DE5\u4F5C\u5C0F\u7ED3",
  "dash.farewellTitle": "\u4ECA\u65E5\u6536\u5DE5",
  "dash.summaryEntry": "\u{1F4D6} \u603B\u7ED3",
  "dash.menuUsage": "\u{1F3F7} \u4ECA\u65E5\u7528\u91CF",
  "dash.menuSummary": "\u{1F4CA} \u67E5\u770B\u6700\u8FD1\u603B\u7ED3",
  "dash.menuSessions": "\u{1F5C2} \u4F1A\u8BDD\u4E00\u89C8",
  "dash.unsaved": "\u6709\u672A\u4FDD\u5B58\u66F4\u6539",
  "dash.saved": "\u5DF2\u4FDD\u5B58 \u2713",
  "dash.invalidNums": "{n} \u4E2A\u6570\u503C\u65E0\u6548",
  "dash.save": "\u4FDD\u5B58",
  "dash.discard": "\u653E\u5F03",
  "dash.caliberNote": "\u7528\u91CF\u5747\u4E3A\u7EAF token \u53E3\u5F84\uFF0C\u4E0D\u6298\u7B97\u91D1\u989D",
  "dash.noActive": "\u6682\u65E0\u8FDB\u884C\u4E2D\u4F1A\u8BDD",
  // ---- 通用 ----
  "common.close": "\u5173\u95ED",
  "common.cancel": "\u53D6\u6D88",
  "common.ok": "\u786E\u5B9A",
  "common.busy": "\u5904\u7406\u4E2D\u2026",
  "common.error": "\u51FA\u9519\u4E86",
  // ---- 守卫问题 kind ----
  "issue.spritesheet-missing": "\u56FE\u96C6\u7F3A\u5931",
  "issue.spritesheet-changed": "\u56FE\u96C6\u5DF2\u53D8\u66F4",
  "issue.voice-missing": "\u8BED\u97F3\u6587\u4EF6\u7F3A\u5931",
  "issue.voice-changed": "\u8BED\u97F3\u6587\u4EF6\u5DF2\u53D8\u66F4",
  "issue.voice-extra": "\u672A\u767B\u8BB0\u7684\u8BED\u97F3\u6587\u4EF6",
  "issue.manifest-missing": "manifest \u7F3A\u5931",
  "issue.pet-dir-missing": "\u5BA0\u7269\u76EE\u5F55\u7F3A\u5931",
  // ---- 客户端本地错误（pet.err.*）----
  "err.sheet-missing": "\u56FE\u96C6\u6587\u4EF6\u7F3A\u5931",
  "err.sheet-bad-size": "\u56FE\u96C6\u5C3A\u5BF8\u975E\u6CD5: {w}\xD7{h}",
  "err.sheet-load-fail": "\u56FE\u96C6\u52A0\u8F7D\u5931\u8D25",
  "err.sheet-timeout": "\u56FE\u96C6\u52A0\u8F7D\u8D85\u65F6",
  "err.audio-timeout": "\u97F3\u9891\u63A2\u6D4B\u8D85\u65F6",
  "err.audio-bad-duration": "\u97F3\u9891\u65F6\u957F\u4E0D\u53EF\u7528",
  "err.audio-load-fail": "\u97F3\u9891\u52A0\u8F7D\u5931\u8D25",
  "err.scan-fail": "\u5BA0\u7269\u7D20\u6750\u626B\u63CF\u5931\u8D25",
  // ---- RPC 错误（pet.rpc.*，与宿主 ALL_RPC_CODES 一一对应）----
  "rpc.internal": "\u64CD\u4F5C\u5931\u8D25: {err}",
  "rpc.audio-format-unsupported": "\u4E0D\u652F\u6301\u7684\u97F3\u9891\u683C\u5F0F\uFF1A{path}",
  "rpc.audio-not-found": "\u97F3\u9891\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A{path}",
  "rpc.audio-relpath-invalid": "\u975E\u6CD5\u7684\u8BED\u97F3\u6587\u4EF6\u8DEF\u5F84",
  "rpc.copy-failed": "\u590D\u5236\u6587\u4EF6\u5931\u8D25",
  "rpc.delete-failed": "\u5220\u9664\u5931\u8D25",
  "rpc.download-failed": "\u4E0B\u8F7D\u5931\u8D25",
  "rpc.download-status": "\u4E0B\u8F7D\u54CD\u5E94\u5F02\u5E38",
  "rpc.download-too-large": "\u4E0B\u8F7D\u5185\u5BB9\u8FC7\u5927\uFF08\u4E0A\u9650 {limit} \u5B57\u8282\uFF09",
  "rpc.download-url-invalid": "\u4E0B\u8F7D\u5730\u5740\u975E\u6CD5",
  "rpc.finalize-move-failed": "\u5BFC\u5165\u843D\u5730\u5931\u8D25",
  "rpc.finalize-scan-failed": "\u5BFC\u5165\u843D\u5730\u540E\u8BFB\u53D6\u5BA0\u7269\u4FE1\u606F\u5931\u8D25",
  "rpc.group-invalid": "\u975E\u6CD5\u8BED\u97F3\u5206\u7EC4\uFF1A{group}",
  "rpc.host-forbidden": "\u62D2\u7EDD\u975E petdex \u57DF\u4E0B\u8F7D\uFF1A{host}",
  "rpc.manifest-backup-failed": "\u5907\u4EFD manifest \u5931\u8D25",
  "rpc.manifest-invalid": "manifest \u5185\u5BB9\u975E\u6CD5\u6216\u4E0E\u78C1\u76D8\u4E0D\u4E00\u81F4",
  "rpc.manifest-parse-failed": "manifest/\u8BF7\u6C42\u4F53\u89E3\u6790\u5931\u8D25",
  "rpc.manifest-request-failed": "petdex \u6E05\u5355\u8BF7\u6C42\u5931\u8D25",
  "rpc.manifest-status": "petdex \u6E05\u5355\u54CD\u5E94\u5F02\u5E38",
  "rpc.manifest-too-large": "petdex \u6E05\u5355\u8FC7\u5927\uFF08\u4E0A\u9650 {limit} \u5B57\u8282\uFF09",
  "rpc.manifest-write-failed": "\u5199\u5165 manifest \u5931\u8D25",
  "rpc.origin-forbidden": "\u8BF7\u6C42\u6765\u6E90\u88AB\u62D2\u7EDD",
  "rpc.pet-dir-missing": "\u5BA0\u7269\u76EE\u5F55\u4E0D\u5B58\u5728",
  "rpc.pet-exists": "\u5BA0\u7269\u5DF2\u5B58\u5728\uFF1A{name}",
  "rpc.pet-name-dot-prefix": "\u5BA0\u7269\u540D\u4E0D\u80FD\u4EE5\u70B9\u5F00\u5934",
  "rpc.pet-name-empty": "\u5BA0\u7269\u540D\u4E0D\u80FD\u4E3A\u7A7A",
  "rpc.pet-name-illegal": "\u5BA0\u7269\u540D\u4EC5\u652F\u6301\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26/\u4E0B\u5212\u7EBF",
  "rpc.pet-name-reserved": "foxbell \u4E3A\u5185\u7F6E\u5BA0\u7269\u4FDD\u7559\u540D",
  "rpc.pet-name-reserved-device": "\u5BA0\u7269\u540D\u4E0E Windows \u4FDD\u7559\u8BBE\u5907\u540D\u51B2\u7A81",
  "rpc.pet-name-too-long": "\u5BA0\u7269\u540D\u8FC7\u957F\uFF08\u2264{max} \u5B57\u7B26\uFF09",
  "rpc.pet-not-found": "\u5BA0\u7269\u4E0D\u5B58\u5728\uFF1A{id}",
  "rpc.pet-not-on-petdex": "petdex \u4E0A\u672A\u627E\u5230\u5BA0\u7269\uFF1A{slug}",
  "rpc.petdex-no-zip": "\u8BE5\u5BA0\u7269\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684\u538B\u7F29\u5305",
  "rpc.redirect-forbidden": "\u91CD\u5B9A\u5411\u76EE\u6807\u4E0D\u5728 petdex \u767D\u540D\u5355\u5185",
  "rpc.redirect-too-many": "\u91CD\u5B9A\u5411\u6B21\u6570\u8FC7\u591A",
  "rpc.sheet-not-found": "\u672A\u627E\u5230 spritesheet.webp\uFF08\u6839\u76EE\u5F55\u6216\u4E00\u5C42\u5B50\u76EE\u5F55\uFF09",
  "rpc.slug-invalid": "\u65E0\u6548\u7684 petdex \u6807\u8BC6\uFF08\u4EC5\u652F\u6301\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26\uFF09",
  "rpc.slug-parse-failed": "\u65E0\u6CD5\u4ECE\u94FE\u63A5\u89E3\u6790\u5BA0\u7269\u6807\u8BC6\uFF08\u671F\u671B https://petdex.dev/pets/<slug>\uFF09",
  "rpc.source-not-folder": "\u6765\u6E90\u4E0D\u662F\u6709\u6548\u7684\u6587\u4EF6\u5939/\u538B\u7F29\u5305",
  "rpc.staging-create-failed": "\u521B\u5EFA\u5BFC\u5165\u6682\u5B58\u5931\u8D25",
  "rpc.staging-id-invalid": "\u5BFC\u5165\u6682\u5B58\u6807\u8BC6\u975E\u6CD5",
  "rpc.staging-missing-sheet": "\u6682\u5B58\u533A\u7F3A\u5C11 spritesheet.webp",
  "rpc.staging-not-found": "\u5BFC\u5165\u6682\u5B58\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u5F00\u59CB\u5BFC\u5165",
  "rpc.tmp-write-failed": "\u4E34\u65F6\u6587\u4EF6\u5199\u5165\u5931\u8D25",
  "rpc.zip-entry-illegal-path": "\u538B\u7F29\u5305\u5185\u542B\u975E\u6CD5\u8DEF\u5F84\uFF1A{name}",
  "rpc.zip-open-failed": "\u6253\u5F00\u538B\u7F29\u5305\u5931\u8D25",
  "rpc.zip-read-failed": "\u8BFB\u53D6\u538B\u7F29\u5305\u5931\u8D25",
  "rpc.zip-too-many-entries": "\u538B\u7F29\u5305\u6587\u4EF6\u6570\u8D85\u9650\uFF08>{limit}\uFF09",
  "rpc.zip-total-over-limit": "\u538B\u7F29\u5305\u89E3\u538B\u603B\u91CF\u8D85\u9650\uFF08>{limit}\uFF09"
};
var EN = {
  "menu.sound": "\u{1F50A} Sound",
  "menu.subtitle": "\u{1F4AC} Voice subtitles",
  "menu.physics": "\u{1F9F2} Drop physics",
  "menu.size": "\u{1F4CF} Size",
  "menu.dblAction": "\u{1F5B1}\uFE0F Double-click action",
  "menu.approvalAction": "\u{1F534} Red light action",
  "menu.runningAction": "\u{1F7E1} Yellow light action",
  "menu.errorAction": "\u{1F7E5} Dark-red light action",
  "menu.doneAction": "\u{1F7E2} Green light action",
  "menu.switchPet": "\u{1F501} Switch pet",
  "menu.hide": "\u{1F98A} Hide pet",
  "menu.about": "\u2139\uFE0F About",
  "menu.back": "\u2190 Back",
  "menu.on": "On",
  "menu.off": "Off",
  "menu.soundNoCap": "This pet has no voice assets (requires all four groups)",
  "menu.subtitleNoCap": "Subtitles disabled for this pet (subtitle = audio filename)",
  "scale.small": "Small",
  "scale.medium": "Medium",
  "scale.large": "Large",
  "action.jumping": "Jump",
  "action.waving": "Wave",
  "action.failed": "Sulking",
  "action.waiting": "Waiting",
  "action.review": "Review",
  "action.running": "Working",
  "card.done": "Done",
  "card.approval": "Waiting",
  "card.running": "Running",
  "card.error": "Turn failed",
  "card.disconnected": "Disconnected",
  "card.more": "more",
  "switch.title": "Switch Pet",
  "switch.builtin": "Built-in",
  "switch.activated": "Switched to {name}",
  "switch.invalidSheet": "Spritesheet missing or invalid, cannot activate",
  "switch.updated": "Manifest updated from assets and activated",
  "switch.mismatchTitle": "Assets differ from manifest",
  "switch.mismatchUpdate": "Update manifest from assets (auto backup)",
  "switch.mismatchIgnore": "Ignore, run degraded from disk",
  "switch.mismatchCancel": "Cancel switch",
  "switch.pendingFirstCheck": "Pending first activation check",
  "switch.ignoredDiff": "Differences ignored \u2014 running with current assets (you'll be prompted again next check)",
  "switch.current": "current",
  "startup.title": "Pet Assets Check",
  "startup.fatal": "Spritesheet missing or invalid: {msg}",
  "startup.issuesTitle": "The following assets differ from manifest:",
  "startup.update": "Update manifest from assets (auto backup)",
  "startup.foxbell": "Switch back to foxbell",
  "startup.ignore": "Ignore and continue",
  "startup.hidePet": "Hide pet",
  "startup.updated": "Manifest updated",
  "startup.switched": "Switched back to foxbell",
  "startup.petHidden": "Pet hidden",
  "startup.fatalScan": "Pet assets scan failed: {msg}",
  "import.groupGeneral": "General chat (double-click)",
  "import.groupApproval": "Approval needed (red)",
  "import.groupDone": "Task done (green)",
  "import.groupError": "Error",
  "import.addAudio": "Add audio",
  "import.remove": "Remove",
  "import.probing": "Probing\u2026",
  "import.problems.too-short": "\u22641s",
  "import.problems.too-long": "\u226520s",
  "import.problems.too-big": ">10MB",
  "import.problems.no-duration": "unreadable duration",
  "import.reprobeDuration": "Re-read duration",
  "import.coverageOk": "All four groups present, voice enabled",
  "import.coverageMissing": "Missing groups: {groups} (pet will have no voice)",
  "import.totalSize": "Total voice size: {size}",
  "import.tooLargeWarn": "Voice is large (>30MB), consider trimming",
  "import.title": "Import Pet",
  "import.tabCodex": "From codex",
  "import.tabLocal": "Folder / zip",
  "import.tabPetdex": "petdex online",
  "import.codexEmpty": "No pets found under ~/.codex/pets",
  "import.codexImported": "imported",
  "import.stage": "Stage selected",
  "import.folderHint": "Absolute folder path on the machine running dsh; must contain spritesheet.webp (root or one level deep)",
  "import.folderPath": "Absolute folder path",
  "import.pickFolder": "Stage folder",
  "import.pickZip": "Pick zip & stage",
  "import.petdexHint": "Browse petdex.dev, paste a pet page link (e.g. https://petdex.dev/pets/capvolt), or search",
  "import.petdexBrowse": "Browse petdex.dev",
  "import.petdexSearch": "Search",
  "import.petdexPlaceholder": "Pet page link or search keyword",
  "import.petdexDownload": "Download & stage",
  "import.petdexDownloading": "Downloading\u2026",
  "import.petdexNoZip": "no zip",
  "import.configTitle": "Configure",
  "import.name": "Pet name (folder)",
  "import.nameHint": "letters/digits/-/_ only",
  "import.nameDup": "A pet with this name already exists",
  "import.nameReserved": "Reserved Windows device name (CON/PRN/AUX/NUL/COM1-9/LPT1-9) is not allowed",
  "import.nameReservedBuiltin": "foxbell is a reserved built-in name",
  "import.nameTooLong": "Name must be at most 64 characters",
  "import.nameEmpty": "Pet name cannot be empty",
  "import.displayName": "Display name",
  "import.description": "Description (optional)",
  "import.preview": "Preview",
  "import.sheetInvalid": "Invalid sheet size (need 1536x1872 or 1536x2288)",
  "import.sheetProbing": "Probing sheet\u2026",
  "import.subtitle": "Import subtitles (subtitle = audio filename)",
  "import.execute": "Import",
  "import.cancelImport": "Cancel",
  "import.doneTitle": "Imported",
  "import.doneId": "Imported pet: {id}",
  "import.activateNow": "Activate now",
  "import.finish": "Done",
  "import.errorStage": "Stage failed: {msg}",
  "import.errorFinalize": "Import failed: {msg}",
  "manage.title": "Manage Pets",
  "manage.pick": "Pick a pet to manage",
  "manage.rename": "New name (folder)",
  "manage.renameBtn": "Rename",
  "manage.renamedToast": "Renamed to {name}",
  "manage.subtitle": "Voice subtitles",
  "manage.save": "Save changes",
  "manage.savedToast": "Saved (manifest backed up & updated)",
  "manage.activeSwitchNotice": "Pet in use; switched back to foxbell first",
  "manage.dirLabel": "Folder path",
  "manage.copy": "Copy",
  "manage.copied": "Copied",
  "manage.delete": "Delete pet",
  "manage.deleteConfirm": "Delete? The whole folder moves to the trash dir (~/.dsh/foxbell-pet/.trash/, never hard-deleted)",
  "manage.deletedToast": "Deleted {name}",
  "manage.builtinHint": "Built-in foxbell ships with the plugin and cannot be edited",
  "settings.cardTitle": "Foxbell pet",
  "settings.cardDescription": "Status lights, voice alerts, and external pet management.",
  "settings.expand": "Show settings",
  "settings.collapse": "Collapse settings",
  "settings.configSection": "Configuration",
  "settings.petSection": "Pet management",
  "settings.currentPet": "Current pet",
  "settings.switchPet": "Switch pet",
  "settings.importPet": "Import pet",
  "settings.managePet": "Manage pets",
  "settings.petdex": "Petdex gallery",
  "settings.muted": "Sound",
  "settings.talkative": "Voice subtitles",
  "settings.gravity": "Drop physics",
  "settings.scale": "Size",
  "settings.dblAction": "Double-click action",
  "settings.approvalAction": "Red light action",
  "settings.runningAction": "Yellow light action",
  "settings.errorAction": "Dark-red light action",
  "settings.doneAction": "Green light action",
  // ---- Efficiency dashboard (five-caliber nouns are behavioral invariants) ----
  "dash.today": "Today",
  "dash.requestInput": "Request input",
  "dash.hit": "Hit",
  "dash.cacheHit": "Cache hit",
  "dash.output": "Output",
  "dash.yourInput": "Your input",
  "dash.estimateSuffix": "(est.)",
  "dash.withSubagents": "incl. subagents",
  "dash.sessionReq": "This session",
  "dash.summaryTitle": "Summary",
  "dash.farewellTitle": "Done for today",
  "dash.summaryEntry": "\u{1F4D6} Summary",
  "dash.menuUsage": "\u{1F3F7} Today's usage",
  "dash.menuSummary": "\u{1F4CA} Recent summary",
  "dash.menuSessions": "\u{1F5C2} Sessions",
  "dash.unsaved": "Unsaved changes",
  "dash.saved": "Saved \u2713",
  "dash.invalidNums": "{n} invalid value(s)",
  "dash.save": "Save",
  "dash.discard": "Discard",
  "dash.caliberNote": "Usage is token-only, never converted to money",
  "dash.noActive": "No active sessions",
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.ok": "OK",
  "common.busy": "Working\u2026",
  "common.error": "Error",
  "issue.spritesheet-missing": "Spritesheet missing",
  "issue.spritesheet-changed": "Spritesheet changed",
  "issue.voice-missing": "Voice file missing",
  "issue.voice-changed": "Voice file changed",
  "issue.voice-extra": "Unregistered voice file",
  "issue.manifest-missing": "Manifest missing",
  "issue.pet-dir-missing": "Pet directory missing",
  "err.sheet-missing": "Spritesheet missing",
  "err.sheet-bad-size": "Invalid sheet size: {w}x{h}",
  "err.sheet-load-fail": "Spritesheet failed to load",
  "err.sheet-timeout": "Spritesheet load timed out",
  "err.audio-timeout": "Audio probe timed out",
  "err.audio-bad-duration": "Audio duration unavailable",
  "err.audio-load-fail": "Audio failed to load",
  "err.scan-fail": "Pet assets scan failed",
  "rpc.internal": "Operation failed: {err}",
  "rpc.audio-format-unsupported": "Unsupported audio format: {path}",
  "rpc.audio-not-found": "Audio file not found: {path}",
  "rpc.audio-relpath-invalid": "Invalid voice file path",
  "rpc.copy-failed": "Failed to copy file",
  "rpc.delete-failed": "Delete failed",
  "rpc.download-failed": "Download failed",
  "rpc.download-status": "Download response error",
  "rpc.download-too-large": "Download too large (limit {limit} bytes)",
  "rpc.download-url-invalid": "Invalid download URL",
  "rpc.finalize-move-failed": "Failed to finalize import",
  "rpc.finalize-scan-failed": "Failed to read pet info after finalize",
  "rpc.group-invalid": "Invalid voice group: {group}",
  "rpc.host-forbidden": "Download from non-petdex host rejected: {host}",
  "rpc.manifest-backup-failed": "Failed to back up manifest",
  "rpc.manifest-invalid": "Manifest invalid or inconsistent with disk",
  "rpc.manifest-parse-failed": "Failed to parse manifest/request body",
  "rpc.manifest-request-failed": "petdex manifest request failed",
  "rpc.manifest-status": "petdex manifest response error",
  "rpc.manifest-too-large": "petdex manifest too large (limit {limit} bytes)",
  "rpc.manifest-write-failed": "Failed to write manifest",
  "rpc.origin-forbidden": "Request origin rejected",
  "rpc.pet-dir-missing": "Pet directory missing",
  "rpc.pet-exists": "Pet already exists: {name}",
  "rpc.pet-name-dot-prefix": "Pet name cannot start with a dot",
  "rpc.pet-name-empty": "Pet name cannot be empty",
  "rpc.pet-name-illegal": "Pet name supports letters/digits/-/_ only",
  "rpc.pet-name-reserved": "foxbell is a reserved built-in name",
  "rpc.pet-name-reserved-device": "Pet name conflicts with a Windows reserved device name",
  "rpc.pet-name-too-long": "Pet name is too long (max {max} characters)",
  "rpc.pet-not-found": "Pet not found: {id}",
  "rpc.pet-not-on-petdex": "Pet not found on petdex: {slug}",
  "rpc.petdex-no-zip": "This pet has no downloadable zip",
  "rpc.redirect-forbidden": "Redirect target not in petdex whitelist",
  "rpc.redirect-too-many": "Too many redirects",
  "rpc.sheet-not-found": "spritesheet.webp not found (root or one level deep)",
  "rpc.slug-invalid": "Invalid petdex slug (lowercase letters, digits and hyphen only)",
  "rpc.slug-parse-failed": "Cannot parse pet slug from the link (expect https://petdex.dev/pets/<slug>)",
  "rpc.source-not-folder": "Source is not a valid folder/zip",
  "rpc.staging-create-failed": "Failed to create import staging",
  "rpc.staging-id-invalid": "Invalid staging id",
  "rpc.staging-missing-sheet": "Staging lacks spritesheet.webp",
  "rpc.staging-not-found": "Import staging expired, please start over",
  "rpc.tmp-write-failed": "Failed to write temp file",
  "rpc.zip-entry-illegal-path": "Illegal path entry in zip: {name}",
  "rpc.zip-open-failed": "Failed to open zip",
  "rpc.zip-read-failed": "Failed to read zip",
  "rpc.zip-too-many-entries": "Too many entries in zip (>{limit})",
  "rpc.zip-total-over-limit": "Zip total size over limit (>{limit})"
};
var DICTS = { zh: ZH, en: EN };
var currentLang = detectLang();
function t(key, params) {
  const dict = DICTS[currentLang];
  let s = dict[key];
  if (s === void 0 && currentLang !== "zh") s = ZH[key];
  if (s === void 0) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

// src/client/PetMenu.tsx
var import_react = require("react");

// src/client/dialogs/host.ts
var listeners2 = /* @__PURE__ */ new Set();
var current = null;
function openDialog(kind, props = {}) {
  current = { kind, props };
  for (const l of [...listeners2]) l(current);
}
function closeDialog() {
  current = null;
  for (const l of [...listeners2]) l(null);
}
function subscribeDialogs(l) {
  listeners2.add(l);
  return () => {
    listeners2.delete(l);
  };
}
function currentDialog() {
  return current;
}

// src/client/PetMenu.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var ACTION_PAGE = {
  Dbl: "dblAction",
  Approval: "approvalAction",
  Error: "errorAction",
  Done: "doneAction",
  Running: "runningAction"
};
var PLUGIN_VERSION = "v2.0.0";
function PetMenu(props) {
  const { page, setPage, cfg, onPreview, onClose } = props;
  (0, import_react.useEffect)(() => {
    if (page && page in ACTION_PAGE) onPreview(cfg[ACTION_PAGE[page]]);
    else if (page === null) onPreview(null);
  }, [page, cfg, onPreview]);
  const actionLabel = (a) => t(`action.${a}`);
  const scaleLabel = (s) => s === 0.75 ? t("scale.small") : s === 1 ? t("scale.medium") : t("scale.large");
  const Toggle = (p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: "dyn-pet-menu-row" + (p.disabled ? " disabled" : ""),
      title: p.disabled ? p.title : void 0,
      onClick: () => {
        if (!p.disabled) p.onChange(!p.on);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: p.label }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            className: "dyn-pet-menu-btn" + (p.on && !p.disabled ? " on" : ""),
            onClick: (e) => {
              e.stopPropagation();
              if (!p.disabled) p.onChange(!p.on);
            },
            children: p.on && !p.disabled ? t("menu.on") : t("menu.off")
          }
        )
      ]
    }
  );
  const Sub = (p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dyn-pet-menu-sub", onClick: p.onOpen, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: p.label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dyn-pet-menu-val", children: p.value })
  ] });
  let body;
  if (page === "About") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: onClose, children: `dsh-foxbell-pet ${PLUGIN_VERSION}` });
  } else if (page === "Size") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: () => setPage(null), children: t("menu.back") }),
      CFG_SCALES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "dyn-pet-menu-item" + (cfg.scale === s ? " sel" : ""),
          onClick: () => {
            cfgStore.set({ scale: s });
            setPage(null);
          },
          children: scaleLabel(s)
        },
        s
      ))
    ] });
  } else if (page === "SwitchPet") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: () => setPage(null), children: t("menu.back") }),
      props.pets.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "dyn-pet-menu-item" + (p.id === props.activePetId ? " sel" : ""),
          onClick: () => {
            if (p.id !== props.activePetId) props.onSwitchPet(p.id);
            else onClose();
          },
          children: (p.id === props.activePetId ? "\u2713 " : "") + (p.displayName || p.id)
        },
        p.id
      )),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-divider" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dyn-pet-menu-item", onClick: () => {
        onClose();
        openDialog("switch", {});
      }, children: [
        t("switch.title"),
        "\u2026"
      ] })
    ] });
  } else if (page && page in ACTION_PAGE) {
    const field = ACTION_PAGE[page];
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: () => setPage(null), children: t("menu.back") }),
      CFG_ACTIONS.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "dyn-pet-menu-item" + (cfg[field] === a ? " sel" : ""),
          onClick: () => {
            cfgStore.set({ [field]: a });
            setPage(null);
          },
          children: actionLabel(a)
        },
        a
      ))
    ] });
  } else {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Toggle,
        {
          label: t("menu.sound"),
          on: !cfg.muted,
          disabled: !props.voiceCapable,
          title: !props.voiceCapable ? t("menu.soundNoCap") : void 0,
          onChange: (v) => cfgStore.set({ muted: !v })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Toggle,
        {
          label: t("menu.subtitle"),
          on: cfg.talkative,
          disabled: !props.subtitleCapable,
          title: !props.subtitleCapable ? t("menu.subtitleNoCap") : void 0,
          onChange: (v) => cfgStore.set({ talkative: v })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { label: t("menu.physics"), on: cfg.gravity, onChange: (v) => cfgStore.set({ gravity: v }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-divider" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sub, { label: t("menu.size"), value: scaleLabel(cfg.scale), onOpen: () => setPage("Size") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sub, { label: t("menu.dblAction"), value: actionLabel(cfg.dblAction), onOpen: () => setPage("Dbl") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sub, { label: t("menu.approvalAction"), value: actionLabel(cfg.approvalAction), onOpen: () => setPage("Approval") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sub, { label: t("menu.runningAction"), value: actionLabel(cfg.runningAction), onOpen: () => setPage("Running") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sub, { label: t("menu.errorAction"), value: actionLabel(cfg.errorAction), onOpen: () => setPage("Error") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sub, { label: t("menu.doneAction"), value: actionLabel(cfg.doneAction), onOpen: () => setPage("Done") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-divider" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Sub,
        {
          label: t("menu.switchPet"),
          value: props.pets.find((p) => p.id === props.activePetId)?.displayName ?? props.activePetId,
          onOpen: () => setPage("SwitchPet")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: props.onHide, children: t("menu.hide") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: () => setPage("About"), children: t("menu.about") })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu", "data-testid": "pet-menu", style: { fontSize: Math.round(13 * props.scale) }, children: body });
}

// src/client/Sign.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function Sign(props) {
  const { text, scale } = props;
  const px = (v) => Math.round(v * scale);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      className: "dyn-pet-sign",
      style: { fontSize: px(12), padding: `${px(4)}px ${px(10)}px`, borderRadius: px(6) },
      children: [
        "\u{1F3F7} ",
        text
      ]
    }
  );
}

// src/client/Pet.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var BOTTOM_MARGIN = 76;
var LOOK_FRAME_MS = 250;
var LOOK_IDLE_MS = 6e3;
var TRANSIENT_WAVE_MS = 1700;
var APPROVAL_THROTTLE_MS = 1e4;
function Pet(props) {
  const petCtx = props.ctx;
  const currentId = props.useSessions((s) => s && s.current);
  const currentIdRef = (0, import_react2.useRef)(currentId);
  currentIdRef.current = currentId;
  const [cfg, setCfg] = (0, import_react2.useState)(cfgStore.getSnapshot());
  (0, import_react2.useEffect)(() => cfgStore.subscribe(() => setCfg(cfgStore.getSnapshot())), []);
  const cfgRef = (0, import_react2.useRef)(cfg);
  (0, import_react2.useEffect)(() => {
    cfgRef.current = cfg;
  }, [cfg]);
  const [visible2, setVisible] = (0, import_react2.useState)(petStore.visible);
  (0, import_react2.useEffect)(() => petStore.subscribe(() => setVisible(petStore.visible)), []);
  const [snap, setSnap] = (0, import_react2.useState)(appStore.getSnapshot());
  const [runtime, setRuntime] = (0, import_react2.useState)(appStore.getRuntime());
  (0, import_react2.useEffect)(
    () => appStore.subscribe(() => {
      setSnap(appStore.getSnapshot());
      setRuntime(appStore.getRuntime());
    }),
    []
  );
  const runtimeRef = (0, import_react2.useRef)(runtime);
  (0, import_react2.useEffect)(() => {
    runtimeRef.current = runtime;
  }, [runtime]);
  const scale = cfg.scale;
  const px = (0, import_react2.useCallback)((v) => Math.round(v * scale), [scale]);
  const frameW = px(FRAME_W);
  const frameH = px(FRAME_H);
  const bottomMargin = px(BOTTOM_MARGIN);
  const [pos, setPos] = (0, import_react2.useState)(() => {
    const p = loadPosition();
    if (p === null) return null;
    if (Number.isNaN(p.y)) {
      const b = viewportBounds(window.innerWidth, window.innerHeight, FRAME_W, FRAME_H, BOTTOM_MARGIN);
      return clampPos(p.x, b.groundY, FRAME_W, FRAME_H, window.innerWidth, window.innerHeight, BOTTOM_MARGIN);
    }
    return clampPos(p.x, p.y, FRAME_W, FRAME_H, window.innerWidth, window.innerHeight, BOTTOM_MARGIN);
  });
  (0, import_react2.useEffect)(() => {
    setPos((p) => p === null ? null : clampPos(p.x, p.y, frameW, frameH, window.innerWidth, window.innerHeight, bottomMargin));
    const onResize = () => setPos((p) => p === null ? null : clampPos(p.x, p.y, frameW, frameH, window.innerWidth, window.innerHeight, bottomMargin));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [frameW, frameH, bottomMargin]);
  const [anim, setAnim] = (0, import_react2.useState)("idle");
  const [frame, setFrame] = (0, import_react2.useState)(0);
  const [lookFrame, setLookFrame] = (0, import_react2.useState)(-1);
  const animRef = (0, import_react2.useRef)("idle");
  const frameRef = (0, import_react2.useRef)(0);
  const stepTimer = (0, import_react2.useRef)(null);
  const stateRef = (0, import_react2.useRef)({
    drag: null,
    transient: null,
    task: null,
    look: false
  });
  const lookStop = (0, import_react2.useRef)(null);
  const genRef = (0, import_react2.useRef)({ transient: 0, look: 0 });
  const rowsRef = (0, import_react2.useRef)(11);
  (0, import_react2.useEffect)(() => {
    rowsRef.current = runtime.rows;
  }, [runtime.rows]);
  const later = (0, import_react2.useRef)((fn, ms) => {
    const id = window.setTimeout(fn, ms);
    return () => window.clearTimeout(id);
  }).current;
  const cancelStep = () => {
    if (stepTimer.current !== null) {
      window.clearTimeout(stepTimer.current);
      stepTimer.current = null;
    }
  };
  const stepLoop = () => {
    const def = ANIM[animRef.current === "look" ? "idle" : animRef.current];
    const i = frameRef.current;
    const ms = def.d[i] ?? 160;
    stepTimer.current = window.setTimeout(() => {
      frameRef.current = (i + 1) % def.d.length;
      setFrame(frameRef.current);
      stepLoop();
    }, ms);
  };
  const stopLook = () => {
    lookStop.current?.();
    lookStop.current = null;
    if (stateRef.current.look) {
      stateRef.current.look = false;
      setLookFrame(-1);
    }
  };
  const applyAnim = (key) => {
    if (animRef.current === key) return;
    animRef.current = key;
    setAnim(key);
    cancelStep();
    if (animRef.current !== "look") stopLook();
    frameRef.current = 0;
    setFrame(0);
    stepLoop();
  };
  const tierAnim = () => {
    if (stateRef.current.task === "running" && appStore.getSnapshot()?.dashboard?.pace?.tier === "longrun") return "waiting";
    return null;
  };
  const refreshAnim = () => {
    const s = stateRef.current;
    applyAnim(s.drag ?? s.transient ?? tierAnim() ?? s.task ?? (s.look ? "look" : "idle"));
  };
  const playTransient = (0, import_react2.useRef)((key, ms) => {
    const gen = ++genRef.current.transient;
    stateRef.current.transient = key;
    refreshAnim();
    later(() => {
      if (genRef.current.transient === gen && stateRef.current.transient === key) {
        stateRef.current.transient = null;
        refreshAnim();
      }
    }, ms);
  }).current;
  const scheduleNextLook = (0, import_react2.useRef)(() => {
  });
  scheduleNextLook.current = () => {
    const gen = ++genRef.current.look;
    later(() => {
      if (genRef.current.look !== gen) return;
      if (rowsRef.current !== 11) {
        scheduleNextLook.current();
        return;
      }
      const s = stateRef.current;
      const tier = appStore.getSnapshot()?.dashboard?.pace?.tier;
      if (typeof tier === "string" && tier.startsWith("loaf")) {
        scheduleNextLook.current();
        return;
      }
      if (!s.drag && !s.transient && !s.task) {
        s.look = true;
        setLookFrame(0);
        refreshAnim();
        let i = 0;
        const id = window.setInterval(() => {
          i += 1;
          if (i >= LOOK_FRAMES.length) {
            window.clearInterval(id);
            lookStop.current = null;
            stopLook();
            refreshAnim();
            scheduleNextLook.current();
          } else {
            setLookFrame(i);
          }
        }, LOOK_FRAME_MS);
        lookStop.current = () => window.clearInterval(id);
      } else {
        scheduleNextLook.current();
      }
    }, LOOK_IDLE_MS);
  };
  const [subtitle, setSubtitle] = (0, import_react2.useState)(null);
  const bubbleGen = (0, import_react2.useRef)(0);
  const unlockedRef = (0, import_react2.useRef)(false);
  const showBubble = (text, ms) => {
    const gen = ++bubbleGen.current;
    setSubtitle(text);
    later(() => {
      if (bubbleGen.current === gen) setSubtitle(null);
    }, ms);
  };
  const playVoice = (group, action) => {
    if (!loadVisible()) return;
    playTransient(action, TRANSIENT_WAVE_MS);
    if (!runtimeRef.current.hasVoice) return;
    const entry2 = voicePlayer.pick(group);
    if (!entry2) return;
    if (cfgRef.current.talkative && runtimeRef.current.hasSubtitle) showBubble(entry2.name, MIN_SPEECH_MS);
    voicePlayer.play(entry2, {
      muted: cfgRef.current.muted,
      onSubtitle: (name, ms) => {
        if (!cfgRef.current.muted && cfgRef.current.talkative && runtimeRef.current.hasSubtitle && ms > MIN_SPEECH_MS) {
          showBubble(name, ms);
        }
      }
    });
  };
  const playVoiceRef = (0, import_react2.useRef)(playVoice);
  (0, import_react2.useEffect)(() => {
    playVoiceRef.current = playVoice;
  });
  const [sign, setSign] = (0, import_react2.useState)(null);
  const seenAlertsRef = (0, import_react2.useRef)(/* @__PURE__ */ new Set());
  const [entry, setEntry] = (0, import_react2.useState)(false);
  const entryTimerRef = (0, import_react2.useRef)(null);
  const paceTierRef = (0, import_react2.useRef)(null);
  const prevStatusRef = (0, import_react2.useRef)({});
  const lastApprovalAtRef = (0, import_react2.useRef)(0);
  const sinceSeqRef = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    if (!snap) return;
    const cards2 = Array.isArray(snap.projects) ? snap.projects : [];
    const dash = snap.dashboard;
    const since = sinceSeqRef.current;
    sinceSeqRef.current = snap.seq;
    if (since !== null && Array.isArray(snap.completions)) {
      const fresh = snap.completions.filter((c) => c && typeof c.seq === "number" && c.seq > since);
      if (fresh.length > 0) {
        if (cfgRef.current.summaryEnabled) {
          if (entryTimerRef.current) {
            const d = entryTimerRef.current;
            entryTimerRef.current = null;
            try {
              d();
            } catch {
            }
          }
          setEntry(true);
          entryTimerRef.current = later(() => setEntry(false), (cfgRef.current.summaryEntrySec || 15) * 1e3);
        }
        playVoiceRef.current("done", cfgRef.current.doneAction);
      }
    }
    if (dash && Array.isArray(dash.alerts)) {
      for (const a of dash.alerts) {
        if (!a || typeof a.id !== "string" || seenAlertsRef.current.has(a.id)) continue;
        seenAlertsRef.current.add(a.id);
        if (!cfgRef.current.usageEnabled) continue;
        if (a.kind === "milestone") showBubble(a.text, 4200);
        else {
          setSign(a.text);
          later(() => setSign(null), 4200);
        }
        playTransient("jumping", 1600);
        if (cfgRef.current.muted) continue;
        const v = voicePlayer.pick("usage");
        if (v) {
          voicePlayer.play(v, {
            muted: cfgRef.current.muted,
            onSubtitle: a.kind === "milestone" ? (name, ms) => {
              if (!cfgRef.current.muted && cfgRef.current.talkative && runtimeRef.current.hasSubtitle) showBubble(a.text || name, ms);
            } : void 0
          });
          continue;
        }
        if (cfgRef.current.ttsEnabled && typeof window !== "undefined" && window.speechSynthesis) {
          try {
            const u = new window.SpeechSynthesisUtterance(a.text);
            u.lang = "zh-CN";
            window.speechSynthesis.speak(u);
          } catch {
          }
        }
      }
    }
    const prev = prevStatusRef.current;
    const statuses = {};
    let errAppeared = false;
    let approvalAppeared = false;
    let runningAppeared = false;
    for (const p of cards2) {
      if (!p || !p.id) continue;
      statuses[p.id] = p.status;
      if (p.status === "error" && prev[p.id] !== "error") errAppeared = true;
      if (p.status === "approval" && prev[p.id] !== "approval") approvalAppeared = true;
      if (p.status === "running" && prev[p.id] !== "running") runningAppeared = true;
    }
    prevStatusRef.current = statuses;
    if (errAppeared) {
      playVoiceRef.current("error", cfgRef.current.errorAction);
    }
    if (approvalAppeared) {
      const now = Date.now();
      if (now - lastApprovalAtRef.current > APPROVAL_THROTTLE_MS) {
        lastApprovalAtRef.current = now;
        playVoiceRef.current("approval", cfgRef.current.approvalAction);
      }
    }
    if (runningAppeared) {
      playVoiceRef.current("general", cfgRef.current.runningAction);
    }
    const task = taskPoseOf(cards2);
    if (stateRef.current.task !== task) {
      stateRef.current.task = task;
      refreshAnim();
    }
    const tier = dash && dash.pace ? dash.pace.tier : null;
    if (paceTierRef.current !== tier) {
      paceTierRef.current = tier;
      refreshAnim();
    }
    const active = currentIdRef.current;
    for (const p of cards2) {
      if (p && p.unread && (p.status === "done" || p.status === "error") && p.id === active) ackProject(p.id);
    }
  }, [snap]);
  const dragRef = (0, import_react2.useRef)(null);
  const fallRaf = (0, import_react2.useRef)(0);
  const spriteRef = (0, import_react2.useRef)(null);
  const [dragging, setDragging] = (0, import_react2.useState)(false);
  const busyRef = (0, import_react2.useRef)(false);
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (fallRaf.current) {
      cancelAnimationFrame(fallRaf.current);
      fallRaf.current = 0;
    }
    e.preventDefault();
    stopLook();
    if (!unlockedRef.current) {
      unlockedRef.current = true;
      voicePlayer.unlock();
    }
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      movedX: 0,
      movedY: 0,
      moved: false,
      samples: []
    };
    setDragging(true);
    busyRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
    }
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const now = performance.now();
    pushSample(d.samples, now, e.clientX, e.clientY);
    d.moved = true;
    const winAnchor = d.samples[0];
    d.movedX = e.clientX - winAnchor.x;
    d.movedY = e.clientY - winAnchor.y;
    setPos({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    const dir = dragDirection(d.movedX, d.movedY);
    if (dir && stateRef.current.drag !== dir) {
      stateRef.current.drag = dir;
      refreshAnim();
    }
  };
  const startFall = (x0, y0, vx0) => {
    if (fallRaf.current) cancelAnimationFrame(fallRaf.current);
    let s = { x: x0, y: y0, vx: vx0, vy: 0, landed: false, rest: false };
    let last = performance.now();
    let landFired = false;
    const tick = (now) => {
      const dt = (now - last) / 1e3;
      last = now;
      const b = viewportBounds(window.innerWidth, window.innerHeight, frameW, frameH, bottomMargin);
      const wasAir = !s.landed;
      s = stepFall(s, dt, b.groundY, b.minX, b.maxX);
      if (s.landed && wasAir && !landFired) {
        landFired = true;
        squashAnim();
      }
      setPos({ x: s.x, y: s.y });
      if (s.rest || fallRaf.current === 0) {
        if (s.rest) savePosition({ x: s.x, y: s.y });
        fallRaf.current = 0;
        busyRef.current = false;
        return;
      }
      fallRaf.current = requestAnimationFrame(tick);
    };
    fallRaf.current = requestAnimationFrame(tick);
  };
  const squashAnim = () => {
    const el = spriteRef.current;
    if (!el) return;
    const T = SQUASH_TIMING;
    el.style.transition = `transform ${T.squashMs}ms ease-out`;
    el.style.transform = `scale(1, ${T.squashScaleY})`;
    later(() => {
      const el2 = spriteRef.current;
      if (!el2) return;
      el2.style.transition = `transform ${T.bounceMs}ms ${T.bounceEasing}`;
      el2.style.transform = "scale(1, 1)";
      later(() => {
        const el3 = spriteRef.current;
        if (!el3) return;
        el3.style.transition = "";
        el3.style.transform = "";
        playTransient("jumping", T.hopAnimMs);
      }, T.settleMs);
    }, T.squashMs);
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    stateRef.current.drag = null;
    if (!d.moved) playTransient("waving", TRANSIENT_WAVE_MS);
    refreshAnim();
    const current2 = posRef.current;
    const gravityOn = cfgRef.current.gravity;
    if (gravityOn && d.moved && d.samples.length >= 2) {
      const vx = throwVelocity(d.samples);
      const anchor = current2 ?? { x: e.clientX - d.dx, y: e.clientY - d.dy };
      startFall(anchor.x, anchor.y, vx);
    } else {
      if (d.moved && current2) savePosition(current2);
      busyRef.current = false;
    }
  };
  const posRef = (0, import_react2.useRef)(pos);
  (0, import_react2.useEffect)(() => {
    posRef.current = pos;
  }, [pos]);
  const onDoubleClick = (e) => {
    e.stopPropagation();
    playVoiceRef.current("general", cfgRef.current.dblAction);
  };
  const [menu, setMenu] = (0, import_react2.useState)(null);
  const [menuPage, setMenuPage] = (0, import_react2.useState)(null);
  const menuRef = (0, import_react2.useRef)(null);
  const previewLoop = (0, import_react2.useRef)(null);
  const stopPreview = (0, import_react2.useCallback)(() => {
    if (previewLoop.current !== null) {
      clearInterval(previewLoop.current);
      previewLoop.current = null;
    }
  }, []);
  const handlePreview = (0, import_react2.useCallback)((action) => {
    if (action) {
      stopPreview();
      playTransient(action, 1600);
      previewLoop.current = window.setInterval(() => playTransient(action, 1600), TRANSIENT_WAVE_MS);
    } else {
      stopPreview();
    }
  }, [playTransient, stopPreview]);
  const closeMenu = (0, import_react2.useCallback)(() => {
    setMenu(null);
    setMenuPage(null);
    stopPreview();
  }, [stopPreview]);
  (0, import_react2.useEffect)(() => {
    if (menu === null || !visible2) return;
    const onDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      closeMenu();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, visible2, closeMenu]);
  const switchTo = (0, import_react2.useCallback)(async (id) => {
    try {
      const r = await apiPost("/api/activate", { id });
      if (r.status === "activated") {
        cfgStore.set({ activePetId: id });
        appStore.refresh();
        return r;
      }
      if (r.status === "mismatch") {
        openDialog("guard", { targetId: id, issues: r.issues ?? [], plan: r.plan, onResolved: (choice) => {
          if (choice === "ignore") {
            cfgStore.set({ activePetId: id });
            appStore.refresh();
          }
        } });
        return r;
      }
      openDialog("guard", { targetId: id, issues: r.issues ?? [], fatal: true });
      return r;
    } catch (e) {
      openDialog("guard", { targetId: id, issues: [{ kind: "scan-fail", detail: String(e?.message ?? e) }], fatal: true });
      return null;
    }
  }, []);
  const guardPromptedRef = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    if (!snap || !visible2) return;
    const issues = Array.isArray(snap.guard) ? snap.guard : [];
    const activeId = snap.activePet?.id ?? "foxbell";
    if (issues.length === 0 || activeId === "foxbell") {
      guardPromptedRef.current = null;
      return;
    }
    const sig = guardSignature(activeId, issues);
    if (guardPromptedRef.current === sig) return;
    if (loadGuardIgnored() === sig) return;
    if (busyRef.current || dragRef.current !== null || stateRef.current.transient !== null) return;
    guardPromptedRef.current = sig;
    openDialog("guard", { targetId: activeId, issues, fatal: issues.some((i) => i.fatal) });
  }, [snap, visible2]);
  (0, import_react2.useEffect)(() => {
    stepLoop();
    scheduleNextLook.current();
    return () => {
      cancelStep();
      stopLook();
      genRef.current.look += 1;
      stopPreview();
      if (fallRaf.current) {
        cancelAnimationFrame(fallRaf.current);
        fallRaf.current = 0;
      }
    };
  }, []);
  (0, import_react2.useEffect)(() => {
    if (!visible2 && fallRaf.current) {
      cancelAnimationFrame(fallRaf.current);
      fallRaf.current = 0;
      busyRef.current = false;
    }
  }, [visible2]);
  const onProjectClick = (p) => {
    try {
      const sessions = petCtx.get("sessions");
      if (sessions && typeof sessions.open === "function") sessions.open(p.id);
    } catch {
    }
    ackProject(p.id);
    setLocalAcked((s) => new Set(s).add(p.id));
  };
  const [localAcked, setLocalAcked] = (0, import_react2.useState)(/* @__PURE__ */ new Set());
  (0, import_react2.useEffect)(() => {
    if (!snap) return;
    setLocalAcked((prev) => {
      if (prev.size === 0) return prev;
      const next = /* @__PURE__ */ new Set();
      for (const id of prev) {
        const card = snap.projects.find((p) => p.id === id);
        if (card && card.unread) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [snap]);
  if (!visible2) return null;
  const cards = (snap?.projects ?? []).filter((p) => !(p.status === "done" && localAcked.has(p.id)));
  const shown = cards.slice(0, 6);
  const extra = cards.length - shown.length;
  const style = frameStyle(anim, frame, lookFrame, scale, runtime.rows);
  const rootStyle = {
    position: "fixed",
    zIndex: 2147483e3,
    pointerEvents: "auto",
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none"
  };
  if (pos) {
    rootStyle.left = pos.x;
    rootStyle.top = pos.y;
  } else {
    rootStyle.right = 24;
    rootStyle.bottom = BOTTOM_MARGIN;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        className: "dyn-pet-root",
        style: rootStyle,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
        onDoubleClick,
        onContextMenu: (e) => {
          e.preventDefault();
          setMenu({
            x: Math.min(e.clientX, window.innerWidth - px(200)),
            y: Math.min(e.clientY, window.innerHeight - px(340))
          });
          setMenuPage(null);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dyn-pet-top", style: { marginBottom: px(10), gap: px(5), maxWidth: px(320) }, children: [
            shown.map((p) => {
              const light = lightOf(p);
              return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                "div",
                {
                  className: "dyn-pet-proj",
                  style: { padding: `${px(5)}px ${px(10)}px`, borderRadius: px(10), gap: px(7), fontSize: px(12) },
                  onPointerDown: (e) => e.stopPropagation(),
                  onClick: (e) => {
                    e.stopPropagation();
                    onProjectClick(p);
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                      "span",
                      {
                        className: "dyn-pet-dot",
                        style: {
                          width: px(8),
                          height: px(8),
                          marginTop: px(4),
                          background: DOT_COLOR[light],
                          boxShadow: `0 0 0 2px ${DOT_HALO[light]}`
                        }
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dyn-pet-proj-body", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dyn-pet-proj-title", style: { fontSize: px(12) }, children: [
                        light === "error-darkred" ? "\u26A0 " : "",
                        p.title
                      ] }),
                      Array.isArray(p.lines) ? p.lines.map((l, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dyn-pet-proj-line", style: { fontSize: px(11.5) }, children: [
                        l,
                        i === 0 && p.age ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dyn-pet-age", style: { fontSize: px(10) }, children: " " + p.age }) : null
                      ] }, i)) : null
                    ] })
                  ]
                },
                p.id
              );
            }),
            extra > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dyn-pet-proj-more", style: { fontSize: px(11) }, children: [
              "+",
              extra,
              " ",
              t("card.more")
            ] }) : null
          ] }),
          sign !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Sign, { text: sign, scale }) : null,
          subtitle ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "div",
            {
              className: "dyn-pet-bubble",
              style: { marginTop: px(8), padding: `${px(6)}px ${px(12)}px`, fontSize: px(13), borderRadius: px(12), maxWidth: px(320) },
              children: subtitle
            }
          ) : null,
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "div",
            {
              ref: spriteRef,
              className: "dyn-pet-sprite " + (dragging ? "dragging" : ""),
              style: {
                width: frameW,
                height: frameH,
                backgroundImage: runtime.spriteUrl ? `url('${runtime.spriteUrl}')` : void 0,
                backgroundPosition: style.backgroundPosition,
                backgroundSize: style.backgroundSize,
                backgroundRepeat: "no-repeat",
                cursor: dragging ? "grabbing" : "grab"
              }
            }
          )
        ]
      }
    ),
    menu !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { ref: menuRef, className: "dyn-pet-menu-wrap", style: { left: menu.x, top: menu.y, zIndex: 2147483001 }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      PetMenu,
      {
        page: menuPage,
        setPage: setMenuPage,
        cfg,
        scale,
        voiceCapable: runtime.hasVoice,
        subtitleCapable: runtime.hasSubtitle,
        activePetId: runtime.id,
        pets: snap?.pets ?? [],
        onClose: closeMenu,
        onPreview: handlePreview,
        onHide: () => {
          closeMenu();
          petStore.set(false);
        },
        onSwitchPet: (id) => {
          closeMenu();
          void switchTo(id);
        }
      }
    ) }) : null
  ] });
}

// src/client/PetToggle.tsx
var import_react3 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function PetToggle(props) {
  const wide = props.wide;
  const [on, setOn] = (0, import_react3.useState)(petStore.visible);
  (0, import_react3.useEffect)(() => petStore.subscribe(() => setOn(petStore.visible)), []);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "button",
    {
      className: "dyn-pet-toggle" + (on ? " on" : " off"),
      title: on ? "\u9690\u85CFFoxbell\u684C\u5BA0" : "\u663E\u793AFoxbell\u684C\u5BA0",
      onClick: (e) => {
        e.stopPropagation();
        petStore.set(!petStore.visible);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dyn-pet-toggle-icon", children: "\u{1F98A}" }),
        wide ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dyn-pet-toggle-text", children: on ? "\u9690\u85CF" : "\u663E\u793A" }) : null
      ]
    }
  );
}

// src/client/SettingsCard.tsx
var import_react4 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function Chevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "svg",
    {
      className: "dyn-pet-card-chevron" + (open ? " open" : ""),
      width: "14",
      height: "14",
      viewBox: "0 0 14 14",
      fill: "none",
      "aria-hidden": true,
      children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M3.5 5.25 7 8.75l3.5-3.5", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" })
    }
  );
}
function SettingsCard() {
  const [open, setOpen] = (0, import_react4.useState)(false);
  const [cfg, setCfg] = (0, import_react4.useState)(cfgStore.getSnapshot());
  (0, import_react4.useEffect)(() => cfgStore.subscribe(() => setCfg(cfgStore.getSnapshot())), []);
  const [activeName, setActiveName] = (0, import_react4.useState)("");
  (0, import_react4.useEffect)(
    () => appStore.subscribe(() => {
      const rt = appStore.getRuntime();
      setActiveName(rt.name || rt.id);
    }),
    []
  );
  (0, import_react4.useEffect)(() => {
    const rt = appStore.getRuntime();
    setActiveName(rt.name || rt.id);
  }, []);
  const toggle = (k, v) => cfgStore.set({ [k]: v });
  const actionLabel = (a) => t(`action.${a}`);
  const scaleLabel = (s) => s === 0.75 ? t("scale.small") : s === 1 ? t("scale.medium") : t("scale.large");
  const title = t("settings.cardTitle");
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { className: "dyn-pet-card" + (open ? " open" : ""), children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      "button",
      {
        type: "button",
        className: "dyn-pet-card-header",
        "aria-expanded": open,
        "aria-label": `${open ? t("settings.collapse") : t("settings.expand")}: ${title}`,
        onClick: () => setOpen(!open),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dyn-pet-card-headtext", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dyn-pet-card-name", children: title }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dyn-pet-card-desc", children: t("settings.cardDescription") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Chevron, { open })
        ]
      }
    ),
    open ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-card-body dyn-pet-settings", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dyn-pet-settings-section", children: t("settings.configSection") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("settings.muted") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "checkbox", checked: !cfg.muted, onChange: (e) => toggle("muted", !e.target.checked) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("settings.talkative") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "checkbox", checked: cfg.talkative, onChange: (e) => toggle("talkative", e.target.checked) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("settings.gravity") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "checkbox", checked: cfg.gravity, onChange: (e) => toggle("gravity", e.target.checked) })
      ] }),
      ["dblAction", "approvalAction", "runningAction", "errorAction", "doneAction"].map((k) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t(`settings.${k}`) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("select", { value: cfg[k], onChange: (e) => toggle(k, e.target.value), children: CFG_ACTIONS.map((a) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: a, children: actionLabel(a) }, a)) })
      ] }, k)),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("settings.scale") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dyn-pet-scale-group", children: CFG_SCALES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            className: "dyn-pet-scale-btn" + (cfg.scale === s ? " on" : ""),
            onClick: () => toggle("scale", s),
            children: scaleLabel(s)
          },
          s
        )) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dyn-pet-settings-section", children: t("settings.petSection") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("settings.currentPet") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { className: "dyn-pet-current-pet", children: activeName || cfg.activePetId })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-settings-row dyn-pet-settings-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "dyn-pet-btn plain", onClick: () => openDialog("switch", {}), children: t("settings.switchPet") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "dyn-pet-btn plain", onClick: () => openDialog("import", {}), children: t("settings.importPet") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "dyn-pet-btn plain", onClick: () => openDialog("manage", {}), children: t("settings.managePet") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dyn-pet-settings-row", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("a", { className: "dyn-pet-petdex-link", href: "https://petdex.dev", target: "_blank", rel: "noopener noreferrer", children: [
        t("settings.petdex"),
        " \u2197"
      ] }) })
    ] }) : null
  ] });
}

// src/client/dialogs/DialogHost.tsx
var import_react10 = require("react");
var import_react_dom = require("react-dom");

// src/client/dialogs/SwitchDialog.tsx
var import_react5 = require("react");

// src/client/dialogs/probe.ts
var PROBE_TIMEOUT_MS = 8e3;
var PROBE_RETRY_DELAY_MS = 500;
var PROBE_MAX_AUTO_RETRIES = 2;
function probeAudioDurationMs(url, timeoutMs = PROBE_TIMEOUT_MS) {
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
      if (Number.isFinite(d) && d > 0) resolve(Math.round(d * 1e3));
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
function probeSheetSize(url, timeoutMs = PROBE_TIMEOUT_MS) {
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
async function probeWithRetry(url) {
  for (let attempt = 0; attempt <= PROBE_MAX_AUTO_RETRIES; attempt++) {
    try {
      return await probeAudioDurationMs(url);
    } catch {
      if (attempt < PROBE_MAX_AUTO_RETRIES) await new Promise((r) => setTimeout(r, PROBE_RETRY_DELAY_MS));
    }
  }
  return null;
}

// src/client/dialogs/common.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function Modal(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dyn-pet-modal-mask", onPointerDown: (e) => {
    if (e.target === e.currentTarget) props.onClose();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dyn-pet-modal" + (props.wide ? " wide" : ""), role: "dialog", "aria-label": props.title, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dyn-pet-modal-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: props.title }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "dyn-pet-modal-x", onClick: props.onClose, "aria-label": t("common.close"), children: "\u2715" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dyn-pet-modal-body", children: props.children }),
    props.footer ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dyn-pet-modal-foot", children: props.footer }) : null
  ] }) });
}
function Btn(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "button",
    {
      className: "dyn-pet-btn " + (props.kind ?? "plain"),
      disabled: props.disabled,
      title: props.title,
      onClick: (e) => {
        e.stopPropagation();
        props.onClick();
      },
      children: props.children
    }
  );
}
function InlineError(props) {
  if (!props.msg) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dyn-pet-inline-error", role: "alert", children: props.msg });
}
function InlineOk(props) {
  if (!props.msg) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dyn-pet-inline-ok", children: props.msg });
}
function Spinner() {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dyn-pet-spinner", "aria-hidden": true });
}

// src/client/dialogs/SwitchDialog.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function SwitchDialog(props) {
  const [pets, setPets] = (0, import_react5.useState)([]);
  const [activeId, setActiveId] = (0, import_react5.useState)(cfgStore.getSnapshot().activePetId);
  const [busyId, setBusyId] = (0, import_react5.useState)(null);
  const [error, setError] = (0, import_react5.useState)(null);
  const [ok, setOk] = (0, import_react5.useState)(null);
  const [mismatch, setMismatch] = (0, import_react5.useState)(null);
  const [localCaps, setLocalCaps] = (0, import_react5.useState)({});
  (0, import_react5.useEffect)(() => {
    const snap = appStore.getSnapshot();
    if (snap?.pets) setPets(snap.pets);
    const un = appStore.subscribe(() => {
      const s = appStore.getSnapshot();
      if (s?.pets) setPets(s.pets);
    });
    return un;
  }, []);
  (0, import_react5.useEffect)(() => cfgStore.subscribe(() => setActiveId(cfgStore.getSnapshot().activePetId)), []);
  const sorted = (0, import_react5.useMemo)(() => {
    const builtin = pets.filter((p) => p.builtin);
    const external = pets.filter((p) => !p.builtin);
    return [...builtin, ...external];
  }, [pets]);
  const doUpdateManifest = async (id, result) => {
    setBusyId(id);
    setError(null);
    try {
      const plan = result.plan;
      const scan = await apiPost("/api/scan", { id });
      if (!scan.spritesheet.exists) throw new Error(t("switch.invalidSheet"));
      let rows = null;
      try {
        const size = await probeSheetSize(petSheetUrl(id));
        rows = rowsFromSize(size.w, size.h);
      } catch {
        rows = null;
      }
      const old = result.manifest ?? await fetchManifest(id);
      if (!rows) {
        const recorded = old?.spriteVersionNumber ?? 0;
        if (recorded === 1 || recorded === 2) rows = recorded === 2 ? 11 : 9;
      }
      if (!rows) throw new Error(t("import.sheetInvalid"));
      const keep = plan ? plan.keepVoices : (old?.voices ?? []).filter((v) => scan.voiceFiles.some((f) => f.rel === v.file && f.size === v.sizeBytes));
      const reprobeRels = plan ? plan.reprobes.map((r) => r.rel) : scan.voiceFiles.filter((f) => /\.(m4a|mp3|wav|ogg|opus|flac|aac)$/i.test(f.rel)).map((f) => f.rel).filter((rel) => !keep.some((v) => v.file === rel));
      const probed = await Promise.all(
        reprobeRels.map(async (rel) => {
          const url = `/dyn-pet-foxbell/pets/${encodeURIComponent(id)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
          const size = scan.voiceFiles.find((f) => f.rel === rel)?.size ?? 0;
          return { rel, size, durationMs: await probeWithRetry(url) };
        })
      );
      const validNew = probed.filter((p) => p.durationMs !== null && p.durationMs > 1e3 && p.durationMs < 2e4 && p.size <= 10 * 1024 * 1024);
      const voices = [
        ...keep,
        ...validNew.map((p) => ({
          group: p.rel.split("/")[1],
          name: nameFromRel(p.rel),
          file: p.rel,
          sizeBytes: p.size,
          durationMs: p.durationMs
        }))
      ];
      const hasVoice = ["general", "approval", "done", "error"].every((g) => voices.some((v) => v.group === g && v.durationMs > 1e3 && v.durationMs < 2e4 && v.sizeBytes <= 10 * 1024 * 1024));
      const next = {
        schemaVersion: 2,
        id,
        displayName: old?.displayName || id,
        description: old?.description ?? "",
        source: old?.source ?? "folder",
        spriteVersionNumber: spriteVersionOf(rows),
        spritesheetSizeBytes: scan.spritesheet.size,
        hasVoice,
        // 修复不擅自开字幕（MAM repairManifest：hasSubtitle = hasVoice && old.hasSubtitle）
        hasSubtitle: hasVoice && (old?.hasSubtitle ?? true),
        voices
      };
      await apiPost("/api/manifest-update", { id, manifest: next, backup: !plan?.manifestMissing });
      setOk(t("switch.updated"));
      await activate(id, true);
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
    } finally {
      setBusyId(null);
    }
  };
  const activate = async (id, afterUpdate = false) => {
    setBusyId(id);
    setError(null);
    try {
      const r = await apiPost("/api/activate", { id });
      if (r.status === "activated") {
        cfgStore.set({ activePetId: id });
        setActiveId(id);
        setMismatch(null);
        if (!afterUpdate) setOk(t("switch.activated", { name: pets.find((p) => p.id === id)?.displayName || id }));
        if (r.voiceCap !== void 0) {
          setLocalCaps((m) => ({ ...m, [id]: { hasVoice: r.voiceCap, hasSubtitle: r.voiceCap } }));
        }
        appStore.refresh();
        return;
      }
      if (r.status === "mismatch") {
        setMismatch({ id, result: r });
        return;
      }
      setError(t("switch.invalidSheet"));
    } catch (e) {
      setError(petErrMsg(e, t));
    } finally {
      setBusyId(null);
    }
  };
  const ignoreMismatch = async () => {
    if (!mismatch) return;
    const { id, result } = mismatch;
    try {
      const scan = await apiPost("/api/scan", { id });
      const m = result.manifest ?? await fetchManifest(id);
      const cap = m ? manifestVoiceCapOnDisk(m, scan) : false;
      setLocalCaps((prev) => ({ ...prev, [id]: { hasVoice: cap, hasSubtitle: cap && (m?.hasSubtitle ?? false) } }));
      if (m && result.issues) saveGuardIgnored(guardSignature(id, result.issues));
      cfgStore.set({ activePetId: id });
      setActiveId(id);
      setMismatch(null);
      setOk(t("switch.ignoredDiff"));
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Modal, { title: t("switch.title"), onClose: props.onClose, wide: true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(InlineError, { msg: error }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(InlineOk, { msg: ok }),
    mismatch ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dyn-pet-mismatch", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dyn-pet-mismatch-title", children: [
        t("switch.mismatchTitle"),
        "\uFF08",
        mismatch.id,
        "\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "dyn-pet-issue-list", children: (mismatch.result.issues ?? []).map((i, k) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
        t(`issue.${i.kind}`, {}),
        i.detail ? `\uFF1A${i.detail}` : ""
      ] }, k)) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dyn-pet-mismatch-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Btn, { kind: "primary", onClick: () => {
          void doUpdateManifest(mismatch.id, mismatch.result);
        }, disabled: busyId !== null || mismatch.result.plan?.canRepair === false, children: t("switch.mismatchUpdate") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Btn, { onClick: () => {
          void ignoreMismatch();
        }, disabled: busyId !== null, children: t("switch.mismatchIgnore") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Btn, { onClick: () => setMismatch(null), children: t("switch.mismatchCancel") })
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dyn-pet-switch-grid", children: sorted.map((p) => {
      const cap = localCaps[p.id];
      const hasVoice = cap ? cap.hasVoice : p.hasVoice;
      const hasSubtitle = cap ? cap.hasSubtitle : p.hasSubtitle;
      return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
        "div",
        {
          className: "dyn-pet-switch-card" + (p.id === activeId ? " active" : ""),
          onClick: () => {
            if (p.id !== activeId && busyId === null) void activate(p.id);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "div",
              {
                className: "dyn-pet-switch-thumb",
                style: {
                  backgroundImage: `url('${petSheetUrl(p.id, p.builtin ? "builtin" : void 0)}')`,
                  backgroundSize: p.spriteVersionNumber === 1 ? "384px 468px" : "384px 572px",
                  backgroundPosition: "0 0"
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dyn-pet-switch-name", children: [
              p.displayName || p.id,
              p.id === activeId ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dyn-pet-badge", children: t("switch.current") }) : null,
              p.builtin ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dyn-pet-badge", children: t("switch.builtin") }) : null
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dyn-pet-switch-meta", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dyn-pet-badge", title: p.spriteVersionNumber === 0 ? t("switch.pendingFirstCheck") : void 0, children: p.spriteVersionNumber > 0 ? `v${p.spriteVersionNumber}` : "v?" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { opacity: hasVoice ? 1 : 0.4 }, title: hasVoice ? void 0 : t("menu.soundNoCap"), children: "\u{1F50A}" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { opacity: hasSubtitle ? 1 : 0.4 }, title: hasSubtitle ? void 0 : t("menu.subtitleNoCap"), children: "\u{1F4AC}" }),
              busyId === p.id ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Spinner, {}) : null
            ] })
          ]
        },
        p.id
      );
    }) })
  ] });
}

// src/client/dialogs/ImportDialog.tsx
var import_react7 = require("react");

// src/client/dialogs/VoiceGroupEditor.tsx
var import_react6 = require("react");
var import_jsx_runtime8 = require("react/jsx-runtime");
var GROUP_LABEL = {
  general: "import.groupGeneral",
  approval: "import.groupApproval",
  done: "import.groupDone",
  error: "import.groupError"
};
function fmtSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function VoiceGroupEditor(props) {
  const { target, rows, setRows, onError } = props;
  const [busyGroup, setBusyGroup] = (0, import_react6.useState)(null);
  const [probing, setProbing] = (0, import_react6.useState)(/* @__PURE__ */ new Set());
  const fileRefs = (0, import_react6.useRef)({});
  const urlOf = (rel) => target.mode === "staged" ? stagingVoiceUrl(target.sid ?? "", rel) : `/dyn-pet-foxbell/pets/${encodeURIComponent(target.id ?? "")}/${rel.split("/").map(encodeURIComponent).join("/")}`;
  (0, import_react6.useEffect)(() => {
    const pending = rows.filter((r) => r.durationMs === null);
    if (pending.length === 0) return;
    let cancelled = false;
    setProbing(new Set(pending.map((r) => r.file)));
    void (async () => {
      const results = await Promise.all(
        pending.map(async (r) => [r.file, await probeWithRetry(urlOf(r.file))])
      );
      if (cancelled) return;
      setProbing(/* @__PURE__ */ new Set());
      setRows(
        (prev) => prev.map((r) => {
          const hit = results.find(([f]) => f === r.file);
          return hit && r.durationMs === null ? { ...r, durationMs: hit[1] } : r;
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [rows.filter((r) => r.durationMs === null).length, target.sid, target.id]);
  const summary = (0, import_react6.useMemo)(
    () => judgeVoiceTier(
      rows.map((r) => ({ rel: r.file, size: r.sizeBytes, durationMs: r.durationMs }))
    ),
    [rows]
  );
  const totalSize = rows.reduce((n, r) => n + r.sizeBytes, 0);
  const missing = GROUPS.filter((g) => summary.coverage[g] === 0);
  const onAdd = async (group, files) => {
    if (!files || files.length === 0) return;
    setBusyGroup(group);
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_AUDIO_BYTES) {
          onError(t("import.problems.too-big") + `: ${f.name}`);
          continue;
        }
        let added;
        if (target.mode === "staged") {
          const q = `?sid=${encodeURIComponent(target.sid ?? "")}&group=${encodeURIComponent(group)}&name=${encodeURIComponent(f.name)}`;
          const r = await apiPostBytes(`/api/staging-voice-add${q}`, f);
          added = r.added;
        } else {
          const q = `?id=${encodeURIComponent(target.id ?? "")}&group=${encodeURIComponent(group)}&name=${encodeURIComponent(f.name)}`;
          const r = await apiPostBytes(`/api/voice-add${q}`, f);
          added = r.added;
        }
        const url = urlOf(added.file);
        setProbing((s) => new Set(s).add(added.file));
        const dur = await probeWithRetry(url);
        setProbing((s) => {
          const n = new Set(s);
          n.delete(added.file);
          return n;
        });
        setRows((prev) => [
          ...prev,
          { group: added.group, name: added.name || nameFromRel(added.file), file: added.file, sizeBytes: added.sizeBytes, durationMs: dur }
        ]);
      }
    } catch (e) {
      onError(String(e.detail ?? e.message ?? e));
    } finally {
      setBusyGroup(null);
      const inp = fileRefs.current[group];
      if (inp) inp.value = "";
    }
  };
  const onRemove = async (row) => {
    try {
      if (target.mode === "staged") {
        await apiPost("/api/staging-voice-remove", { sid: target.sid ?? "", rel: row.file });
      } else {
        await apiPost("/api/voice-remove", { id: target.id ?? "", rel: row.file });
      }
      setRows((prev) => prev.filter((r) => r.file !== row.file));
    } catch (e) {
      onError(String(e.detail ?? e.message ?? e));
    }
  };
  const reprobe = async (row) => {
    setProbing((s) => new Set(s).add(row.file));
    const dur = await probeWithRetry(urlOf(row.file));
    setProbing((s) => {
      const n = new Set(s);
      n.delete(row.file);
      return n;
    });
    setRows((prev) => prev.map((r) => r.file === row.file ? { ...r, durationMs: dur } : r));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-voice-editor", children: [
    GROUPS.map((g) => {
      const groupRows = rows.filter((r) => r.group === g);
      return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-voice-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-voice-group-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t(GROUP_LABEL[g]) }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Btn, { onClick: () => fileRefs.current[g]?.click(), disabled: props.disabled || busyGroup !== null, children: busyGroup === g ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Spinner, {}) : t("import.addAudio") }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "input",
            {
              ref: (el) => {
                fileRefs.current[g] = el;
              },
              type: "file",
              accept: ".m4a,.mp3,.wav,.ogg,.opus,.flac,.aac",
              multiple: true,
              style: { display: "none" },
              onChange: (e) => {
                void onAdd(g, e.target.files);
              }
            }
          )
        ] }),
        groupRows.map((r) => {
          const problem = voiceRowProblem(r);
          const isProbing = probing.has(r.file);
          return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-voice-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "dyn-pet-voice-name", title: r.file, children: [
              r.name,
              r.durationMs !== null ? ` (${(r.durationMs / 1e3).toFixed(1)}s)` : isProbing ? ` (${t("import.probing")})` : ""
            ] }),
            problem ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              "button",
              {
                className: "dyn-pet-voice-badge",
                title: problem === "no-duration" ? t("import.reprobeDuration") : void 0,
                onClick: () => {
                  if (problem === "no-duration") void reprobe(r);
                },
                children: t(`import.problems.${problem}`)
              }
            ) : null,
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Btn, { kind: "plain", onClick: () => {
              void onRemove(r);
            }, disabled: props.disabled, children: t("import.remove") })
          ] }, r.file);
        })
      ] }, g);
    }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dyn-pet-voice-summary" + (summary.hasVoice ? " ok" : ""), children: summary.hasVoice ? t("import.coverageOk") : t("import.coverageMissing", { groups: missing.map((g) => t(GROUP_LABEL[g])).join("\u3001") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-voice-summary", children: [
      t("import.totalSize", { size: fmtSize(totalSize) }),
      totalSize > 30 * 1024 * 1024 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "dyn-pet-warn", children: [
        " \xB7 ",
        t("import.tooLargeWarn")
      ] }) : null
    ] })
  ] });
}
function rowsFromStaged(files) {
  return files.map((f) => ({ group: f.group, name: f.name, file: f.file, sizeBytes: f.sizeBytes, durationMs: null }));
}

// src/client/dialogs/ImportDialog.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function ImportDialog(props) {
  const [step, setStep] = (0, import_react7.useState)("source");
  const [tab, setTab] = (0, import_react7.useState)("codex");
  const [busy, setBusy] = (0, import_react7.useState)(false);
  const [error, setError] = (0, import_react7.useState)(null);
  const [ok, setOk] = (0, import_react7.useState)(null);
  const [codexPets, setCodexPets] = (0, import_react7.useState)(null);
  const [selectedCodex, setSelectedCodex] = (0, import_react7.useState)(null);
  const [petdexQuery, setPetdexQuery] = (0, import_react7.useState)("");
  const [petdexHits, setPetdexHits] = (0, import_react7.useState)(null);
  const [selectedPetdex, setSelectedPetdex] = (0, import_react7.useState)(null);
  const zipInputRef = (0, import_react7.useRef)(null);
  const folderInputRef = (0, import_react7.useRef)(null);
  const [staged, setStaged] = (0, import_react7.useState)(null);
  const [existingIds, setExistingIds] = (0, import_react7.useState)(["foxbell"]);
  const [name, setName] = (0, import_react7.useState)("");
  const [displayName, setDisplayName] = (0, import_react7.useState)("");
  const [description, setDescription] = (0, import_react7.useState)("");
  const [subtitle, setSubtitle] = (0, import_react7.useState)(true);
  const [voiceRows, setVoiceRowsState] = (0, import_react7.useState)([]);
  const [sheetRows, setSheetRows] = (0, import_react7.useState)(null);
  const [sheetProbeState, setSheetProbeState] = (0, import_react7.useState)("pending");
  const probeGen = (0, import_react7.useRef)(0);
  const [importedId, setImportedId] = (0, import_react7.useState)(null);
  const setVoiceRows = (fn) => setVoiceRowsState(fn);
  (0, import_react7.useEffect)(() => {
    void (async () => {
      try {
        const snap = appStore.getSnapshot();
        const pets = snap?.pets ?? (await apiGet("/pets")).pets;
        setExistingIds(["foxbell", ...pets.map((p) => p.id)]);
      } catch {
      }
    })();
  }, []);
  (0, import_react7.useEffect)(() => {
    if (step !== "source" || tab !== "codex") return;
    void (async () => {
      try {
        setCodexPets((await apiPost("/api/codex-list")).pets);
      } catch (e) {
        setError(petErrMsg(e, t));
      }
    })();
  }, [step, tab]);
  const nameProblem = name.length === 0 ? "empty" : petNameProblem(name, { existingIds });
  const nameOk = nameProblem === null;
  const tier = judgeVoiceTier(voiceRows.map((r) => ({ rel: r.file, size: r.sizeBytes, durationMs: r.durationMs })));
  const sourceOverride = (0, import_react7.useRef)(null);
  const enterConfig = (s) => {
    setStaged(s);
    setName(s.suggestedName);
    setDisplayName(s.suggestedDisplayName || s.suggestedName);
    setDescription("");
    setSubtitle(true);
    setVoiceRowsState(rowsFromStaged(s.voiceFiles));
    setSheetRows(null);
    setSheetProbeState("pending");
    setStep("config");
    setError(null);
    const gen = ++probeGen.current;
    void (async () => {
      try {
        const { w, h } = await probeSheetSize(stagingSheetUrl(s.stagingId));
        if (gen !== probeGen.current) return;
        const rows = rowsFromSize(w, h);
        if (rows) {
          setSheetRows(rows);
          setSheetProbeState("ok");
        } else setSheetProbeState("invalid");
      } catch {
        if (gen !== probeGen.current) return;
        if (s.spriteVersionNumber === 1 || s.spriteVersionNumber === 2) {
          setSheetRows(s.spriteVersionNumber === 1 ? 9 : 11);
          setSheetProbeState("ok");
        } else {
          setSheetProbeState("invalid");
        }
      }
    })();
  };
  const stageError = (e) => setError(t("import.errorStage", { msg: petErrMsg(e, t) }));
  const stageCodex = async () => {
    if (!selectedCodex) return;
    setBusy(true);
    setError(null);
    sourceOverride.current = null;
    try {
      enterConfig(await apiPost("/api/import-codex", { id: selectedCodex }));
    } catch (e) {
      stageError(e);
    } finally {
      setBusy(false);
    }
  };
  const stageZip = async (file) => {
    setBusy(true);
    setError(null);
    sourceOverride.current = "zip";
    try {
      enterConfig(await apiPostBytes("/api/import-zip", file));
    } catch (e) {
      stageError(e);
    } finally {
      setBusy(false);
    }
  };
  const stageFolderUpload = async (files) => {
    setBusy(true);
    setError(null);
    sourceOverride.current = "folder";
    try {
      const list = Array.from(files);
      const basePrefix = (() => {
        const sheet = list.find((f) => f.name === "spritesheet.webp");
        if (!sheet) return null;
        const rel = sheet.webkitRelativePath ?? sheet.name;
        return rel.slice(0, rel.length - "spritesheet.webp".length);
      })();
      if (basePrefix === null) {
        setError(t("rpc.sheet-not-found"));
        setBusy(false);
        return;
      }
      const payload = {
        files: list.map((f) => ({ f, rel: (f.webkitRelativePath ?? f.name).slice(basePrefix.length) })).filter(({ rel }) => rel === "spritesheet.webp" || rel.startsWith("voice/") && /\.(m4a|mp3|wav|ogg|opus|flac|aac)$/i.test(rel)).slice(0, 200)
      };
      if (payload.files.length === 0 || !payload.files.some(({ rel }) => rel === "spritesheet.webp")) {
        setError(t("rpc.sheet-not-found"));
        setBusy(false);
        return;
      }
      const encoded = await Promise.all(
        payload.files.map(async ({ f, rel }) => ({ rel, name: f.name, size: f.size, data: await fileToBase64(f) }))
      );
      enterConfig(await apiPost("/api/import-folder-files", { files: encoded }));
    } catch (e) {
      stageError(e);
    } finally {
      setBusy(false);
    }
  };
  const stagePetdex = async () => {
    const target = selectedPetdex ? selectedPetdex.slug : petdexQuery.trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    sourceOverride.current = null;
    try {
      enterConfig(await apiPost("/api/import-petdex", { url: selectedPetdex ? `https://petdex.dev/pets/${selectedPetdex.slug}` : target, slug: selectedPetdex ? selectedPetdex.slug : void 0 }));
    } catch (e) {
      stageError(e);
    } finally {
      setBusy(false);
    }
  };
  const searchPetdex = async () => {
    setBusy(true);
    setError(null);
    try {
      setPetdexHits((await apiPost("/api/petdex-search", { q: petdexQuery.trim() })).pets);
    } catch (e) {
      setError(petErrMsg(e, t));
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!staged || !nameOk || !sheetRows || busy) return;
    setBusy(true);
    setError(null);
    try {
      const valid = voiceRows.filter((r) => r.durationMs !== null && r.durationMs > 1e3 && r.durationMs < 2e4 && r.sizeBytes <= 10 * 1024 * 1024);
      const hasVoice = tier.hasVoice;
      const manifest = {
        schemaVersion: 2,
        id: name,
        displayName: displayName.trim() || name,
        description: description.trim(),
        source: tab === "codex" ? "codex" : tab === "petdex" ? "petdex" : sourceOverride.current ?? "folder",
        spriteVersionNumber: spriteVersionOf(sheetRows),
        spritesheetSizeBytes: staged.spritesheetSize,
        hasVoice,
        hasSubtitle: hasVoice && subtitle,
        voices: valid.map((r) => ({
          group: r.group,
          name: r.name || nameFromRel(r.file),
          file: r.file,
          sizeBytes: r.sizeBytes,
          durationMs: r.durationMs ?? 0
        }))
      };
      const sum = await apiPost("/api/import-finalize", { stagingId: staged.stagingId, name, manifest });
      setImportedId(sum.id);
      setStep("done");
      appStore.refresh();
    } catch (e) {
      setError(t("import.errorFinalize", { msg: petErrMsg(e, t) }));
    } finally {
      setBusy(false);
    }
  };
  const cancelAll = () => {
    if (staged) void apiPost("/api/import-cancel", { stagingId: staged.stagingId }).catch(() => {
    });
    props.onClose();
  };
  const activateNow = async () => {
    if (!importedId) return;
    setBusy(true);
    try {
      const r = await apiPost("/api/activate", { id: importedId });
      if (r.status === "activated") {
        cfgStore.set({ activePetId: importedId });
        appStore.refresh();
        setOk(t("switch.activated", { name: importedId }));
      }
    } catch (e) {
      setError(petErrMsg(e, t));
    } finally {
      setBusy(false);
    }
  };
  const sheetPreviewStyle = (0, import_react7.useMemo)(() => {
    if (!staged) return void 0;
    const half = { width: 96, height: 104 };
    return {
      ...half,
      backgroundImage: `url('${stagingSheetUrl(staged.stagingId)}')`,
      backgroundSize: sheetRows === 9 ? "768px 936px" : "768px 1144px",
      backgroundPosition: "0 0"
    };
  }, [staged, sheetRows]);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
    Modal,
    {
      title: step === "source" ? t("import.title") : step === "config" ? t("import.configTitle") : t("import.doneTitle"),
      onClose: cancelAll,
      wide: true,
      footer: step === "config" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Btn, { onClick: cancelAll, children: t("import.cancelImport") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Btn, { kind: "primary", onClick: () => {
          void execute();
        }, disabled: !nameOk || !sheetRows || busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Spinner, {}) : t("import.execute") })
      ] }) : step === "done" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Btn, { onClick: props.onClose, children: t("import.finish") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Btn, { kind: "primary", onClick: () => {
          void activateNow();
        }, disabled: busy || !importedId, children: t("import.activateNow") })
      ] }) : void 0,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(InlineError, { msg: error }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(InlineOk, { msg: ok }),
        step === "done" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-import-done", children: importedId ? t("import.doneId", { id: importedId }) : "" }) : step === "config" && staged ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-import-config", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-import-preview", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-sheet-thumb", style: sheetPreviewStyle }),
            sheetProbeState === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dyn-pet-hint", children: t("import.sheetProbing") }) : null,
            sheetProbeState === "ok" && sheetRows ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dyn-pet-badge", children: sheetRows === 9 ? "v1" : "v2" }) : null,
            sheetProbeState === "invalid" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dyn-pet-bad", children: t("import.sheetInvalid") }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-import-fields", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "dyn-pet-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { title: t("import.nameHint"), children: t("import.name") }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: staged.suggestedName })
            ] }),
            nameProblem && name.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-bad", "data-testid": "import-name-problem", children: t(petNameProblemKey(nameProblem)) }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "dyn-pet-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("import.displayName") }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("input", { value: displayName, onChange: (e) => setDisplayName(e.target.value) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "dyn-pet-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("import.description") }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("input", { value: description, onChange: (e) => setDescription(e.target.value) })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            VoiceGroupEditor,
            {
              target: { mode: "staged", sid: staged.stagingId },
              rows: voiceRows,
              setRows: setVoiceRows,
              onError: setError,
              disabled: busy
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "dyn-pet-checkline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              "input",
              {
                type: "checkbox",
                checked: subtitle && tier.hasVoice,
                disabled: voiceRows.length === 0,
                onChange: (e) => setSubtitle(e.target.checked)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("import.subtitle") })
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-import-source", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-tabs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { className: tab === "codex" ? "on" : "", onClick: () => setTab("codex"), children: t("import.tabCodex") }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { className: tab === "local" ? "on" : "", onClick: () => setTab("local"), children: t("import.tabLocal") }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { className: tab === "petdex" ? "on" : "", onClick: () => setTab("petdex"), children: t("import.tabPetdex") })
          ] }),
          tab === "codex" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-codex-list", children: [
            codexPets === null ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Spinner, {}) : codexPets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-hint", children: t("import.codexEmpty") }) : null,
            codexPets?.map((p) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
              "div",
              {
                className: "dyn-pet-codex-row" + (selectedCodex === p.id ? " sel" : ""),
                onClick: () => {
                  if (!p.imported) setSelectedCodex(p.id);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: p.id }),
                  p.displayName ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dyn-pet-hint", children: p.displayName }) : null,
                  p.spriteVersionNumber > 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "dyn-pet-badge", children: [
                    "v",
                    p.spriteVersionNumber
                  ] }) : null,
                  p.imported ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dyn-pet-hint", children: t("import.codexImported") }) : null
                ]
              },
              p.id
            )),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Btn, { kind: "primary", onClick: () => {
              void stageCodex();
            }, disabled: !selectedCodex || busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Spinner, {}) : t("import.stage") })
          ] }) : null,
          tab === "local" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-local", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Btn, { onClick: () => folderInputRef.current?.click(), disabled: busy, children: t("import.pickFolder") }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              "input",
              {
                ref: folderInputRef,
                type: "file",
                multiple: true,
                webkitdirectory: "",
                directory: "",
                style: { display: "none" },
                onChange: (e) => {
                  if (e.target.files) void stageFolderUpload(e.target.files);
                  e.target.value = "";
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Btn, { onClick: () => zipInputRef.current?.click(), disabled: busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Spinner, {}) : t("import.pickZip") }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              "input",
              {
                ref: zipInputRef,
                type: "file",
                accept: ".zip,application/zip",
                style: { display: "none" },
                onChange: (e) => {
                  const f = e.target.files?.[0];
                  if (f) void stageZip(f);
                  e.target.value = "";
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-hint", children: t("import.folderHint") })
          ] }) : null,
          tab === "petdex" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-petdex", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-hint", children: t("import.petdexHint") }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-petdex-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                "input",
                {
                  value: petdexQuery,
                  placeholder: t("import.petdexPlaceholder"),
                  onChange: (e) => setPetdexQuery(e.target.value)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Btn, { onClick: () => {
                void searchPetdex();
              }, disabled: busy || petdexQuery.trim().length === 0, children: t("import.petdexSearch") }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Btn, { onClick: () => window.open("https://petdex.dev", "_blank", "noopener"), children: t("import.petdexBrowse") })
            ] }),
            petdexHits !== null && petdexHits.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-hint", children: "\u2014" }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-petdex-list", children: petdexHits?.map((h) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
              "div",
              {
                className: "dyn-pet-codex-row" + (selectedPetdex?.slug === h.slug ? " sel" : ""),
                onClick: () => {
                  if (h.hasZip) setSelectedPetdex(h);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: h.slug }),
                  h.displayName ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dyn-pet-hint", children: h.displayName }) : null,
                  h.spriteVersionNumber > 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "dyn-pet-badge", children: [
                    "v",
                    h.spriteVersionNumber
                  ] }) : null,
                  !h.hasZip ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dyn-pet-hint", children: t("import.petdexNoZip") }) : null
                ]
              },
              h.slug
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              Btn,
              {
                kind: "primary",
                onClick: () => {
                  void stagePetdex();
                },
                disabled: busy || !selectedPetdex && !/^https?:\/\/|^[\w-]+$/.test(petdexQuery.trim()),
                children: busy ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Spinner, {}) : t("import.petdexDownload")
              }
            )
          ] }) : null
        ] })
      ]
    }
  );
}
async function fileToBase64(f) {
  const buf = await f.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// src/client/dialogs/ManageDialog.tsx
var import_react8 = require("react");
var import_jsx_runtime10 = require("react/jsx-runtime");
function ManageDialog(props) {
  const [pets, setPets] = (0, import_react8.useState)([]);
  const [selected, setSelected] = (0, import_react8.useState)(null);
  const [manifest, setManifest] = (0, import_react8.useState)(null);
  const [petDir, setPetDir] = (0, import_react8.useState)("");
  const [busy, setBusy] = (0, import_react8.useState)(false);
  const [error, setError] = (0, import_react8.useState)(null);
  const [ok, setOk] = (0, import_react8.useState)(null);
  const [confirmDelete, setConfirmDelete] = (0, import_react8.useState)(false);
  const [copied, setCopied] = (0, import_react8.useState)(false);
  const [renameTo, setRenameTo] = (0, import_react8.useState)("");
  const [displayName, setDisplayName] = (0, import_react8.useState)("");
  const [description, setDescription] = (0, import_react8.useState)("");
  const [subtitle, setSubtitle] = (0, import_react8.useState)(true);
  const [voiceRows, setVoiceRowsState] = (0, import_react8.useState)([]);
  const setVoiceRows = (fn) => setVoiceRowsState(fn);
  const reload = async () => {
    try {
      const snap = appStore.getSnapshot();
      const list = snap?.pets ?? [];
      setPets(list.filter((p) => !p.builtin));
    } catch (e) {
      setError(petErrMsg(e, t));
    }
  };
  (0, import_react8.useEffect)(() => {
    void reload();
  }, []);
  const existingIds = (0, import_react8.useMemo)(() => ["foxbell", ...pets.map((p) => p.id)], [pets]);
  const ensureNotActive = () => {
    const activeId = cfgStore.getSnapshot().activePetId;
    if (selected && activeId === selected.id) {
      saveFlashSwitched(selected.id);
      cfgStore.set({ activePetId: "foxbell" });
      appStore.refresh();
      setOk(t("manage.activeSwitchNotice"));
    }
  };
  const restoreFlashSwitched = (renameMap) => {
    const flashed = loadFlashSwitched();
    if (!flashed) return;
    clearFlashSwitched();
    const target = renameMap && renameMap.from === flashed ? renameMap.to : flashed;
    cfgStore.set({ activePetId: target });
    appStore.refresh();
  };
  const openPanel = async (p) => {
    setSelected(p);
    setError(null);
    setOk(null);
    setConfirmDelete(false);
    setCopied(false);
    setRenameTo("");
    setDisplayName(p.displayName);
    setDescription(p.description ?? "");
    try {
      const scan = await apiPost("/api/scan", { id: p.id });
      setPetDir(scan.dir);
      const m = await fetchManifest(p.id);
      setManifest(m);
      setSubtitle(m ? m.hasSubtitle : true);
      const rows = (m ? m.voices : []).map((v) => ({
        group: v.group,
        name: v.name,
        file: v.file,
        sizeBytes: v.sizeBytes,
        durationMs: v.durationMs
      }));
      const known = new Set(rows.map((r) => r.file));
      for (const f of scan.voiceFiles) {
        if (known.has(f.rel)) continue;
        if (!/\.(m4a|mp3|wav|ogg|opus|flac|aac)$/i.test(f.rel)) continue;
        rows.push({ group: f.rel.split("/")[1], name: nameFromRel(f.rel), file: f.rel, sizeBytes: f.size, durationMs: null });
      }
      setVoiceRowsState(rows);
    } catch (e) {
      setError(petErrMsg(e, t));
    }
  };
  const doRename = async () => {
    if (!selected || busy) return;
    const target = renameTo.trim();
    if (target.length === 0 || target === selected.id) return;
    const problem = petNameProblem(target, { existingIds, selfId: selected.id });
    if (problem) {
      setError(t(petNameProblemKey(problem)));
      return;
    }
    setBusy(true);
    setError(null);
    const wasActive = cfgStore.getSnapshot().activePetId === selected.id || !!loadFlashSwitched();
    try {
      ensureNotActive();
      await apiPost("/api/rename", { oldId: selected.id, newId: target });
      setOk(t("manage.renamedToast", { name: target }));
      const renamed = { ...selected, id: target, displayName: displayName || selected.displayName };
      if (wasActive) restoreFlashSwitched({ from: selected.id, to: target });
      else clearFlashSwitched();
      setSelected(renamed);
      setRenameTo("");
      await reload();
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
      if (wasActive) restoreFlashSwitched();
    } finally {
      setBusy(false);
    }
  };
  const doSave = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    const wasActive = cfgStore.getSnapshot().activePetId === selected.id || !!loadFlashSwitched();
    try {
      ensureNotActive();
      const scan = await apiPost("/api/scan", { id: selected.id });
      let rows;
      const trusted = manifest && manifest.spriteVersionNumber !== 0 && manifest.spritesheetSizeBytes === scan.spritesheet.size;
      if (trusted && manifest) {
        rows = manifest.spriteVersionNumber === 2 ? 11 : 9;
      } else {
        const url = `/dyn-pet-foxbell/pets/${encodeURIComponent(selected.id)}/spritesheet.webp`;
        const size = await probeSheetSize(url);
        const r = rowsFromSize(size.w, size.h);
        if (!r) throw new Error(t("import.sheetInvalid"));
        rows = r;
      }
      const probed = await Promise.all(
        voiceRows.map(async (r) => {
          if (r.durationMs !== null) return r;
          const url = `/dyn-pet-foxbell/pets/${encodeURIComponent(selected.id)}/${r.file.split("/").map(encodeURIComponent).join("/")}`;
          return { ...r, durationMs: await probeWithRetry(url) };
        })
      );
      const valid = probed.filter((r) => r.durationMs !== null && r.durationMs > 1e3 && r.durationMs < 2e4 && r.sizeBytes <= 10 * 1024 * 1024);
      const hasVoice = valid.length > 0 && ["general", "approval", "done", "error"].every((g) => valid.some((r) => r.group === g));
      const next = {
        schemaVersion: 2,
        id: selected.id,
        displayName: displayName.trim() || selected.id,
        description: description.trim(),
        source: manifest?.source ?? "folder",
        spriteVersionNumber: spriteVersionOf(rows),
        spritesheetSizeBytes: scan.spritesheet.size,
        hasVoice,
        hasSubtitle: hasVoice && subtitle,
        voices: valid.map((r) => ({
          group: r.group,
          name: r.name || nameFromRel(r.file),
          file: r.file,
          sizeBytes: r.sizeBytes,
          durationMs: r.durationMs ?? 0
        }))
      };
      await apiPost("/api/manifest-update", { id: selected.id, manifest: next, backup: true });
      setManifest(next);
      setOk(t("manage.savedToast"));
      if (wasActive) restoreFlashSwitched();
      else clearFlashSwitched();
      await reload();
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
      if (wasActive) restoreFlashSwitched();
    } finally {
      setBusy(false);
    }
  };
  const doDelete = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      ensureNotActive();
      await apiPost("/api/delete", { id: selected.id });
      clearFlashSwitched();
      setOk(t("manage.deletedToast", { name: selected.displayName || selected.id }));
      setSelected(null);
      setConfirmDelete(false);
      await reload();
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
      restoreFlashSwitched();
    } finally {
      setBusy(false);
    }
  };
  const copyDir = async () => {
    try {
      await navigator.clipboard.writeText(petDir);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  };
  const closeAll = () => {
    restoreFlashSwitched();
    props.onClose();
  };
  const renameProblem = renameTo.trim().length === 0 ? null : petNameProblem(renameTo.trim(), { existingIds, selfId: selected?.id });
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Modal, { title: t("manage.title"), onClose: closeAll, wide: true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(InlineError, { msg: error }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(InlineOk, { msg: ok }),
    !selected ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-manage-list", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dyn-pet-hint", children: t("manage.pick") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dyn-pet-hint", children: t("manage.builtinHint") }),
      pets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dyn-pet-hint", children: "\u2014" }) : null,
      pets.map((p) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-codex-row", onClick: () => {
        void openPanel(p);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: p.displayName || p.id }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dyn-pet-hint", children: p.id }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dyn-pet-badge", children: p.spriteVersionNumber > 0 ? `v${p.spriteVersionNumber}` : "v?" }),
        p.hasVoice ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { title: t("menu.sound"), children: "\u{1F50A}" }) : null,
        p.hasSubtitle ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { title: t("menu.subtitle"), children: "\u{1F4AC}" }) : null
      ] }, p.id))
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-manage-panel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t("manage.dirLabel") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { className: "dyn-pet-dirpath", children: petDir }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { onClick: () => {
          void copyDir();
        }, children: copied ? t("manage.copied") : t("manage.copy") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t("import.displayName") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("input", { value: displayName, onChange: (e) => setDisplayName(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t("import.description") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("input", { value: description, onChange: (e) => setDescription(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t("manage.rename") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("input", { value: renameTo, placeholder: selected.id, onChange: (e) => setRenameTo(e.target.value) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { onClick: () => {
          void doRename();
        }, disabled: busy || renameTo.trim().length === 0 || renameProblem !== null, children: t("manage.renameBtn") })
      ] }),
      renameProblem ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dyn-pet-bad", children: t(petNameProblemKey(renameProblem)) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        VoiceGroupEditor,
        {
          target: { mode: "installed", id: selected.id },
          rows: voiceRows,
          setRows: setVoiceRows,
          onError: setError,
          disabled: busy
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { className: "dyn-pet-checkline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("input", { type: "checkbox", checked: subtitle, onChange: (e) => setSubtitle(e.target.checked) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t("manage.subtitle") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-manage-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { kind: "primary", onClick: () => {
          void doSave();
        }, disabled: busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Spinner, {}) : t("manage.save") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { onClick: () => {
          setSelected(null);
          setConfirmDelete(false);
        }, children: t("menu.back") }),
        !confirmDelete ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { kind: "danger", onClick: () => setConfirmDelete(true), disabled: busy, children: t("manage.delete") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "dyn-pet-delete-confirm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dyn-pet-bad", children: t("manage.deleteConfirm") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { kind: "danger", onClick: () => {
            void doDelete();
          }, disabled: busy, children: t("manage.delete") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { onClick: () => setConfirmDelete(false), children: t("common.cancel") })
        ] })
      ] })
    ] })
  ] });
}

// src/client/dialogs/GuardDialog.tsx
var import_react9 = require("react");
var import_jsx_runtime11 = require("react/jsx-runtime");
function GuardDialog(props) {
  const [busy, setBusy] = (0, import_react9.useState)(false);
  const [error, setError] = (0, import_react9.useState)(null);
  const [ok, setOk] = (0, import_react9.useState)(null);
  const fatal = !!props.fatal || props.issues.some((i) => i.fatal) || props.issues.some((i) => i.kind === "spritesheet-missing" || i.kind === "pet-dir-missing");
  const canRepair = !fatal && props.plan?.canRepair !== false;
  const choose = (choice) => {
    props.onResolved?.(choice);
    props.onClose();
  };
  const doUpdate = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = props.targetId;
      const scan = await apiPost("/api/scan", { id });
      if (!scan.spritesheet.exists) throw new Error(t("switch.invalidSheet"));
      let rows = null;
      try {
        const size = await probeSheetSize(petSheetUrl(id));
        rows = rowsFromSize(size.w, size.h);
      } catch {
        rows = null;
      }
      const old = await fetchManifest(id);
      if (!rows) {
        const recorded = old?.spriteVersionNumber ?? 0;
        if (recorded === 1 || recorded === 2) rows = recorded === 2 ? 11 : 9;
        else rows = props.plan?.manifestMissing ? 9 : null;
      }
      if (!rows) throw new Error(t("import.sheetInvalid"));
      const keep = props.plan ? props.plan.keepVoices : (old?.voices ?? []).filter((v) => scan.voiceFiles.some((f) => f.rel === v.file && f.size === v.sizeBytes));
      const reprobeRels = props.plan ? props.plan.reprobes.map((r) => r.rel) : scan.voiceFiles.filter((f) => /\.(m4a|mp3|wav|ogg|opus|flac|aac)$/i.test(f.rel)).map((f) => f.rel).filter((rel) => !keep.some((v) => v.file === rel));
      const probed = await Promise.all(
        reprobeRels.map(async (rel) => {
          const url = `/dyn-pet-foxbell/pets/${encodeURIComponent(id)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
          const size = scan.voiceFiles.find((f) => f.rel === rel)?.size ?? 0;
          return { rel, size, durationMs: await probeWithRetry(url) };
        })
      );
      const validNew = probed.filter((p) => p.durationMs !== null && p.durationMs > 1e3 && p.durationMs < 2e4 && p.size <= 10 * 1024 * 1024);
      const voices = [
        ...keep,
        ...validNew.map((p) => ({
          group: p.rel.split("/")[1],
          name: nameFromRel(p.rel),
          file: p.rel,
          sizeBytes: p.size,
          durationMs: p.durationMs
        }))
      ];
      const hasVoice = ["general", "approval", "done", "error"].every((g) => voices.some((v) => v.group === g && v.durationMs > 1e3 && v.durationMs < 2e4 && v.sizeBytes <= 10 * 1024 * 1024));
      const manifestMissing = !old;
      const next = {
        schemaVersion: 2,
        id,
        displayName: old?.displayName || id,
        description: old?.description ?? "",
        source: old?.source ?? "folder",
        spriteVersionNumber: spriteVersionOf(rows),
        spritesheetSizeBytes: scan.spritesheet.size,
        hasVoice,
        hasSubtitle: hasVoice && (manifestMissing ? true : old?.hasSubtitle ?? false),
        voices
      };
      await apiPost("/api/manifest-update", { id, manifest: next, backup: !manifestMissing });
      setOk(t("startup.updated"));
      saveGuardIgnored("");
      appStore.refresh();
      props.onResolved?.("update");
      props.onClose();
    } catch (e) {
      setError(petErrMsg(e, t));
    } finally {
      setBusy(false);
    }
  };
  const doFoxbell = () => {
    cfgStore.set({ activePetId: "foxbell" });
    appStore.refresh();
    setOk(t("startup.switched"));
    choose("foxbell");
  };
  const doIgnore = () => {
    saveGuardIgnored(guardSignature(props.targetId, props.issues));
    choose("ignore");
  };
  const doHide = () => {
    petStore.set(false);
    choose("hide");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Modal, { title: t("startup.title"), onClose: props.onClose, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(InlineError, { msg: error }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(InlineOk, { msg: ok }),
    fatal ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dyn-pet-guard-fatal", children: t("startup.fatal", { msg: props.issues.map((i) => t(`issue.${i.kind}`) + (i.detail ? `\uFF1A${i.detail}` : "")).join("\uFF1B") }) }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { children: t("startup.issuesTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("ul", { className: "dyn-pet-issue-list", children: props.issues.map((i, k) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("li", { children: [
        t(`issue.${i.kind}`),
        i.detail ? `\uFF1A${i.detail}` : ""
      ] }, k)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dyn-pet-guard-actions", children: [
      canRepair ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Btn, { kind: "primary", onClick: () => {
        void doUpdate();
      }, disabled: busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Spinner, {}) : t("startup.update") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Btn, { onClick: doFoxbell, disabled: busy, children: t("startup.foxbell") }),
      !fatal ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Btn, { onClick: doIgnore, disabled: busy, children: t("startup.ignore") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Btn, { kind: "danger", onClick: doHide, disabled: busy, children: t("startup.hidePet") })
    ] })
  ] });
}

// src/client/dialogs/DialogHost.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
function DialogHost() {
  const [req, setReq] = (0, import_react10.useState)(currentDialog());
  (0, import_react10.useEffect)(() => subscribeDialogs(setReq), []);
  if (!req) return null;
  let dialog;
  switch (req.kind) {
    case "switch":
      dialog = /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(SwitchDialog, { onClose: closeDialog });
      break;
    case "import":
      dialog = /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ImportDialog, { onClose: closeDialog });
      break;
    case "manage":
      dialog = /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ManageDialog, { onClose: closeDialog });
      break;
    case "guard":
      dialog = /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(GuardDialog, { ...req.props, onClose: closeDialog });
      break;
    default:
      return null;
  }
  return (0, import_react_dom.createPortal)(dialog, document.body);
}

// src/client/styles.ts
var CSS = `
.dyn-pet-root { position: fixed; z-index: 2147483000; pointer-events: auto; user-select: none; -webkit-user-select: none; touch-action: none; }
.dyn-pet-sprite { width: 192px; height: 208px; background-repeat: no-repeat; cursor: grab; }
.dyn-pet-sprite.dragging { cursor: grabbing; }
.dyn-pet-top {
  position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 3;
  width: fit-content;
}
.dyn-pet-proj {
  pointer-events: auto; cursor: pointer; display: flex; align-items: flex-start;
  background: rgba(255, 252, 248, 0.97); border: 1px solid rgba(122, 74, 43, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
  line-height: 1.45; width: 100%; box-sizing: border-box;
}
.dyn-pet-proj:hover { border-color: rgba(122, 74, 43, 0.65); }
.dyn-pet-dot { border-radius: 50%; flex: none; }
.dyn-pet-proj-body { min-width: 0; }
.dyn-pet-proj-title { font-weight: 700; color: #7a4a2b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-proj-line { color: #a07050; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-age { color: #c4a484; }
.dyn-pet-proj-more { pointer-events: none; color: #a07050; background: rgba(255, 252, 248, 0.9); border-radius: 999px; padding: 2px 8px; }
.dyn-pet-bubble {
  position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.96); color: #7a4a2b; border: 1px solid rgba(122, 74, 43, 0.35);
  line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18); pointer-events: none; z-index: 2;
}
/* \u4E3E\u724C\uFF08v1.4.0 .dyn-pet-sign \u79FB\u690D\uFF09\uFF1A\u5B57\u53F7/\u5185\u8FB9\u8DDD/\u5706\u89D2\u7531 Sign.tsx \u5185\u8054 px() \u7F29\u653E\u4E0B\u53D1 */
.dyn-pet-sign {
  position: absolute; bottom: 85%; left: 60%; transform: rotate(-4deg);
  background: #fffbe8; border: 1px solid rgba(122, 74, 43, 0.45); color: #7a4a2b; font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15); pointer-events: none; z-index: 3; white-space: nowrap;
}
.dyn-pet-toggle {
  display: inline-flex; align-items: center; gap: 4px; background: transparent; border: none;
  color: #8b7355; font-size: 12px; cursor: pointer; padding: 4px 6px; border-radius: 8px;
}
.dyn-pet-toggle:hover { background: rgba(122, 74, 43, 0.08); }
.dyn-pet-toggle-icon { font-size: 14px; line-height: 1; }
.dyn-pet-toggle.off .dyn-pet-toggle-icon { filter: grayscale(1); opacity: 0.45; }
.dyn-pet-toggle-text { font-size: 12px; line-height: 1; }
.dyn-pet-menu-wrap { position: fixed; }
.dyn-pet-menu { background: rgba(30,30,34,.96); color:#eee; line-height:1.9; border-radius:10px; padding:4px 0; min-width:170px; box-shadow:0 6px 20px rgba(0,0,0,.4); cursor:default; user-select:none; position: relative; }
.dyn-pet-menu-item { padding: 3px 14px; cursor: pointer; }
.dyn-pet-menu-item:hover { background: rgba(255,255,255,.08); }
.dyn-pet-menu-item.sel { color: #fbbf24; }
.dyn-pet-menu-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 3px 14px; cursor: pointer; }
.dyn-pet-menu-row.disabled { opacity: .5; cursor: not-allowed; }
.dyn-pet-menu-btn { background:#3f3f46; color:#eee; border:none; border-radius:6px; font-size:12px; padding:1px 10px; cursor:pointer; }
.dyn-pet-menu-btn.on { background:#16a34a; }
.dyn-pet-menu-sub { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:3px 14px; cursor:pointer; }
.dyn-pet-menu-sub:hover { background:rgba(255,255,255,.08); }
.dyn-pet-menu-val { color:#a1a1aa; font-size:12px; }
.dyn-pet-menu-divider { height:1px; margin:4px 10px; background:rgba(255,255,255,.12); }
.dyn-pet-card { list-style:none; border:0.5px solid var(--dsw-alias-border-l4, rgba(0,0,0,.1)); border-radius:16px; background:var(--dsw-alias-bg-layer-3, #fff); transition:border-color .16s, background .16s; }
.dyn-pet-card:hover { border-color:var(--dsw-alias-label-dimmed, rgba(0,0,0,.25)); }
.dyn-pet-card.open { background:var(--dsw-alias-bg-layer-2, #fff); border-color:var(--dsw-alias-label-dimmed, rgba(0,0,0,.25)); }
.dyn-pet-card-header { width:100%; appearance:none; border:0; background:none; font:inherit; color:inherit; text-align:left; cursor:pointer; display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:12px; }
.dyn-pet-card-headtext { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
.dyn-pet-card-name { font-size:15px; font-weight:600; line-height:1.4; color:var(--dsw-alias-label-primary, #1f1f1f); }
.dyn-pet-card-desc { font-size:13px; line-height:1.5; color:var(--dsw-alias-label-tertiary, #8a8a8a); }
.dyn-pet-card-chevron { flex:none; color:var(--dsw-alias-label-tertiary, #8a8a8a); transition:transform .16s; }
.dyn-pet-card-chevron.open { transform:rotate(180deg); }
.dyn-pet-card-body { border-top:0.5px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08)); margin:0 16px; padding-bottom:8px; }
.dyn-pet-settings { padding: 8px 12px; font-size: 13px; color: #333; display: flex; flex-direction: column; gap: 6px; min-width: 240px; }
.dyn-pet-settings-section { font-weight: 700; margin-top: 4px; padding-bottom: 2px; border-bottom: 1px solid rgba(122,74,43,.18); color:#7a4a2b; }
.dyn-pet-settings-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.dyn-pet-settings-row select { max-width: 140px; }
.dyn-pet-settings-actions { justify-content: flex-start; flex-wrap: wrap; }
.dyn-pet-scale-group { display: inline-flex; gap: 4px; }
.dyn-pet-scale-btn { border:1px solid rgba(122,74,43,.35); background:#fff; color:#7a4a2b; border-radius:8px; font-size:12px; padding:2px 10px; cursor:pointer; }
.dyn-pet-scale-btn.on { background:#7a4a2b; color:#fff; }
.dyn-pet-current-pet { color:#7a4a2b; }
.dyn-pet-petdex-link { color:#b45309; font-size:12px; text-decoration:none; }
.dyn-pet-petdex-link:hover { text-decoration:underline; }
.dyn-pet-modal-mask { position: fixed; inset: 0; z-index: 2147483100; background: rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; pointer-events:auto; }
.dyn-pet-modal { background:#fffdf9; color:#3b2f23; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.35); width:420px; max-width:92vw; max-height:86vh; display:flex; flex-direction:column; font-size:13px; }
.dyn-pet-modal.wide { width:640px; }
.dyn-pet-modal-head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid rgba(122,74,43,.15); font-weight:700; color:#7a4a2b; }
.dyn-pet-modal-x { background:transparent; border:none; cursor:pointer; color:#a07050; font-size:14px; }
.dyn-pet-modal-body { padding:12px 14px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; max-height:64vh; }
.dyn-pet-modal-foot { padding:10px 14px; border-top:1px solid rgba(122,74,43,.15); display:flex; justify-content:flex-end; gap:8px; }
.dyn-pet-btn { border:1px solid rgba(122,74,43,.35); background:#fff; color:#7a4a2b; border-radius:8px; font-size:12px; padding:4px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.dyn-pet-btn:disabled { opacity:.5; cursor:not-allowed; }
.dyn-pet-btn.primary { background:#7a4a2b; color:#fff; border-color:#7a4a2b; }
.dyn-pet-btn.danger { background:#b91c1c; color:#fff; border-color:#b91c1c; }
.dyn-pet-inline-error { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; border-radius:8px; padding:6px 10px; font-size:12px; white-space:pre-wrap; }
.dyn-pet-inline-ok { background:#f0fdf4; border:1px solid #bbf7d0; color:#15803d; border-radius:8px; padding:6px 10px; font-size:12px; }
.dyn-pet-spinner { width:12px; height:12px; border:2px solid rgba(122,74,43,.25); border-top-color:#7a4a2b; border-radius:50%; display:inline-block; animation:dyn-pet-spin .8s linear infinite; }
@keyframes dyn-pet-spin { to { transform: rotate(360deg); } }
.dyn-pet-hint { color:#a07050; font-size:12px; }
.dyn-pet-bad { color:#b91c1c; font-size:12px; }
.dyn-pet-warn { color:#b45309; }
.dyn-pet-badge { background:rgba(122,74,43,.12); color:#7a4a2b; border-radius:999px; padding:0 8px; font-size:11px; }
.dyn-pet-tabs { display:flex; gap:6px; }
.dyn-pet-tabs button { border:1px solid rgba(122,74,43,.35); background:#fff; color:#7a4a2b; border-radius:8px 8px 0 0; padding:4px 12px; cursor:pointer; font-size:12px; }
.dyn-pet-tabs button.on { background:#7a4a2b; color:#fff; }
.dyn-pet-codex-list, .dyn-pet-petdex-list { display:flex; flex-direction:column; gap:4px; max-height:220px; overflow-y:auto; }
.dyn-pet-codex-row { display:flex; align-items:center; gap:8px; padding:5px 10px; border:1px solid rgba(122,74,43,.2); border-radius:8px; cursor:pointer; }
.dyn-pet-codex-row:hover { border-color:rgba(122,74,43,.55); }
.dyn-pet-codex-row.sel { border-color:#7a4a2b; background:rgba(122,74,43,.08); }
.dyn-pet-local { display:flex; flex-direction:column; gap:8px; align-items:flex-start; }
.dyn-pet-petdex-row { display:flex; gap:6px; }
.dyn-pet-petdex-row input { flex:1; }
.dyn-pet-import-config { display:flex; flex-direction:column; gap:10px; }
.dyn-pet-import-preview { display:flex; align-items:center; gap:10px; }
.dyn-pet-sheet-thumb { width:96px; height:104px; background-repeat:no-repeat; border:1px solid rgba(122,74,43,.25); border-radius:8px; flex:none; }
.dyn-pet-import-fields { display:flex; flex-direction:column; gap:6px; }
.dyn-pet-field { display:flex; align-items:center; gap:8px; }
.dyn-pet-field > span:first-child { flex:none; width:130px; color:#7a4a2b; }
.dyn-pet-field input { flex:1; border:1px solid rgba(122,74,43,.35); border-radius:8px; padding:4px 8px; font-size:12px; min-width:0; }
.dyn-pet-dirpath { flex:1; font-size:11px; color:#a07050; word-break:break-all; background:rgba(122,74,43,.06); border-radius:6px; padding:3px 6px; }
.dyn-pet-checkline { display:flex; align-items:center; gap:6px; font-size:12px; color:#7a4a2b; }
.dyn-pet-voice-editor { display:flex; flex-direction:column; gap:8px; }
.dyn-pet-voice-group { border:1px solid rgba(122,74,43,.18); border-radius:8px; padding:6px 8px; }
.dyn-pet-voice-group-head { display:flex; align-items:center; justify-content:space-between; gap:8px; color:#7a4a2b; font-weight:600; }
.dyn-pet-voice-row { display:flex; align-items:center; gap:8px; padding:2px 0; }
.dyn-pet-voice-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dyn-pet-voice-badge { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:999px; font-size:11px; padding:0 8px; cursor:pointer; flex:none; }
.dyn-pet-voice-summary { font-size:12px; color:#a07050; }
.dyn-pet-voice-summary.ok { color:#15803d; }
.dyn-pet-switch-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.dyn-pet-switch-card { border:1px solid rgba(122,74,43,.25); border-radius:10px; padding:8px; cursor:pointer; display:flex; flex-direction:column; gap:6px; align-items:center; }
.dyn-pet-switch-card:hover { border-color:rgba(122,74,43,.6); }
.dyn-pet-switch-card.active { border-color:#7a4a2b; background:rgba(122,74,43,.07); }
.dyn-pet-switch-thumb { width:48px; height:52px; background-repeat:no-repeat; border-radius:6px; }
.dyn-pet-switch-name { font-weight:600; color:#7a4a2b; display:flex; gap:6px; align-items:center; }
.dyn-pet-switch-meta { display:flex; gap:8px; align-items:center; font-size:12px; }
.dyn-pet-mismatch { display:flex; flex-direction:column; gap:8px; }
.dyn-pet-mismatch-title { font-weight:700; color:#b45309; }
.dyn-pet-mismatch-actions { display:flex; gap:8px; flex-wrap:wrap; }
.dyn-pet-issue-list { margin:0; padding-left:18px; max-height:160px; overflow-y:auto; color:#7a4a2b; }
.dyn-pet-guard-fatal { color:#b91c1c; }
.dyn-pet-guard-actions { display:flex; gap:8px; flex-wrap:wrap; }
.dyn-pet-manage-list { display:flex; flex-direction:column; gap:6px; }
.dyn-pet-manage-panel { display:flex; flex-direction:column; gap:8px; }
.dyn-pet-manage-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.dyn-pet-delete-confirm { display:inline-flex; gap:8px; align-items:center; }
.dyn-pet-import-done { color:#15803d; font-weight:600; }
`;
var STYLE_ID = "dyn-pet-styles";
function adoptStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

// src/client/index.tsx
var import_jsx_runtime13 = require("react/jsx-runtime");
function makeUseSessions(ctx) {
  const svc = ctx.get("sessions");
  const list = svc && typeof svc === "object" ? svc.list : void 0;
  const ok = !!list && typeof list.getSnapshot === "function";
  const read = () => {
    try {
      const snap = list?.getSnapshot?.();
      return snap && typeof snap === "object" ? snap : { current: void 0 };
    } catch {
      return { current: void 0 };
    }
  };
  return function useSessions(sel) {
    const [value, setValue] = import_react11.default.useState(() => ok ? sel(read()) : void 0);
    import_react11.default.useEffect(() => {
      if (!ok) return;
      const sync = () => setValue(sel(read()));
      sync();
      return typeof list?.subscribe === "function" ? list.subscribe(sync) : void 0;
    }, []);
    return value;
  };
}
function OverlayEntry(props) {
  const ctx = props.ctx;
  const useSessions = props.useSessions;
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Pet, { ctx, useSessions }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(DialogHost, {})
  ] });
}
function apply(ctx) {
  const slots = ctx.get("slots") ?? ctx.slots;
  if (slots === void 0) return;
  adoptStyles();
  reportVisible(petStore.visible);
  appStore.start();
  const settingsScope = ctx.get("settingsScope");
  if (settingsScope !== void 0) {
    try {
      const scope = settingsScope.bind({ namespace: "foxbell-pet" });
      if (typeof ctx.effect === "function") ctx.effect(() => appStore.attachSettings(scope));
      else appStore.attachSettings(scope);
    } catch {
    }
  }
  const useSessions = makeUseSessions(ctx);
  slots.inject(
    "shell.overlay",
    () => slots.register(
      { name: "shell.overlay", id: "foxbell-pet", order: 100 },
      (props) => import_react11.default.createElement(OverlayEntry, Object.assign({}, props, { ctx, useSessions }))
    )
  );
  slots.inject(
    "sidebar.footer.action",
    () => slots.register(
      { name: "sidebar.footer.action", id: "foxbell-pet-toggle", order: 100, label: () => "Foxbell" },
      (props) => import_react11.default.createElement(PetToggle, props)
    )
  );
  slots.inject(
    "settings.plugin.item",
    () => slots.register(
      { name: "settings.plugin.item", key: "foxbell-pet" },
      () => import_react11.default.createElement(SettingsCard)
    )
  );
}
var inject = ["slots"];

return module.exports; } });
