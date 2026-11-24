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
var import_react20 = __toESM(require("react"), 1);

// src/client/Pet.tsx
var import_react4 = require("react");

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
var POSE_KEYS = ["random", ...Object.keys(ANIM)];
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
function dragPos(clientX, clientY, dx, dy, frameW, frameH, vw, vh, bottomMargin) {
  return clampPos(clientX - dx, clientY - dy, frameW, frameH, vw, vh, bottomMargin);
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
  ttsEnabled: false,
  // v2.2.1：开关移除（当前无 TTS 消费；键保留兼容旧 yaml）
  exportPose: "random"
  // v2.2 R8 导出立绘姿态（宿主 settings 同名键镜像）
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
  if (k === "exportPose") return typeof v === "string" && POSE_KEYS.includes(v) ? v : "random";
  return !!v;
}
var NS_CANDIDATES = ["foxbell-pet", "dsh-foxbell-pet"];
var NS_MARKER_KEYS = ["activePetId", "doneAction"];
function describeViewOf(j) {
  const v = j?.result?.value;
  return v && typeof v === "object" ? v : null;
}
var rpcSeq = 0;
var nextRpcId = (tag) => `foxbell-${tag}-${Date.now().toString(36)}-${(rpcSeq++).toString(36)}`;
var RPC_TIMEOUT_MS = 8e3;
function settingsRpc(method, args) {
  try {
    return fetch(`/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: nextRpcId("rpc"), method, payload: { args } }),
      ...typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? { signal: AbortSignal.timeout(RPC_TIMEOUT_MS) } : {}
    }).then((r) => {
      if (!r.ok) throw new Error(`settings RPC ${method} HTTP ${r.status}`);
      return r.json();
    });
  } catch (err) {
    return Promise.reject(err);
  }
}
function discoverNs(view) {
  const list = Array.isArray(view?.namespaces) ? view.namespaces : [];
  const known = new Set(list.map((n) => n?.ns));
  for (const c of NS_CANDIDATES) if (known.has(c)) return c;
  for (const n of list) {
    const v = n?.value;
    if (v && typeof v === "object" && NS_MARKER_KEYS.every((k) => k in v)) return n.ns;
  }
  return null;
}
var resolvedNs = null;
function ensureNs() {
  if (resolvedNs !== null) return Promise.resolve(resolvedNs);
  return settingsRpc("settings/describe", {}).then((j) => {
    resolvedNs = discoverNs(describeViewOf(j));
    return resolvedNs;
  }).catch(() => null);
}
function rowOf(view, ns) {
  if (ns === null || !Array.isArray(view?.namespaces)) return null;
  return view.namespaces.find((n) => n?.ns === ns) ?? null;
}
function writeSetting(field, value) {
  return ensureNs().then((ns) => {
    if (ns === null) throw new Error("foxbell-pet settings namespace not found");
    return settingsRpc("settings/update", { ns, patch: { [field]: value } }).then((j) => {
      if (j?.result && j.result.ok === false) throw new Error("settings update rejected");
    });
  });
}
function createConfigStore() {
  let scope = null;
  let pending2 = {};
  let prevUnsub = null;
  const listeners4 = /* @__PURE__ */ new Set();
  const writeSeq = {};
  let scopeSilent = 0;
  const SCOPE_SILENT_MAX = 2;
  const readUser = (k) => ensureNs().then(
    (ns) => settingsRpc("settings/describe", {}).then((j) => {
      const user = rowOf(describeViewOf(j), ns)?.user;
      return user && typeof user === "object" && k in user ? user[k] : null;
    })
  );
  const verifyWrite = (k, v, seq, tries) => {
    if (writeSeq[k] !== seq) return;
    void readUser(k).then((actual) => {
      if (writeSeq[k] !== seq) return;
      if (actual === v) {
        scopeSilent = 0;
        delete pending2[k];
        emit2();
        return;
      }
      if (tries <= 0) {
        delete pending2[k];
        emit2();
        return;
      }
      writeSetting(k, v).then(
        () => verifyWrite(k, v, seq, tries - 1),
        () => {
          delete pending2[k];
          emit2();
        }
      );
    }).catch(() => {
      if (tries <= 0) {
        delete pending2[k];
        emit2();
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
  const emit2 = () => {
    for (const fn of [...listeners4]) fn();
  };
  let resolveCache = null;
  const resolve = () => {
    if (scope === null) return local;
    const sv = scope.getSnapshot();
    if (!sv || sv.status !== "ready" || !sv.value || typeof sv.value !== "object") return local;
    const pendingKeys = Object.keys(pending2).join("\0");
    if (resolveCache && resolveCache.local === local && resolveCache.sv === sv && resolveCache.pendingKeys === pendingKeys) return resolveCache.value;
    const merged = { ...CFG_DEFAULT, ...local };
    merged.usageEnabled = true;
    for (const k of Object.keys(CFG_DEFAULT)) {
      if (pending2[k] !== void 0) merged[k] = pending2[k];
      else if (sv.value[k] !== void 0) merged[k] = sanitizeValue(k, sv.value[k]);
    }
    resolveCache = { local, sv, pendingKeys, value: merged };
    return merged;
  };
  return {
    getSnapshot: resolve,
    subscribe(fn) {
      listeners4.add(fn);
      return () => {
        listeners4.delete(fn);
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
        pending2[k] = v;
        const seq = (writeSeq[k] ?? 0) + 1;
        writeSeq[k] = seq;
        if (scope === null || scopeSilent >= SCOPE_SILENT_MAX) {
          writeSetting(k, v).then(
            () => {
              delete pending2[k];
              emit2();
            },
            () => {
              delete pending2[k];
              emit2();
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
            delete pending2[k];
            emit2();
          });
          setTimeout(() => {
            if (settled) return;
            if (writeSeq[k] !== seq) return;
            writeSetting(k, v).then(
              () => {
                delete pending2[k];
                emit2();
              },
              () => {
                delete pending2[k];
                emit2();
              }
            );
          }, 3e3);
        }
      }
      emit2();
    },
    attachScope(s) {
      if (s === null) {
        if (prevUnsub) {
          prevUnsub();
          prevUnsub = null;
        }
        scope = null;
        pending2 = {};
        emit2();
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
              pending2[k] = legacy[k];
              const seq = (writeSeq[k] ?? 0) + 1;
              writeSeq[k] = seq;
              s.set(k, legacy[k]).then(
                () => verifyWrite(k, legacy[k], seq, 5),
                () => {
                  delete pending2[k];
                  emit2();
                }
              );
            }
          }
        }
        emit2();
      };
      scope = s;
      prevUnsub = s.subscribe(sync);
      sync();
      return () => {
        if (prevUnsub) prevUnsub();
        prevUnsub = null;
        scope = null;
        pending2 = {};
        emit2();
      };
    }
  };
}
var SCOPE_POLL_MS = 8e3;
function createHttpSettingsScope() {
  const listeners4 = /* @__PURE__ */ new Set();
  let snap = { status: "pending" };
  let timer = null;
  const refresh = () => {
    try {
      return settingsRpc("settings/describe", {}).then((j) => {
        const view = describeViewOf(j);
        if (resolvedNs === null) resolvedNs = discoverNs(view);
        const row = rowOf(view, resolvedNs);
        if (row === null && resolvedNs !== null) resolvedNs = null;
        snap = row && row.value && typeof row.value === "object" ? {
          status: "ready",
          value: row.value,
          user: row.user ?? {}
        } : { status: "pending" };
        for (const fn of [...listeners4]) fn();
      }).catch(() => {
      });
    } catch {
      return Promise.resolve();
    }
  };
  const startTimer = () => {
    if (timer !== null || typeof setInterval !== "function") return;
    timer = setInterval(() => {
      void refresh();
    }, SCOPE_POLL_MS);
  };
  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  return {
    getSnapshot: () => snap,
    subscribe(fn) {
      listeners4.add(fn);
      startTimer();
      void refresh();
      return () => {
        listeners4.delete(fn);
        if (listeners4.size === 0) stopTimer();
      };
    },
    set: writeSetting
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
async function apiGetRange(from, to) {
  return apiGet(`/dashboard/range?from=${from}&to=${to}`);
}
function usageQuery(query) {
  const p = new URLSearchParams({ preset: query.preset });
  if (query.from !== void 0) p.set("from", query.from);
  if (query.to !== void 0) p.set("to", query.to);
  return p.toString();
}
async function apiGetUsageWindow(query) {
  return apiGet(`/dashboard/usage?${usageQuery(query)}`);
}
async function apiGetCost(query, span, usageRevision) {
  const p = new URLSearchParams({ spanFrom: String(span.from), spanTo: String(span.to) });
  if (usageRevision !== void 0) p.set("usageRevision", String(usageRevision));
  return apiGet(`/dashboard/cost?${usageQuery(query)}&${p.toString()}`);
}
async function apiGetPriceRules() {
  return apiGet("/dashboard/price-rules");
}
async function apiSavePriceRules(expectedRevision, rules) {
  return apiPost("/dashboard/price-rules", { expectedRevision, rules });
}
async function apiSyncPricing(force) {
  return apiPost("/dashboard/pricing-sync", { force });
}
async function apiGetSpeed(range, selectedKey) {
  const p = new URLSearchParams({ range });
  if (selectedKey) p.set("selectedKey", selectedKey);
  return apiGet(`/dashboard/speed?${p.toString()}`);
}
var stagingSheetUrl = (sid) => `${ROUTE_PREFIX}/staging/${encodeURIComponent(sid)}/spritesheet.webp`;
var stagingVoiceUrl = (sid, rel) => `${ROUTE_PREFIX}/staging/${encodeURIComponent(sid)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
var petSheetUrl = (id, rev) => `${ROUTE_PREFIX}/pets/${encodeURIComponent(id)}/spritesheet.webp${rev ? `?rev=${encodeURIComponent(rev)}` : ""}`;

// src/client/validation.ts
var GROUPS = ["general", "approval", "done", "error"];
var PLAY_GROUPS = [...GROUPS];
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
var POLL_INTERVAL_HIDDEN_MS = 5e3;
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
var lifecycle = 0;
var pollGen = 0;
var lastSeq = null;
var lastRev = null;
var loadedKey = "";
function mergeUnchanged(cur, res) {
  const projects = (cur.projects || []).map((p, i) => ({ ...p, age: res.ages && res.ages[i] || p.age }));
  return { ...cur, seq: res.seq, rev: res.rev, projects };
}
var schedulePoll = () => {
  const gen = ++pollGen;
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  void pollOnce();
  const hidden = typeof document !== "undefined" && document.hidden;
  pollTimer = setTimeout(function tick() {
    void pollOnce().finally(() => {
      if (gen !== pollGen) return;
      const h = typeof document !== "undefined" && document.hidden;
      pollTimer = setTimeout(tick, h ? POLL_INTERVAL_HIDDEN_MS : POLL_INTERVAL_MS);
    });
  }, hidden ? POLL_INTERVAL_HIDDEN_MS : POLL_INTERVAL_MS);
};
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
    schedulePoll();
  },
  stop() {
    lifecycle += 1;
    pollGen += 1;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    loadedKey = "";
    lastRev = null;
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
  const life = lifecycle;
  let snap;
  try {
    const hint = cfgStore.getSnapshot().activePetId;
    const since = lastRev !== null ? `&since=${encodeURIComponent(lastRev)}` : "";
    snap = await apiGet(`/state?pet=${encodeURIComponent(hint)}${since}`);
  } catch {
    return;
  }
  if (life !== lifecycle || !snap || typeof snap.seq !== "number") return;
  if (snap.unchanged === true) {
    state.snapshot = mergeUnchanged(state.snapshot, snap);
    appStore.emit();
    return;
  }
  lastRev = typeof snap.rev === "string" ? snap.rev : null;
  state.snapshot = snap;
  const ap = snap.activePet;
  const key = ap ? `${ap.id}#${ap.rev}` : "";
  if (ap && key !== loadedKey) {
    loadedKey = key;
    const rows = await resolveRows(ap.spriteVersionNumber, ap.spriteUrl);
    if (life !== lifecycle || loadedKey !== key) return;
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
var ALERT_SOUNDS = [1, 2, 3].map((n) => `${ROUTE_PREFIX}/sounds/alert-${n}.wav`);
var alertIdx = 0;
function playDefaultAlertSound() {
  try {
    const a = new Audio(ALERT_SOUNDS[alertIdx++ % ALERT_SOUNDS.length]);
    a.volume = 0.6;
    a.play().catch(() => {
    });
  } catch {
  }
}
var PANEL_ID = "foxbell-dashboard";
var panelSwitcher = null;
function setPanelSwitcher(fn) {
  panelSwitcher = fn;
}
function openDashboardPanel() {
  if (!panelSwitcher) {
    console.warn("[foxbell-pet] panel switcher unavailable");
    return false;
  }
  panelSwitcher(PANEL_ID);
  return true;
}

// src/client/voiceowner.ts
var owner = false;
var listeners2 = /* @__PURE__ */ new Set();
var started = false;
var generation = 0;
var pending = false;
var retryTimer = null;
var release = null;
function isVoiceOwner() {
  return owner;
}
function emit() {
  for (const fn of [...listeners2]) {
    try {
      fn();
    } catch {
    }
  }
}
function getLocks() {
  try {
    const locks = navigator.locks;
    return locks && typeof locks.request === "function" ? locks : null;
  } catch {
    return null;
  }
}
var LOCK_NAME = "foxbell-voice-owner";
function clearRetry() {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
}
function acquire() {
  if (!started || pending || release) return;
  clearRetry();
  const locks = getLocks();
  if (!locks) {
    if (!owner) {
      owner = true;
      emit();
    }
    return;
  }
  const epoch = generation;
  const retry = (ms) => {
    if (epoch !== generation) return;
    clearRetry();
    retryTimer = setTimeout(acquire, ms);
  };
  pending = true;
  void locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
    if (epoch !== generation) return;
    pending = false;
    if (!lock) {
      if (owner) {
        owner = false;
        emit();
      }
      retry(2500 + Math.floor(Math.random() * 1e3));
      return;
    }
    await new Promise((resolve) => {
      release = resolve;
      owner = true;
      emit();
    });
    if (epoch !== generation) return;
    release = null;
    if (owner) {
      owner = false;
      emit();
    }
    if (typeof document !== "undefined" && !document.hidden) retry(0);
  }).catch(() => {
    if (epoch !== generation) return;
    pending = false;
    retry(3e3);
  });
}
function onVisibility() {
  const hidden = typeof document !== "undefined" && document.hidden;
  if (hidden && owner && release) {
    const r = release;
    release = null;
    r();
  } else if (!hidden && !owner) {
    acquire();
  }
}
function startVoiceOwnership() {
  if (started) return;
  started = true;
  try {
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", onVisibility);
    }
  } catch {
  }
  acquire();
}
function stopVoiceOwnership() {
  if (!started) return;
  started = false;
  generation += 1;
  pending = false;
  clearRetry();
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  const done = release;
  release = null;
  done?.();
  if (owner) {
    owner = false;
    emit();
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
function countsFromDash(dash, cards) {
  const counts = { approval: 0, running: 0, done: 0 };
  for (const p of cards || []) {
    if (counts[p.status] !== void 0) counts[p.status] += 1;
  }
  const c = dash && dash.usage ? dash.usage.counts : void 0;
  if (c && typeof c.approval === "number" && typeof c.running === "number" && typeof c.done === "number") {
    return { approval: c.approval, running: c.running, done: c.done };
  }
  return counts;
}

// src/client/format.ts
function fmtTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1e4) return String(Math.round(n));
  if (n < 1e8) {
    const v2 = (n / 1e4).toFixed(1);
    return (v2.endsWith(".0") ? v2.slice(0, -2) : v2) + "\u4E07";
  }
  const v = (n / 1e8).toFixed(2);
  return v.replace(/\.?0+$/, "") + "\u4EBF";
}
function fmtInt(n) {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}
function fmtPct(x) {
  return (x * 100).toFixed(1) + "%";
}
function fmtMoney(amount) {
  if (amount === null || amount === void 0 || amount === "") return "\u2014";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "\u2014";
  const scaled = Math.round((n + Number.EPSILON * Math.sign(n || 1)) * 100) / 100;
  return scaled.toFixed(2);
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
  "settings.scale": "\u5BA0\u7269\u5927\u5C0F",
  "settings.dblAction": "\u53CC\u51FB\u52A8\u4F5C",
  "settings.approvalAction": "\u7EA2\u706F\u52A8\u4F5C",
  "settings.runningAction": "\u9EC4\u706F\u52A8\u4F5C",
  "settings.errorAction": "\u6DF1\u7EA2\u706F\u52A8\u4F5C",
  "settings.doneAction": "\u7EFF\u706F\u52A8\u4F5C",
  // ---- 效率看板（五口径名词为行为不变量：请求输入/缓存命中/命中率/产出/你的输入/含子代理）----
  "dash.today": "\u4ECA\u65E5",
  "dash.requestInput": "\u8BF7\u6C42\u8F93\u5165",
  "dash.hit": "\u547D\u4E2D\u7387",
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
  // L3 大看板脚注（v2.2 自检修复：spec R5 §7 引文逐字——SettingsCard 沿用 dash.caliberNote 不变）
  "dash.caliber": "\u7EAF token \xB7 \u542B\u5B50\u4EE3\u7406 \xB7 \u672C\u5730\u805A\u5408",
  // 设置卡 12 键标签（Task 9；zh 沿用 v1.4.0 SettingsCard 行标签语义，886b303 L1155-1172）
  "dash.cfg.paceEnabled": "\u8282\u594F\u6863\u4F4D",
  "dash.cfg.usageEnabled": "\u7528\u91CF\u7EDF\u8BA1",
  "dash.cfg.summaryEnabled": "\u5DE5\u4F5C\u603B\u7ED3",
  "dash.cfg.ttsEnabled": "TTS \u6717\u8BFB",
  "dash.cfg.dayLimitTokens": "\u65E5 token \u9608\u503C(0=\u5173)",
  "dash.cfg.milestoneUnit": "\u91CC\u7A0B\u7891\u6B65\u957F(0=\u5173)",
  "dash.cfg.paceIntenseEvents": "\u9AD8\u5F3A\u5EA6\u4E8B\u4EF6\u6570/5min",
  "dash.cfg.paceLongrunMin": "\u957F\u4EFB\u52A1\u9759\u9ED8(\u5206)",
  "dash.cfg.paceLoafStartMin": "\u6478\u9C7C\u8D77\u70B9(\u5206)",
  "dash.cfg.approvalFlickerMin": "\u5BA1\u6279\u95EA\u70C1(\u5206,0=\u5173)",
  "dash.cfg.summaryEntrySec": "\u603B\u7ED3\u5165\u53E3\u65F6\u957F(\u79D2)",
  "dash.cfg.boardTtlSec": "\u9ED1\u677F\u505C\u7559(\u79D2)",
  "dash.noActive": "\u6682\u65E0\u8FDB\u884C\u4E2D\u4F1A\u8BDD",
  // 标题闪烁（Task 8；spec 6.3 页外召集：approvalFlickerMin>0 且页面不可见时 document.title 每秒轮换本键/原标题）
  "dash.flickerTitle": "\u{1F98A} \u5BA1\u6279\u7B49\u5F85\u4E2D\u2026",
  // 警报举牌/气泡（Task 9 R10：kind+reached 结构化拼装，{v}=fmtTokens(reached)；
  // 客户端拼装取代宿主预拼文本——举牌/气泡随界面语言，不再固定宿主语）
  "dash.alert.dayWarn": "\u4ECA\u65E5 token \u5DF2\u7528 80% \xB7 {v}",
  "dash.alert.dayHit": "\u4ECA\u65E5 token \u5DF2\u8FBE\u9608\u503C \xB7 {v}",
  "dash.alert.milestone": "\u91CC\u7A0B\u7891\uFF1A\u7D2F\u8BA1 {v} token",
  // 表盘档位（zh 逐字节 = 宿主 PACE_LABELS，src/host/dashboard.js L18-21；客户端按 pace.tier 查表）
  // v2.2.1 档位跨阶举牌（纯文字表达；摸鱼四阶内部递进不举）
  "dash.pace.longrun": "\u8FDB\u5165\u957F\u4EFB\u52A1\uFF0C\u6211\u76EF\u7740\u5462",
  "dash.pace.loaf": "\u6536\u5DE5\u6478\u9C7C\u4E2D",
  "dash.pace.backToWork": "\u56DE\u6765\u5E72\u6D3B\u4E86\uFF01",
  "dash.tier.intense": "\u9AD8\u5F3A\u5EA6",
  "dash.tier.active": "\u6D3B\u8DC3",
  "dash.tier.longrun": "\u957F\u4EFB\u52A1",
  "dash.tier.idle": "\u7A7A\u95F2",
  "dash.tier.loaf1": "\u6478\u9C7C\xB7\u5C0F\u61A9",
  "dash.tier.loaf2": "\u6478\u9C7C\xB7\u8EBA\u5E73",
  "dash.tier.loaf3": "\u6478\u9C7C\xB7\u54B8\u9C7C",
  "dash.tier.loaf4": "\u6478\u9C7C\xB7\u54B8\u9C7C\u5E72",
  // 迷你条状态计数行（v1.4.0 短词：等审批/运行/完成）+ 本会话行的「请求」
  "dash.countApproval": "\u7B49\u5BA1\u6279",
  "dash.countRunning": "\u8FD0\u884C",
  "dash.countDone": "\u5B8C\u6210",
  "dash.request": "\u8BF7\u6C42\u6B21\u6570",
  // 迷你条钻取按钮（Task10 R6：唯一可点元素「详情 »」，点击开黑板）
  "dash.detail": "\u8BE6\u60C5",
  // 黑板加料三行（Task 11 R4/R10）：7 日 sparkline 标签 / 模型 Top3 行 / 等余量 / 完整看板入口行
  "dash.trend7": "7\u65E5",
  "dash.models": "\u6A21\u578B",
  "dash.moreN": "\u7B49{n}",
  "dash.openPanel": "\u67E5\u770B\u5B8C\u6574\u770B\u677F",
  // ---- 小黑板行拼装（Task 7；zh 拼装结果与宿主 summarize zh 字符串逐字节一致，见 boardrows.ts）----
  "dash.boardSessions": "\u4F1A\u8BDD",
  "dash.boardTurns": "turn",
  "dash.boardErrors": "\u62A5\u9519",
  "dash.boardTodayToken": "\u4ECA\u65E5 token",
  // 命中段含右括号与其后的「·」分隔：宿主 tokensText 为 `%）· 产出`（全角括号后无空格），故把分隔符并入本键
  "dash.boardHitPct": "\uFF08{inner}\uFF09\xB7",
  "dash.boardToolsTop": "\u5DE5\u5177 Top3",
  "dash.boardLongest": "\u6700\u957F\u5355 turn",
  // 工具耗时段括号（条目末尾，无尾随分隔；条目间 join(" · ")）
  "dash.boardToolDur": "\uFF08{inner}\uFF09",
  "dash.toolTotal": "\u5171",
  "dash.durMin": "\u5206\u949F",
  "dash.durSec": "\u79D2",
  "dash.durMs": "\u6BEB\u79D2",
  "dash.noSessions": "\u6682\u65E0\u4F1A\u8BDD",
  // ---- Task 12 L3 大看板（R5/R9）：标题/选项卡/hero/趋势卡/工具卡/空态/区间钳制 ----
  "dash.panelTitle": "\u7528\u91CF\u770B\u677F",
  "dash.tab.5h": "5\u5C0F\u65F6",
  "dash.tab.7d": "7\u65E5",
  "dash.tab.30d": "30\u65E5",
  "dash.tab.custom": "\u81EA\u5B9A\u4E49",
  "dash.heroTotal": "{range} Token \u5408\u8BA1",
  "dash.hitCompare": "\u547D\u4E2D\u7387 {a}\uFF08\u4E0A\u4E00\u5468\u671F {b} \xB7 {d}\uFF09",
  "dash.hitCur": "\u547D\u4E2D\u7387 {a}",
  "dash.trendTitle": "\u7528\u91CF\u8D8B\u52BF",
  "dash.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "dash.peak": "\u5CF0\u503C {v}",
  "dash.tools": "\u5DE5\u5177",
  "dash.noData": "\u6682\u65E0\u6570\u636E",
  "dash.rangeClamp": "\u5DF2\u622A\u65AD\u4E3A\u6700\u8FD1 31 \u5929",
  // 五口径网格标签（R5 名词序：用户输入/产出/请求输入(全文累计)/缓存命中/命中率 + 请求次数 + 数据截止；
  // 「(估)」「含子代理」后缀复用 v2.1 既有键 dash.estimateSuffix / dash.withSubagents，五口径名词不变）
  "dash.g.userEst": "\u7528\u6237\u8F93\u5165",
  "dash.g.uncachedInput": "\u7F13\u5B58\u672A\u547D\u4E2D\u8F93\u5165",
  "dash.g.cacheWrite": "\u7F13\u5B58\u5199\u5165",
  "dash.g.output": "\u4EA7\u51FA",
  "dash.g.requestTotal": "\u8BF7\u6C42\u8F93\u5165(\u5168\u6587\u7D2F\u8BA1)",
  "dash.g.cacheRead": "\u7F13\u5B58\u547D\u4E2D",
  "dash.g.hitPct": "\u547D\u4E2D\u7387",
  "dash.g.requests": "\u8BF7\u6C42\u6B21\u6570",
  "dash.g.asOf": "\u6570\u636E\u622A\u6B62\u65F6\u95F4",
  // 2×2 工具格标签（数据源随视图：5h/7d→快照 usage.tools，30d/custom→range.tools）
  "dash.g.toolCalls": "\u8C03\u7528\u603B\u6570",
  "dash.g.toolAvg": "\u5E73\u5747\u8017\u65F6",
  "dash.g.toolTopCount": "Top \u5DE5\u5177\u6B21\u6570",
  "dash.g.toolTopDur": "Top \u5DE5\u5177\u603B\u8017\u65F6",
  // ---- Task 14 R8 导出（头部两按钮 + 复制回执；设置卡 3 键标签；姿态下拉 random+ANIM 键）----
  "dash.export.copyText": "\u590D\u5236\u6587\u672C",
  "dash.export.exportImage": "\u5BFC\u51FA\u56FE\u7247",
  "dash.export.exportCustom": "\u6309\u81EA\u5B9A\u4E49\u8BC4\u8BED\u5BFC\u51FA",
  "dash.export.quotePlaceholder": "\u81EA\u5B9A\u4E49\u8BC4\u8BED\uFF0C\u652F\u6301 {range} {tokens} {hitPct} {models}",
  "dash.export.export": "\u5BFC\u51FA",
  "dash.export.copied": "\u5DF2\u590D\u5236",
  // v2.2.1 设置卡：分组标题 + 每项 i 悬浮注释（勾选/数值含义）
  "settings.sect.base": "\u57FA\u7840\u884C\u4E3A",
  "settings.sect.core": "\u6838\u5FC3\u529F\u80FD \xB7 \u5DE5\u4F5C\u72B6\u6001",
  "settings.sect.voice": "\u8868\u8FBE\u4E0E\u8F85\u52A9",
  "settings.sect.usage": "\u7528\u91CF\u7EDF\u8BA1\u4E0E\u770B\u677F",
  "settings.tip.muted": "\u5F00\u542F\u540E\u5BA0\u7269\u4F1A\u53D1\u51FA\u8BED\u97F3/\u97F3\u6548\uFF1B\u5173\u95ED\u5219\u5168\u7A0B\u9759\u97F3\uFF08\u52A8\u753B\u4E0E\u5B57\u5E55\u4ECD\u4F1A\u64AD\u653E\uFF09\u3002",
  "settings.tip.talkative": "\u8BED\u97F3\u5B57\u5E55\uFF1A\u5BA0\u7269\u8BF4\u8BDD\u65F6\u5728\u5934\u9876\u6C14\u6CE1\u663E\u793A\u53F0\u8BCD\uFF1B\u5173\u95ED\u5219\u53EA\u6709\u58F0\u97F3\u6CA1\u6709\u5B57\u5E55\u3002",
  "settings.tip.gravity": "\u843D\u5730\u7269\u7406\uFF1A\u5BA0\u7269\u53D7\u91CD\u529B\u5F71\u54CD\u53EF\u62D6\u62FD\u629B\u63B7\u3001\u81EA\u7136\u4E0B\u843D\uFF1B\u5173\u95ED\u5219\u62D6\u5230\u54EA\u505C\u54EA\u3002",
  "settings.tip.scale": "\u6574\u4F53\u7F29\u653E\u7CBE\u7075\u3001\u72B6\u6001\u5361\u3001\u83DC\u5355\u4E0E\u60AC\u6D6E\u6761\uFF1B\u5C0F 0.75\xD7 / \u4E2D 1\xD7 / \u5927 1.25\xD7\u3002",
  "settings.tip.dblAction": "\u53CC\u51FB\u5BA0\u7269\u65F6\u64AD\u653E\u7684\u52A8\u4F5C\uFF08\u5982\u6325\u624B\u6253\u62DB\u547C\uFF09\u3002",
  "settings.tip.approvalAction": "\u51FA\u73B0\u5F85\u5BA1\u6279\u4EFB\u52A1\uFF08\u7EA2\u706F\uFF09\u65F6\u64AD\u653E\u7684\u52A8\u4F5C\uFF0C\u63D0\u9192\u4F60\u9700\u8981\u786E\u8BA4\u3002",
  "settings.tip.runningAction": "\u4F1A\u8BDD\u5F00\u59CB\u8FD0\u884C\uFF08\u9EC4\u706F\uFF09\u65F6\u64AD\u653E\u7684\u52A8\u4F5C\u3002",
  "settings.tip.doneAction": "\u4EFB\u52A1\u5B8C\u6210\uFF08\u7EFF\u706F\uFF09\u65F6\u64AD\u653E\u7684\u52A8\u4F5C\u3002",
  "settings.tip.errorAction": "\u4F1A\u8BDD\u8FD0\u884C\u5931\u8D25\uFF08\u6DF1\u7EA2 \u26A0\uFF09\u65F6\u64AD\u653E\u7684\u52A8\u4F5C\u3002",
  "settings.tip.approvalFlickerMin": "\u5BA1\u6279\u7B49\u5F85\u8FBE\u5230\u8BE5\u5206\u949F\u6570\u4E14\u9875\u9762\u4E0D\u5728\u524D\u53F0\u65F6\uFF0C\u6D4F\u89C8\u5668\u6807\u7B7E\u9875\u6807\u9898\u4F1A\u8F6E\u6362\u663E\u793A\u300C\u{1F98A} \u5BA1\u6279\u7B49\u5F85\u4E2D\u2026\u300D\u53EC\u96C6\u4F60\u56DE\u6765\uFF1B0=\u5173\u95ED\u3002",
  "settings.tip.paceEnabled": "\u8282\u594F\u6863\u4F4D\uFF1A\u53CD\u6620\u5F53\u524D\u5DE5\u4F5C\u8282\u594F\uFF0C\u901A\u8FC7\u8FF7\u4F60\u6761\u8868\u76D8\uFF08\u523B\u5EA6+\u6863\u4F4D\u540D\uFF09\u4E0E\u8DE8\u9636\u4E3E\u724C\u6587\u5B57\u8868\u8FBE\uFF1B\u5BA0\u7269\u52A8\u753B\u4EC5\u5728\u957F\u4EFB\u52A1\u6863\u5207\u6362\u4E3A\u300C\u770B\u8868\u7B49\u5F85\u300D\u59FF\u6001\uFF08v1/v2 \u56FE\u96C6\u901A\u7528\uFF09\uFF0C\u4E0D\u65B0\u589E\u8868\u60C5\u52A8\u4F5C\u3002",
  "settings.tip.paceIntenseEvents": "\u6700\u8FD1 5 \u5206\u949F\u4E8B\u4EF6\u603B\u6570\u8FBE\u5230\u8BE5\u503C\uFF0C\u8868\u76D8\u663E\u793A\u300C\u9AD8\u5F3A\u5EA6\u300D\u6EE1\u523B\u5EA6\uFF08\u5FD9\u6863\uFF09\uFF1B\u8C03\u5927=\u66F4\u96BE\u89E6\u53D1\u3002",
  "settings.tip.paceLongrunMin": "\u4E00\u4E2A turn \u5F00\u59CB\u540E\u6301\u7EED\u9759\u9ED8\u8FBE\u5230\u8BE5\u5206\u949F\u6570\uFF0C\u5BA0\u7269\u5207\u6362\u4E3A\u300C\u957F\u4EFB\u52A1\u300D\u770B\u8868\u59FF\u6001\u5E76\u4E3E\u724C\u300C\u8FDB\u5165\u957F\u4EFB\u52A1\u300D",
  "settings.tip.paceLoafStartMin": "\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1\u4E14\u9759\u9ED8\u8FBE\u5230\u8BE5\u5206\u949F\u6570\uFF0C\u5F00\u59CB\u6478\u9C7C\u8BA1\u65F6\u5E76\u5728\u4E3E\u724C\u63D0\u793A\u540E\u8FDB\u5165\u56DB\u9636\u9012\u8FDB\uFF08\u8868\u76D8\u8BFB\u6570\u4E0E\u6863\u4F4D\u540D\u9010\u6B65\u53D8\u5316\uFF09",
  "settings.tip.usageEnabled": "\u7528\u91CF\u7EDF\u8BA1\uFF1A\u8FF7\u4F60\u6761/\u9ED1\u677F/\u770B\u677F\u5C55\u793A token \u4E94\u53E3\u5F84\u4E0E\u6A21\u578B\u5206\u5E03\uFF1B\u5173\u95ED\u540E\u5168\u90E8\u7528\u91CF\u754C\u9762\u9690\u85CF\u3002",
  "settings.tip.dayLimitTokens": "\u5355\u65E5\u6D88\u8017 token \u8FBE\u5230\u8BE5\u503C\u7684 80% \u4E3E\u724C\u63D0\u9192\u3001100% \u518D\u4E3E\u4E00\u6B21\uFF1B0=\u5173\u95ED\u3002",
  "settings.tip.milestoneUnit": "\u7D2F\u8BA1 token \u6BCF\u8DE8\u8FC7\u8BE5\u6B65\u957F\u7684\u6574\u6570\u5173\u53E3\uFF08\u5982\u6BCF 100 \u4E07\uFF09\u6C14\u6CE1\u64AD\u62A5\u4E00\u6B21\u91CC\u7A0B\u7891\uFF1B0=\u5173\u95ED\u3002",
  "settings.tip.summaryEnabled": "\u5DE5\u4F5C\u603B\u7ED3\uFF1A\u4EFB\u52A1\u5B8C\u6210\u540E\u5BA0\u7269\u65C1\u51FA\u73B0\u300C\u{1F4D6} \u603B\u7ED3\u300D\u9650\u65F6\u5165\u53E3\uFF0C\u70B9\u5F00\u5C0F\u9ED1\u677F\u67E5\u770B\u672C\u8F6E\u6458\u8981\uFF08\u9ED1\u677F\u5185\u5BB9\u4E3A\u7EAF\u6587\u5B57\u660E\u7EC6\uFF09\u3002",
  "settings.tip.summaryEntrySec": "\u300C\u{1F4D6} \u603B\u7ED3\u300D\u5165\u53E3\u51FA\u73B0\u540E\u4FDD\u7559\u7684\u79D2\u6570\uFF0C\u8D85\u65F6\u81EA\u52A8\u6D88\u5931\u3002",
  "settings.tip.boardTtlSec": "\u5C0F\u9ED1\u677F\u6253\u5F00\u540E\u505C\u7559\u7684\u79D2\u6570\uFF0C\u8D85\u65F6\u81EA\u52A8\u5173\u95ED\uFF08\u2715/\u70B9\u5916\u90E8/ESC \u4E5F\u53EF\u624B\u52A8\u5173\u95ED\uFF09\u3002",
  "settings.tip.ttsEnabled": "TTS \u6717\u8BFB\uFF1A\u7528\u7CFB\u7EDF\u8BED\u97F3\u6717\u8BFB\u5BA0\u7269\u53F0\u8BCD\uFF08\u770B\u677F\u8B66\u62A5\u4E0D\u4F7F\u7528 TTS\uFF0C\u8D70\u8BED\u97F3\u7EC4\u6216\u63D0\u793A\u97F3\uFF09\u3002",
  "settings.tip.dashboardSidebarEntry": "\u5F00\u542F\u540E\u4FA7\u680F\u51FA\u73B0\u300C\u7528\u91CF\u770B\u677F\u300D\u56FE\u6807\u5165\u53E3\uFF1B\u9ED8\u8BA4\u5173\u95ED\uFF08\u53EF\u7528\u53F3\u952E\u83DC\u5355\u6216\u9ED1\u677F\u94FE\u8FDB\u5165\u770B\u677F\uFF09\u3002",
  "settings.tip.exportPose": "\u5BFC\u51FA\u56FE\u7247\u4E2D\u5BA0\u7269\u7ACB\u7ED8\u7684\u59FF\u6001\uFF1A\u968F\u673A\u62BD\u53D6\u4E00\u4E2A\u52A8\u4F5C\uFF0C\u6216\u56FA\u5B9A\u4E3A\u6307\u5B9A\u52A8\u4F5C\u3002",
  "dash.cfg.dashboardSidebarEntry": "\u4FA7\u680F\u770B\u677F\u5165\u53E3",
  "dash.cfg.exportPose": "\u5BFC\u51FA\u59FF\u6001",
  "dash.pose.random": "\u968F\u673A",
  "dash.pose.idle": "\u5F85\u673A",
  "dash.pose.run-right": "\u5411\u53F3\u8DD1",
  "dash.pose.run-left": "\u5411\u5DE6\u8DD1",
  "dash.pose.waving": "\u6325\u624B",
  "dash.pose.jumping": "\u8DF3\u8DC3",
  "dash.pose.failed": "\u59D4\u5C48",
  "dash.pose.waiting": "\u7B49\u5F85",
  "dash.pose.running": "\u5DE5\u4F5C",
  "dash.pose.review": "\u5BA1\u67E5",
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
  "rpc.zip-total-over-limit": "\u538B\u7F29\u5305\u89E3\u538B\u603B\u91CF\u8D85\u9650\uFF08>{limit}\uFF09",
  "rpc.bad-request": "\u8BF7\u6C42\u53C2\u6570\u65E0\u6548",
  "rpc.capability-unavailable": "\u6B64\u5BBF\u4E3B\u672A\u63D0\u4F9B\u5DF2\u9A8C\u8BC1\u7684\u65B0\u770B\u677F\u80FD\u529B\uFF0C\u5DF2\u4FDD\u7559\u65E7\u89C6\u56FE",
  "rpc.owner-required": "\u65B0\u63A5\u53E3\u9700\u8981\u5BBF\u4E3B\u9A8C\u8BC1\u7684 owner \u6388\u6743",
  "rpc.revision-conflict": "\u6570\u636E\u7A97\u53E3\u6216\u89C4\u5219\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5",
  "rpc.pricing-rules-invalid": "\u8BA1\u4EF7\u89C4\u5219\u65E0\u6548\uFF0C\u8BF7\u68C0\u67E5\u6A21\u578B\u3001\u4EF7\u683C\u7CBE\u5EA6\u548C\u9AD8\u5CF0\u7A97\u53E3",
  "rpc.pricing-store-corrupt": "\u8BA1\u4EF7\u89C4\u5219\u6587\u4EF6\u635F\u574F\uFF0C\u539F\u6587\u4EF6\u672A\u88AB\u8986\u76D6",
  "rpc.pricing-store-read-failed": "\u8BA1\u4EF7\u89C4\u5219\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25",
  "rpc.pricing-store-write-failed": "\u8BA1\u4EF7\u89C4\u5219\u4FDD\u5B58\u5931\u8D25\uFF0C\u8349\u7A3F\u4ECD\u4FDD\u7559",
  // ---- DSH native usage / API-equivalent cost / output speed ----
  "dash2.usageTab": "Token \u7528\u91CF",
  "dash2.range.5h": "\u8FD1 5 \u5C0F\u65F6",
  "dash2.range.today": "\u4ECA\u5929",
  "dash2.range.7d": "\u8FD1 7 \u5929",
  "dash2.range.30d": "\u8FD1 30 \u5929",
  "dash2.range.custom": "\u81EA\u5B9A\u4E49",
  "dash2.from": "\u5F00\u59CB\u65E5\u671F",
  "dash2.to": "\u7ED3\u675F\u65E5\u671F",
  "dash2.overview": "Token \u603B\u89C8",
  "dash2.distribution": "\u7528\u91CF\u5206\u5E03",
  "dash2.byProvider": "\u6309\u4F9B\u5E94\u5546",
  "dash2.byModel": "\u6309\u6A21\u578B",
  "dash2.trendFilter": "\u4EC5\u7B5B\u9009\u8D8B\u52BF",
  "dash2.allRoutes": "\u5168\u90E8\u4F9B\u5E94\u5546 / \u6A21\u578B",
  "dash2.unknown": "\u672A\u77E5",
  "dash2.workActivity": "\u5DE5\u4F5C\u6D3B\u52A8",
  "dash2.tokens": "Token",
  "dash2.activitySessions": "\u6709\u8BB0\u5F55\u7684\u4F1A\u8BDD",
  "dash2.costCsv": "\u8D39\u7528 CSV",
  "dash2.estimateNotice": "\u8D39\u7528\u4EC5\u4E3A API \u7B49\u6548\u4F30\u4EF7\uFF0C\u4E0D\u662F\u8D26\u5355\uFF1B\u539F\u6709\u6587\u672C\u548C\u5206\u4EAB\u56FE\u4ECD\u53EA\u542B Token \u6570\u636E\u3002",
  "dash2.queryFailed": "\u7528\u91CF\u7A97\u53E3\u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
  "dash2.copyFailed": "\u590D\u5236\u5931\u8D25",
  "dash2.unobserved": "\u4EE5\u4E0B\u6876\u5728\u90E8\u5206\u8BB0\u5F55\u4E2D\u672A\u89C2\u6D4B\uFF0C\u6C47\u603B\u4E3A\u5DF2\u89C2\u6D4B\u5C0F\u8BA1\u800C\u975E\u8865\u96F6\uFF1A{buckets}",
  "dash2.coverage.ready": "\u5DF2\u679A\u4E3E\u8BB0\u5F55\u8BFB\u53D6\u5B8C\u6210",
  "dash2.coverage.loading": "\u5386\u53F2\u4F1A\u8BDD\u4ECD\u5728\u8BFB\u53D6\uFF0C\u5F53\u524D\u7ED3\u679C\u4E0D\u662F\u5168\u91CF",
  "dash2.coverage.limited": "\u90E8\u5206\u5386\u53F2\u4E0D\u53EF\u8BFB\uFF0C\u5F53\u524D\u7ED3\u679C\u4EC5\u8986\u76D6\u5DF2\u786E\u8BA4\u8BB0\u5F55",
  "cost.title": "API \u7B49\u6548\u8D39\u7528",
  "cost.disclaimer": "\u6309\u53C2\u8003\u4EF7\u6216\u624B\u52A8\u5355\u4EF7\u4F30\u7B97\uFF0C\u4E0D\u662F\u5B9E\u9645\u8D26\u5355\u3001\u652F\u4ED8\u91D1\u989D\u6216\u8BA2\u9605\u989D\u5EA6\uFF1B\u7F3A\u4EF7\u663E\u793A \u2014\uFF0C\u4E0D\u89C6\u4E3A\u514D\u8D39\u3002",
  "cost.manage": "\u7BA1\u7406\u8BA1\u4EF7",
  "cost.sync": "\u540C\u6B65\u516C\u5F00\u4EF7\u76EE",
  "cost.syncing": "\u540C\u6B65\u4E2D\u2026",
  "cost.lastGood": "\u540C\u6B65\u5931\u8D25\uFF0C\u6CBF\u7528\u6700\u540E\u6709\u6548\u5FEB\u7167\uFF1A{date}",
  "cost.byProvider": "\u6309\u4F9B\u5E94\u5546\u5206\u7EC4",
  "cost.byModel": "\u6309\u6A21\u578B\u5E73\u94FA",
  "cost.route": "\u4F9B\u5E94\u5546 / \u6A21\u578B",
  "cost.estimate": "\u4F30\u4EF7",
  "cost.tokens": "\u603B Token",
  "cost.hit": "\u7F13\u5B58\u547D\u4E2D\u7387",
  "cost.details": "\u8BA1\u8D39\u8BE6\u60C5",
  "cost.status.priced": "\u5DF2\u5B8C\u6574\u8BA1\u4EF7",
  "cost.status.partial": "\u4EC5\u8986\u76D6\u5DF2\u8BA1\u4EF7\u90E8\u5206",
  "cost.status.unpriced": "\u672A\u4F30\u4EF7",
  "cost.coverage": "\u8BA1\u4EF7\u8986\u76D6\u7387",
  "cost.pricedTokens": "\u5DF2\u8BA1\u4EF7 Token",
  "cost.unpricedTokens": "\u672A\u8BA1\u4EF7 Token",
  "cost.basis": "\u4EF7\u683C\u6765\u6E90",
  "cost.basis.manual": "\u624B\u52A8\u4EF7",
  "cost.basis.catalog": "\u516C\u5F00\u76EE\u5F55",
  "cost.basis.mixed": "\u624B\u52A8 + \u76EE\u5F55",
  "cost.basis.none": "\u65E0\u53EF\u7528\u4EF7",
  "cost.rule": "\u4EF7\u683C\u89C4\u5219",
  "cost.rule.none": "\u65E0\u624B\u52A8\u89C4\u5219",
  "cost.rule.fixed": "\u56FA\u5B9A\u4EF7",
  "cost.rule.time": "\u5206\u65F6\u4EF7",
  "cost.dailyFallback": "\u65F6\u6BB5\u4E0D\u53EF\u8FA8\uFF0C\u6309\u4F4E\u8C37\u4EF7\u4F30\u7B97",
  "cost.converted": "\u7ECF\u6C47\u7387\u6362\u7B97",
  "cost.bucket.inputTokens": "\u672A\u7F13\u5B58\u8F93\u5165",
  "cost.bucket.cacheReadTokens": "\u7F13\u5B58\u8BFB",
  "cost.bucket.cacheWriteTokens": "\u7F13\u5B58\u5199",
  "cost.bucket.outputTokens": "\u8F93\u51FA",
  "cost.showAll": "\u5C55\u5F00\u5168\u90E8 {count} \u884C",
  "cost.showLess": "\u53EA\u663E\u793A\u524D 5 \u884C",
  "cost.ruleHelp": "\u5355\u4EF7\u5747\u4E3A\u6BCF\u767E\u4E07 Token\u3002\u7A7A\u5B57\u6BB5\u56DE\u9000\u5230\u53EF\u786E\u5B9A\u7684\u76EE\u5F55\u4EF7\uFF1B\u660E\u786E\u8F93\u5165 0 \u624D\u4EE3\u8868\u96F6\u4EF7\u3002\u9650\u5B9A\u4F9B\u5E94\u5546\u7684\u89C4\u5219\u4F18\u5148\u4E8E\u540C\u6A21\u578B\u5168\u5C40\u89C4\u5219\u3002",
  "cost.ruleN": "\u89C4\u5219 {n}",
  "cost.model": "\u5F52\u4E00\u5316\u6A21\u578B\u6807\u8BC6",
  "cost.providerOptional": "\u539F\u59CB\u4F9B\u5E94\u5546\uFF08\u7559\u7A7A = \u4E3B\u52A8\u5168\u5C40\u5E94\u7528\u4E8E\u6B64\u6A21\u578B\uFF09",
  "cost.currency": "\u5E01\u79CD",
  "cost.kind": "\u89C4\u5219\u7C7B\u578B",
  "cost.fixed": "\u56FA\u5B9A\u4EF7",
  "cost.time": "\u5206\u65F6\u4EF7",
  "cost.fixedPrices": "\u56FA\u5B9A\u56DB\u6876\u5355\u4EF7",
  "cost.zone": "\u9AD8\u5CF0\u65F6\u533A",
  "cost.zone.local": "\u5BBF\u4E3B\u672C\u5730",
  "cost.zone.asiaShanghai": "\u4E0A\u6D77",
  "cost.windows": "\u5DE5\u4F5C\u65E5\u9AD8\u5CF0\u6574\u70B9\u7A97\u53E3 [\u8D77\u70B9, \u7EC8\u70B9)\uFF0C\u652F\u6301\u8DE8\u5348\u591C",
  "cost.windowStart": "\u9AD8\u5CF0\u8D77\u70B9",
  "cost.windowEnd": "\u9AD8\u5CF0\u7EC8\u70B9",
  "cost.peakPrices": "\u9AD8\u5CF0\u56DB\u6876\u5355\u4EF7",
  "cost.offpeakPrices": "\u4F4E\u8C37\u56DB\u6876\u5355\u4EF7",
  "cost.removeRule": "\u5220\u9664\u89C4\u5219",
  "cost.addRule": "\u65B0\u589E\u89C4\u5219",
  "cost.save": "\u4FDD\u5B58\u89C4\u5219",
  "cost.saving": "\u4FDD\u5B58\u4E2D\u2026",
  "cost.saveSummary": "\u4FDD\u5B58\u5C06\u6821\u9A8C\u5168\u90E8\u89C4\u5219\uFF0C\u5E76\u4F7F\u7528\u4FEE\u8BA2\u53F7 {revision} \u9632\u6B62\u5E76\u53D1\u8986\u76D6\u3002",
  "speed.tab": "\u8F93\u51FA\u901F\u5EA6",
  "speed.range.15m": "15 \u5206\u949F",
  "speed.range.1h": "1 \u5C0F\u65F6",
  "speed.range.5h": "5 \u5C0F\u65F6",
  "speed.range.24h": "24 \u5C0F\u65F6",
  "speed.current": "\u672C\u4F1A\u8BDD\u8F93\u51FA\u901F\u5EA6",
  "speed.currentNotice": "DSH \u539F\u751F\u7D2F\u8BA1\u6295\u5F71\uFF0C\u4E0D\u53D7\u5386\u53F2\u8303\u56F4\u5F71\u54CD",
  "speed.noSession": "\u65E0\u5F53\u524D\u4F1A\u8BDD",
  "speed.search": "\u641C\u7D22\u4F9B\u5E94\u5546 / \u6A21\u578B",
  "speed.provider": "\u4F9B\u5E94\u5546\u7B5B\u9009",
  "speed.allProviders": "\u5168\u90E8\u4F9B\u5E94\u5546",
  "speed.sort": "\u6392\u5E8F",
  "speed.sortName": "\u6309\u540D\u79F0",
  "speed.sortSpeed": "\u6309\u901F\u5EA6",
  "speed.sortSessions": "\u6309\u4F1A\u8BDD\u6570",
  "speed.retry": "\u91CD\u8BD5",
  "speed.combinations": "\u4F9B\u5E94\u5546 / \u6A21\u578B\u7EC4\u5408",
  "speed.sessionCount": "{n} \u4E2A\u6709\u6837\u672C\u4F1A\u8BDD",
  "speed.noSelection": "\u8BF7\u9009\u62E9\u7EC4\u5408",
  "speed.clearPin": "\u8FD4\u56DE\u533A\u95F4\u6C47\u603B",
  "speed.streamingTps": "\u6D41\u5F0F TPS",
  "speed.ttft": "\u5E73\u5747\u9996 Token \u7B49\u5F85",
  "speed.modelTime": "\u7D2F\u8BA1\u6A21\u578B\u7528\u65F6",
  "speed.toolTime": "\u53EF\u5F52\u5C5E\u5DE5\u5177\u7528\u65F6",
  "speed.loading": "\u6B63\u5728\u8BFB\u53D6\u901F\u5EA6\u2026",
  "speed.historyLoading": "\u5386\u53F2\u672A\u8BFB\u5B8C\uFF0C\u5F53\u524D\u66F2\u7EBF\u4E0D\u662F\u5168\u91CF",
  "speed.historyLimited": "\u4EC5\u663E\u793A\u53EF\u8BFB\u53D6\u7684\u4F1A\u8BDD\u8BB0\u5F55",
  "speed.unsupported": "\u6B64\u5BBF\u4E3B\u7F3A\u5C11\u539F\u751F\u6D41\u5F0F\u6D4B\u901F\u6570\u636E",
  "speed.noData": "\u6B64\u8303\u56F4\u65E0\u8BB0\u5F55",
  "speed.noMatches": "\u6CA1\u6709\u5339\u914D\u7684\u7EC4\u5408",
  "speed.clearFilters": "\u6E05\u9664\u7B5B\u9009",
  "speed.emptyRange": "\u6B64\u8303\u56F4\u6CA1\u6709\u7B26\u5408\u4E25\u683C\u51C6\u5165\u7684\u901F\u5EA6\u6837\u672C\uFF1B\u7A7A\u6876\u4E0D\u4F1A\u586B\u96F6",
  "speed.chartLabel": "\u6240\u9009\u7EC4\u5408\u7684\u539F\u751F\u6D41\u5F0F\u8F93\u51FA\u901F\u5EA6\u5386\u53F2",
  "speed.noSamples": "\u65E0\u6837\u672C",
  "speed.samples": "{n} \u4E2A\u901F\u5EA6\u6837\u672C",
  "speed.partial": "\u8FB9\u7F18\u88C1\u526A\u6876",
  "speed.table": "\u67E5\u770B\u56FE\u8868\u6570\u636E\u8868",
  "speed.bucket": "\u6876\u8D77\u6B62"
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
  "settings.scale": "Pet size",
  "settings.dblAction": "Double-click action",
  "settings.approvalAction": "Red light action",
  "settings.runningAction": "Yellow light action",
  "settings.errorAction": "Dark-red light action",
  "settings.doneAction": "Green light action",
  // ---- Efficiency dashboard (five-caliber nouns are behavioral invariants) ----
  "dash.today": "Today",
  "dash.requestInput": "Request input",
  "dash.hit": "Hit rate",
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
  "dash.caliber": "Token-only \xB7 includes subagents \xB7 local aggregation",
  // Settings card 12-key labels (Task 9; v1.4.0 row-label semantics)
  "dash.cfg.paceEnabled": "Pace tiers",
  "dash.cfg.usageEnabled": "Usage stats",
  "dash.cfg.summaryEnabled": "Work summary",
  "dash.cfg.ttsEnabled": "TTS speech",
  "dash.cfg.dayLimitTokens": "Daily token limit (0=off)",
  "dash.cfg.milestoneUnit": "Milestone step (0=off)",
  "dash.cfg.paceIntenseEvents": "Intense events / 5min",
  "dash.cfg.paceLongrunMin": "Longrun silence (min)",
  "dash.cfg.paceLoafStartMin": "Loaf start (min)",
  "dash.cfg.approvalFlickerMin": "Approval flicker (min, 0=off)",
  "dash.cfg.summaryEntrySec": "Summary entry (sec)",
  "dash.cfg.boardTtlSec": "Board stay (sec)",
  "dash.noActive": "No active sessions",
  // Title flicker (Task 8; out-of-page recall while approvalFlickerMin > 0 and page hidden)
  "dash.flickerTitle": "\u{1F98A} Approval waiting\u2026",
  // Alert sign/bubble (Task 9 R10: composed client-side from kind+reached, {v}=fmtTokens(reached))
  "dash.alert.dayWarn": "Daily tokens 80% used \xB7 {v}",
  "dash.alert.dayHit": "Daily token threshold reached \xB7 {v}",
  "dash.alert.milestone": "Milestone: {v} tokens total",
  // Dial tiers (zh byte-exact vs host PACE_LABELS; client looks up label by pace.tier)
  "dash.pace.longrun": "Long task \u2014 I'm keeping watch",
  "dash.pace.loaf": "Clocking out for a break",
  "dash.pace.backToWork": "Back to work!",
  "dash.tier.intense": "Intense",
  "dash.tier.active": "Active",
  "dash.tier.longrun": "Long task",
  "dash.tier.idle": "Idle",
  "dash.tier.loaf1": "Loafing\xB7Resting",
  "dash.tier.loaf2": "Loafing\xB7Lying flat",
  "dash.tier.loaf3": "Loafing\xB7Salted fish",
  "dash.tier.loaf4": "Loafing\xB7Dried fish",
  // Mini bar status counts (v1.4.0 short words) + the "requests" noun of the session row
  "dash.countApproval": "to approve",
  "dash.countRunning": "running",
  "dash.countDone": "done",
  "dash.request": "Requests",
  // Mini bar drill-down button (Task 10 R6: the only clickable element, "Details »", opens the board)
  "dash.detail": "Details",
  // Board extra rows (Task 11 R4/R10): 7-day sparkline label / model Top3 row / rest count / open-panel entry row
  "dash.trend7": "7d",
  "dash.models": "Models",
  "dash.moreN": "+{n}",
  "dash.openPanel": "Open full dashboard",
  // ---- Board rows (Task 7; client-side composition from structured summary fields) ----
  "dash.boardSessions": "Sessions",
  "dash.boardTurns": "turns",
  "dash.boardErrors": "errors",
  "dash.boardTodayToken": "Today's tokens",
  // Hit segment includes the closing paren and the following "·" separator (zh mirrors host tokensText byte-exact)
  "dash.boardHitPct": " ({inner}) \xB7",
  "dash.boardToolsTop": "Top 3 tools",
  "dash.boardLongest": "Longest turn",
  // Tool duration paren (entry-final, entries joined by " · ")
  "dash.boardToolDur": " ({inner})",
  "dash.toolTotal": "total",
  "dash.durMin": "min",
  "dash.durSec": "s",
  "dash.durMs": "ms",
  "dash.noSessions": "No sessions",
  // ---- Task 12 L3 dashboard (R5/R9) ----
  "dash.panelTitle": "Usage dashboard",
  "dash.tab.5h": "5h",
  "dash.tab.7d": "7d",
  "dash.tab.30d": "30d",
  "dash.tab.custom": "Custom",
  "dash.heroTotal": "{range} token total",
  "dash.hitCompare": "Hit rate {a} (previous period {b} \xB7 {d})",
  "dash.hitCur": "Hit rate {a}",
  "dash.trendTitle": "Usage trend",
  "dash.loading": "Loading\u2026",
  "dash.peak": "Peak {v}",
  "dash.tools": "Tools",
  "dash.noData": "No data",
  "dash.rangeClamp": "Clamped to last 31 days",
  // Five-caliber grid labels (R5 noun order; "(est.)"/"incl. subagents" suffixes reuse v2.1 keys)
  "dash.g.userEst": "User input",
  "dash.g.uncachedInput": "Uncached input",
  "dash.g.cacheWrite": "Cache write",
  "dash.g.output": "Output",
  "dash.g.requestTotal": "Request input (cumulative)",
  "dash.g.cacheRead": "Cache hit",
  "dash.g.hitPct": "Hit rate",
  "dash.g.requests": "Requests",
  "dash.g.asOf": "Data as of",
  // 2x2 tools grid labels (source follows view: 5h/7d -> snapshot usage.tools; 30d/custom -> range.tools)
  "dash.g.toolCalls": "Total calls",
  "dash.g.toolAvg": "Avg time",
  "dash.g.toolTopCount": "Top tool calls",
  "dash.g.toolTopDur": "Top tool time",
  // ---- Task 14 R8 export (header buttons + copy ack; settings card 3 keys; pose dropdown random+ANIM keys) ----
  "dash.export.copyText": "Copy text",
  "dash.export.exportImage": "Export image",
  "dash.export.exportCustom": "Export with custom quote",
  "dash.export.quotePlaceholder": "Custom quote; supports {range} {tokens} {hitPct} {models}",
  "dash.export.export": "Export",
  "dash.export.copied": "Copied",
  // v2.2.1 settings sections + per-item info tooltips
  "settings.sect.base": "Basics",
  "settings.sect.core": "Core \xB7 Work status",
  "settings.sect.voice": "Expression & helpers",
  "settings.sect.usage": "Usage stats & dashboard",
  "settings.tip.muted": "When on, the pet plays voices/sounds; off = fully muted (animations and subtitles still play).",
  "settings.tip.talkative": "Subtitles: show speech bubbles when the pet talks; off = sound only, no subtitles.",
  "settings.tip.gravity": "Physics: the pet obeys gravity \u2014 drag and toss it around; off = stays where dropped.",
  "settings.tip.scale": "Scales the sprite, status cards, menu and mini bar together: small 0.75\xD7 / medium 1\xD7 / large 1.25\xD7.",
  "settings.tip.dblAction": "Animation played when you double-click the pet (e.g. waving hello).",
  "settings.tip.approvalAction": "Animation when an approval request appears (red light) \u2014 nudges you to confirm.",
  "settings.tip.runningAction": "Animation when a session starts running (yellow light).",
  "settings.tip.doneAction": "Animation when a task completes (green light).",
  "settings.tip.errorAction": "Animation when a session fails (dark red \u26A0).",
  "settings.tip.approvalFlickerMin": 'After an approval waits this many minutes while the page is hidden, the tab title alternates with "\u{1F98A} approval waiting\u2026" to call you back; 0=off.',
  "settings.tip.paceEnabled": "Pace tiers: reflect your working rhythm via the mini-bar dial (gauge + tier name) and crossing placards; the sprite only switches to a watch-checking pose in the long-run tier (works for v1/v2 sheets), with no new expressions.",
  "settings.tip.paceIntenseEvents": "Total events in the last 5 minutes reaching this count shows an intense full-gauge on the dial (busy tier); higher = harder to trigger.",
  "settings.tip.paceLongrunMin": 'A turn started but silent for this many minutes switches to the long-run watch pose and raises a "long task" placard.',
  "settings.tip.paceLoafStartMin": "No running task and silent for this many minutes starts the loaf timer \u2014 after a placard heads into the four stages (dial gauge and tier name change step by step).",
  "settings.tip.usageEnabled": "Usage stats: token metrics and model distribution on the mini bar / blackboard / dashboard; off hides all usage UI.",
  "settings.tip.dayLimitTokens": "At 80% and 100% of this daily token value the pet raises a placard; 0=off.",
  "settings.tip.milestoneUnit": "Each time cumulative tokens cross this step (e.g. every 1M), a milestone bubble plays; 0=off.",
  "settings.tip.summaryEnabled": 'Work summary: after a task completes a "\u{1F4D6} Summary" entry appears by the pet, opening the blackboard digest.',
  "settings.tip.summaryEntrySec": 'How long the "\u{1F4D6} Summary" entry stays before auto-dismissing.',
  "settings.tip.boardTtlSec": "How long the blackboard stays open before auto-closing (\u2715 / outside click / ESC also close it).",
  "settings.tip.ttsEnabled": "TTS: read pet lines with the system voice (dashboard alerts do not use TTS \u2014 voice group or chime instead).",
  "settings.tip.dashboardSidebarEntry": "Show a dashboard icon in the sidebar; off by default (right-click menu and the blackboard chain still reach it).",
  "settings.tip.exportPose": "Pet pose in exported images: a random animation frame, or a fixed one.",
  "dash.cfg.dashboardSidebarEntry": "Sidebar dashboard entry",
  "dash.cfg.exportPose": "Export pose",
  "dash.pose.random": "Random",
  "dash.pose.idle": "Idle",
  "dash.pose.run-right": "Run right",
  "dash.pose.run-left": "Run left",
  "dash.pose.waving": "Wave",
  "dash.pose.jumping": "Jump",
  "dash.pose.failed": "Sulk",
  "dash.pose.waiting": "Wait",
  "dash.pose.running": "Work",
  "dash.pose.review": "Review",
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
  "rpc.zip-total-over-limit": "Zip total size over limit (>{limit})",
  "rpc.bad-request": "Invalid request parameters",
  "rpc.capability-unavailable": "Verified extended dashboard capabilities are unavailable; the legacy view is preserved",
  "rpc.owner-required": "The new API requires host-verified owner authorization",
  "rpc.revision-conflict": "The data window or rule revision changed; refresh and retry",
  "rpc.pricing-rules-invalid": "Invalid pricing rules; check models, decimal precision, and peak windows",
  "rpc.pricing-store-corrupt": "The pricing rule file is corrupt; it was not overwritten",
  "rpc.pricing-store-read-failed": "Could not read the pricing rule file",
  "rpc.pricing-store-write-failed": "Could not save pricing rules; your draft is preserved",
  "dash2.usageTab": "Token usage",
  "dash2.range.5h": "Last 5 hours",
  "dash2.range.today": "Today",
  "dash2.range.7d": "Last 7 days",
  "dash2.range.30d": "Last 30 days",
  "dash2.range.custom": "Custom",
  "dash2.from": "From date",
  "dash2.to": "To date",
  "dash2.overview": "Token overview",
  "dash2.distribution": "Usage distribution",
  "dash2.byProvider": "By provider",
  "dash2.byModel": "By model",
  "dash2.trendFilter": "Filter trend only",
  "dash2.allRoutes": "All providers / models",
  "dash2.unknown": "Unknown",
  "dash2.workActivity": "Work activity",
  "dash2.tokens": "Tokens",
  "dash2.activitySessions": "Sessions with observed activity",
  "dash2.costCsv": "Cost CSV",
  "dash2.estimateNotice": "Cost is an API-equivalent estimate, not a bill; legacy text and image exports remain Token-only.",
  "dash2.queryFailed": "Could not query this usage window; please retry",
  "dash2.copyFailed": "Copy failed",
  "dash2.unobserved": "These buckets are unobserved in some records; totals are observed subtotals, not zero-filled: {buckets}",
  "dash2.coverage.ready": "All enumerated records have been read",
  "dash2.coverage.loading": "History is still loading; this is not a complete result",
  "dash2.coverage.limited": "Some history is unreadable; only confirmed records are covered",
  "cost.title": "API-equivalent cost",
  "cost.disclaimer": "Estimated from reference or manual prices. Not a bill, payment, or subscription balance; missing prices show \u2014, never free by default.",
  "cost.manage": "Manage pricing",
  "cost.sync": "Sync public prices",
  "cost.syncing": "Syncing\u2026",
  "cost.lastGood": "Sync failed; using last good snapshot: {date}",
  "cost.byProvider": "Group by provider",
  "cost.byModel": "Flat model rows",
  "cost.route": "Provider / model",
  "cost.estimate": "Estimate",
  "cost.tokens": "Total tokens",
  "cost.hit": "Cache hit rate",
  "cost.details": "Pricing details",
  "cost.status.priced": "Fully priced",
  "cost.status.partial": "Priced portion only",
  "cost.status.unpriced": "Unpriced",
  "cost.coverage": "Pricing coverage",
  "cost.pricedTokens": "Priced tokens",
  "cost.unpricedTokens": "Unpriced tokens",
  "cost.basis": "Price basis",
  "cost.basis.manual": "Manual",
  "cost.basis.catalog": "Public catalog",
  "cost.basis.mixed": "Manual + catalog",
  "cost.basis.none": "No price available",
  "cost.rule": "Price rule",
  "cost.rule.none": "No manual rule",
  "cost.rule.fixed": "Fixed",
  "cost.rule.time": "Scheduled",
  "cost.dailyFallback": "Time band unknown; off-peak estimate",
  "cost.converted": "FX converted",
  "cost.bucket.inputTokens": "Uncached input",
  "cost.bucket.cacheReadTokens": "Cache read",
  "cost.bucket.cacheWriteTokens": "Cache write",
  "cost.bucket.outputTokens": "Output",
  "cost.showAll": "Show all {count} rows",
  "cost.showLess": "Show first 5 rows",
  "cost.ruleHelp": "Prices are per million tokens. Empty cells fall back to a verified catalog price; only an explicit 0 means free. Provider-specific rules take precedence over global model rules.",
  "cost.ruleN": "Rule {n}",
  "cost.model": "Normalized model ID",
  "cost.providerOptional": "Observed provider (empty = deliberately global for this model)",
  "cost.currency": "Currency",
  "cost.kind": "Rule kind",
  "cost.fixed": "Fixed",
  "cost.time": "Scheduled",
  "cost.fixedPrices": "Fixed prices for four buckets",
  "cost.zone": "Peak timezone",
  "cost.zone.local": "Host local",
  "cost.zone.asiaShanghai": "Shanghai",
  "cost.windows": "Weekday peak hour windows [start, end), including cross-midnight",
  "cost.windowStart": "Peak start",
  "cost.windowEnd": "Peak end",
  "cost.peakPrices": "Peak prices for four buckets",
  "cost.offpeakPrices": "Off-peak prices for four buckets",
  "cost.removeRule": "Remove rule",
  "cost.addRule": "Add rule",
  "cost.save": "Save rules",
  "cost.saving": "Saving\u2026",
  "cost.saveSummary": "Saving validates all rules and uses revision {revision} to prevent concurrent overwrite.",
  "speed.tab": "Output speed",
  "speed.range.15m": "15 minutes",
  "speed.range.1h": "1 hour",
  "speed.range.5h": "5 hours",
  "speed.range.24h": "24 hours",
  "speed.current": "Current-session output speed",
  "speed.currentNotice": "Native DSH cumulative projection; independent of history range",
  "speed.noSession": "No current session",
  "speed.search": "Search provider / model",
  "speed.provider": "Provider filter",
  "speed.allProviders": "All providers",
  "speed.sort": "Sort",
  "speed.sortName": "By name",
  "speed.sortSpeed": "By speed",
  "speed.sortSessions": "By sampled sessions",
  "speed.retry": "Retry",
  "speed.combinations": "Provider / model combinations",
  "speed.sessionCount": "{n} sampled sessions",
  "speed.noSelection": "Select a combination",
  "speed.clearPin": "Return to range summary",
  "speed.streamingTps": "Streaming TPS",
  "speed.ttft": "Average TTFT",
  "speed.modelTime": "Cumulative model time",
  "speed.toolTime": "Attributable tool time",
  "speed.loading": "Loading speed\u2026",
  "speed.historyLoading": "History is still loading; this curve is incomplete",
  "speed.historyLimited": "Only readable session records are shown",
  "speed.unsupported": "This host lacks native streaming speed data",
  "speed.noData": "No records in this range",
  "speed.noMatches": "No matching combinations",
  "speed.clearFilters": "Clear filters",
  "speed.emptyRange": "No speed samples meet the strict admission rules; empty buckets are never zero-filled",
  "speed.chartLabel": "Native streaming output-speed history for the selected combination",
  "speed.noSamples": "No samples",
  "speed.samples": "{n} speed samples",
  "speed.partial": "Clipped edge bucket",
  "speed.table": "View chart data table",
  "speed.bucket": "Bucket start/end"
};
var DICTS = { zh: ZH, en: EN };
var currentLang = detectLang();
var langListeners = /* @__PURE__ */ new Set();
function setLang(l) {
  if (l === currentLang) return;
  currentLang = l;
  for (const fn of [...langListeners]) fn();
}
function getLang() {
  return currentLang;
}
var langStore = {
  subscribe(fn) {
    langListeners.add(fn);
    return () => {
      langListeners.delete(fn);
    };
  },
  getSnapshot() {
    return currentLang;
  }
};
function adoptLocaleService(svc) {
  const adopt = () => {
    setLang(svc.getSnapshot().active === "zh" ? "zh" : "en");
  };
  adopt();
  return svc.subscribe(adopt);
}
function lookup(lang, key, params) {
  let s = DICTS[lang][key];
  if (s === void 0 && lang !== "zh") s = ZH[key];
  if (s === void 0) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}
function t(key, params) {
  return lookup(currentLang, key, params);
}
function alertText(lang, kind, reached) {
  const key = kind === "day-warn" ? "dash.alert.dayWarn" : kind === "day-hit" ? "dash.alert.dayHit" : "dash.alert.milestone";
  return lookup(lang, key, { v: fmtTokens(reached) });
}

// src/client/PetMenu.tsx
var import_react = require("react");

// src/client/dialogs/host.ts
var listeners3 = /* @__PURE__ */ new Set();
var current = null;
function openDialog(kind, props = {}) {
  current = { kind, props };
  for (const l of [...listeners3]) l(current);
}
function closeDialog() {
  current = null;
  for (const l of [...listeners3]) l(null);
}
function subscribeDialogs(l) {
  listeners3.add(l);
  return () => {
    listeners3.delete(l);
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
var PLUGIN_VERSION = "v2.5.0";
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
  } else if (page === "Sessions") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: () => setPage(null), children: t("menu.back") }),
      props.sessions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", style: { cursor: "default" }, children: t("dash.noSessions") }) : props.sessions.map((p) => {
        const light = lightOf(p);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dyn-pet-menu-item", onClick: () => props.onSessionPick(p), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              className: "dyn-pet-dot",
              style: { display: "inline-block", width: 8, height: 8, marginRight: 8, background: DOT_COLOR[light], boxShadow: `0 0 0 2px ${DOT_HALO[light]}` }
            }
          ),
          p.title || p.id
        ] }, p.id);
      })
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-divider" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: props.onMiniUsage, children: t("dash.menuUsage") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: props.onBoardSummary, children: t("dash.menuSummary") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: props.onOpenDashboard, children: "\u{1F4C8} " + t("dash.panelTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: () => setPage("Sessions"), children: t("dash.menuSessions") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: props.onHide, children: t("menu.hide") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu-item", onClick: () => setPage("About"), children: t("menu.about") })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dyn-pet-menu", "data-testid": "pet-menu", style: { fontSize: Math.round(13 * props.scale) }, children: body });
}

// src/client/Sign.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function Sign(props) {
  const { text: text2, scale } = props;
  const px = (v) => Math.round(v * scale);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      className: "dyn-pet-sign",
      style: { fontSize: px(12), padding: `${px(4)}px ${px(10)}px`, borderRadius: px(6) },
      children: [
        "\u{1F3F7} ",
        text2
      ]
    }
  );
}

// src/client/MiniBar.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var TIER_PCT = {
  intense: 100,
  active: 65,
  longrun: 50,
  idle: 20,
  loaf1: 12,
  loaf2: 8,
  loaf3: 5,
  loaf4: 3
};
function tierBarClass(pace) {
  const t2 = pace?.tier ?? "";
  if (t2 === "intense" || t2 === "active") return "busy";
  if (t2 === "longrun") return "longrun";
  if (t2.startsWith("loaf")) return "loaf";
  return "busy";
}
function tierMoodClass(pace) {
  const t2 = pace?.tier ?? "";
  if (t2 === "longrun") return "mood-longrun";
  if (t2.startsWith("loaf")) return "mood-loaf";
  return "mood-busy";
}
function tierLabel(pace) {
  if (pace && TIER_PCT[pace.tier] !== void 0) return t(`dash.tier.${pace.tier}`);
  return pace && pace.label || "\u2014";
}
function MiniBar(props) {
  const { dash, cards, mode, scale, usageOn } = props;
  const px = (v) => Math.round(v * scale);
  const pace = dash && dash.pace || null;
  const u = dash && dash.usage || null;
  const day = u && u.day || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const reqTotal = u && u.requestTotal !== void 0 ? u.requestTotal : (day.inputTokens || 0) + (day.cacheReadTokens || 0);
  const hit = u && u.cacheHitRate !== void 0 ? u.cacheHitRate : 0;
  const sess = u ? u.session : null;
  const sessReq = sess ? sess.requestTotal !== void 0 ? sess.requestTotal : (sess.inputTokens || 0) + (sess.cacheReadTokens || 0) : null;
  const counts = countsFromDash(dash, cards);
  const countsText = (counts.approval ? counts.approval + " " + t("dash.countApproval") + " \xB7 " : "") + (counts.running ? counts.running + " " + t("dash.countRunning") + " \xB7 " : "") + (counts.done ? counts.done + " " + t("dash.countDone") : "") || t("dash.noActive");
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "div",
    {
      className: "dyn-pet-mini",
      "data-mode": mode,
      style: { width: px(248), padding: `${px(8)}px ${px(10)}px`, borderRadius: px(10), fontSize: px(12) },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dyn-pet-mini-dial", style: { gap: px(8), marginBottom: px(4) }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dyn-pet-mini-bar", style: { height: px(6) }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("i", { className: tierBarClass(pace), style: { width: (pace && TIER_PCT[pace.tier] || 20) + "%" } }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dyn-pet-mini-tier " + tierMoodClass(pace), children: tierLabel(pace) })
        ] }),
        usageOn ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dyn-pet-mini-row", children: t("dash.today") + " " + t("dash.requestInput") + " " + fmtTokens(reqTotal) + " \xB7 " + t("dash.hit") + " " + (hit * 100).toFixed(1) + "%" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dyn-pet-mini-row", children: t("dash.cacheHit") + " " + fmtTokens(day.cacheReadTokens || 0) + " \xB7 " + t("dash.output") + " " + fmtTokens(day.outputTokens || 0) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dyn-pet-mini-row dyn-pet-mini-dim", style: { fontSize: px(11) }, children: t("dash.yourInput") + " ~" + fmtTokens(u ? u.userEst || 0 : 0) + t("dash.estimateSuffix") + " \xB7 " + t("dash.withSubagents") })
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dyn-pet-mini-row", children: countsText }),
        usageOn && sess && sess.title ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dyn-pet-mini-row dyn-pet-mini-dim", style: { fontSize: px(11) }, children: t("dash.sessionReq") + " " + t("dash.request") + " " + (sessReq !== null ? fmtTokens(sessReq) : "\u2014") + " \xB7 " + sess.title }) : null,
        typeof props.sessionTps === "number" && Number.isFinite(props.sessionTps) && props.sessionTps > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dyn-pet-mini-row dyn-pet-mini-dim", style: { fontSize: px(11) }, children: t("speed.current") + " " + props.sessionTps.toFixed(1) + " tok/s" }) : null,
        props.onDetail ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "div",
          {
            className: "dyn-pet-mini-detail",
            onPointerDown: (e) => e.stopPropagation(),
            onClick: (e) => {
              e.stopPropagation();
              props.onDetail();
            },
            children: [
              t("dash.detail"),
              " \xBB"
            ]
          }
        ) : null
      ]
    }
  );
}

// src/client/Board.tsx
var import_react2 = require("react");

// src/client/boardrows.ts
function fmtDur(ms) {
  if (ms >= 6e4) return (ms / 6e4).toFixed(1) + " " + t("dash.durMin");
  if (ms >= 1e3) return (ms / 1e3).toFixed(1) + " " + t("dash.durSec");
  return String(Math.round(ms)) + " " + t("dash.durMs");
}
function fmtLongest(ms) {
  if (ms >= 6e4) return (ms / 6e4).toFixed(1) + " " + t("dash.durMin");
  return String(Math.round(ms / 1e3)) + " " + t("dash.durSec");
}
function toolEntry(r) {
  const base = r.name + "\xD7" + r.count;
  if (!(r.ms > 0)) return base;
  return base + t("dash.boardToolDur", { inner: t("dash.toolTotal") + " " + fmtDur(r.ms) });
}
function boardOverviewLine(s) {
  return t("dash.boardSessions") + " " + s.sessions + " \xB7 " + t("dash.boardTurns") + " " + s.turns + " \xB7 " + t("dash.boardErrors") + " " + s.errors;
}
function boardRows(s) {
  const tk = s.tokens;
  const pct = tk.requestTotal > 0 ? tk.hitPct.toFixed(1) : "0.0";
  const rows = [
    { label: t("dash.g.requestTotal"), value: fmtTokens(tk.requestTotal) },
    { label: t("dash.cacheHit"), value: fmtTokens(tk.cacheRead) + "\uFF08" + pct + "%\uFF09" },
    { label: t("dash.output"), value: fmtTokens(tk.output) },
    { label: t("dash.yourInput") + t("dash.estimateSuffix") + " \xB7 " + t("dash.withSubagents"), value: "~" + fmtTokens(tk.userEst) },
    { label: t("dash.boardToolsTop"), value: s.toolRows.length ? s.toolRows.map(toolEntry).join(" \xB7 ") : "\u2014", entries: s.toolRows.length ? s.toolRows.map(toolEntry) : void 0 },
    { label: t("dash.boardLongest"), value: fmtLongest(s.longest ? s.longest.ms : 0) }
  ];
  return rows;
}

// src/client/TrendChart.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var LINE_GRAD = ["#3BA7FF", "#8D6BFF"];
function lastN(days, n) {
  const src = Array.isArray(days) ? days : [];
  const tail = src.slice(Math.max(0, src.length - n));
  const out = tail.map((d) => {
    const [, m, day] = d.key.split("-");
    return { key: d.key, label: `${Number(m)}/${Number(day)}`, value: d.dayTotal || 0, hitPct: d.hitPct };
  });
  while (out.length < n) out.unshift({ key: "", label: "", value: 0, hitPct: void 0 });
  return out;
}
function pathOf(pts, smooth) {
  if (pts.length === 0) return "";
  const f = (n) => n.toFixed(1);
  if (!smooth || pts.length < 3) return "M " + pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(" L ");
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}
function axisTicks(max, count = 3) {
  const n = Math.max(2, Math.floor(count));
  const top = Number.isFinite(max) && max > 0 ? max : 1;
  const rough = top / (n - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return Array.from({ length: n }, (_, i) => step * i);
}
function TrendChart(props) {
  const { points, width, height } = props;
  if (!points || points.length < 2) return null;
  const axis = axisTicks(Math.max(...points.map((p) => p.value)), 3);
  const max = axis[axis.length - 1];
  const ticks = axisTicks(max, axis.length);
  const axisLabels = ticks.map((v) => fmtTokens(v));
  const gutter = props.showAxis === false ? 0 : Math.max(28, ...axisLabels.map((s) => s.length * 6.2));
  const padL = 6 + gutter, padR = 8, padT = 10, padB = props.showLabels ? 18 : 6;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const pts = points.map((p, i) => ({
    x: padL + innerW * i / (points.length - 1),
    y: padT + innerH * (1 - p.value / max)
  }));
  const line = pathOf(pts, true);
  const baseline = (padT + innerH).toFixed(1);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${baseline} L ${pts[0].x.toFixed(1)} ${baseline} Z`;
  const gid = props.idPrefix ?? "dyn-pet-trend-g";
  const hover = props.hover;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "svg",
    {
      viewBox: `0 0 ${width} ${height}`,
      style: { width: "100%", height: "auto", display: "block" },
      role: "img",
      "aria-label": props.ariaLabel,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("defs", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("linearGradient", { id: `${gid}-l`, x1: "0", y1: "0", x2: width, y2: "0", gradientUnits: "userSpaceOnUse", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("stop", { offset: "0", stopColor: LINE_GRAD[0] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("stop", { offset: "1", stopColor: LINE_GRAD[1] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("linearGradient", { id: `${gid}-a`, x1: "0", y1: padT, x2: "0", y2: padT + innerH, gradientUnits: "userSpaceOnUse", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("stop", { offset: "0", stopColor: LINE_GRAD[0], stopOpacity: "0.22" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("stop", { offset: "1", stopColor: LINE_GRAD[1], stopOpacity: "0.02" })
          ] })
        ] }),
        ticks.map((tick, i) => {
          const y = padT + innerH * (1 - tick / max);
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("g", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: `M ${padL} ${y.toFixed(1)} H ${width - padR}`, fill: "none", stroke: "currentColor", strokeOpacity: i === 0 ? "0.18" : "0.1", strokeWidth: "1" }),
            props.showAxis === false ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("text", { x: padL - 6, y: (y + 3.5).toFixed(1), textAnchor: "end", fontSize: "10", fill: "currentColor", opacity: "0.55", children: axisLabels[i] })
          ] }, tick);
        }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: area, fill: `url(#${gid}-a)` }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: line, fill: "none", stroke: `url(#${gid}-l)`, strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" }),
        pts.map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "circle",
          {
            cx: p.x.toFixed(1),
            cy: p.y.toFixed(1),
            r: hover === i ? 4.2 : i === pts.length - 1 ? 3.6 : 2.6,
            fill: "var(--dsw-bg, #fff)",
            stroke: `url(#${gid}-l)`,
            strokeWidth: hover === i ? 2.4 : 1.6,
            tabIndex: props.onPoint === void 0 ? void 0 : 0,
            role: props.onPoint === void 0 ? void 0 : "button",
            "aria-label": props.onPoint === void 0 ? void 0 : `${points[i].label} ${fmtTokens(points[i].value)}`,
            style: props.onPoint === void 0 ? void 0 : { cursor: "pointer", outline: "none" },
            onPointerEnter: props.onPoint === void 0 ? void 0 : () => props.onPoint(i),
            onFocus: props.onPoint === void 0 ? void 0 : () => props.onPoint(i),
            onClick: props.onPoint === void 0 ? void 0 : () => props.onPoint(i)
          },
          i
        )),
        props.showLabels ? points.map((p, i) => ({ p, i })).filter(({ p, i }) => {
          const n = points.length;
          if (n <= 14) return true;
          const stride = Math.ceil(n / 12);
          if (i === 0 || i === n - 1) return true;
          if (p.label.endsWith("\u6708")) return true;
          return i % stride === 0;
        }).map(({ p, i }) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("text", { x: pts[i].x.toFixed(1), y: height - 4, textAnchor: i === 0 ? "start" : i === points.length - 1 ? "end" : "middle", fontSize: "11", fill: "currentColor", opacity: "0.6", children: p.label }, i)) : null
      ]
    }
  );
}

// src/client/Board.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function Board(props) {
  const s = props.dash && props.dash.summary || null;
  if (!s) return null;
  const u = props.dash && props.dash.usage || null;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-board" + (props.mode === "farewell" ? " farewell" : ""), children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-board-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: props.mode === "farewell" ? t("dash.farewellTitle") + " \u{1F98A}" : t("dash.summaryTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          className: "dyn-pet-board-x",
          onClick: (e) => {
            e.stopPropagation();
            props.onClose();
          },
          children: "\u2715"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dyn-pet-board-row", children: boardOverviewLine(s) }),
    boardRows(s).map((kv, i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-board-kv" + (kv.entries ? " dyn-pet-board-kv-tools" : ""), children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "k", children: kv.label }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v", children: kv.entries ? kv.entries.map((e2, j) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_react2.Fragment, { children: [
        j > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "sep", children: " \xB7 " }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "entry", children: e2 })
      ] }, j)) : kv.value })
    ] }, i)),
    u && u.trend && u.trend.days ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-board-row dyn-pet-board-spark", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dyn-pet-board-spark-label", children: t("dash.trend7") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TrendChart, { points: lastN(u.trend.days, 7), width: 270, height: 44 })
    ] }) : null,
    u && Array.isArray(u.models) && u.models.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      u.models.slice(0, 5).map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-board-kv", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "k", children: i === 0 ? t("dash.models") : "" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "v dyn-pet-board-model", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "nm", children: m.route }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "num", children: fmtTokens(m.requestTotal) })
        ] })
      ] }, m.route)),
      u.models.length > 5 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-board-kv", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "k" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "v", children: t("dash.moreN", { n: String(u.models.length - 5) }) })
      ] }) : null
    ] }) : null,
    props.onOpenPanel ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dyn-pet-board-open", onClick: (e) => {
      e.stopPropagation();
      props.onOpenPanel();
    }, children: [
      t("dash.openPanel"),
      " \u2192"
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dyn-pet-board-tray", "aria-hidden": true })
  ] });
}

// src/client/session-speed.ts
var import_react3 = __toESM(require("react"), 1);
var SESSION_SPEED_POLL_MS = 5e3;
var sharedRead = null;
function apiGetSessionSpeed(sessionId) {
  const now = Date.now();
  if (sharedRead?.id === sessionId && now - sharedRead.at < 4500) return sharedRead.promise;
  const promise = apiGet(`/dashboard/session-speed?sessionId=${encodeURIComponent(sessionId)}`);
  sharedRead = { id: sessionId, at: now, promise };
  promise.catch(() => {
    if (sharedRead?.promise === promise) sharedRead = null;
  });
  return promise;
}
function acceptSessionSpeed(currentId, response) {
  if (!currentId || !response || response.sessionId !== currentId || response.status !== "ready") return null;
  return typeof response.tps === "number" && Number.isFinite(response.tps) && response.tps > 0 ? response.tps : null;
}
function browserDocument() {
  return typeof document === "undefined" ? null : document;
}
function createSessionSpeedPoller(options) {
  const read = options.read;
  const onValue = options.onValue;
  const onError = options.onError ?? (() => {
  });
  const intervalMs = options.intervalMs ?? SESSION_SPEED_POLL_MS;
  const scheduleTimeout = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
  const cancelTimeout = options.clearTimeout ?? ((timer2) => clearTimeout(timer2));
  const doc = options.document === void 0 ? browserDocument() : options.document;
  let currentId = null;
  let active = false;
  let generation2 = 0;
  let timer = null;
  let disposed = false;
  let unsupported = false;
  const clearTimer = () => {
    if (timer !== null) cancelTimeout(timer);
    timer = null;
  };
  const canPoll = () => !disposed && !unsupported && active && currentId !== null && !(doc?.hidden ?? false);
  const schedule = (gen) => {
    if (gen !== generation2 || !canPoll()) return;
    timer = scheduleTimeout(() => {
      timer = null;
      if (gen === generation2 && canPoll()) poll(gen);
    }, intervalMs);
  };
  const poll = (gen) => {
    const id = currentId;
    if (id === null || gen !== generation2 || !canPoll()) return;
    let request;
    try {
      request = read(id);
    } catch (error) {
      if (gen === generation2) {
        onError(error);
        schedule(gen);
      }
      return;
    }
    void Promise.resolve(request).then((response) => {
      if (gen !== generation2 || disposed || currentId !== id) return;
      if (response.status === "unsupported") unsupported = true;
      onValue(acceptSessionSpeed(id, response));
    }).catch((error) => {
      if (gen === generation2 && !disposed) {
        const status = error?.status;
        const code = error?.code;
        if (status === 404 || status === 403 || code === "capability-unavailable" || code === "owner-required") {
          unsupported = true;
          onValue(null);
        }
        onError(error);
      }
    }).finally(() => schedule(gen));
  };
  const restart = (clearValue) => {
    generation2 += 1;
    clearTimer();
    if (clearValue) onValue(null);
    if (canPoll()) poll(generation2);
  };
  const onVisibility2 = () => restart(false);
  doc?.addEventListener("visibilitychange", onVisibility2);
  return {
    update(sessionId, nextActive) {
      const id = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
      const next = !!nextActive;
      if (id === currentId && next === active) return;
      if (id !== currentId || !next) unsupported = false;
      currentId = id;
      active = next;
      restart(true);
    },
    refresh() {
      if (canPoll()) restart(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation2 += 1;
      clearTimer();
      doc?.removeEventListener("visibilitychange", onVisibility2);
    }
  };
}
function useSessionSpeed(sessionId, active) {
  const id = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
  const snap = import_react3.default.useSyncExternalStore(appStore.subscribe, appStore.getSnapshot);
  const enabled = active && snap?.diag?.additiveApiCapability === true && snap?.diag?.sessionSpeedCapability === true;
  const [reading, setReading] = import_react3.default.useState({ id: null, tps: null });
  import_react3.default.useEffect(() => {
    setReading({ id, tps: null });
    const poller = createSessionSpeedPoller({
      read: apiGetSessionSpeed,
      onValue: (tps) => setReading({ id, tps }),
      onError: () => setReading({ id, tps: null })
    });
    poller.update(id, enabled);
    return () => poller.dispose();
  }, [id, enabled]);
  return enabled && reading.id === id ? reading.tps : null;
}

// src/client/dashboard-entries.ts
function openDashboardEntry(close) {
  close();
  return openDashboardPanel();
}
function openMiniBarDetail(openBoard) {
  openBoard("manual");
}

// src/client/Pet.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var BOTTOM_MARGIN = 76;
var LOOK_FRAME_MS = 250;
var LOOK_IDLE_MS = 6e3;
var TRANSIENT_WAVE_MS = 1700;
var APPROVAL_THROTTLE_MS = 1e4;
var MINI_HOVER_MS = 500;
var BOARD_W = 310;
var BOARD_GAP = 12;
var BOARD_EDGE = 8;
function Pet(props) {
  const petCtx = props.ctx;
  const currentId = props.useSessions((s) => s && s.current);
  const currentIdRef = (0, import_react4.useRef)(currentId);
  currentIdRef.current = currentId;
  const [cfg, setCfg] = (0, import_react4.useState)(cfgStore.getSnapshot());
  (0, import_react4.useEffect)(() => cfgStore.subscribe(() => setCfg(cfgStore.getSnapshot())), []);
  const cfgRef = (0, import_react4.useRef)(cfg);
  (0, import_react4.useEffect)(() => {
    cfgRef.current = cfg;
  }, [cfg]);
  const [visible2, setVisible] = (0, import_react4.useState)(petStore.visible);
  (0, import_react4.useEffect)(() => petStore.subscribe(() => {
    setVisible(petStore.visible);
    if (petStore.visible === false && cfgRef.current.summaryEnabled) {
      const dash = appStore.getSnapshot()?.dashboard ?? null;
      if (dash && dash.summary) openBoardRef.current("farewell");
    }
  }), []);
  const [snap, setSnap] = (0, import_react4.useState)(appStore.getSnapshot());
  const [runtime, setRuntime] = (0, import_react4.useState)(appStore.getRuntime());
  (0, import_react4.useEffect)(
    () => appStore.subscribe(() => {
      setSnap(appStore.getSnapshot());
      setRuntime(appStore.getRuntime());
    }),
    []
  );
  const runtimeRef = (0, import_react4.useRef)(runtime);
  (0, import_react4.useEffect)(() => {
    runtimeRef.current = runtime;
  }, [runtime]);
  const scale = cfg.scale;
  const px = (0, import_react4.useCallback)((v) => Math.round(v * scale), [scale]);
  const frameW = px(FRAME_W);
  const frameH = px(FRAME_H);
  const bottomMargin = px(BOTTOM_MARGIN);
  const [pos, setPos] = (0, import_react4.useState)(() => {
    const p = loadPosition();
    if (p === null) return null;
    if (Number.isNaN(p.y)) {
      const b = viewportBounds(window.innerWidth, window.innerHeight, FRAME_W, FRAME_H, BOTTOM_MARGIN);
      return clampPos(p.x, b.groundY, FRAME_W, FRAME_H, window.innerWidth, window.innerHeight, BOTTOM_MARGIN);
    }
    return clampPos(p.x, p.y, FRAME_W, FRAME_H, window.innerWidth, window.innerHeight, BOTTOM_MARGIN);
  });
  (0, import_react4.useEffect)(() => {
    setPos((p) => p === null ? null : clampPos(p.x, p.y, frameW, frameH, window.innerWidth, window.innerHeight, bottomMargin));
    const onResize = () => setPos((p) => p === null ? null : clampPos(p.x, p.y, frameW, frameH, window.innerWidth, window.innerHeight, bottomMargin));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [frameW, frameH, bottomMargin]);
  const [anim, setAnim] = (0, import_react4.useState)("idle");
  const [frame, setFrame] = (0, import_react4.useState)(0);
  const [lookFrame, setLookFrame] = (0, import_react4.useState)(-1);
  const animRef = (0, import_react4.useRef)("idle");
  const frameRef = (0, import_react4.useRef)(0);
  const stepTimer = (0, import_react4.useRef)(null);
  const stateRef = (0, import_react4.useRef)({
    drag: null,
    transient: null,
    task: null,
    look: false
  });
  const lookStop = (0, import_react4.useRef)(null);
  const genRef = (0, import_react4.useRef)({ transient: 0, look: 0 });
  const rowsRef = (0, import_react4.useRef)(11);
  (0, import_react4.useEffect)(() => {
    rowsRef.current = runtime.rows;
  }, [runtime.rows]);
  const later = (0, import_react4.useRef)((fn, ms) => {
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
  const playTransient = (0, import_react4.useRef)((key, ms) => {
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
  const scheduleNextLook = (0, import_react4.useRef)(() => {
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
  const [subtitle, setSubtitle] = (0, import_react4.useState)(null);
  const bubbleGen = (0, import_react4.useRef)(0);
  const unlockedRef = (0, import_react4.useRef)(false);
  const showBubble = (text2, ms) => {
    const gen = ++bubbleGen.current;
    setSubtitle(text2);
    later(() => {
      if (bubbleGen.current === gen) setSubtitle(null);
    }, ms);
  };
  const playVoice = (group, action, opts) => {
    if (!loadVisible()) return;
    playTransient(action, TRANSIENT_WAVE_MS);
    if (!runtimeRef.current.hasVoice) return;
    if (opts?.auto === true && !isVoiceOwner()) return;
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
  const playVoiceRef = (0, import_react4.useRef)(playVoice);
  (0, import_react4.useEffect)(() => {
    playVoiceRef.current = playVoice;
  });
  const [sign, setSign] = (0, import_react4.useState)(null);
  const seenAlertsRef = (0, import_react4.useRef)(/* @__PURE__ */ new Set());
  const [entry, setEntry] = (0, import_react4.useState)(false);
  const entryTimerRef = (0, import_react4.useRef)(null);
  const signTimerRef = (0, import_react4.useRef)(null);
  const paceTierRef = (0, import_react4.useRef)(null);
  const [miniMode, setMiniMode] = (0, import_react4.useState)(null);
  const hoverTimerRef = (0, import_react4.useRef)(null);
  const miniLeaveTimerRef = (0, import_react4.useRef)(null);
  const clearHoverTimer = () => {
    if (hoverTimerRef.current) {
      const d = hoverTimerRef.current;
      hoverTimerRef.current = null;
      try {
        d();
      } catch {
      }
    }
  };
  const cancelMiniLeave = () => {
    if (miniLeaveTimerRef.current) {
      const d = miniLeaveTimerRef.current;
      miniLeaveTimerRef.current = null;
      try {
        d();
      } catch {
      }
    }
  };
  const rootRef = (0, import_react4.useRef)(null);
  const [board, setBoard] = (0, import_react4.useState)(null);
  const boardTimerRef = (0, import_react4.useRef)(null);
  const boardRef = (0, import_react4.useRef)(null);
  const openBoardRef = (0, import_react4.useRef)(() => {
  });
  const openBoard = (mode) => {
    if (boardTimerRef.current) {
      const d = boardTimerRef.current;
      boardTimerRef.current = null;
      try {
        d();
      } catch {
      }
    }
    setBoard({ mode });
    boardTimerRef.current = later(() => {
      boardTimerRef.current = null;
      setBoard(null);
    }, (cfgRef.current.boardTtlSec || 15) * 1e3);
  };
  (0, import_react4.useEffect)(() => {
    openBoardRef.current = openBoard;
  });
  const closeBoard = () => {
    if (boardTimerRef.current) {
      const d = boardTimerRef.current;
      boardTimerRef.current = null;
      try {
        d();
      } catch {
      }
    }
    setBoard(null);
  };
  const prevStatusRef = (0, import_react4.useRef)({});
  const lastApprovalAtRef = (0, import_react4.useRef)(0);
  const sinceSeqRef = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => {
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
        playVoiceRef.current("done", cfgRef.current.doneAction, { auto: true });
      }
    }
    if (dash && Array.isArray(dash.alerts)) {
      for (const a of dash.alerts) {
        if (!a || typeof a.id !== "string" || seenAlertsRef.current.has(a.id)) continue;
        seenAlertsRef.current.add(a.id);
        if (!cfgRef.current.usageEnabled) continue;
        const txt = typeof a.reached === "number" ? alertText(getLang(), a.kind, a.reached) : a.text;
        if (a.kind === "milestone") showBubble(txt || a.text, 4200);
        else {
          setSign(txt || a.text);
          if (signTimerRef.current) {
            try {
              signTimerRef.current();
            } catch {
            }
          }
          signTimerRef.current = later(() => setSign(null), 4200);
        }
        playTransient("jumping", 1600);
        if (cfgRef.current.muted) continue;
        if (!isVoiceOwner()) continue;
        if (runtimeRef.current.hasVoice) {
          const v = voicePlayer.pick("general");
          if (v) {
            voicePlayer.play(v, {
              muted: cfgRef.current.muted,
              onSubtitle: a.kind === "milestone" ? (name, ms) => {
                if (!cfgRef.current.muted && cfgRef.current.talkative && runtimeRef.current.hasSubtitle) showBubble(txt || name, ms);
              } : void 0
            });
            continue;
          }
        }
        playDefaultAlertSound();
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
      playVoiceRef.current("error", cfgRef.current.errorAction, { auto: true });
    }
    if (approvalAppeared) {
      const now = Date.now();
      if (now - lastApprovalAtRef.current > APPROVAL_THROTTLE_MS) {
        lastApprovalAtRef.current = now;
        playVoiceRef.current("approval", cfgRef.current.approvalAction, { auto: true });
      }
    }
    if (runningAppeared) {
      playVoiceRef.current("general", cfgRef.current.runningAction, { auto: true });
    }
    const task = taskPoseOf(cards2);
    if (stateRef.current.task !== task) {
      stateRef.current.task = task;
      refreshAnim();
    }
    const tier = dash && dash.pace ? dash.pace.tier : null;
    if (paceTierRef.current !== tier) {
      const prevTier = paceTierRef.current;
      paceTierRef.current = tier;
      refreshAnim();
      const bucket = (t2) => t2 === null ? null : t2 === "longrun" ? "longrun" : t2.startsWith("loaf") ? "loaf" : t2 === "intense" || t2 === "active" ? "work" : "idle";
      const bPrev = bucket(prevTier), bNext = bucket(tier);
      if (prevTier !== null && bPrev !== bNext && tier !== null) {
        const msg = tier === "longrun" ? t("dash.pace.longrun") : bNext === "loaf" ? t("dash.pace.loaf") : bPrev === "loaf" ? t("dash.pace.backToWork") : null;
        if (msg) {
          setSign(msg);
          if (signTimerRef.current) {
            try {
              signTimerRef.current();
            } catch {
            }
          }
          signTimerRef.current = later(() => setSign(null), 4200);
        }
      }
    }
    const active = currentIdRef.current;
    for (const p of cards2) {
      if (p && p.unread && (p.status === "done" || p.status === "error") && p.id === active) ackProject(p.id);
    }
  }, [snap]);
  const dragRef = (0, import_react4.useRef)(null);
  const fallRaf = (0, import_react4.useRef)(0);
  const spriteRef = (0, import_react4.useRef)(null);
  const [dragging, setDragging] = (0, import_react4.useState)(false);
  const busyRef = (0, import_react4.useRef)(false);
  const onPointerDown = (e) => {
    clearHoverTimer();
    if (miniMode !== "manual") setMiniMode(null);
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
    setPos(dragPos(e.clientX, e.clientY, d.dx, d.dy, frameW, frameH, window.innerWidth, window.innerHeight, bottomMargin));
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
  const posRef = (0, import_react4.useRef)(pos);
  (0, import_react4.useEffect)(() => {
    posRef.current = pos;
  }, [pos]);
  const onDoubleClick = (e) => {
    e.stopPropagation();
    playVoiceRef.current("general", cfgRef.current.dblAction);
  };
  const scrollableAncestor = (el) => {
    let n = el;
    while (n && n !== document.body && n !== document.documentElement) {
      const st = window.getComputedStyle(n);
      if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll|overlay/.test(st.overflowY)) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.body;
  };
  const onWheel = (e) => {
    const root = e.currentTarget;
    const prev = root.style.pointerEvents;
    root.style.pointerEvents = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    root.style.pointerEvents = prev || "auto";
    if (!el) return;
    const sc = scrollableAncestor(el);
    if (sc) sc.scrollTop += e.deltaY;
  };
  const [menu, setMenu] = (0, import_react4.useState)(null);
  const [menuPage, setMenuPage] = (0, import_react4.useState)(null);
  const menuRef = (0, import_react4.useRef)(null);
  const previewLoop = (0, import_react4.useRef)(null);
  const stopPreview = (0, import_react4.useCallback)(() => {
    if (previewLoop.current !== null) {
      clearInterval(previewLoop.current);
      previewLoop.current = null;
    }
  }, []);
  const handlePreview = (0, import_react4.useCallback)((action) => {
    if (action) {
      stopPreview();
      playTransient(action, 1600);
      previewLoop.current = window.setInterval(() => playTransient(action, 1600), TRANSIENT_WAVE_MS);
    } else {
      stopPreview();
    }
  }, [playTransient, stopPreview]);
  const closeMenu = (0, import_react4.useCallback)(() => {
    setMenu(null);
    setMenuPage(null);
    stopPreview();
  }, [stopPreview]);
  (0, import_react4.useEffect)(() => {
    if (menu === null || !visible2) return;
    const onDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      closeMenu();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [menu, visible2, closeMenu]);
  (0, import_react4.useEffect)(() => {
    if (miniMode !== "manual" && board === null && menu === null) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (miniMode === "manual") {
        setMiniMode(null);
        return;
      }
      if (board !== null) {
        closeBoard();
        return;
      }
      if (menu !== null) closeMenu();
    };
    const onDown = (e) => {
      if (miniMode !== "manual" && board === null) return;
      const target = e.target;
      if (rootRef.current && rootRef.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (boardRef.current && boardRef.current.contains(target)) return;
      if (miniMode === "manual") setMiniMode(null);
      if (board !== null) closeBoard();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [miniMode, board, menu, closeMenu]);
  const switchTo = (0, import_react4.useCallback)(async (id) => {
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
  const guardPromptedRef = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => {
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
  (0, import_react4.useEffect)(() => {
    stepLoop();
    scheduleNextLook.current();
    return () => {
      cancelStep();
      stopLook();
      clearHoverTimer();
      cancelMiniLeave();
      if (boardTimerRef.current) {
        const d = boardTimerRef.current;
        boardTimerRef.current = null;
        try {
          d();
        } catch {
        }
      }
      if (entryTimerRef.current) {
        const d = entryTimerRef.current;
        entryTimerRef.current = null;
        try {
          d();
        } catch {
        }
      }
      if (signTimerRef.current) {
        const d = signTimerRef.current;
        signTimerRef.current = null;
        try {
          d();
        } catch {
        }
      }
      genRef.current.look += 1;
      stopPreview();
      if (fallRaf.current) {
        cancelAnimationFrame(fallRaf.current);
        fallRaf.current = 0;
      }
    };
  }, []);
  (0, import_react4.useEffect)(() => {
    if (!visible2 && fallRaf.current) {
      cancelAnimationFrame(fallRaf.current);
      fallRaf.current = 0;
      busyRef.current = false;
    }
  }, [visible2]);
  (0, import_react4.useEffect)(() => {
    const base = document.title;
    const flickerText = t("dash.flickerTitle");
    let on = false, flip = false, flickIv = null;
    const stop = () => {
      if (flickIv !== null) {
        window.clearInterval(flickIv);
        flickIv = null;
      }
      if (on) {
        document.title = base;
        on = false;
      }
    };
    const tick = () => {
      const min = cfgRef.current.approvalFlickerMin;
      const dash = appStore.getSnapshot()?.dashboard ?? null;
      const hit = min > 0 && dash !== null && Array.isArray(dash.approvals) && dash.approvals.some((a) => a && a.waitMin >= min) && document.visibilityState !== "visible";
      if (hit && !on) {
        on = true;
        flickIv = window.setInterval(() => {
          flip = !flip;
          document.title = flip ? flickerText : base;
        }, 1e3);
      } else if (!hit && on) stop();
    };
    tick();
    const iv = window.setInterval(tick, 1500);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const onProjectClick = (p) => {
    try {
      const sessions = petCtx.get("sessions");
      if (sessions && typeof sessions.open === "function") sessions.open(p.id);
    } catch {
    }
    ackProject(p.id);
    setLocalAcked((s) => new Set(s).add(p.id));
  };
  const [localAcked, setLocalAcked] = (0, import_react4.useState)(/* @__PURE__ */ new Set());
  (0, import_react4.useEffect)(() => {
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
  const miniSpeedActive = visible2 && miniMode !== null && board === null && !dragging && stateRef.current.drag === null;
  const sessionTps = useSessionSpeed(currentId ?? null, miniSpeedActive);
  const boardLayer = board !== null ? (() => {
    const p = posRef.current;
    const petX = p ? p.x : window.innerWidth - 24 - frameW;
    const petY = p ? p.y : window.innerHeight - BOTTOM_MARGIN - frameH;
    let left = petX - BOARD_W * scale - BOARD_GAP;
    if (left < BOARD_EDGE) left = petX + frameW + BOARD_GAP;
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "div",
      {
        ref: boardRef,
        style: { position: "fixed", top: petY, left, zIndex: 2147483e3, transform: `scale(${scale})`, transformOrigin: "top left" },
        children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          Board,
          {
            dash: snap?.dashboard ?? null,
            mode: board.mode,
            ttlSec: cfg.boardTtlSec,
            onClose: closeBoard,
            onOpenPanel: () => openDashboardEntry(closeBoard)
          }
        )
      }
    );
  })() : null;
  if (!visible2) return boardLayer;
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
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
      "div",
      {
        ref: rootRef,
        className: "dyn-pet-root",
        style: rootStyle,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
        onDoubleClick,
        onWheel,
        onContextMenu: (e) => {
          e.preventDefault();
          setMenu({
            x: Math.min(e.clientX, window.innerWidth - px(200)),
            y: Math.min(e.clientY, window.innerHeight - px(340))
          });
          setMenuPage(null);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dyn-pet-top", style: { marginBottom: px(10), gap: px(5), maxWidth: px(320) }, children: [
            shown.map((p) => {
              const light = lightOf(p);
              return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
                "div",
                {
                  className: "dyn-pet-proj",
                  style: { padding: `${px(5)}px ${px(10)}px`, borderRadius: px(10), gap: px(7), fontSize: px(12) },
                  onPointerDown: (e) => e.stopPropagation(),
                  onClick: (e) => {
                    e.stopPropagation();
                    onProjectClick(p);
                  },
                  onContextMenu: (e) => e.stopPropagation(),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
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
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dyn-pet-proj-body", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dyn-pet-proj-title", style: { fontSize: px(12) }, children: [
                        light === "error-darkred" ? "\u26A0 " : "",
                        p.title
                      ] }),
                      Array.isArray(p.lines) ? p.lines.map((l, i) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dyn-pet-proj-line", style: { fontSize: px(11.5) }, children: [
                        l,
                        i === 0 && p.age ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dyn-pet-age", style: { fontSize: px(10) }, children: " " + p.age }) : null
                      ] }, i)) : null
                    ] })
                  ]
                },
                p.id
              );
            }),
            extra > 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dyn-pet-proj-more", style: { fontSize: px(11) }, children: [
              "+",
              extra,
              " ",
              t("card.more")
            ] }) : null
          ] }),
          sign ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Sign, { text: sign, scale }) : null,
          subtitle ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "div",
            {
              className: "dyn-pet-bubble",
              style: { marginTop: px(8), padding: `${px(6)}px ${px(12)}px`, fontSize: px(13), borderRadius: px(12), maxWidth: px(320) },
              children: subtitle
            }
          ) : null,
          miniMode !== null && board === null && !dragging && stateRef.current.drag === null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "div",
            {
              className: "dyn-pet-mini-wrap",
              onPointerEnter: cancelMiniLeave,
              children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                MiniBar,
                {
                  dash: snap?.dashboard ?? null,
                  cards,
                  mode: miniMode,
                  scale,
                  usageOn: cfg.usageEnabled,
                  sessionTps,
                  onDetail: () => openMiniBarDetail(openBoard)
                }
              )
            }
          ) : null,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "div",
            {
              ref: spriteRef,
              className: "dyn-pet-sprite " + (dragging ? "dragging" : ""),
              onPointerEnter: () => {
                cancelMiniLeave();
                if (miniMode !== "manual") {
                  clearHoverTimer();
                  hoverTimerRef.current = later(() => setMiniMode("hover"), MINI_HOVER_MS);
                }
              },
              onPointerLeave: () => {
                clearHoverTimer();
                if (miniMode === "hover") {
                  cancelMiniLeave();
                  miniLeaveTimerRef.current = later(() => setMiniMode(null), 200);
                }
              },
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
          ),
          entry ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "div",
            {
              className: "dyn-pet-entry",
              style: { fontSize: px(12) },
              onPointerDown: (e) => e.stopPropagation(),
              onContextMenu: (e) => e.stopPropagation(),
              onClick: (e) => {
                e.stopPropagation();
                setEntry(false);
                openBoard("manual");
              },
              children: t("dash.summaryEntry")
            }
          ) : null
        ]
      }
    ),
    menu !== null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { ref: menuRef, className: "dyn-pet-menu-wrap", style: { left: menu.x, top: menu.y, zIndex: 2147483001 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
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
        },
        onMiniUsage: () => {
          closeMenu();
          setMiniMode("manual");
        },
        onBoardSummary: () => {
          closeMenu();
          openBoard("manual");
        },
        onOpenDashboard: () => openDashboardEntry(closeMenu),
        onSessionPick: (p) => {
          closeMenu();
          onProjectClick(p);
        },
        sessions: snap?.projects ?? []
      }
    ) }) : null,
    boardLayer
  ] });
}

// src/client/PetToggle.tsx
var import_react5 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
function PetToggle(props) {
  const wide = props.wide;
  const [on, setOn] = (0, import_react5.useState)(petStore.visible);
  (0, import_react5.useEffect)(() => petStore.subscribe(() => setOn(petStore.visible)), []);
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
    "button",
    {
      className: "dyn-pet-toggle" + (on ? " on" : " off"),
      title: on ? "\u9690\u85CFFoxbell\u684C\u5BA0" : "\u663E\u793AFoxbell\u684C\u5BA0",
      onClick: (e) => {
        e.stopPropagation();
        petStore.set(!petStore.visible);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dyn-pet-toggle-icon", children: "\u{1F98A}" }),
        wide ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dyn-pet-toggle-text", children: on ? "\u9690\u85CF" : "\u663E\u793A" }) : null
      ]
    }
  );
}

// src/client/SettingsCard.tsx
var import_react7 = require("react");

// src/client/useLang.ts
var import_react6 = require("react");
function useLang() {
  return (0, import_react6.useSyncExternalStore)(langStore.subscribe, langStore.getSnapshot);
}

// src/client/settingsdraft.ts
var DASH_BOOL_KEYS = ["paceEnabled", "usageEnabled", "summaryEnabled", "ttsEnabled"];
var DASH_NUM_ROWS = [
  "dayLimitTokens",
  "milestoneUnit",
  "paceIntenseEvents",
  "paceLongrunMin",
  "paceLoafStartMin",
  "approvalFlickerMin",
  "summaryEntrySec",
  "boardTtlSec"
];
var SETTINGS_ALL_KEYS = [
  "muted",
  "talkative",
  "gravity",
  ...DASH_BOOL_KEYS,
  ...DASH_NUM_ROWS,
  "dblAction",
  "approvalAction",
  "runningAction",
  "errorAction",
  "doneAction",
  "scale"
];
var SETTINGS_V22_KEYS = [
  "exportPose"
];
var ALL_DRAFT_KEYS = [...SETTINGS_ALL_KEYS, ...SETTINGS_V22_KEYS];
var isBadNumValue = (v) => v === "" || v === null || !Number.isFinite(Number(v));
var isDraftDirty = (draft, cfg) => ALL_DRAFT_KEYS.some((k) => String(draft[k]) !== String(cfg[k]));
function buildSavePatch(draft, cfg) {
  const patch = {};
  for (const k of ALL_DRAFT_KEYS) {
    if (String(draft[k]) === String(cfg[k])) continue;
    patch[k] = NUM_KEYS.includes(k) ? sanitizeValue(k, Number(draft[k])) : draft[k];
  }
  return patch;
}

// src/client/SettingsCard.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function Chevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    "svg",
    {
      className: "dyn-pet-card-chevron" + (open ? " open" : ""),
      width: "14",
      height: "14",
      viewBox: "0 0 14 14",
      fill: "none",
      "aria-hidden": true,
      children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M3.5 5.25 7 8.75l3.5-3.5", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" })
    }
  );
}
function Info({ text: text2 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    "span",
    {
      className: "dyn-pet-info",
      "data-tip": text2,
      role: "note",
      "aria-label": text2,
      onClick: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      onPointerDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      children: "i"
    }
  );
}
function SettingsCard() {
  useLang();
  const [open, setOpen] = (0, import_react7.useState)(false);
  const [cfg, setCfg] = (0, import_react7.useState)(cfgStore.getSnapshot());
  const [draft, setDraft] = (0, import_react7.useState)(cfgStore.getSnapshot());
  const [savedFlash, setSavedFlash] = (0, import_react7.useState)(false);
  const dirtyRef = (0, import_react7.useRef)(false);
  (0, import_react7.useEffect)(() => cfgStore.subscribe(() => {
    const next = cfgStore.getSnapshot();
    setCfg(next);
    if (!dirtyRef.current) setDraft(next);
  }), []);
  (0, import_react7.useEffect)(() => {
    if (!savedFlash) return;
    const timer = setTimeout(() => setSavedFlash(false), 1600);
    return () => clearTimeout(timer);
  }, [savedFlash]);
  const [activeName, setActiveName] = (0, import_react7.useState)("");
  (0, import_react7.useEffect)(
    () => appStore.subscribe(() => {
      const rt = appStore.getRuntime();
      setActiveName(rt.name || rt.id);
    }),
    []
  );
  (0, import_react7.useEffect)(() => {
    const rt = appStore.getRuntime();
    setActiveName(rt.name || rt.id);
  }, []);
  const setDraftKey = (k, v) => {
    dirtyRef.current = true;
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const badCount = DASH_NUM_ROWS.filter((k) => isBadNumValue(draft[k])).length;
  const dirty = isDraftDirty(draft, cfg);
  const save = () => {
    if (!dirty || badCount > 0) return;
    const patch = buildSavePatch(draft, cfg);
    cfgStore.set(patch);
    dirtyRef.current = false;
    const next = cfgStore.getSnapshot();
    setCfg(next);
    setDraft(next);
    setSavedFlash(true);
    setOpen(false);
  };
  const discard = () => {
    dirtyRef.current = false;
    setDraft(cfgStore.getSnapshot());
  };
  const actionLabel = (a) => t(`action.${a}`);
  const scaleLabel = (s) => s === 0.75 ? t("scale.small") : s === 1 ? t("scale.medium") : t("scale.large");
  const title = t("settings.cardTitle");
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-card" + (open ? " open" : ""), children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
      "button",
      {
        type: "button",
        className: "dyn-pet-card-header",
        "aria-expanded": open,
        "aria-label": `${open ? t("settings.collapse") : t("settings.expand")}: ${title}`,
        onClick: () => setOpen(!open),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "dyn-pet-card-headtext", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dyn-pet-card-name", children: title }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dyn-pet-card-desc", children: t("settings.cardDescription") })
          ] }),
          badCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dyn-pet-settings-dirty", children: t("dash.invalidNums", { n: badCount }) }) : dirty ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dyn-pet-settings-dirty", children: t("dash.unsaved") }) : savedFlash ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dyn-pet-settings-saved", children: t("dash.saved") }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Chevron, { open })
        ]
      }
    ),
    open ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-card-body dyn-pet-settings", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dyn-pet-settings-section", children: t("settings.sect.base") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t("settings.muted"),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t("settings.tip.muted") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "checkbox", checked: !draft.muted, onChange: (e) => setDraftKey("muted", !e.target.checked) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t("settings.talkative"),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t("settings.tip.talkative") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "checkbox", checked: draft.talkative, onChange: (e) => setDraftKey("talkative", e.target.checked) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t("settings.gravity"),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t("settings.tip.gravity") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "checkbox", checked: draft.gravity, onChange: (e) => setDraftKey("gravity", e.target.checked) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t("settings.scale"),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t("settings.tip.scale") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dyn-pet-scale-group", children: CFG_SCALES.map((sc) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "button",
          {
            className: "dyn-pet-scale-btn" + (draft.scale === sc ? " on" : ""),
            onClick: () => setDraftKey("scale", sc),
            children: scaleLabel(sc)
          },
          sc
        )) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dyn-pet-settings-section", children: t("settings.sect.core") }),
      ["dblAction", "approvalAction", "runningAction", "doneAction", "errorAction"].map((k) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t(`settings.${k}`),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t(`settings.tip.${k}`) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("select", { value: draft[k], onChange: (e) => setDraftKey(k, e.target.value), children: CFG_ACTIONS.map((a) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: a, children: actionLabel(a) }, a)) })
      ] }, k)),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t("dash.cfg.approvalFlickerMin"),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t("settings.tip.approvalFlickerMin") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "number", value: draft.approvalFlickerMin, onChange: (e) => setDraftKey("approvalFlickerMin", e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dyn-pet-settings-section", children: t("settings.sect.voice") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t("dash.cfg.paceEnabled"),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t("settings.tip.paceEnabled") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "checkbox", checked: !!draft.paceEnabled, onChange: (e) => setDraftKey("paceEnabled", e.target.checked) })
      ] }),
      ["paceIntenseEvents", "paceLongrunMin", "paceLoafStartMin"].map((k) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dyn-pet-settings-row" + (isBadNumValue(draft[k]) ? " bad" : ""), children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t(`dash.cfg.${k}`),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t(`settings.tip.${k}`) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "number", value: draft[k], onChange: (e) => setDraftKey(k, e.target.value) })
      ] }, k)),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t("dash.cfg.summaryEnabled"),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t("settings.tip.summaryEnabled") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "checkbox", checked: !!draft.summaryEnabled, onChange: (e) => setDraftKey("summaryEnabled", e.target.checked) })
      ] }),
      ["summaryEntrySec", "boardTtlSec"].map((k) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dyn-pet-settings-row" + (isBadNumValue(draft[k]) ? " bad" : ""), children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t(`dash.cfg.${k}`),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t(`settings.tip.${k}`) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "number", value: draft[k], onChange: (e) => setDraftKey(k, e.target.value) })
      ] }, k)),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dyn-pet-settings-section", children: t("settings.sect.usage") }),
      ["dayLimitTokens", "milestoneUnit"].map((k) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dyn-pet-settings-row" + (isBadNumValue(draft[k]) ? " bad" : ""), children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t(`dash.cfg.${k}`),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t(`settings.tip.${k}`) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "number", value: draft[k], onChange: (e) => setDraftKey(k, e.target.value) })
      ] }, k)),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          t("dash.cfg.exportPose"),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Info, { text: t("settings.tip.exportPose") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("select", { value: draft.exportPose, onChange: (e) => setDraftKey("exportPose", e.target.value), children: POSE_KEYS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: p, children: p === "random" ? t("dash.pose.random") : t(`dash.pose.${p}`) }, p)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dyn-pet-settings-note", children: t("dash.caliberNote") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-settings-savebar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "dyn-pet-settings-discard", onClick: discard, children: t("dash.discard") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "button",
          {
            className: "dyn-pet-settings-save",
            disabled: !dirty || badCount > 0,
            onClick: save,
            children: t("dash.save")
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dyn-pet-settings-section", children: t("settings.petSection") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-settings-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("settings.currentPet") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { className: "dyn-pet-current-pet", children: activeName || cfg.activePetId })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dyn-pet-settings-row dyn-pet-settings-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "dyn-pet-btn plain", onClick: () => openDialog("switch", {}), children: t("settings.switchPet") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "dyn-pet-btn plain", onClick: () => openDialog("import", {}), children: t("settings.importPet") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "dyn-pet-btn plain", onClick: () => openDialog("manage", {}), children: t("settings.managePet") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dyn-pet-settings-row", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("a", { className: "dyn-pet-petdex-link", href: "https://petdex.dev", target: "_blank", rel: "noopener noreferrer", children: [
        t("settings.petdex"),
        " \u2197"
      ] }) })
    ] }) : null
  ] });
}

// src/client/dialogs/DialogHost.tsx
var import_react13 = require("react");
var import_react_dom = require("react-dom");

// src/client/dialogs/SwitchDialog.tsx
var import_react8 = require("react");

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
var import_jsx_runtime9 = require("react/jsx-runtime");
function Modal(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-modal-mask", onPointerDown: (e) => {
    if (e.target === e.currentTarget) props.onClose();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-modal" + (props.wide ? " wide" : ""), role: "dialog", "aria-label": props.title, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dyn-pet-modal-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: props.title }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { className: "dyn-pet-modal-x", onClick: props.onClose, "aria-label": t("common.close"), children: "\u2715" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-modal-body", children: props.children }),
    props.footer ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-modal-foot", children: props.footer }) : null
  ] }) });
}
function Btn(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-inline-error", role: "alert", children: props.msg });
}
function InlineOk(props) {
  if (!props.msg) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dyn-pet-inline-ok", children: props.msg });
}
function Spinner() {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dyn-pet-spinner", "aria-hidden": true });
}

// src/client/dialogs/SwitchDialog.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
function SwitchDialog(props) {
  const [pets, setPets] = (0, import_react8.useState)([]);
  const [activeId, setActiveId] = (0, import_react8.useState)(cfgStore.getSnapshot().activePetId);
  const [busyId, setBusyId] = (0, import_react8.useState)(null);
  const [error, setError] = (0, import_react8.useState)(null);
  const [ok, setOk] = (0, import_react8.useState)(null);
  const [mismatch, setMismatch] = (0, import_react8.useState)(null);
  const [localCaps, setLocalCaps] = (0, import_react8.useState)({});
  (0, import_react8.useEffect)(() => {
    const snap = appStore.getSnapshot();
    if (snap?.pets) setPets(snap.pets);
    const un = appStore.subscribe(() => {
      const s = appStore.getSnapshot();
      if (s?.pets) setPets(s.pets);
    });
    return un;
  }, []);
  (0, import_react8.useEffect)(() => cfgStore.subscribe(() => setActiveId(cfgStore.getSnapshot().activePetId)), []);
  const sorted = (0, import_react8.useMemo)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Modal, { title: t("switch.title"), onClose: props.onClose, wide: true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(InlineError, { msg: error }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(InlineOk, { msg: ok }),
    mismatch ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-mismatch", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-mismatch-title", children: [
        t("switch.mismatchTitle"),
        "\uFF08",
        mismatch.id,
        "\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { className: "dyn-pet-issue-list", children: (mismatch.result.issues ?? []).map((i, k) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
        t(`issue.${i.kind}`, {}),
        i.detail ? `\uFF1A${i.detail}` : ""
      ] }, k)) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-mismatch-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { kind: "primary", onClick: () => {
          void doUpdateManifest(mismatch.id, mismatch.result);
        }, disabled: busyId !== null || mismatch.result.plan?.canRepair === false, children: t("switch.mismatchUpdate") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { onClick: () => {
          void ignoreMismatch();
        }, disabled: busyId !== null, children: t("switch.mismatchIgnore") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Btn, { onClick: () => setMismatch(null), children: t("switch.mismatchCancel") })
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dyn-pet-switch-grid", children: sorted.map((p) => {
      const cap = localCaps[p.id];
      const hasVoice = cap ? cap.hasVoice : p.hasVoice;
      const hasSubtitle = cap ? cap.hasSubtitle : p.hasSubtitle;
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "div",
        {
          className: "dyn-pet-switch-card" + (p.id === activeId ? " active" : ""),
          onClick: () => {
            if (p.id !== activeId && busyId === null) void activate(p.id);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-switch-name", children: [
              p.displayName || p.id,
              p.id === activeId ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dyn-pet-badge", children: t("switch.current") }) : null,
              p.builtin ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dyn-pet-badge", children: t("switch.builtin") }) : null
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dyn-pet-switch-meta", children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dyn-pet-badge", title: p.spriteVersionNumber === 0 ? t("switch.pendingFirstCheck") : void 0, children: p.spriteVersionNumber > 0 ? `v${p.spriteVersionNumber}` : "v?" }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: { opacity: hasVoice ? 1 : 0.4 }, title: hasVoice ? void 0 : t("menu.soundNoCap"), children: "\u{1F50A}" }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: { opacity: hasSubtitle ? 1 : 0.4 }, title: hasSubtitle ? void 0 : t("menu.subtitleNoCap"), children: "\u{1F4AC}" }),
              busyId === p.id ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Spinner, {}) : null
            ] })
          ]
        },
        p.id
      );
    }) })
  ] });
}

// src/client/dialogs/ImportDialog.tsx
var import_react10 = require("react");

// src/client/dialogs/VoiceGroupEditor.tsx
var import_react9 = require("react");
var import_jsx_runtime11 = require("react/jsx-runtime");
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
  const [busyGroup, setBusyGroup] = (0, import_react9.useState)(null);
  const [probing, setProbing] = (0, import_react9.useState)(/* @__PURE__ */ new Set());
  const fileRefs = (0, import_react9.useRef)({});
  const urlOf = (rel) => target.mode === "staged" ? stagingVoiceUrl(target.sid ?? "", rel) : `/dyn-pet-foxbell/pets/${encodeURIComponent(target.id ?? "")}/${rel.split("/").map(encodeURIComponent).join("/")}`;
  (0, import_react9.useEffect)(() => {
    const pending2 = rows.filter((r) => r.durationMs === null);
    if (pending2.length === 0) return;
    let cancelled = false;
    setProbing(new Set(pending2.map((r) => r.file)));
    void (async () => {
      const results = await Promise.all(
        pending2.map(async (r) => [r.file, await probeWithRetry(urlOf(r.file))])
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
  const summary = (0, import_react9.useMemo)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dyn-pet-voice-editor", children: [
    GROUPS.map((g) => {
      const groupRows = rows.filter((r) => r.group === g);
      return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dyn-pet-voice-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dyn-pet-voice-group-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t(GROUP_LABEL[g]) }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Btn, { onClick: () => fileRefs.current[g]?.click(), disabled: props.disabled || busyGroup !== null, children: busyGroup === g ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Spinner, {}) : t("import.addAudio") }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
          return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dyn-pet-voice-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "dyn-pet-voice-name", title: r.file, children: [
              r.name,
              r.durationMs !== null ? ` (${(r.durationMs / 1e3).toFixed(1)}s)` : isProbing ? ` (${t("import.probing")})` : ""
            ] }),
            problem ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Btn, { kind: "plain", onClick: () => {
              void onRemove(r);
            }, disabled: props.disabled, children: t("import.remove") })
          ] }, r.file);
        })
      ] }, g);
    }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dyn-pet-voice-summary" + (summary.hasVoice ? " ok" : ""), children: summary.hasVoice ? t("import.coverageOk") : t("import.coverageMissing", { groups: missing.map((g) => t(GROUP_LABEL[g])).join("\u3001") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dyn-pet-voice-summary", children: [
      t("import.totalSize", { size: fmtSize(totalSize) }),
      totalSize > 30 * 1024 * 1024 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "dyn-pet-warn", children: [
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
var import_jsx_runtime12 = require("react/jsx-runtime");
function ImportDialog(props) {
  const [step, setStep] = (0, import_react10.useState)("source");
  const [tab, setTab] = (0, import_react10.useState)("codex");
  const [busy, setBusy] = (0, import_react10.useState)(false);
  const [error, setError] = (0, import_react10.useState)(null);
  const [ok, setOk] = (0, import_react10.useState)(null);
  const [codexPets, setCodexPets] = (0, import_react10.useState)(null);
  const [selectedCodex, setSelectedCodex] = (0, import_react10.useState)(null);
  const [petdexQuery, setPetdexQuery] = (0, import_react10.useState)("");
  const [petdexHits, setPetdexHits] = (0, import_react10.useState)(null);
  const [selectedPetdex, setSelectedPetdex] = (0, import_react10.useState)(null);
  const zipInputRef = (0, import_react10.useRef)(null);
  const folderInputRef = (0, import_react10.useRef)(null);
  const [staged, setStaged] = (0, import_react10.useState)(null);
  const [existingIds, setExistingIds] = (0, import_react10.useState)(["foxbell"]);
  const [name, setName] = (0, import_react10.useState)("");
  const [displayName, setDisplayName] = (0, import_react10.useState)("");
  const [description, setDescription] = (0, import_react10.useState)("");
  const [subtitle, setSubtitle] = (0, import_react10.useState)(true);
  const [voiceRows, setVoiceRowsState] = (0, import_react10.useState)([]);
  const [sheetRows, setSheetRows] = (0, import_react10.useState)(null);
  const [sheetProbeState, setSheetProbeState] = (0, import_react10.useState)("pending");
  const probeGen = (0, import_react10.useRef)(0);
  const [importedId, setImportedId] = (0, import_react10.useState)(null);
  const setVoiceRows = (fn) => setVoiceRowsState(fn);
  (0, import_react10.useEffect)(() => {
    void (async () => {
      try {
        const snap = appStore.getSnapshot();
        const pets = snap?.pets ?? (await apiGet("/pets")).pets;
        setExistingIds(["foxbell", ...pets.map((p) => p.id)]);
      } catch {
      }
    })();
  }, []);
  (0, import_react10.useEffect)(() => {
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
  const sourceOverride = (0, import_react10.useRef)(null);
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
  const sheetPreviewStyle = (0, import_react10.useMemo)(() => {
    if (!staged) return void 0;
    const half = { width: 96, height: 104 };
    return {
      ...half,
      backgroundImage: `url('${stagingSheetUrl(staged.stagingId)}')`,
      backgroundSize: sheetRows === 9 ? "768px 936px" : "768px 1144px",
      backgroundPosition: "0 0"
    };
  }, [staged, sheetRows]);
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
    Modal,
    {
      title: step === "source" ? t("import.title") : step === "config" ? t("import.configTitle") : t("import.doneTitle"),
      onClose: cancelAll,
      wide: true,
      footer: step === "config" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Btn, { onClick: cancelAll, children: t("import.cancelImport") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Btn, { kind: "primary", onClick: () => {
          void execute();
        }, disabled: !nameOk || !sheetRows || busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Spinner, {}) : t("import.execute") })
      ] }) : step === "done" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Btn, { onClick: props.onClose, children: t("import.finish") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Btn, { kind: "primary", onClick: () => {
          void activateNow();
        }, disabled: busy || !importedId, children: t("import.activateNow") })
      ] }) : void 0,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(InlineError, { msg: error }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(InlineOk, { msg: ok }),
        step === "done" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dyn-pet-import-done", children: importedId ? t("import.doneId", { id: importedId }) : "" }) : step === "config" && staged ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dyn-pet-import-config", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dyn-pet-import-preview", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dyn-pet-sheet-thumb", style: sheetPreviewStyle }),
            sheetProbeState === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dyn-pet-hint", children: t("import.sheetProbing") }) : null,
            sheetProbeState === "ok" && sheetRows ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dyn-pet-badge", children: sheetRows === 9 ? "v1" : "v2" }) : null,
            sheetProbeState === "invalid" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dyn-pet-bad", children: t("import.sheetInvalid") }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dyn-pet-import-fields", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "dyn-pet-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { title: t("import.nameHint"), children: t("import.name") }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: staged.suggestedName })
            ] }),
            nameProblem && name.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dyn-pet-bad", "data-testid": "import-name-problem", children: t(petNameProblemKey(nameProblem)) }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "dyn-pet-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: t("import.displayName") }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("input", { value: displayName, onChange: (e) => setDisplayName(e.target.value) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "dyn-pet-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: t("import.description") }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("input", { value: description, onChange: (e) => setDescription(e.target.value) })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            VoiceGroupEditor,
            {
              target: { mode: "staged", sid: staged.stagingId },
              rows: voiceRows,
              setRows: setVoiceRows,
              onError: setError,
              disabled: busy
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "dyn-pet-checkline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              "input",
              {
                type: "checkbox",
                checked: subtitle && tier.hasVoice,
                disabled: voiceRows.length === 0,
                onChange: (e) => setSubtitle(e.target.checked)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: t("import.subtitle") })
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dyn-pet-import-source", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dyn-pet-tabs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { className: tab === "codex" ? "on" : "", onClick: () => setTab("codex"), children: t("import.tabCodex") }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { className: tab === "local" ? "on" : "", onClick: () => setTab("local"), children: t("import.tabLocal") }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { className: tab === "petdex" ? "on" : "", onClick: () => setTab("petdex"), children: t("import.tabPetdex") })
          ] }),
          tab === "codex" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dyn-pet-codex-list", children: [
            codexPets === null ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Spinner, {}) : codexPets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dyn-pet-hint", children: t("import.codexEmpty") }) : null,
            codexPets?.map((p) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
              "div",
              {
                className: "dyn-pet-codex-row" + (selectedCodex === p.id ? " sel" : ""),
                onClick: () => {
                  if (!p.imported) setSelectedCodex(p.id);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: p.id }),
                  p.displayName ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dyn-pet-hint", children: p.displayName }) : null,
                  p.spriteVersionNumber > 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "dyn-pet-badge", children: [
                    "v",
                    p.spriteVersionNumber
                  ] }) : null,
                  p.imported ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dyn-pet-hint", children: t("import.codexImported") }) : null
                ]
              },
              p.id
            )),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Btn, { kind: "primary", onClick: () => {
              void stageCodex();
            }, disabled: !selectedCodex || busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Spinner, {}) : t("import.stage") })
          ] }) : null,
          tab === "local" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dyn-pet-local", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Btn, { onClick: () => folderInputRef.current?.click(), disabled: busy, children: t("import.pickFolder") }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Btn, { onClick: () => zipInputRef.current?.click(), disabled: busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Spinner, {}) : t("import.pickZip") }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dyn-pet-hint", children: t("import.folderHint") })
          ] }) : null,
          tab === "petdex" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dyn-pet-petdex", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dyn-pet-hint", children: t("import.petdexHint") }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dyn-pet-petdex-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                "input",
                {
                  value: petdexQuery,
                  placeholder: t("import.petdexPlaceholder"),
                  onChange: (e) => setPetdexQuery(e.target.value)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Btn, { onClick: () => {
                void searchPetdex();
              }, disabled: busy || petdexQuery.trim().length === 0, children: t("import.petdexSearch") }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Btn, { onClick: () => window.open("https://petdex.dev", "_blank", "noopener"), children: t("import.petdexBrowse") })
            ] }),
            petdexHits !== null && petdexHits.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dyn-pet-hint", children: "\u2014" }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dyn-pet-petdex-list", children: petdexHits?.map((h) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
              "div",
              {
                className: "dyn-pet-codex-row" + (selectedPetdex?.slug === h.slug ? " sel" : ""),
                onClick: () => {
                  if (h.hasZip) setSelectedPetdex(h);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: h.slug }),
                  h.displayName ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dyn-pet-hint", children: h.displayName }) : null,
                  h.spriteVersionNumber > 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "dyn-pet-badge", children: [
                    "v",
                    h.spriteVersionNumber
                  ] }) : null,
                  !h.hasZip ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dyn-pet-hint", children: t("import.petdexNoZip") }) : null
                ]
              },
              h.slug
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              Btn,
              {
                kind: "primary",
                onClick: () => {
                  void stagePetdex();
                },
                disabled: busy || !selectedPetdex && !/^https?:\/\/|^[\w-]+$/.test(petdexQuery.trim()),
                children: busy ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Spinner, {}) : t("import.petdexDownload")
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
var import_react11 = require("react");
var import_jsx_runtime13 = require("react/jsx-runtime");
function ManageDialog(props) {
  const [pets, setPets] = (0, import_react11.useState)([]);
  const [selected, setSelected] = (0, import_react11.useState)(null);
  const [manifest, setManifest] = (0, import_react11.useState)(null);
  const [petDir, setPetDir] = (0, import_react11.useState)("");
  const [busy, setBusy] = (0, import_react11.useState)(false);
  const [error, setError] = (0, import_react11.useState)(null);
  const [ok, setOk] = (0, import_react11.useState)(null);
  const [confirmDelete, setConfirmDelete] = (0, import_react11.useState)(false);
  const [copied, setCopied] = (0, import_react11.useState)(false);
  const [renameTo, setRenameTo] = (0, import_react11.useState)("");
  const [displayName, setDisplayName] = (0, import_react11.useState)("");
  const [description, setDescription] = (0, import_react11.useState)("");
  const [subtitle, setSubtitle] = (0, import_react11.useState)(true);
  const [voiceRows, setVoiceRowsState] = (0, import_react11.useState)([]);
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
  (0, import_react11.useEffect)(() => {
    void reload();
  }, []);
  const existingIds = (0, import_react11.useMemo)(() => ["foxbell", ...pets.map((p) => p.id)], [pets]);
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
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(Modal, { title: t("manage.title"), onClose: closeAll, wide: true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(InlineError, { msg: error }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(InlineOk, { msg: ok }),
    !selected ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dyn-pet-manage-list", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "dyn-pet-hint", children: t("manage.pick") }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "dyn-pet-hint", children: t("manage.builtinHint") }),
      pets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "dyn-pet-hint", children: "\u2014" }) : null,
      pets.map((p) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dyn-pet-codex-row", onClick: () => {
        void openPanel(p);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: p.displayName || p.id }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dyn-pet-hint", children: p.id }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dyn-pet-badge", children: p.spriteVersionNumber > 0 ? `v${p.spriteVersionNumber}` : "v?" }),
        p.hasVoice ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { title: t("menu.sound"), children: "\u{1F50A}" }) : null,
        p.hasSubtitle ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { title: t("menu.subtitle"), children: "\u{1F4AC}" }) : null
      ] }, p.id))
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dyn-pet-manage-panel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dyn-pet-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: t("manage.dirLabel") }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("code", { className: "dyn-pet-dirpath", children: petDir }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Btn, { onClick: () => {
          void copyDir();
        }, children: copied ? t("manage.copied") : t("manage.copy") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dyn-pet-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: t("import.displayName") }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("input", { value: displayName, onChange: (e) => setDisplayName(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dyn-pet-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: t("import.description") }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("input", { value: description, onChange: (e) => setDescription(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dyn-pet-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: t("manage.rename") }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("input", { value: renameTo, placeholder: selected.id, onChange: (e) => setRenameTo(e.target.value) }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Btn, { onClick: () => {
          void doRename();
        }, disabled: busy || renameTo.trim().length === 0 || renameProblem !== null, children: t("manage.renameBtn") })
      ] }),
      renameProblem ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "dyn-pet-bad", children: t(petNameProblemKey(renameProblem)) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        VoiceGroupEditor,
        {
          target: { mode: "installed", id: selected.id },
          rows: voiceRows,
          setRows: setVoiceRows,
          onError: setError,
          disabled: busy
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "dyn-pet-checkline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("input", { type: "checkbox", checked: subtitle, onChange: (e) => setSubtitle(e.target.checked) }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: t("manage.subtitle") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dyn-pet-manage-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Btn, { kind: "primary", onClick: () => {
          void doSave();
        }, disabled: busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Spinner, {}) : t("manage.save") }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Btn, { onClick: () => {
          setSelected(null);
          setConfirmDelete(false);
        }, children: t("menu.back") }),
        !confirmDelete ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Btn, { kind: "danger", onClick: () => setConfirmDelete(true), disabled: busy, children: t("manage.delete") }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "dyn-pet-delete-confirm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dyn-pet-bad", children: t("manage.deleteConfirm") }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Btn, { kind: "danger", onClick: () => {
            void doDelete();
          }, disabled: busy, children: t("manage.delete") }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Btn, { onClick: () => setConfirmDelete(false), children: t("common.cancel") })
        ] })
      ] })
    ] })
  ] });
}

// src/client/dialogs/GuardDialog.tsx
var import_react12 = require("react");
var import_jsx_runtime14 = require("react/jsx-runtime");
function GuardDialog(props) {
  const [busy, setBusy] = (0, import_react12.useState)(false);
  const [error, setError] = (0, import_react12.useState)(null);
  const [ok, setOk] = (0, import_react12.useState)(null);
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
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(Modal, { title: t("startup.title"), onClose: props.onClose, children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(InlineError, { msg: error }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(InlineOk, { msg: ok }),
    fatal ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dyn-pet-guard-fatal", children: t("startup.fatal", { msg: props.issues.map((i) => t(`issue.${i.kind}`) + (i.detail ? `\uFF1A${i.detail}` : "")).join("\uFF1B") }) }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { children: t("startup.issuesTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ul", { className: "dyn-pet-issue-list", children: props.issues.map((i, k) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
        t(`issue.${i.kind}`),
        i.detail ? `\uFF1A${i.detail}` : ""
      ] }, k)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dyn-pet-guard-actions", children: [
      canRepair ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Btn, { kind: "primary", onClick: () => {
        void doUpdate();
      }, disabled: busy, children: busy ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Spinner, {}) : t("startup.update") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Btn, { onClick: doFoxbell, disabled: busy, children: t("startup.foxbell") }),
      !fatal ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Btn, { onClick: doIgnore, disabled: busy, children: t("startup.ignore") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Btn, { kind: "danger", onClick: doHide, disabled: busy, children: t("startup.hidePet") })
    ] })
  ] });
}

// src/client/dialogs/DialogHost.tsx
var import_jsx_runtime15 = require("react/jsx-runtime");
function DialogHost() {
  const [req, setReq] = (0, import_react13.useState)(currentDialog());
  (0, import_react13.useEffect)(() => subscribeDialogs(setReq), []);
  if (!req) return null;
  let dialog;
  switch (req.kind) {
    case "switch":
      dialog = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(SwitchDialog, { onClose: closeDialog });
      break;
    case "import":
      dialog = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(ImportDialog, { onClose: closeDialog });
      break;
    case "manage":
      dialog = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(ManageDialog, { onClose: closeDialog });
      break;
    case "guard":
      dialog = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(GuardDialog, { ...req.props, onClose: closeDialog });
      break;
    default:
      return null;
  }
  return (0, import_react_dom.createPortal)(dialog, document.body);
}

// src/client/DashboardPanel.tsx
var import_react19 = require("react");

// src/client/exportimage.ts
function resolvePoseRow(pose) {
  const keys = Object.keys(ANIM);
  if (pose === "random") return ANIM[keys[Math.floor(Math.random() * keys.length)]].row;
  return ANIM[pose]?.row ?? 0;
}
function maxAnimCols() {
  return Math.max(...Object.values(ANIM).map((a) => a.d.length));
}
function loadSprite(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = "";
      res(null);
    }, 8e3);
    img.onload = () => {
      clearTimeout(timer);
      res(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      res(null);
    };
    img.src = url;
  });
}
var W = 720;
var PET_H = 360;
var H = 2016;
var M = 24;
var CARD = { x: M, y: M, w: W - M * 2, get h() {
  return H - M * 2;
}, r: 24 };
var INK = "#1f2937";
var SUB = "#6b7280";
var FAINT = "#9ca3af";
var LINE = "#eceef2";
var ACCENT_A = "#3BA7FF";
var ACCENT_B = "#8D6BFF";
var PAD = 32;
var CW = CARD.w - PAD * 2;
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function drawTrendCard(c, points, x, y, w, h) {
  c.fillStyle = "#f7f8fa";
  roundRectPath(c, x - 16, y - 24, w + 32, h + 52, 14);
  c.fill();
  if (points.length < 2) {
    c.fillStyle = SUB;
    c.font = "400 15px system-ui";
    c.fillText("\u6682\u65E0\u8D8B\u52BF\u6570\u636E", x, y + h / 2);
    return;
  }
  const max = Math.max(1, ...points.map((p) => p.value));
  const pts = points.map((p, i) => ({ px: x + w * i / (points.length - 1), py: y + h * (1 - p.value / max) }));
  const grad = c.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, ACCENT_A);
  grad.addColorStop(1, ACCENT_B);
  c.beginPath();
  c.moveTo(pts[0].px, y + h);
  for (const p of pts) c.lineTo(p.px, p.py);
  c.lineTo(pts[pts.length - 1].px, y + h);
  c.closePath();
  c.globalAlpha = 0.12;
  c.fillStyle = grad;
  c.fill();
  c.globalAlpha = 1;
  c.beginPath();
  pts.forEach((p, i) => i === 0 ? c.moveTo(p.px, p.py) : c.lineTo(p.px, p.py));
  c.strokeStyle = grad;
  c.lineWidth = 3;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.stroke();
  c.textAlign = "center";
  pts.forEach((p, i) => {
    c.beginPath();
    c.arc(p.px, p.py, i === pts.length - 1 ? 4.5 : 3.2, 0, Math.PI * 2);
    c.fillStyle = "#ffffff";
    c.fill();
    c.strokeStyle = grad;
    c.lineWidth = 1.6;
    c.stroke();
    const n = points.length;
    const stride = Math.ceil(n / 12);
    if (n <= 14 || i === 0 || i === n - 1 || points[i].label.endsWith("\u6708") || i % stride === 0) {
      c.fillStyle = SUB;
      c.font = "400 13px system-ui";
      c.fillText(points[i].label, Math.min(Math.max(p.px, x + 14), x + w - 14), y + h + 22);
    }
  });
  c.textAlign = "left";
}
async function exportDashboardImage(input) {
  const paint = () => {
    let yy = 298;
    yy += input.metrics.length * 38 + 34;
    yy += 216 + 34;
    yy += 32 + (input.models.length === 0 ? 48 : input.models.length * 48) + 36;
    yy += 30 + (58 + 10) * 2 + 26;
    yy += 24 + PET_H;
    return yy + 72;
  };
  H = Math.max(1560, paint());
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d");
  c.fillStyle = "#f5f6f8";
  c.fillRect(0, 0, W, H);
  c.fillStyle = "#ffffff";
  roundRectPath(c, CARD.x, CARD.y, CARD.w, CARD.h, CARD.r);
  c.fill();
  c.strokeStyle = "#e8e5df";
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = INK;
  c.font = "700 28px system-ui";
  c.fillText("\u7528\u91CF\u770B\u677F", PAD, 78);
  c.font = "500 18px system-ui";
  c.fillStyle = SUB;
  c.textAlign = "right";
  c.fillText(input.rangeLabel, W - PAD, 74);
  c.textAlign = "left";
  c.strokeStyle = LINE;
  c.beginPath();
  c.moveTo(PAD, 100);
  c.lineTo(W - PAD, 100);
  c.stroke();
  c.fillStyle = SUB;
  c.font = "500 16px system-ui";
  c.fillText("\u7D2F\u8BA1 Token", PAD, 136);
  c.fillStyle = INK;
  const heroSize = input.hero.length > 12 ? 48 : input.hero.length > 9 ? 56 : 64;
  c.font = `750 ${heroSize}px system-ui`;
  c.fillText(input.hero, PAD - 2, 206);
  c.fillStyle = SUB;
  c.font = "400 15px system-ui";
  c.fillText(input.heroSub, PAD, 242);
  c.strokeStyle = LINE;
  c.beginPath();
  c.moveTo(PAD, 270);
  c.lineTo(W - PAD, 270);
  c.stroke();
  let y = 298;
  for (const [k, v] of input.metrics) {
    c.fillStyle = "#4b5563";
    c.font = "400 19px system-ui";
    c.fillText(k, PAD, y);
    c.fillStyle = INK;
    c.font = "600 20px system-ui";
    c.textAlign = "right";
    c.fillText(v, W - PAD, y);
    c.textAlign = "left";
    y += 38;
  }
  c.strokeStyle = LINE;
  c.beginPath();
  c.moveTo(PAD, y + 2);
  c.lineTo(W - PAD, y + 2);
  c.stroke();
  y += 34;
  c.fillStyle = INK;
  c.font = "600 20px system-ui";
  c.fillText(input.trendTitle, PAD, y + 24);
  c.fillStyle = SUB;
  c.font = "400 14px system-ui";
  c.textAlign = "right";
  c.fillText(input.peakLabel, W - PAD, y + 24);
  c.textAlign = "left";
  drawTrendCard(c, input.points, PAD + 16, y + 58, CW - 32, 120);
  y += 216;
  c.strokeStyle = LINE;
  c.beginPath();
  c.moveTo(PAD, y);
  c.lineTo(W - PAD, y);
  c.stroke();
  y += 34;
  c.fillStyle = INK;
  c.font = "600 20px system-ui";
  c.fillText("\u6309 Model \u5206\u5E03", PAD, y);
  y += 32;
  if (input.models.length === 0) {
    c.fillStyle = SUB;
    c.font = "400 15px system-ui";
    c.fillText("\u6682\u65E0\u6570\u636E", PAD, y + 16);
    y += 48;
  } else {
    for (const m of input.models) {
      c.fillStyle = INK;
      c.font = "600 17px system-ui";
      c.fillText(m.name, PAD, y + 15);
      c.fillStyle = "#374151";
      c.font = "500 15px system-ui";
      c.textAlign = "right";
      c.fillText(m.val, W - PAD, y + 15);
      c.textAlign = "left";
      const barY = y + 26, barW = CW;
      c.fillStyle = "#eceef2";
      roundRectPath(c, PAD, barY, barW, 8, 4);
      c.fill();
      const fillW = Math.max(barW * 0.04, barW * Math.min(1, Math.max(0, m.share)));
      if (fillW > 0) {
        const bg = c.createLinearGradient(PAD, 0, PAD + barW, 0);
        bg.addColorStop(0, ACCENT_A);
        bg.addColorStop(1, ACCENT_B);
        c.fillStyle = bg;
        roundRectPath(c, PAD, barY, fillW, 8, 4);
        c.fill();
      }
      y += 48;
    }
  }
  c.strokeStyle = LINE;
  c.beginPath();
  c.moveTo(PAD, y + 2);
  c.lineTo(W - PAD, y + 2);
  c.stroke();
  y += 36;
  c.fillStyle = INK;
  c.font = "600 20px system-ui";
  c.fillText("\u5DE5\u5177\u8C03\u7528", PAD, y);
  y += 30;
  const cellW = (CW - 12) / 2, cellH = 58;
  input.tools2x2.forEach(([k, v], i) => {
    const cx = PAD + i % 2 * (cellW + 12), cy = y + Math.floor(i / 2) * (cellH + 10);
    c.fillStyle = "#f7f8fa";
    roundRectPath(c, cx, cy, cellW, cellH, 10);
    c.fill();
    c.fillStyle = SUB;
    c.font = "400 15px system-ui";
    c.fillText(k, cx + 14, cy + 23);
    c.fillStyle = INK;
    c.font = "600 18px system-ui";
    c.fillText(v, cx + 14, cy + 47);
  });
  y += (cellH + 10) * 2 + 26;
  const petW = input.sprite && input.frameH > 0 && input.frameW > 0 ? PET_H * (input.frameW / input.frameH) : 0;
  const petX = W - PAD - petW;
  const petY = y + 24;
  c.font = "500 19px system-ui";
  const longestLine = (() => {
    const lines = [];
    let line = "";
    for (const ch of input.quote) {
      if (ch === "\n" || c.measureText(line + ch).width > 340 - 44) {
        lines.push(line);
        line = ch === "\n" ? "" : ch;
      } else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  })();
  const textW = Math.max(0, ...longestLine.map((l) => c.measureText(l).width));
  const bubbleW = Math.min(340, Math.max(150, textW + 44), petX - 18 - PAD);
  const bubbleX = petX - 18 - bubbleW;
  const bubbleH = Math.max(60, 20 * 2 + longestLine.length * 27 - (27 - 19));
  const bubbleY = petY + PET_H * 0.1;
  c.save();
  c.shadowColor = "rgba(122, 74, 43, 0.18)";
  c.shadowBlur = 14;
  c.shadowOffsetY = 4;
  c.fillStyle = "#fffdf9";
  roundRectPath(c, bubbleX, bubbleY, bubbleW, bubbleH, 16);
  c.fill();
  c.restore();
  const bStroke = c.createLinearGradient(bubbleX, bubbleY, bubbleX + bubbleW, bubbleY + bubbleH);
  bStroke.addColorStop(0, "rgba(59, 167, 255, 0.45)");
  bStroke.addColorStop(1, "rgba(141, 107, 255, 0.45)");
  c.strokeStyle = bStroke;
  c.lineWidth = 1.5;
  roundRectPath(c, bubbleX, bubbleY, bubbleW, bubbleH, 16);
  c.stroke();
  const tailY = bubbleY + bubbleH / 2;
  c.beginPath();
  c.moveTo(bubbleX + bubbleW, tailY - 10);
  c.quadraticCurveTo(bubbleX + bubbleW + 16, tailY, bubbleX + bubbleW, tailY + 10);
  c.closePath();
  c.fillStyle = "#fffdf9";
  c.fill();
  c.strokeStyle = bStroke;
  c.stroke();
  c.fillStyle = "#4a3b2a";
  c.font = "500 19px system-ui";
  longestLine.forEach((line, i) => c.fillText(line, bubbleX + 20, bubbleY + 20 + 16 + i * 27));
  if (input.sprite && input.frameW > 0 && input.frameH > 0 && petW > 0) {
    c.drawImage(input.sprite, 0, input.poseRow * input.frameH, input.frameW, input.frameH, petX, petY, petW, PET_H);
  }
  const cardBottom = CARD.y + CARD.h;
  const contentBottom = Math.max(petY + PET_H, y) + 24;
  if (contentBottom + 16 < cardBottom) {
    c.fillStyle = "#f5f6f8";
    c.fillRect(CARD.x, contentBottom, CARD.w, cardBottom - contentBottom);
  }
  c.strokeStyle = "#e8e5df";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(CARD.x, contentBottom);
  c.lineTo(CARD.x + CARD.w, contentBottom);
  c.stroke();
  const footY = contentBottom + 30;
  c.fillStyle = FAINT;
  c.font = "400 15px system-ui";
  c.fillText("\u7EAF token \xB7 \u542B\u5B50\u4EE3\u7406 \xB7 \u672C\u5730\u805A\u5408", PAD, footY);
  c.textAlign = "right";
  c.fillText("DSH \xB7 Foxbell \u7528\u91CF\u770B\u677F", W - PAD, footY);
  c.textAlign = "left";
  const below = footY + 16;
  if (below < H) {
    c.fillStyle = "#f5f6f8";
    c.fillRect(0, below, W, H - below);
  }
  return await new Promise((res, rej) => cv.toBlob((b) => b ? res(b) : rej(new Error("canvas toBlob returned null")), "image/png"));
}

// src/client/quotes.ts
var POOL = {
  zh: [
    { when: (a) => a.hitPct >= 0.9, text: "\u7F13\u5B58\u5403\u5F97\u5E72\u5E72\u51C0\u51C0\uFF0C\u7701\u94B1\u5C0F\u80FD\u624B\uFF01" },
    { when: (a) => a.hitPct > 0 && a.hitPct < 0.5, text: "\u7F13\u5B58\u6709\u70B9\u51B7\uFF0C\u4E0A\u4E0B\u6587\u8FD8\u5728\u70ED\u8EAB\u3002" },
    { when: (a) => a.total >= 1e7, text: "\u5343\u4E07\u4FF1\u4E50\u90E8\uFF01\u4ECA\u5929\u8FD9\u662F\u70E7\u4E86\u4E2A\u706B\u7BAD\u3002" },
    { when: (a) => a.total >= 1e6, text: "\u767E\u4E07\u4FF1\u4E50\u90E8\u53C8\u6DFB\u4E00\u65E5\u3002" },
    { when: (a) => a.total < 1e5 && a.total > 0, text: "\u4ECA\u5929\u5F88\u8282\u5236\uFF0C\u5C3E\u5DF4\u90FD\u7FD8\u8D77\u6765\u4E86\u3002" },
    { when: (a) => a.total === 0, text: "\u4ECA\u5929\u8FD8\u6CA1\u5F00\u5DE5\uFF0C\u65E5\u5FD7\u672C\u7A7A\u7A7A\u7684\u3002" },
    { when: (a) => a.trendUp === true && !!a.tool, text: "\u7528\u91CF\u5728\u722C\u5761\u2014\u2014{tool} \u5E72\u5F97\u6700\u8D77\u52B2\u3002" },
    { when: (a) => a.trendUp === true, text: "\u7528\u91CF\u5728\u722C\u5761\uFF0C\u6211\u5728\u770B\u7740\u5462\u3002" },
    { when: (a) => a.trendUp === false && !!a.tool, text: "\u7528\u91CF\u5728\u6536\u655B\uFF0C{tool} \u4E5F\u8BE5\u6B47\u6B47\u4E86\u3002" },
    { when: (a) => a.trendUp === false, text: "\u7528\u91CF\u5728\u6536\u655B\uFF0C\u5E72\u5F97\u6F02\u4EAE\u3002" },
    { when: (a) => a.multiModel && !!a.tool, text: "\u591A\u7EBF\u4F5C\u6218\uFF0C{tool} \u51B2\u5728\u7B2C\u4E00\u7EBF\u3002" },
    { when: (a) => a.multiModel, text: "\u591A\u7EBF\u4F5C\u6218\uFF0C\u6307\u6325\u82E5\u5B9A\u3002" },
    { when: (a) => a.loaf, text: "\u4ECA\u5929\u6709\u70B9\u95F2\uFF0C\u6478\u9C7C\u4F7F\u6211\u5FEB\u4E50\u3002" },
    { when: (a) => !!a.tool, text: "\u4ECA\u5929 {tool} \u51FA\u52E4\u6700\u591A\uFF0C\u52B3\u6A21\u8BA4\u8BC1\u3002" },
    { when: () => true, text: "\u53C8\u662F\u597D\u597D\u5E72\u6D3B\u7684\u4E00\u5929\u3002" }
  ],
  en: [
    { when: (a) => a.hitPct >= 0.9, text: "Cache hit like a pro!" },
    { when: (a) => a.hitPct > 0 && a.hitPct < 0.5, text: "Cache still warming up." },
    { when: (a) => a.total >= 1e7, text: "Ten-million club \u2014 someone lit a rocket today." },
    { when: (a) => a.total >= 1e6, text: "Another day in the million club." },
    { when: (a) => a.total < 1e5 && a.total > 0, text: "Lean day. Tail's up!" },
    { when: (a) => a.total === 0, text: "Nothing on the clock yet today." },
    { when: (a) => a.trendUp === true && !!a.tool, text: "Usage climbing \u2014 {tool} leads the charge." },
    { when: (a) => a.trendUp === true, text: "Usage is climbing, I'm watching." },
    { when: (a) => a.trendUp === false && !!a.tool, text: "Usage tapering \u2014 {tool} can rest too." },
    { when: (a) => a.trendUp === false, text: "Usage is tapering. Nice." },
    { when: (a) => a.multiModel && !!a.tool, text: "Multi-model ops \u2014 {tool} on point." },
    { when: (a) => a.multiModel, text: "Multi-model ops, fully in control." },
    { when: (a) => a.loaf, text: "Quiet day. Loaf mode." },
    { when: (a) => !!a.tool, text: "{tool} tops today's attendance. Certified workhorse." },
    { when: () => true, text: "Another good day's work." }
  ]
};
function fillQuote(tpl, v) {
  return tpl.split("{range}").join(v.range).split("{tokens}").join(v.tokens).split("{hitPct}").join(v.hit).split("{models}").join(v.models).split("{tool}").join(v.tool ?? "");
}
function pickQuote(a, lang, custom, vars) {
  if (custom && custom.trim()) return fillQuote(custom.trim(), vars ?? { range: "", tokens: "", hit: "", models: "" });
  for (const r of POOL[lang]) if (r.when(a)) return r.text;
  return POOL[lang][POOL[lang].length - 1].text;
}

// src/client/UsagePanel.tsx
var import_react14 = require("react");

// src/client/dashboard-contract.ts
var routeKey = ({ provider, model }) => JSON.stringify([provider, model]);

// src/client/dashboard-view.ts
function reconcileDashboardFallback(state2, capability) {
  if (capability) return { legacy: false, hadCapability: true };
  return { legacy: state2.hadCapability ? true : state2.legacy, hadCapability: state2.hadCapability };
}
function shouldAutoSyncCost({ active, syncActive, snapshot, key, attemptedKey }) {
  return active && syncActive && !!snapshot && (!snapshot.pricingSnapshotId || snapshot.priceState.stale) && attemptedKey !== key;
}
function costSnapshotMatches(snapshot, span, usageRevision) {
  return snapshot.revision === usageRevision && snapshot.span.from === span.from && snapshot.span.to === span.to;
}
function selectTrend(window2, selection = {}) {
  if (!window2) return [];
  if (selection.route) {
    const key = typeof selection.route === "string" ? selection.route : routeKey(selection.route);
    return window2.routes.find((row) => routeKey(row.route) === key)?.points ?? [];
  }
  if (selection.provider === void 0) return window2.points;
  const rows = window2.routes.filter((row) => row.route.provider === selection.provider);
  if (rows.length === 0) return [];
  if (rows.length === 1) return rows[0].points;
  return window2.points.map((base, index) => ({
    from: base.from,
    to: base.to,
    tokens: rows.reduce((sum, row) => sum + (row.points[index]?.tokens ?? 0), 0),
    hitPct: null
  }));
}
function sumBucket(rows, read) {
  let sum = 0;
  for (const row of rows) {
    const value = read(row.totals);
    if (value === null || value === void 0) return null;
    sum += value;
  }
  return sum;
}
function groupTotals(rows) {
  const requestTotal = rows.reduce((sum, row) => sum + row.totals.requestTotal, 0);
  const cacheRead = sumBucket(rows, (t2) => t2.cacheRead);
  return {
    requestTotal,
    cacheRead,
    cacheWrite: sumBucket(rows, (t2) => t2.cacheWrite),
    uncachedInput: sumBucket(rows, (t2) => t2.uncachedInput),
    outputTokens: sumBucket(rows, (t2) => t2.outputTokens),
    userEst: null,
    requestCount: rows.reduce((sum, row) => sum + row.totals.requestCount, 0),
    hitPct: cacheRead === null || requestTotal === 0 ? 0 : cacheRead / requestTotal
  };
}
function usageDistribution(window2, mode) {
  if (mode !== "provider" && mode !== "model") throw new RangeError("Invalid usage distribution mode");
  const groups = /* @__PURE__ */ new Map();
  for (const row of window2?.routes ?? []) {
    const route = mode === "provider" ? { provider: row.route.provider, model: null } : { provider: row.route.provider, model: row.route.model };
    const key = routeKey(route);
    const group = groups.get(key);
    if (group) group.routes.push(row);
    else groups.set(key, { route, routes: [row] });
  }
  return [...groups].map(([key, group]) => ({
    key,
    route: group.route,
    label: mode === "provider" ? group.route.provider ?? "Unknown" : `${group.route.provider ?? "Unknown"} / ${group.route.model ?? "Unknown"}`,
    tokens: group.routes.reduce((sum, row) => sum + row.points.reduce((pointSum, point) => pointSum + point.tokens, 0), 0),
    totals: groupTotals(group.routes),
    routes: group.routes
  })).sort((a, b) => b.tokens - a.tokens || b.totals.requestTotal - a.totals.requestTotal || a.key.localeCompare(b.key));
}

// src/client/usage-export.ts
function legacyUsageProjection(window2) {
  return {
    span: window2.span,
    totals: window2.totals,
    points: window2.points,
    routes: window2.routes,
    tools: window2.tools
  };
}
function buildLegacyUsageText(title, overviewRows, projection, unknown, formatTokens) {
  return buildUsageText(title, overviewRows, unknown.models, projection.routes.map((row) => ({
    route: row.route.provider && row.route.model ? `${row.route.provider}/${row.route.model}` : unknown.route,
    requestTotal: row.totals.requestTotal
  })), formatTokens);
}
function buildUsageText(title, rows, modelsTitle, models, formatTokens) {
  return [
    title,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    `${modelsTitle}:`,
    ...models.map((model) => `${model.route}  ${formatTokens(model.requestTotal)}`)
  ].join("\n");
}
function legacyRangeLabel(preset, points, label, custom) {
  if (preset === "custom" && custom) return `${custom.from} ~ ${custom.to}`;
  if (!points.length) return label;
  const first = points[0].key, last = points[points.length - 1].key;
  const md = (key) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
  if (preset === "5h") {
    const start = `${md(first)} ${first.slice(11, 16)}`;
    const end = `${first.slice(0, 10) === last.slice(0, 10) ? "" : `${md(last)} `}${last.slice(11, 16)}`;
    return `${start}\u2013${end}`;
  }
  return `${md(first)} \u2013 ${md(last)}\uFF08${label}\uFF09`;
}
function toolsMetrics(tools) {
  const list = Array.isArray(tools) ? tools : [];
  let calls = 0, dur = 0, top = null, topDur = null;
  for (const x of list) {
    calls += x.count || 0;
    dur += x.durMs || 0;
    if (!top || (x.count || 0) > (top.count || 0)) top = x;
    if (!topDur || (x.durMs || 0) > (topDur.durMs || 0)) topDur = x;
  }
  return { calls, avgMs: calls > 0 ? dur / calls : 0, topCount: top ? top.count || 0 : 0, topDurMs: topDur ? topDur.durMs || 0 : 0, topName: top ? top.name : "\u2014", topDurName: topDur ? topDur.name : "\u2014" };
}

// src/client/UsagePanel.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
var dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
var queryKey = (query) => JSON.stringify(query);
function UsagePanel({ active, children, onUnsupported }) {
  const cfg = (0, import_react14.useSyncExternalStore)(cfgStore.subscribe, cfgStore.getSnapshot);
  const [query, setQuery] = (0, import_react14.useState)({ preset: "7d" });
  const [custom, setCustom] = (0, import_react14.useState)(() => ({ from: dayKey(new Date(Date.now() - 6 * 864e5)), to: dayKey(/* @__PURE__ */ new Date()) }));
  const [loaded, setLoaded] = (0, import_react14.useState)(null);
  const [busy, setBusy] = (0, import_react14.useState)(true);
  const [error, setError] = (0, import_react14.useState)("");
  const [trendRoute, setTrendRoute] = (0, import_react14.useState)(null);
  const [trendHover, setTrendHover] = (0, import_react14.useState)(null);
  const [trendMode, setTrendMode] = (0, import_react14.useState)("all");
  const [trendProviderKey, setTrendProviderKey] = (0, import_react14.useState)("");
  const [distributionMode, setDistributionMode] = (0, import_react14.useState)("provider");
  const [distributionOpen, setDistributionOpen] = (0, import_react14.useState)(true);
  const [activityOpen, setActivityOpen] = (0, import_react14.useState)(false);
  const [priced, setPriced] = (0, import_react14.useState)(null);
  const [copied, setCopied] = (0, import_react14.useState)(false);
  const [refreshNonce, setRefreshNonce] = (0, import_react14.useState)(0);
  const [quoteOpen, setQuoteOpen] = (0, import_react14.useState)(false);
  const [quoteDraft, setQuoteDraft] = (0, import_react14.useState)(() => {
    try {
      return localStorage.getItem("dyn-foxbell-pet:export-quote") ?? "";
    } catch {
      return "";
    }
  });
  const request = (0, import_react14.useRef)(0);
  const effectiveQuery = query.preset === "custom" ? { ...query, from: custom.from, to: custom.to } : query;
  const effectiveKey = queryKey(effectiveQuery);
  const window2 = loaded?.key === effectiveKey ? loaded.window : null;
  const currentKey = (0, import_react14.useRef)(effectiveKey);
  currentKey.current = active ? effectiveKey : "";
  const usageStamp = (0, import_react14.useSyncExternalStore)(appStore.subscribe, () => {
    const diag = appStore.getSnapshot()?.diag;
    const edge = query.preset === "5h" ? diag?.usageHour : query.preset === "custom" ? "" : diag?.usageDay;
    return `${diag?.usageRevision ?? ""}:${edge ?? ""}`;
  });
  const retryKey = JSON.stringify([effectiveKey, usageStamp]);
  const lastConflict = (0, import_react14.useRef)("");
  const retryUsage = () => {
    lastConflict.current = "";
    setRefreshNonce((value) => value + 1);
  };
  const onWindowConflict = (0, import_react14.useCallback)(() => {
    if (lastConflict.current === retryKey) {
      setError(t("dash2.queryFailed"));
      return;
    }
    lastConflict.current = retryKey;
    setRefreshNonce((value) => value + 1);
  }, [retryKey]);
  (0, import_react14.useEffect)(() => {
    if (!active) return;
    const id = ++request.current;
    setBusy(true);
    setError("");
    apiGetUsageWindow(effectiveQuery).then((value) => {
      if (request.current !== id || currentKey.current !== effectiveKey) return;
      setLoaded({ key: effectiveKey, window: value });
    }).catch((reason) => {
      if (request.current !== id || currentKey.current !== effectiveKey) return;
      const status = reason?.status;
      const code = reason?.code;
      if (status === 404 || status === 403 || code === "capability-unavailable" || code === "owner-required") {
        onUnsupported();
        return;
      }
      setError(t("dash2.queryFailed"));
    }).finally(() => {
      if (request.current === id) setBusy(false);
    });
    return () => {
      request.current += 1;
    };
  }, [active, effectiveKey, onUnsupported, refreshNonce, usageStamp]);
  const costKey = window2 ? JSON.stringify([effectiveKey, window2.span.from, window2.span.to, window2.revision]) : "";
  const costCsv = priced?.key === costKey ? priced.csv : null;
  const onCostExport = (0, import_react14.useCallback)((csv) => {
    if (csv !== null) setPriced({ key: costKey, csv });
    else setPriced((old) => old?.key === costKey ? null : old);
  }, [costKey]);
  (0, import_react14.useEffect)(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const points = (0, import_react14.useMemo)(() => {
    const provider = trendProviderKey ? JSON.parse(trendProviderKey) : void 0;
    const selected = selectTrend(window2, trendMode === "model" && trendRoute ? { route: trendRoute } : trendMode === "provider" && trendProviderKey ? { provider } : {});
    return selected.map((point) => {
      const date = new Date(point.from);
      const label = window2?.span.grain === "hour" ? `${String(date.getMonth() + 1)}/${String(date.getDate())} ${String(date.getHours()).padStart(2, "0")}:00` : `${date.getMonth() + 1}/${date.getDate()}`;
      return { label, value: point.tokens, key: String(point.from), hitPct: point.hitPct ?? void 0 };
    });
  }, [window2, trendRoute, trendMode, trendProviderKey]);
  const distribution = (0, import_react14.useMemo)(() => usageDistribution(window2, distributionMode), [window2, distributionMode]);
  const trendProviders = (0, import_react14.useMemo)(() => {
    const providers = /* @__PURE__ */ new Map();
    for (const row of window2?.routes ?? []) providers.set(JSON.stringify(row.route.provider), row.route.provider);
    return [...providers].map(([key, value]) => ({ key, value }));
  }, [window2]);
  (0, import_react14.useEffect)(() => {
    if (!window2?.routes.length) return;
    if (trendMode === "provider" && !trendProviders.some((item) => item.key === trendProviderKey)) setTrendProviderKey(trendProviders[0]?.key ?? "");
    if (trendMode === "model" && !window2.routes.some((row) => routeKey(row.route) === trendRoute)) setTrendRoute(routeKey(window2.routes[0].route));
  }, [window2, trendMode, trendProviders, trendProviderKey, trendRoute]);
  const totalTokens = window2?.points.reduce((sum, point) => sum + point.tokens, 0) ?? 0;
  const missing = new Set(window2?.unobservedBuckets ?? []);
  const requestMissing = missing.has("inputTokens") || missing.has("cacheReadTokens");
  const overviewRows = window2 ? [
    [t("dash.g.uncachedInput"), window2.totals.uncachedInput == null ? "\u2014" : fmtTokens(window2.totals.uncachedInput)],
    [t("dash.g.cacheRead"), window2.totals.cacheRead == null ? "\u2014" : fmtTokens(window2.totals.cacheRead)],
    [t("dash.g.cacheWrite"), window2.totals.cacheWrite == null ? "\u2014" : fmtTokens(window2.totals.cacheWrite)],
    [t("dash.g.output"), window2.totals.outputTokens == null ? "\u2014" : fmtTokens(window2.totals.outputTokens)],
    [t("dash.g.requestTotal"), requestMissing ? "\u2014" : fmtTokens(window2.totals.requestTotal)],
    [t("dash.g.hitPct"), requestMissing ? "\u2014" : fmtPct(window2.totals.hitPct)],
    [t("dash.g.requests"), String(window2.totals.requestCount)],
    [t("dash.g.asOf"), (/* @__PURE__ */ new Date()).toLocaleTimeString()]
  ] : [];
  const activity = toolsMetrics(window2?.tools);
  const hitCompare = window2 && !requestMissing && window2.totals.requestTotal > 0 ? (() => {
    const current2 = window2.totals.hitPct;
    const previous = window2.previousHitPct;
    if (previous === null || previous === void 0) return t("dash.hitCur", { a: fmtPct(current2) });
    const raw = (current2 - previous) * 100;
    const delta = `${raw > 0 ? "+" : raw < 0 ? "-" : "\xB1"}${Math.abs(raw).toFixed(1)}pt`;
    return t("dash.hitCompare", { a: fmtPct(current2), b: fmtPct(previous), d: delta });
  })() : "";
  const exportRange = (preset) => t(preset === "today" ? "dash2.range.today" : `dash.tab.${preset}`);
  const copyText = async () => {
    if (!window2) return;
    const text2 = buildLegacyUsageText(
      `${t("dash.panelTitle")} \xB7 ${exportRange(effectiveQuery.preset)}`,
      overviewRows,
      legacyUsageProjection(window2),
      { models: t("dash.models"), route: t("dash2.unknown") },
      fmtTokens
    );
    try {
      await navigator.clipboard.writeText(text2);
      setCopied(true);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text2;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied2 = document.execCommand("copy");
        textarea.remove();
        if (!copied2) throw new Error("copy rejected");
        setCopied(true);
      } catch {
        setError(t("dash2.copyFailed"));
      }
    }
  };
  const exportImage = async (customQuote) => {
    if (!window2) return;
    const exportUsage = legacyUsageProjection(window2);
    const runtime = appStore.getRuntime();
    const sprite = await loadSprite(runtime.spriteUrl);
    const previousPoint = exportUsage.points[exportUsage.points.length - 2];
    const latestPoint = exportUsage.points[exportUsage.points.length - 1];
    const trendUp = !previousPoint || !latestPoint ? null : previousPoint.tokens < latestPoint.tokens ? true : previousPoint.tokens > latestPoint.tokens ? false : null;
    const pace = appStore.getSnapshot()?.dashboard?.pace?.tier ?? "";
    const toolStats = toolsMetrics(exportUsage.tools);
    const vars = {
      range: exportRange(effectiveQuery.preset),
      tokens: fmtTokens(totalTokens),
      hit: fmtPct(exportUsage.totals.hitPct),
      models: String(exportUsage.routes.length),
      tool: exportUsage.tools[0]?.name ?? ""
    };
    const quote = customQuote?.trim() ? fillQuote(customQuote.trim(), vars) : pickQuote({ total: totalTokens, hitPct: exportUsage.totals.hitPct, trendUp, multiModel: exportUsage.routes.length > 1, loaf: pace.startsWith("loaf"), tool: vars.tool }, getLang(), void 0, vars);
    const exportPoints = exportUsage.points.map((point) => {
      const d = new Date(point.from);
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return { key: `${dayKey(d)}T${time}`, label: exportUsage.span.grain === "hour" ? time : `${d.getMonth() + 1}/${d.getDate()}`, value: point.tokens };
    });
    const rangeLabel = legacyRangeLabel(effectiveQuery.preset, exportPoints, vars.range, custom);
    const maxModel = Math.max(1, ...exportUsage.routes.map((row) => row.totals.requestTotal));
    const blob = await exportDashboardImage({
      rangeLabel,
      hero: `${missing.size ? "~" : ""}${totalTokens.toLocaleString("en-US")}`,
      heroSub: `${t("dash.g.asOf")} ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`,
      metrics: overviewRows.slice(0, 6),
      trendTitle: t("dash.trendTitle"),
      peakLabel: t("dash.peak", { v: fmtTokens(Math.max(0, ...exportUsage.points.map((point) => point.tokens))) }),
      points: exportPoints,
      models: exportUsage.routes.map((row) => ({ name: row.route.provider && row.route.model ? `${row.route.provider}/${row.route.model}` : t("dash2.unknown"), val: fmtTokens(row.totals.requestTotal), share: row.totals.requestTotal / maxModel })),
      tools2x2: [
        [t("dash.g.toolCalls"), String(toolStats.calls)],
        [t("dash.g.toolAvg"), fmtDur(toolStats.avgMs)],
        [t("dash.g.toolTopCount"), `${toolStats.topName} ${toolStats.topCount}`],
        [t("dash.g.toolTopDur"), `${toolStats.topDurName} ${fmtDur(toolStats.topDurMs)}`]
      ],
      quote,
      poseRow: resolvePoseRow(cfg.exportPose),
      sprite,
      frameW: sprite ? sprite.naturalWidth / maxAnimCols() : 0,
      frameH: sprite ? sprite.naturalHeight / runtime.rows : 0
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `foxbell-dashboard-${effectiveQuery.preset}.png`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e4);
  };
  const downloadCostCsv = () => {
    if (!costCsv) return;
    const url = URL.createObjectURL(new Blob([costCsv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `foxbell-api-equivalent-cost-usd-${effectiveQuery.preset}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e4);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash", "aria-busy": busy, children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-tabs", "aria-label": t("dash2.usageTab"), children: [
        ["5h", "today", "7d", "30d", "custom"].map((preset) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-tab" + (query.preset === preset ? " is-active" : ""), onClick: () => {
          if (preset !== query.preset) setQuery(preset === "custom" ? { preset, ...custom } : { preset });
        }, children: t(`dash2.range.${preset}`) }, preset)),
        query.preset === "custom" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { className: "dyn-pet-dash-dates", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("input", { "aria-label": t("dash2.from"), type: "date", value: custom.from, max: custom.to, onChange: (event) => {
            const from = event.target.value;
            setCustom((old) => ({ ...old, from }));
            setQuery({ preset: "custom", from, to: custom.to });
          } }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u2013" }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("input", { "aria-label": t("dash2.to"), type: "date", value: custom.to, min: custom.from, max: dayKey(/* @__PURE__ */ new Date()), onChange: (event) => {
            const to = event.target.value;
            setCustom((old) => ({ ...old, to }));
            setQuery({ preset: "custom", from: custom.from, to });
          } })
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-actbtn", disabled: !window2, onClick: () => void copyText(), children: copied ? t("dash.export.copied") : t("dash.export.copyText") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-actbtn", disabled: !window2, onClick: () => void exportImage(), children: t("dash.export.exportImage") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-actbtn" + (quoteOpen ? " is-active" : ""), disabled: !window2, onClick: () => setQuoteOpen((value) => !value), children: t("dash.export.exportCustom") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-actbtn", disabled: !costCsv, onClick: downloadCostCsv, children: t("dash2.costCsv") })
      ] })
    ] }),
    quoteOpen ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-quotebar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("input", { type: "text", value: quoteDraft, placeholder: t("dash.export.quotePlaceholder"), onChange: (event) => {
        const value = event.target.value;
        setQuoteDraft(value);
        try {
          localStorage.setItem("dyn-foxbell-pet:export-quote", value);
        } catch {
        }
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => void exportImage(quoteDraft), children: t("dash.export.export") })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dyn-pet-dash-notice", children: t("dash2.estimateNotice") }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-error", role: "alert", children: [
      error,
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: retryUsage, children: t("speed.retry") })
    ] }) : null,
    busy ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-empty", children: t("dash.loading") }) : null,
    window2 ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
      window2.coverage !== "ready" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-notice", children: t(`dash2.coverage.${window2.coverage}`) }) : null,
      missing.size ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-notice", children: t("dash2.unobserved", { buckets: [...missing].map((bucket) => t(`cost.bucket.${bucket}`)).join(", ") }) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "dyn-pet-dash-hero", "aria-label": t("dash2.overview"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-hero-label", children: t("dash.heroTotal", { range: t(`dash2.range.${effectiveQuery.preset}`) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-hero-num", children: [
          missing.size ? "~" : "",
          fmtTokens(totalTokens)
        ] }),
        hitCompare ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-weekhit", children: hitCompare }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-rows", children: overviewRows.map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: label }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("strong", { children: value })
      ] }, label)) }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "dyn-pet-dash-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-card-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: t("dash.trendTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-actions", children: ["all", "provider", "model"].map((mode) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-actbtn" + (trendMode === mode ? " is-active" : ""), onClick: () => setTrendMode(mode), children: t(mode === "all" ? "dash2.allRoutes" : mode === "provider" ? "dash2.byProvider" : "dash2.byModel") }, mode)) })
        ] }),
        trendMode === "provider" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("select", { "aria-label": t("dash2.trendFilter"), value: trendProviderKey, onChange: (event) => setTrendProviderKey(event.target.value), children: trendProviders.map((item) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: item.key, children: item.value ?? t("dash2.unknown") }, item.key)) }) : null,
        trendMode === "model" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("select", { "aria-label": t("dash2.trendFilter"), value: trendRoute ?? "", onChange: (event) => setTrendRoute(event.target.value || null), children: window2.routes.map((row) => {
          const key = routeKey(row.route);
          return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("option", { value: key, children: [
            row.route.provider ?? t("dash2.unknown"),
            " / ",
            row.route.model ?? t("dash2.unknown")
          ] }, key);
        }) }) : null,
        points.length ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-trendwrap", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
            TrendChart,
            {
              points,
              width: 560,
              height: 168,
              showLabels: true,
              idPrefix: "dyn-pet-usage-v2",
              hover: trendHover,
              onPoint: setTrendHover,
              ariaLabel: t("dash.trendTitle")
            }
          ),
          trendHover !== null && points[trendHover] ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-tooltip", style: { left: "50%", top: "0%" }, children: [
            points[trendHover].label,
            " \xB7 ",
            t("dash2.tokens"),
            " ",
            fmtTokens(points[trendHover].value),
            points[trendHover].hitPct === void 0 ? null : ` \xB7 ${t("dash.g.hitPct")} ${fmtPct(points[trendHover].hitPct)}`
          ] }) : null
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-empty", children: t("dash.noData") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "dyn-pet-dash-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("button", { className: "dyn-pet-dash-card-head dyn-pet-dash-collapse", "aria-expanded": distributionOpen, onClick: () => setDistributionOpen((value) => !value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: t("dash2.distribution") }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: distributionOpen ? "\u2212" : "+" })
        ] }),
        distributionOpen ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-actbtn" + (distributionMode === "provider" ? " is-active" : ""), onClick: () => setDistributionMode("provider"), children: t("dash2.byProvider") }),
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { className: "dyn-pet-dash-actbtn" + (distributionMode === "model" ? " is-active" : ""), onClick: () => setDistributionMode("model"), children: t("dash2.byModel") })
          ] }),
          distribution.length ? distribution.map((row) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-model", children: [
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "dyn-pet-dash-model-name", title: row.label, children: row.label }),
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "dyn-pet-dash-model-val", children: fmtTokens(row.totals.requestTotal) }),
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "dyn-pet-dash-model-bar", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("i", { style: { width: `${Math.max(2, row.totals.requestTotal / Math.max(1, distribution[0].totals.requestTotal) * 100)}%` } }) })
          ] }, row.key)) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-empty", children: t("dash.noData") })
        ] }) : null
      ] }),
      children?.({ query: effectiveQuery, span: window2.span, usageRevision: window2.revision, onExportReady: onCostExport, onWindowConflict }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "dyn-pet-dash-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("button", { className: "dyn-pet-dash-card-head dyn-pet-dash-collapse", "aria-expanded": activityOpen, onClick: () => setActivityOpen((value) => !value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: t("dash2.workActivity") }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: activityOpen ? "\u2212" : "+" })
        ] }),
        activityOpen ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-tools", children: [
          [t("dash2.activitySessions"), window2.activitySessions ?? "\u2014"],
          [t("dash.g.toolCalls"), activity.calls],
          [t("dash.g.toolAvg"), activity.calls ? fmtDur(activity.avgMs) : "\u2014"],
          [t("dash.g.toolTopCount"), `${activity.topName} ${activity.topCount}`],
          [t("dash.g.toolTopDur"), `${activity.topDurName} ${fmtDur(activity.topDurMs)}`]
        ].map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dyn-pet-dash-toolcell", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("strong", { children: value })
        ] }, label)) }) : null
      ] })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dyn-pet-dash-foot", children: t("dash.caliber") })
  ] });
}

// src/client/CostPanel.tsx
var import_react16 = require("react");

// src/client/PriceRulesDialog.tsx
var import_react15 = require("react");
var import_jsx_runtime17 = require("react/jsx-runtime");
var BUCKETS = ["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"];
var emptyCells = () => ({ inputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null });
var clone = (value) => JSON.parse(JSON.stringify(value));
async function attemptSavePriceDraft(draft, revision, save) {
  try {
    return { ok: true, snapshot: await save(revision, draft) };
  } catch (error) {
    return { ok: false, error, draft, revision };
  }
}
function blankRule(route) {
  return { kind: "fixed", model: route?.model ?? "", provider: route?.provider ?? null, currency: "USD", prices: emptyCells() };
}
function Cells({ value, onChange, labelledBy }) {
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "dyn-pet-price-cells", role: "group", "aria-labelledby": labelledBy, children: BUCKETS.map((bucket) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("label", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: t(`cost.bucket.${bucket}`) }),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("input", { inputMode: "decimal", value: value[bucket] ?? "", placeholder: "\u2014", onChange: (event) => onChange({ ...value, [bucket]: event.target.value === "" ? null : event.target.value }) })
  ] }, bucket)) });
}
function PriceRulesDialog({ initial, route, onSave, onClose }) {
  const [rules, setRules] = (0, import_react15.useState)(() => {
    const draft = clone(initial.rules);
    if (route && !draft.some((rule) => rule.model === route.model && rule.provider === route.provider)) draft.push(blankRule(route));
    return draft.length ? draft : [blankRule(route)];
  });
  const revision = initial.revision;
  const [busy, setBusy] = (0, import_react15.useState)(false);
  const [error, setError] = (0, import_react15.useState)(null);
  const host = (0, import_react15.useRef)(null);
  (0, import_react15.useEffect)(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(host.current?.querySelectorAll('button,input,select,[tabindex="0"]') ?? []).filter((node) => !node.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [onClose]);
  const update = (index, next) => setRules((old) => old.map((rule, i) => i === index ? next : rule));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await attemptSavePriceDraft(rules, revision, onSave);
      if (result.ok) {
        onClose();
        return;
      }
      const reason = result.error;
      setError(reason);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { ref: host, className: "dyn-pet-price-dialog-focus", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(Modal, { title: t("cost.manage"), wide: true, onClose, footer: /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Btn, { onClick: onClose, disabled: busy, children: t("common.cancel") }),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Btn, { kind: "primary", onClick: () => void save(), disabled: busy, children: busy ? t("cost.saving") : t("cost.save") })
  ] }), children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { children: t("cost.ruleHelp") }),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(InlineError, { msg: error ? petErrMsg(error, t) : null }),
    rules.map((rule, index) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("fieldset", { className: "dyn-pet-price-rule", children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("legend", { children: t("cost.ruleN", { n: index + 1 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "dyn-pet-price-rule-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("label", { children: [
          t("cost.model"),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("input", { value: rule.model, onChange: (event) => update(index, { ...rule, model: event.target.value }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("label", { children: [
          t("cost.providerOptional"),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("input", { value: rule.provider ?? "", onChange: (event) => update(index, { ...rule, provider: event.target.value || null }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("label", { children: [
          t("cost.currency"),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("select", { value: rule.currency, onChange: (event) => update(index, { ...rule, currency: event.target.value }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("option", { children: "USD" }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("option", { children: "CNY" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("label", { children: [
          t("cost.kind"),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("select", { value: rule.kind, onChange: (event) => {
            if (event.target.value === "fixed") update(index, { kind: "fixed", model: rule.model, provider: rule.provider, currency: rule.currency, prices: rule.kind === "fixed" ? rule.prices : rule.offpeak });
            else update(index, { kind: "time", model: rule.model, provider: rule.provider, currency: rule.currency, zone: "local", windows: [{ start: 9, end: 18 }], peak: rule.kind === "fixed" ? rule.prices : rule.peak, offpeak: rule.kind === "time" ? rule.offpeak : emptyCells() });
          }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("option", { value: "fixed", children: t("cost.fixed") }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("option", { value: "time", children: t("cost.time") })
          ] })
        ] })
      ] }),
      rule.kind === "fixed" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { id: `price-fixed-${index}`, children: t("cost.fixedPrices") }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Cells, { labelledBy: `price-fixed-${index}`, value: rule.prices, onChange: (prices) => update(index, { ...rule, prices }) })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("label", { children: [
          t("cost.zone"),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("select", { value: rule.zone, onChange: (event) => update(index, { ...rule, zone: event.target.value }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("option", { value: "local", children: t("cost.zone.local") }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("option", { value: "asiaShanghai", children: t("cost.zone.asiaShanghai") }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("option", { value: "utc", children: "UTC" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "dyn-pet-price-windows", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: t("cost.windows") }),
          rule.windows.map((window2, wi) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("input", { "aria-label": t("cost.windowStart"), type: "number", min: 0, max: 23, value: window2.start, onChange: (event) => update(index, { ...rule, windows: rule.windows.map((item, i) => i === wi ? { ...item, start: Number(event.target.value) } : item) }) }),
            "\u2013",
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("input", { "aria-label": t("cost.windowEnd"), type: "number", min: 0, max: 24, value: window2.end, onChange: (event) => update(index, { ...rule, windows: rule.windows.map((item, i) => i === wi ? { ...item, end: Number(event.target.value) } : item) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Btn, { onClick: () => update(index, { ...rule, windows: rule.windows.filter((_, i) => i !== wi) }), children: "\u2212" })
          ] }, wi)),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Btn, { onClick: () => update(index, { ...rule, windows: [...rule.windows, { start: 18, end: 23 }] }), children: "+" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { id: `price-peak-${index}`, children: t("cost.peakPrices") }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Cells, { labelledBy: `price-peak-${index}`, value: rule.peak, onChange: (peak) => update(index, { ...rule, peak }) }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { id: `price-offpeak-${index}`, children: t("cost.offpeakPrices") }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Cells, { labelledBy: `price-offpeak-${index}`, value: rule.offpeak, onChange: (offpeak) => update(index, { ...rule, offpeak }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Btn, { kind: "danger", onClick: () => setRules((old) => old.filter((_, i) => i !== index)), children: t("cost.removeRule") })
    ] }, index)),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Btn, { onClick: () => setRules((old) => [...old, blankRule(route)]), children: t("cost.addRule") }),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "dyn-pet-dash-notice", children: t("cost.saveSummary", { revision }) })
  ] }) });
}

// src/client/CostPanel.tsx
var import_jsx_runtime18 = require("react/jsx-runtime");
function visibleCostRows(rows, mode, expanded) {
  const groups = [];
  if (mode === "model") {
    for (const row of rows) groups.push({ key: routeKey(row.route), label: `${row.route.provider ?? "\u2014"} / ${row.route.model ?? "\u2014"}`, rows: [row] });
  } else {
    const byProvider = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const provider = row.route.provider ?? "\u2014";
      const list = byProvider.get(provider) ?? [];
      list.push(row);
      byProvider.set(provider, list);
    }
    for (const [label, groupRows] of byProvider) groups.push({ key: label, label, rows: groupRows });
  }
  if (expanded) return groups;
  let remaining = 5;
  return groups.map((group) => {
    const selected = group.rows.slice(0, remaining);
    remaining -= selected.length;
    return { ...group, rows: selected };
  }).filter((group) => group.rows.length > 0);
}
function canExportCost(snapshot, currentQueryKey) {
  return !!snapshot && snapshot.queryKey === currentQueryKey && typeof snapshot.csv === "string" && snapshot.csv.length > 0;
}
function useCostView(active, query, span, usageRevision, onWindowConflict, syncActive = true) {
  const [lastGood, setLastGood] = (0, import_react16.useState)(null);
  const [busy, setBusy] = (0, import_react16.useState)(false);
  const [error, setError] = (0, import_react16.useState)(null);
  const [reloadNonce, setReloadNonce] = (0, import_react16.useState)(0);
  const generation2 = (0, import_react16.useRef)(0);
  const attemptedSync = (0, import_react16.useRef)("");
  const syncActiveRef = (0, import_react16.useRef)(syncActive);
  syncActiveRef.current = syncActive;
  const key = JSON.stringify([query, span.from, span.to, usageRevision]);
  const snapshot = lastGood?.key === key ? lastGood.snapshot : null;
  const snapshotKey = lastGood?.key ?? "";
  const currentKey = (0, import_react16.useRef)(key);
  currentKey.current = active ? key : "";
  const reload = (0, import_react16.useCallback)(() => setReloadNonce((value) => value + 1), []);
  (0, import_react16.useEffect)(() => {
    if (!active) return;
    const id = ++generation2.current;
    setError(null);
    setBusy(true);
    const current2 = () => generation2.current === id && currentKey.current === key;
    const accept = (value) => {
      if (costSnapshotMatches(value, span, usageRevision)) return true;
      onWindowConflict?.();
      return false;
    };
    const load = async () => {
      try {
        const value = await apiGetCost(query, span, usageRevision);
        if (!current2() || !accept(value)) return;
        setLastGood({ key, snapshot: value });
        if (shouldAutoSyncCost({ active, syncActive: syncActiveRef.current, snapshot: value, key, attemptedKey: attemptedSync.current })) {
          attemptedSync.current = key;
          await apiSyncPricing(false);
          if (!current2() || !syncActiveRef.current) return;
          const refreshed = await apiGetCost(query, span, usageRevision);
          if (!current2() || !accept(refreshed)) return;
          setLastGood({ key, snapshot: refreshed });
        }
      } catch (reason) {
        if (current2()) {
          if (reason?.status === 409) onWindowConflict?.();
          else setError(reason);
        }
      } finally {
        if (current2()) setBusy(false);
      }
    };
    void load();
    return () => {
      generation2.current += 1;
    };
  }, [active, key, reloadNonce]);
  (0, import_react16.useEffect)(() => {
    if (!active) {
      generation2.current += 1;
      attemptedSync.current = "";
    }
  }, [active]);
  (0, import_react16.useEffect)(() => {
    if (shouldAutoSyncCost({ active, syncActive, snapshot, key, attemptedKey: attemptedSync.current })) reload();
  }, [active, syncActive, snapshot, key, reload]);
  return {
    snapshot,
    snapshotKey,
    queryKey: key,
    busy,
    error,
    reload,
    isCurrent: () => currentKey.current === key
  };
}
function CostPanel({ active, query, span, usageRevision, onExportReady, onWindowConflict }) {
  const [costOpen, setCostOpen] = (0, import_react16.useState)(true);
  const view = useCostView(active, query, span, usageRevision, onWindowConflict, costOpen);
  const [currency, setCurrency] = (0, import_react16.useState)("USD");
  const [mode, setMode] = (0, import_react16.useState)("provider");
  const [expanded, setExpanded] = (0, import_react16.useState)(false);
  const [openRows, setOpenRows] = (0, import_react16.useState)(/* @__PURE__ */ new Set());
  const [ruleSnapshot, setRuleSnapshot] = (0, import_react16.useState)(null);
  const [editingRoute, setEditingRoute] = (0, import_react16.useState)(void 0);
  const [editing, setEditing] = (0, import_react16.useState)(false);
  const closeRules = (0, import_react16.useCallback)(() => setEditing(false), []);
  const [syncing, setSyncing] = (0, import_react16.useState)(false);
  const [localError, setLocalError] = (0, import_react16.useState)(null);
  (0, import_react16.useEffect)(() => {
    onExportReady(active && canExportCost(view.snapshot ? { queryKey: view.snapshotKey, csv: view.snapshot.csv } : null, view.queryKey) ? view.snapshot.csv : null);
    return () => onExportReady(null);
  }, [active, view.snapshot, view.snapshotKey, view.queryKey, onExportReady]);
  const groups = (0, import_react16.useMemo)(() => visibleCostRows(view.snapshot?.rows ?? [], mode, expanded), [view.snapshot, mode, expanded]);
  const openRules = async (route) => {
    try {
      const latest = await apiGetPriceRules();
      const issue = latest.error;
      if (issue) throw { code: issue.code, detail: issue.detail, params: {} };
      setRuleSnapshot(latest);
      setEditingRoute(route);
      setEditing(true);
      setLocalError(null);
    } catch (reason) {
      setLocalError(reason);
    }
  };
  const saveRules = async (expectedRevision, rules) => {
    const saved = await apiSavePriceRules(expectedRevision, rules);
    setRuleSnapshot(saved);
    if (view.isCurrent()) view.reload();
    return saved;
  };
  const manualSync = async () => {
    setSyncing(true);
    setLocalError(null);
    try {
      await apiSyncPricing(true);
      if (view.isCurrent()) view.reload();
    } catch (reason) {
      if (view.isCurrent()) setLocalError(reason);
    } finally {
      setSyncing(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("section", { className: "dyn-pet-dash-card dyn-pet-cost", children: [
    /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "dyn-pet-dash-card-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("button", { className: "dyn-pet-dash-collapse", "aria-expanded": costOpen, onClick: () => setCostOpen((value) => !value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: t("cost.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: costOpen ? "\u2212" : "+" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "dyn-pet-dash-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => setCurrency(currency === "USD" ? "CNY" : "USD"), children: currency }),
        /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => void openRules(), children: t("cost.manage") }),
        /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { className: "dyn-pet-dash-actbtn", disabled: syncing, onClick: () => void manualSync(), children: syncing ? t("cost.syncing") : t("cost.sync") })
      ] })
    ] }),
    costOpen ? /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(import_jsx_runtime18.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("p", { className: "dyn-pet-dash-notice", children: t("cost.disclaimer") }),
      view.snapshot?.priceState.error ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("p", { className: "dyn-pet-dash-notice", children: t("cost.lastGood", { date: view.snapshot.priceState.syncedAt ? new Date(view.snapshot.priceState.syncedAt).toLocaleString() : "\u2014" }) }) : null,
      view.busy ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "dyn-pet-dash-empty", children: t("dash.loading") }) : null,
      view.error || localError ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "dyn-pet-dash-error", role: "alert", children: petErrMsg(view.error ?? localError, t) }) : null,
      view.snapshot ? /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(import_jsx_runtime18.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "dyn-pet-dash-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { className: "dyn-pet-dash-actbtn" + (mode === "provider" ? " is-active" : ""), onClick: () => setMode("provider"), children: t("cost.byProvider") }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { className: "dyn-pet-dash-actbtn" + (mode === "model" ? " is-active" : ""), onClick: () => setMode("model"), children: t("cost.byModel") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "dyn-pet-cost-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: t("cost.route") }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: t("cost.estimate") }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: t("cost.tokens") }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: t("cost.hit") }),
          /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: t("cost.details") })
        ] }),
        groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "dyn-pet-cost-group", children: [
          mode === "provider" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "dyn-pet-cost-provider", children: group.label }) : null,
          group.rows.map((row) => {
            const key = routeKey(row.route);
            const reading = currency === "USD" ? row.usd : row.cny;
            const pricing = row.pricing?.[currency] ?? row;
            const open = openRows.has(key);
            return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "dyn-pet-cost-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { title: `${row.route.provider ?? "\u2014"}/${row.route.model ?? "\u2014"}`, children: mode === "model" ? `${row.route.provider ?? t("dash2.unknown")} / ${row.route.model ?? t("dash2.unknown")}` : row.route.model ?? t("dash2.unknown") }),
                /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("strong", { children: [
                  reading.amount === null ? "\u2014" : `${currency === "USD" ? "$" : "\xA5"}${fmtMoney(reading.amount)}`,
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("small", { children: t(`cost.status.${reading.status}`) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: row.tokenUsage === null ? "\u2014" : fmtTokens(row.tokenUsage) }),
                /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: row.hitPct === null ? "\u2014" : `${(row.hitPct * 100).toFixed(1)}%` }),
                /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { className: "dyn-pet-dash-actbtn", "aria-expanded": open, onClick: () => setOpenRows((old) => {
                  const next = new Set(old);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                }), children: open ? "\u2212" : "+" })
              ] }),
              open ? /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "dyn-pet-cost-detail", children: [
                /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { children: [
                  t("cost.coverage"),
                  ": ",
                  reading.coverageRate === null ? "\u2014" : `${(reading.coverageRate * 100).toFixed(1)}%`,
                  " \xB7 ",
                  t("cost.pricedTokens"),
                  ": ",
                  reading.pricedTokens,
                  " \xB7 ",
                  t("cost.unpricedTokens"),
                  ": ",
                  reading.unpricedTokens ?? "\u2014"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { children: [
                  t("cost.basis"),
                  ": ",
                  t(`cost.basis.${pricing.pricingBasis}`),
                  " \xB7 ",
                  t("cost.rule"),
                  ": ",
                  t(`cost.rule.${pricing.priceRuleKind}`),
                  " \xB7 ",
                  pricing.timePriceDailyFallback ? t("cost.dailyFallback") : ""
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => void openRules(row.route), children: t("cost.manage") }),
                row.details[currency].map((detail) => /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "dyn-pet-cost-detail-row", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: t(`cost.bucket.${detail.bucket}`) }),
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: detail.tokens ?? "\u2014" }),
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: detail.unitPrice === null ? "\u2014" : `${detail.unitPrice} / 1M` }),
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { children: detail.amount === null ? "\u2014" : fmtMoney(detail.amount) }),
                  /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("small", { children: [detail.source, detail.converted ? t("cost.converted") : null, detail.sourceAt == null ? null : new Date(detail.sourceAt).toLocaleDateString()].filter(Boolean).join(" \xB7 ") })
                ] }, detail.bucket))
              ] }) : null
            ] }, key);
          })
        ] }, group.key)),
        view.snapshot.rows.length > 5 ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => setExpanded((value) => !value), children: expanded ? t("cost.showLess") : t("cost.showAll", { count: view.snapshot.rows.length }) }) : null
      ] }) : null
    ] }) : null,
    editing && ruleSnapshot ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(PriceRulesDialog, { initial: ruleSnapshot, route: editingRoute, onSave: saveRules, onClose: closeRules }) : null
  ] });
}

// src/client/SpeedPanel.tsx
var import_react18 = require("react");

// src/client/SpeedChart.tsx
var import_react17 = require("react");

// src/client/speed-view.ts
function text(value) {
  return value ?? "";
}
function routeName(row) {
  return `${text(row.route.provider)}/${text(row.route.model)}`;
}
function compareText(a, b) {
  const al = a.toLocaleLowerCase();
  const bl = b.toLocaleLowerCase();
  return (al < bl ? -1 : al > bl ? 1 : 0) || (a < b ? -1 : a > b ? 1 : 0);
}
function validNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function speedSeriesView(series, options) {
  const search = options.search.trim().toLocaleLowerCase();
  const provider = options.provider;
  const direction = options.dir === "desc" ? -1 : 1;
  return (Array.isArray(series) ? series : []).filter((row) => {
    if (provider !== void 0 && provider !== null && provider !== "" && row.route.provider !== provider) return false;
    const haystack = `${routeName(row)}
${row.key}`.toLocaleLowerCase();
    return search === "" || haystack.includes(search);
  }).sort((a, b) => {
    let compared = 0;
    if (options.sort === "speed" || options.sort === "tps") {
      const av = validNumber(a.metrics.tps) ? a.metrics.tps : null;
      const bv = validNumber(b.metrics.tps) ? b.metrics.tps : null;
      if (av === null && bv !== null) return 1;
      if (av !== null && bv === null) return -1;
      if (av !== null && bv !== null) compared = (av - bv) * direction;
    } else if (options.sort === "sessions") {
      compared = (a.sessions - b.sessions) * direction;
    } else {
      compared = compareText(routeName(a), routeName(b)) * direction;
    }
    return compared || compareText(routeName(a), routeName(b)) || compareText(a.key, b.key);
  });
}
function speedSegments(buckets) {
  const segments = [];
  let current2 = [];
  for (const bucket of Array.isArray(buckets) ? buckets : []) {
    if (validNumber(bucket?.metrics?.tps)) {
      current2.push(bucket);
    } else if (current2.length > 0) {
      segments.push(current2);
      current2 = [];
    }
  }
  if (current2.length > 0) segments.push(current2);
  return segments;
}
function stepBucketFocus(index, key, length) {
  if (!Number.isFinite(length) || length <= 0) return -1;
  const last = Math.floor(length) - 1;
  const current2 = Number.isFinite(index) ? Math.min(last, Math.max(0, Math.trunc(index))) : 0;
  if (key === "Home") return 0;
  if (key === "End") return last;
  if (key === "ArrowLeft") return Math.max(0, current2 - 1);
  if (key === "ArrowRight") return Math.min(last, current2 + 1);
  return current2;
}
function speedSelectionAfterFilter(selectedKey, series) {
  if (!series.length) return selectedKey;
  if (selectedKey && series.some((row) => row.key === selectedKey)) return selectedKey;
  return series[0].key;
}
function matchingSpeedSnapshot(snapshot, selectedKey, hasVisibleMatch = true) {
  return hasVisibleMatch && snapshot && snapshot.selectedKey === selectedKey ? snapshot : null;
}
function createSerialSpeedRequest(request, onValue, onError, onBusy) {
  let active = true;
  let inFlight = false;
  let pending2 = false;
  let generation2 = 0;
  const run = async () => {
    if (!active) return;
    if (inFlight) {
      pending2 = true;
      return;
    }
    inFlight = true;
    const id = ++generation2;
    onBusy?.(true);
    try {
      do {
        pending2 = false;
        try {
          const value = await request();
          if (active && id === generation2) onValue(value);
        } catch (error) {
          if (active && id === generation2) onError(error);
        }
      } while (active && pending2 && id === generation2);
    } finally {
      inFlight = false;
      if (id === generation2) onBusy?.(false);
    }
  };
  return {
    run,
    dispose() {
      active = false;
      pending2 = false;
      generation2 += 1;
      onBusy?.(false);
    }
  };
}

// src/client/SpeedChart.tsx
var import_jsx_runtime19 = require("react/jsx-runtime");
var metricText = (metrics) => metrics.tps === null ? t("speed.noSamples") : `${metrics.tps.toFixed(1)} tok/s \xB7 n=${metrics.n}`;
var timeText = (ms) => new Date(ms).toLocaleString();
function SpeedChart({ buckets, shown, onHover, onPin, onReset }) {
  const width = 640, height = 250;
  const margin = { left: 48, right: 18, top: 18, bottom: 38 };
  const innerW = width - margin.left - margin.right, innerH = height - margin.top - margin.bottom;
  const targets = (0, import_react17.useRef)([]);
  const geometry = (0, import_react17.useMemo)(() => {
    const start = buckets[0]?.from ?? 0;
    const end = buckets[buckets.length - 1]?.to ?? 1;
    const duration = Math.max(1, end - start);
    const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.metrics.tps ?? 0));
    const magnitude = 10 ** Math.floor(Math.log10(maxValue));
    const yMax = Math.ceil(maxValue / magnitude) * magnitude;
    const point = (bucket) => ({
      x: margin.left + ((bucket.from + bucket.to) / 2 - start) / duration * innerW,
      y: margin.top + innerH * (1 - (bucket.metrics.tps ?? 0) / yMax)
    });
    return { start, end, yMax, point };
  }, [buckets, innerH, innerW, margin.left, margin.top]);
  const segments = speedSegments(buckets);
  const paths = segments.map((segment) => segment.map((bucket, index) => {
    const p = geometry.point(bucket);
    return `${index === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(" "));
  const yTicks = Array.from({ length: 5 }, (_, index) => geometry.yMax * index / 4);
  const xTickCount = Math.min(5, Math.max(1, buckets.length));
  const xTickIndexes = Array.from({ length: xTickCount }, (_, index) => Math.round(index * Math.max(0, buckets.length - 1) / Math.max(1, xTickCount - 1)));
  return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("div", { className: "dyn-pet-speed-chart", children: [
    /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": t("speed.chartLabel"), children: [
      yTicks.map((tick, index) => {
        const y = margin.top + innerH * (1 - index / 4);
        return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("g", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("line", { className: "dyn-pet-speed-grid", x1: margin.left, x2: width - margin.right, y1: y, y2: y }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("text", { className: "dyn-pet-speed-axis", x: margin.left - 7, y: y + 4, textAnchor: "end", children: tick.toLocaleString("en-US", { maximumFractionDigits: 1 }) })
        ] }, tick);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("text", { className: "dyn-pet-speed-axis", x: 7, y: 12, children: "tok/s" }),
      xTickIndexes.map((bucketIndex) => {
        const bucket = buckets[bucketIndex];
        if (!bucket) return null;
        const x = geometry.point(bucket).x;
        return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("text", { className: "dyn-pet-speed-axis", x, y: height - 10, textAnchor: "middle", children: new Date(bucket.to).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, `${bucket.from}-${bucketIndex}`);
      }),
      paths.map((path, index) => /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("path", { className: "dyn-pet-speed-line", d: path, fill: "none" }, index)),
      buckets.map((bucket, index) => {
        if (bucket.metrics.tps === null) return null;
        const p = geometry.point(bucket);
        return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("circle", { className: "dyn-pet-speed-mark", cx: p.x, cy: p.y, r: 4 }, `mark-${bucket.from}`);
      }),
      shown?.bucket ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("line", { className: "dyn-pet-speed-crosshair", x1: geometry.point(shown.bucket).x, x2: geometry.point(shown.bucket).x, y1: margin.top, y2: margin.top + innerH }) : null,
      buckets.map((bucket, index) => {
        const p = geometry.point(bucket);
        const selection = { index, bucket };
        return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
          "circle",
          {
            ref: (node) => {
              targets.current[index] = node;
            },
            cx: p.x,
            cy: p.y,
            r: 16,
            fill: "transparent",
            tabIndex: 0,
            role: "button",
            "aria-label": `${timeText(bucket.from)} \u2013 ${timeText(bucket.to)} \xB7 ${metricText(bucket.metrics)}`,
            onPointerEnter: () => onHover(selection),
            onPointerLeave: () => onHover(null),
            onFocus: () => onHover(selection),
            onBlur: () => onHover(null),
            onClick: () => onPin(selection),
            onKeyDown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPin(selection);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onReset();
                return;
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? buckets.length - 1 : stepBucketFocus(index, event.key, buckets.length);
                targets.current[next]?.focus();
              }
            }
          },
          `hit-${bucket.from}`
        );
      })
    ] }),
    shown ? /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("div", { className: "dyn-pet-speed-tooltip", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("strong", { children: shown.bucket.metrics.tps === null ? "\u2014" : `${shown.bucket.metrics.tps.toFixed(2)} tok/s` }),
      /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("span", { children: [
        timeText(shown.bucket.from),
        " \u2013 ",
        timeText(shown.bucket.to)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("span", { children: [
        t("speed.samples", { n: shown.bucket.metrics.n }),
        shown.bucket.isPartial ? ` \xB7 ${t("speed.partial")}` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("span", { children: [
        t("speed.ttft"),
        ": ",
        shown.bucket.metrics.ttftMs === null ? "\u2014" : `${shown.bucket.metrics.ttftMs.toFixed(0)} ms (n=${shown.bucket.metrics.ttftN})`
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("span", { children: [
        t("speed.modelTime"),
        ": ",
        shown.bucket.metrics.modelMs === null ? "\u2014" : `${(shown.bucket.metrics.modelMs / 1e3).toFixed(2)} s (n=${shown.bucket.metrics.modelN})`
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("span", { children: [
        t("speed.toolTime"),
        ": ",
        shown.bucket.metrics.toolMs === null ? "\u2014" : `${(shown.bucket.metrics.toolMs / 1e3).toFixed(2)} s (n=${shown.bucket.metrics.toolN})`
      ] })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("details", { className: "dyn-pet-speed-table", children: [
      /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("summary", { children: t("speed.table") }),
      /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("table", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("th", { children: t("speed.bucket") }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("th", { children: "tok/s" }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("th", { children: "n" }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("th", { children: t("speed.ttft") }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("th", { children: t("speed.modelTime") }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("th", { children: t("speed.toolTime") })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("tbody", { children: buckets.map((bucket) => /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("td", { children: [
            timeText(bucket.from),
            " \u2013 ",
            timeText(bucket.to)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("td", { children: bucket.metrics.tps?.toFixed(3) ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("td", { children: bucket.metrics.n }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("td", { children: bucket.metrics.ttftMs ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("td", { children: bucket.metrics.modelMs ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("td", { children: bucket.metrics.toolMs ?? "\u2014" })
        ] }, `row-${bucket.from}`)) })
      ] })
    ] })
  ] });
}

// src/client/SpeedPanel.tsx
var import_jsx_runtime20 = require("react/jsx-runtime");
var cloneSelection = (selection) => ({
  index: selection.index,
  bucket: { ...selection.bucket, metrics: { ...selection.bucket.metrics } }
});
function SpeedPanel({ active, useSessions }) {
  const sessionId = useSessions((state2) => state2.current);
  const currentSpeed = useSessionSpeed(sessionId ?? null, active);
  const [range, setRange] = (0, import_react18.useState)("5h");
  const [snapshot, setSnapshot] = (0, import_react18.useState)(null);
  const [selectedKey, setSelectedKey] = (0, import_react18.useState)(null);
  const [search, setSearch] = (0, import_react18.useState)("");
  const [provider, setProvider] = (0, import_react18.useState)("");
  const [sort, setSort] = (0, import_react18.useState)("tps");
  const [dir, setDir] = (0, import_react18.useState)("desc");
  const [hover, setHover] = (0, import_react18.useState)(null);
  const [pinned, setPinned] = (0, import_react18.useState)(null);
  const [busy, setBusy] = (0, import_react18.useState)(false);
  const [error, setError] = (0, import_react18.useState)(null);
  const [retryNonce, setRetryNonce] = (0, import_react18.useState)(0);
  const [visible2, setVisible] = (0, import_react18.useState)(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const unsupported = (0, import_react18.useRef)(false);
  (0, import_react18.useEffect)(() => {
    const onVisibility2 = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility2);
    return () => document.removeEventListener("visibilitychange", onVisibility2);
  }, []);
  (0, import_react18.useEffect)(() => {
    setPinned(null);
    setHover(null);
  }, [range, selectedKey]);
  (0, import_react18.useEffect)(() => {
    if (!active || !visible2 || unsupported.current) return;
    const runner = createSerialSpeedRequest(
      () => apiGetSpeed(range, selectedKey ?? void 0),
      (value) => {
        if (value.selectedKey !== selectedKey) setSelectedKey(value.selectedKey);
        setSnapshot(value);
        setError(null);
      },
      (reason) => {
        setError(reason);
        const status = reason?.status;
        if (status === 404 || status === 403) {
          unsupported.current = true;
          runner.dispose();
        }
      },
      setBusy
    );
    void runner.run();
    const timer = setInterval(() => {
      if (!unsupported.current) void runner.run();
    }, 5e3);
    return () => {
      runner.dispose();
      clearInterval(timer);
    };
  }, [active, visible2, range, selectedKey, retryNonce]);
  const series = (0, import_react18.useMemo)(() => speedSeriesView(snapshot?.series ?? [], { search, provider, sort, dir }), [snapshot, search, provider, sort, dir]);
  (0, import_react18.useEffect)(() => {
    const next = speedSelectionAfterFilter(selectedKey, series);
    if (next !== selectedKey) {
      setSnapshot(null);
      setSelectedKey(next);
    }
  }, [series, selectedKey]);
  const selectedSnapshot = matchingSpeedSnapshot(snapshot, selectedKey, series.length > 0);
  const selected = selectedSnapshot?.series.find((row) => row.key === selectedKey) ?? null;
  const providers = Array.from(new Set((snapshot?.series ?? []).map((row) => row.route.provider ?? "\u2014"))).sort();
  const shown = selectedSnapshot ? pinned ?? hover : null;
  return /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "dyn-pet-dash dyn-pet-speed", children: [
    /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "dyn-pet-dash-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("h2", { children: t("speed.tab") }),
      /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "dyn-pet-dash-tabs", children: ["15m", "1h", "5h", "24h"].map((item) => /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("button", { className: "dyn-pet-dash-tab" + (range === item ? " is-active" : ""), onClick: () => {
        if (range !== item) {
          setSnapshot(null);
          setSelectedKey(null);
          setRange(item);
        }
      }, children: t(`speed.range.${item}`) }, item)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "dyn-pet-speed-current", children: [
      /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { children: t("speed.current") }),
      /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("strong", { children: currentSpeed === null ? "\u2014" : `${currentSpeed.toFixed(2)} tok/s` }),
      /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("small", { children: [
        sessionId ?? t("speed.noSession"),
        " \xB7 ",
        t("speed.currentNotice")
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "dyn-pet-speed-filters", children: [
      /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("input", { "aria-label": t("speed.search"), placeholder: t("speed.search"), value: search, onChange: (event) => setSearch(event.target.value) }),
      /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("select", { "aria-label": t("speed.provider"), value: provider, onChange: (event) => setProvider(event.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("option", { value: "", children: t("speed.allProviders") }),
        providers.map((item) => /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("option", { value: item, children: item }, item))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("select", { "aria-label": t("speed.sort"), value: sort, onChange: (event) => setSort(event.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("option", { value: "name", children: t("speed.sortName") }),
        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("option", { value: "tps", children: t("speed.sortSpeed") }),
        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("option", { value: "sessions", children: t("speed.sortSessions") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => setDir((value) => value === "asc" ? "desc" : "asc"), children: dir === "asc" ? "\u2191" : "\u2193" })
    ] }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "dyn-pet-dash-error", role: "alert", children: [
      petErrMsg(error, t),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => {
        unsupported.current = false;
        setSelectedKey(null);
        setError(null);
        setRetryNonce((value) => value + 1);
      }, children: t("speed.retry") })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "dyn-pet-speed-layout", children: [
      /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("aside", { className: "dyn-pet-speed-series", "aria-label": t("speed.combinations"), children: [
        series.map((row) => /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("button", { className: "dyn-pet-speed-series-row" + (selectedKey === row.key ? " is-active" : ""), "aria-pressed": selectedKey === row.key, onClick: () => {
          if (selectedKey !== row.key) {
            setSnapshot(null);
            setSelectedKey(row.key);
          }
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("span", { children: [
            row.route.provider ?? "\u2014",
            " / ",
            row.route.model ?? "\u2014"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("strong", { children: row.metrics.tps === null ? "\u2014" : `${row.metrics.tps.toFixed(1)} tok/s` }),
          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("small", { children: t("speed.sessionCount", { n: row.sessions }) })
        ] }, row.key)),
        !busy && !series.length ? /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "dyn-pet-dash-empty", children: [
          snapshot?.series.length ? t("speed.noMatches") : t("speed.noData"),
          search || provider ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => {
            setSearch("");
            setProvider("");
          }, children: t("speed.clearFilters") }) : null
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("section", { className: "dyn-pet-speed-detail", children: [
        /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "dyn-pet-dash-card-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { children: selected ? `${selected.route.provider ?? "\u2014"} / ${selected.route.model ?? "\u2014"}` : t("speed.noSelection") }),
          pinned ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => setPinned(null), children: t("speed.clearPin") }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "dyn-pet-speed-metrics", children: [
          /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { children: t("speed.streamingTps") }),
            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("strong", { children: selected?.metrics.tps?.toFixed(2) ?? "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("small", { children: [
              "n=",
              selected?.metrics.n ?? 0
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { children: t("speed.ttft") }),
            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("strong", { children: selected?.metrics.ttftMs === null || !selected ? "\u2014" : `${selected.metrics.ttftMs.toFixed(0)} ms` }),
            /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("small", { children: [
              "n=",
              selected?.metrics.ttftN ?? 0
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { children: t("speed.modelTime") }),
            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("strong", { children: selected?.metrics.modelMs === null || !selected ? "\u2014" : `${(selected.metrics.modelMs / 1e3).toFixed(2)} s` }),
            /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("small", { children: [
              "n=",
              selected?.metrics.modelN ?? 0
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { children: t("speed.toolTime") }),
            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("strong", { children: selected?.metrics.toolMs === null || !selected ? "\u2014" : `${(selected.metrics.toolMs / 1e3).toFixed(2)} s` }),
            /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("small", { children: [
              "n=",
              selected?.metrics.toolN ?? 0
            ] })
          ] })
        ] }),
        busy && !snapshot ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "dyn-pet-dash-empty", children: t("speed.loading") }) : null,
        snapshot?.coverage === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "dyn-pet-dash-notice", children: t("speed.historyLoading") }) : null,
        snapshot?.coverage === "limited" ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "dyn-pet-dash-notice", children: t("speed.historyLimited") }) : null,
        snapshot?.coverage === "unsupported" ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "dyn-pet-dash-notice", children: t("speed.unsupported") }) : null,
        selectedSnapshot && selectedSnapshot.buckets.length ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(SpeedChart, { buckets: selectedSnapshot.buckets, shown, onHover: setHover, onPin: (selection) => setPinned(cloneSelection(selection)), onReset: () => {
          setPinned(null);
          setHover(null);
        } }) : null,
        snapshot && !snapshot.series.length && !busy ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "dyn-pet-dash-empty", children: t("speed.emptyRange") }) : null
      ] })
    ] })
  ] });
}

// src/client/DashboardPanel.tsx
var import_jsx_runtime21 = require("react/jsx-runtime");
var EXPORT_QUOTE_DRAFT_KEY = "dyn-foxbell-pet:export-quote";
function hourPoints(hours, nowH) {
  const arr = Array.isArray(hours) ? hours : [];
  const idxs = [];
  for (let k = 5; k >= 1; k--) idxs.push(((nowH - k) % 24 + 24) % 24);
  return idxs.map((i) => {
    const b = arr[i];
    return { label: `${String(i).padStart(2, "0")}:00`, value: b ? b.dayTotal : 0, key: b ? b.key : "" };
  });
}
function pooledHit(items) {
  let req = 0, hit = 0;
  for (const x of items) {
    req += x.requestTotal || 0;
    hit += x.cacheRead || 0;
  }
  return req > 0 ? hit / req : 0;
}
function hitCompareText(a, b) {
  if (b === null) return t("dash.hitCur", { a: fmtPct(a) });
  const d = (a - b) * 100;
  const delta = (d > 0 ? "+" : d < 0 ? "-" : "\xB1") + Math.abs(d).toFixed(1) + "pt";
  return t("dash.hitCompare", { a: fmtPct(a), b: fmtPct(b), d: delta });
}
var dayKey2 = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function clampRangeFrom(from, to) {
  const toMs = (/* @__PURE__ */ new Date(to + "T00:00:00")).getTime();
  const maxFrom = dayKey2(new Date(toMs - 30 * 864e5));
  return from < maxFrom ? { from: maxFrom, clamped: true } : { from, clamped: false };
}
function trendDirection(days) {
  const arr = Array.isArray(days) ? days : [];
  if (arr.length < 2) return null;
  const a = arr[arr.length - 2].dayTotal;
  const b = arr[arr.length - 1].dayTotal;
  return a < b ? true : a > b ? false : null;
}
var rangeCache = /* @__PURE__ */ new Map();
async function fetchRange(from, to) {
  const key = `${from}:${to}`;
  const c = rangeCache.get(key);
  if (c && Date.now() - c.at < 6e4) return c.data;
  const data = await apiGetRange(from, to);
  rangeCache.set(key, { at: Date.now(), data });
  return data;
}
function tooltipText(p) {
  let s = `${p.label} \xB7 ${fmtTokens(p.value)}`;
  if (typeof p.hitPct === "number") s += ` \xB7 ${fmtPct(p.hitPct)}`;
  return s;
}
function TooltipLayer(props) {
  const { points, width, height, hover, onHover } = props;
  if (!points || points.length < 2) return null;
  const padL = 6, padR = 6, padT = 8, padB = 16;
  const max = Math.max(1, ...points.map((p) => p.value));
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const pts = points.map((p, i) => ({
    x: padL + innerW * i / (points.length - 1),
    y: padT + innerH * (1 - p.value / max)
  }));
  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(import_jsx_runtime21.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("svg", { className: "dyn-pet-dash-trendhit", viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", "aria-hidden": true, children: pts.map((pt, i) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
      "circle",
      {
        cx: pt.x.toFixed(1),
        cy: pt.y.toFixed(1),
        r: 14,
        fill: "transparent",
        style: { pointerEvents: "all" },
        onPointerEnter: () => onHover({ x: pt.x / width * 100, y: pt.y / height * 100, text: tooltipText(points[i]) }),
        onPointerLeave: () => onHover(null)
      },
      i
    )) }),
    hover ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-tooltip", style: { left: `${hover.x}%`, top: `${hover.y}%` }, children: hover.text }) : null
  ] });
}
function ToolsGrid(props) {
  if (props.tools.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-empty", children: t("dash.noData") });
  const m = toolsMetrics(props.tools);
  const cells = [
    [t("dash.g.toolCalls"), String(m.calls)],
    [t("dash.g.toolAvg"), fmtDur(m.avgMs)],
    [t("dash.g.toolTopCount"), String(m.topCount)],
    [t("dash.g.toolTopDur"), fmtDur(m.topDurMs)]
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-tools", children: cells.map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-toolcell", children: [
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: k }),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("strong", { children: v })
  ] }, k)) });
}
function LegacyUsagePanel() {
  const snap = (0, import_react19.useSyncExternalStore)(appStore.subscribe, appStore.getSnapshot);
  const cfg = (0, import_react19.useSyncExternalStore)(cfgStore.subscribe, cfgStore.getSnapshot);
  useLang();
  const [tab, setTab] = (0, import_react19.useState)("7d");
  const [custom, setCustom] = (0, import_react19.useState)({ from: dayKey2(new Date(Date.now() - 6 * 864e5)), to: dayKey2(/* @__PURE__ */ new Date()) });
  const [range, setRange] = (0, import_react19.useState)(null);
  const [busy, setBusy] = (0, import_react19.useState)(false);
  const [rangeHint, setRangeHint] = (0, import_react19.useState)("");
  const [hover, setHover] = (0, import_react19.useState)(null);
  const [copiedFlash, setCopiedFlash] = (0, import_react19.useState)(false);
  const [quoteOpen, setQuoteOpen] = (0, import_react19.useState)(false);
  const [quoteDraft, setQuoteDraft] = (0, import_react19.useState)(() => {
    try {
      return localStorage.getItem(EXPORT_QUOTE_DRAFT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [prevHit, setPrevHit] = (0, import_react19.useState)(null);
  const modelHeadRef = (0, import_react19.useRef)(null);
  const setQuoteDraftPersisted = (v) => {
    setQuoteDraft(v);
    try {
      localStorage.setItem(EXPORT_QUOTE_DRAFT_KEY, v);
    } catch {
    }
  };
  const dash = snap ? snap.dashboard : null;
  const trend = dash && dash.usage && dash.usage.trend ? dash.usage.trend : null;
  (0, import_react19.useEffect)(() => {
    if (tab !== "7d" && tab !== "30d" && tab !== "custom") return;
    let live = true;
    setBusy(true);
    const to = tab === "custom" ? custom.to : dayKey2(/* @__PURE__ */ new Date());
    const rawFrom = tab === "30d" ? dayKey2(new Date(Date.now() - 29 * 864e5)) : tab === "7d" ? dayKey2(new Date(Date.now() - 6 * 864e5)) : custom.from;
    const { from, clamped } = clampRangeFrom(rawFrom, to);
    if (clamped) {
      setCustom((c) => ({ ...c, from }));
      setRangeHint(t("dash.rangeClamp"));
    }
    setPrevHit(null);
    fetchRange(from, to).then((r) => {
      if (!live) return;
      setRange(r);
      const spanDays = Math.round(((/* @__PURE__ */ new Date(to + "T00:00:00")).getTime() - (/* @__PURE__ */ new Date(from + "T00:00:00")).getTime()) / 864e5) + 1;
      const prevTo = dayKey2(new Date((/* @__PURE__ */ new Date(from + "T00:00:00")).getTime() - 864e5));
      const prevFrom = dayKey2(new Date((/* @__PURE__ */ new Date(prevTo + "T00:00:00")).getTime() - (spanDays - 1) * 864e5));
      return fetchRange(prevFrom, prevTo).then((pr) => {
        if (live) setPrevHit(pr.totals.requestTotal > 0 ? pr.totals.hitPct : null);
      }).catch(() => {
        if (live) setPrevHit(null);
      });
    }).catch(() => {
      if (live) setRange(null);
    }).finally(() => {
      if (live) setBusy(false);
    });
    return () => {
      live = false;
    };
  }, [tab, custom.from, custom.to]);
  const points = (0, import_react19.useMemo)(() => {
    if (tab === "5h" && trend) return hourPoints(trend.hours, (/* @__PURE__ */ new Date()).getHours());
    if (tab === "7d" && trend) return lastN(trend.days, 7);
    if (range) return range.days.map((d) => {
      const m = Number(d.key.slice(5, 7)), day = Number(d.key.slice(8, 10));
      return { label: day === 1 ? `${m}\u6708` : `${day}\u65E5`, value: d.dayTotal, key: d.key, hitPct: d.hitPct };
    });
    return [];
  }, [tab, trend, range]);
  const hero = (0, import_react19.useMemo)(() => points.reduce((s, p) => s + p.value, 0), [points]);
  const usage = dash ? dash.usage : null;
  const inRange = tab === "7d" || tab === "30d" || tab === "custom";
  const totals = inRange && range ? range.totals : null;
  const hitCompare = (() => {
    if (tab === "5h" && trend && trend.hours) {
      const nowH = (/* @__PURE__ */ new Date()).getHours();
      const cur = trend.hours.filter((h) => {
        const hh = Number(h.key.slice(11, 13));
        return hh >= (nowH - 5 % 24 + 24) % 24 && hh < nowH;
      });
      const prev = trend.hours.filter((h) => {
        const hh = Number(h.key.slice(11, 13));
        return hh >= ((nowH - 10) % 24 + 24) % 24 && hh < ((nowH - 5) % 24 + 24) % 24;
      });
      const curAgg = { requestTotal: cur.reduce((s2, h) => s2 + h.requestTotal, 0), cacheRead: cur.reduce((s2, h) => s2 + h.cacheRead, 0) };
      const prevAgg = { requestTotal: prev.reduce((s2, h) => s2 + h.requestTotal, 0), cacheRead: prev.reduce((s2, h) => s2 + h.cacheRead, 0) };
      if (curAgg.requestTotal <= 0) return "";
      return hitCompareText(pooledHit([curAgg]), prevAgg.requestTotal > 0 ? pooledHit([prevAgg]) : null);
    }
    if (tab === "7d" && trend && trend.days.length > 0) {
      const cur = pooledHit(trend.days.slice(7));
      const prevDays = trend.days.slice(0, 7);
      const prevReq = prevDays.reduce((s2, d) => s2 + d.requestTotal, 0);
      return hitCompareText(cur, prevReq > 0 ? pooledHit(prevDays) : null);
    }
    if ((tab === "30d" || tab === "custom") && range && range.totals.requestTotal > 0) {
      return hitCompareText(range.totals.hitPct, prevHit);
    }
    return "";
  })();
  const grid = [
    [t("dash.g.userEst"), "~" + fmtInt(totals ? totals.userEst : usage ? usage.userEst : 0) + t("dash.estimateSuffix") + " \xB7 " + t("dash.withSubagents")],
    [t("dash.g.output"), fmtInt(totals ? totals.outputTokens : usage ? usage.day.outputTokens : 0)],
    [t("dash.g.requestTotal"), fmtInt(totals ? totals.requestTotal : usage ? usage.requestTotal : 0)],
    [t("dash.g.cacheRead"), fmtInt(totals ? totals.cacheRead : usage ? usage.day.cacheReadTokens : 0)],
    [t("dash.g.hitPct"), fmtPct(totals ? totals.hitPct : usage ? usage.cacheHitRate : 0)],
    [t("dash.g.requests"), String(totals ? totals.requestCount : trend && trend.days[13] ? trend.days[13].requestCount : 0)],
    [t("dash.g.asOf"), (/* @__PURE__ */ new Date()).toLocaleTimeString()]
  ];
  const models = inRange ? range ? range.models : [] : usage && usage.models || [];
  const maxModel = Math.max(1, ...models.map((m) => m.requestTotal));
  const tools = inRange ? range ? range.tools : [] : usage && usage.tools || [];
  const inFlight = busy && inRange;
  const hitRate = totals ? totals.hitPct : usage ? usage.cacheHitRate : 0;
  const exportTrendDays = inRange ? range ? range.days : [] : trend ? trend.days : [];
  const trendUp = trendDirection(exportTrendDays);
  const loaf = dash && dash.pace ? dash.pace.tier.startsWith("loaf") : false;
  const quoteVars = {
    range: t(`dash.tab.${tab}`),
    tokens: fmtTokens(hero),
    hit: fmtPct(hitRate),
    models: String(models.length),
    tool: tools[0] ? tools[0].name : ""
  };
  const buildQuote = (customQuote) => pickQuote({ total: hero, hitPct: hitRate, trendUp, multiModel: models.length > 1, loaf, tool: quoteVars.tool }, getLang(), customQuote, quoteVars);
  const onCopyText = async () => {
    const text2 = buildUsageText(`${t("dash.panelTitle")} \xB7 ${t(`dash.tab.${tab}`)}`, grid, t("dash.models"), models, fmtTokens);
    try {
      await navigator.clipboard.writeText(text2);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text2;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch {
      }
    }
    setCopiedFlash(true);
  };
  const rangeLabel = legacyRangeLabel(tab, points, t(`dash.tab.${tab}`), custom);
  const onExportImage = async (customQuote) => {
    const rt = appStore.getRuntime();
    const sprite = await loadSprite(rt.spriteUrl);
    const frameCols = maxAnimCols();
    const blob = await exportDashboardImage({
      rangeLabel,
      hero: hero.toLocaleString("en-US"),
      heroSub: `${t("dash.g.asOf")} ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`,
      metrics: grid.slice(0, 6),
      trendTitle: t("dash.trendTitle"),
      peakLabel: t("dash.peak", { v: fmtTokens(Math.max(0, ...points.map((p) => p.value))) }),
      points: points.map((p) => ({ label: p.label, value: p.value })),
      models: models.map((m) => ({ name: m.route, val: fmtTokens(m.requestTotal), share: maxModel > 0 ? m.requestTotal / maxModel : 0 })),
      tools2x2: (() => {
        const m = toolsMetrics(tools);
        return [
          [t("dash.g.toolCalls"), String(m.calls)],
          [t("dash.g.toolAvg"), fmtDur(m.avgMs)],
          [t("dash.g.toolTopCount"), `${m.topName} ${m.topCount}`],
          [t("dash.g.toolTopDur"), `${m.topDurName} ${fmtDur(m.topDurMs)}`]
        ];
      })(),
      quote: customQuote && customQuote.trim() ? fillQuote(customQuote.trim(), quoteVars) : buildQuote(),
      poseRow: resolvePoseRow(cfg.exportPose),
      sprite,
      frameW: sprite ? sprite.naturalWidth / frameCols : 0,
      frameH: sprite ? sprite.naturalHeight / rt.rows : 0
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `foxbell-dashboard-${tab}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e4);
  };
  const [modelNameW, setModelNameW] = (0, import_react19.useState)(200);
  const [modelValW, setModelValW] = (0, import_react19.useState)(84);
  (0, import_react19.useEffect)(() => {
    const host = modelHeadRef.current;
    if (!host) return;
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:600 16px system-ui";
    document.body.appendChild(probe);
    let maxName = 0, maxVal = 0;
    for (const m of models.slice(0, 6)) {
      probe.textContent = m.route;
      maxName = Math.max(maxName, probe.offsetWidth);
      probe.textContent = fmtTokens(m.requestTotal);
      maxVal = Math.max(maxVal, probe.offsetWidth);
    }
    probe.remove();
    setModelNameW(Math.min(420, Math.ceil(maxName) + 4));
    setModelValW(Math.min(120, Math.ceil(maxVal) + 6));
  }, [models]);
  (0, import_react19.useEffect)(() => {
    if (!copiedFlash) return;
    const timer = setTimeout(() => setCopiedFlash(false), 1600);
    return () => clearTimeout(timer);
  }, [copiedFlash]);
  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash", children: [
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("h2", { children: t("dash.panelTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-tabs", children: [
        ["5h", "7d", "30d", "custom"].map((x) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("button", { className: "dyn-pet-dash-tab" + (tab === x ? " is-active" : ""), onClick: () => setTab(x), children: t(`dash.tab.${x}`) }, x)),
        tab === "custom" ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("span", { className: "dyn-pet-dash-dates", children: [
          /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("input", { type: "date", value: custom.from, max: custom.to, onChange: (e) => {
            setRangeHint("");
            setCustom((c) => ({ ...c, from: e.target.value }));
          } }),
          /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u2013" }),
          /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("input", { type: "date", value: custom.to, min: custom.from, max: dayKey2(/* @__PURE__ */ new Date()), onChange: (e) => {
            setRangeHint("");
            setCustom((c) => ({ ...c, to: e.target.value }));
          } }),
          rangeHint ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("em", { className: "dyn-pet-dash-rangehint", children: rangeHint }) : null
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => void onCopyText(), children: copiedFlash ? t("dash.export.copied") : t("dash.export.copyText") }),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => void onExportImage(), children: t("dash.export.exportImage") }),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("button", { className: "dyn-pet-dash-actbtn" + (quoteOpen ? " is-active" : ""), onClick: () => setQuoteOpen((o) => !o), children: t("dash.export.exportCustom") })
      ] })
    ] }),
    quoteOpen ? /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-quotebar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
        "input",
        {
          type: "text",
          value: quoteDraft,
          placeholder: t("dash.export.quotePlaceholder"),
          onChange: (e) => setQuoteDraftPersisted(e.target.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("button", { className: "dyn-pet-dash-actbtn", onClick: () => void onExportImage(quoteDraft), children: t("dash.export.export") })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-hero", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-hero-label", children: t("dash.heroTotal", { range: t(`dash.tab.${tab}`) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-hero-num", children: fmtInt(hero) }),
      hitCompare ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-weekhit", children: hitCompare }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-rows", children: grid.map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: k }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("strong", { children: v })
    ] }, k)) }),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-card-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: t("dash.trendTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "dyn-pet-dash-meta", children: inFlight ? t("dash.loading") : t("dash.peak", { v: fmtTokens(Math.max(0, ...points.map((p) => p.value))) }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-trendwrap", children: points.length < 2 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-empty", children: t("dash.noData") }) : /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(import_jsx_runtime21.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(TrendChart, { points, width: 560, height: 120, showLabels: true, idPrefix: "dyn-pet-dash-trend" }),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(TooltipLayer, { points, width: 560, height: 120, hover, onHover: setHover })
      ] }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-card", ref: modelHeadRef, style: { "--model-name-w": `${modelNameW}px`, "--model-val-w": `${modelValW}px` }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-card-head", children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: t("dash.models") }) }),
      models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-empty", children: t("dash.noData") }) : models.slice(0, 10).map((m) => /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-model", children: [
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "dyn-pet-dash-model-name", title: m.route, children: m.route }),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "dyn-pet-dash-model-val", children: fmtTokens(m.requestTotal) }),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "dyn-pet-dash-model-bar", children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("i", { style: { width: `${Math.max(4, m.requestTotal / maxModel * 100).toFixed(1)}%` } }) })
      ] }, m.route))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-card-head", children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: t("dash.tools") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(ToolsGrid, { tools })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-foot", children: t("dash.caliber") })
  ] });
}
function DashboardPanel({ useSessions }) {
  useLang();
  const snap = (0, import_react19.useSyncExternalStore)(appStore.subscribe, appStore.getSnapshot);
  const [page, setPage] = (0, import_react19.useState)("usage");
  const [speedMounted, setSpeedMounted] = (0, import_react19.useState)(false);
  const [legacy, setLegacy] = (0, import_react19.useState)(false);
  const tabRefs = (0, import_react19.useRef)([]);
  const hadCapability = (0, import_react19.useRef)(false);
  const legacyRef = (0, import_react19.useRef)(legacy);
  legacyRef.current = legacy;
  const capability = snap?.diag?.additiveApiCapability === true;
  (0, import_react19.useEffect)(() => {
    const next = reconcileDashboardFallback({ legacy: legacyRef.current, hadCapability: hadCapability.current }, capability);
    hadCapability.current = next.hadCapability;
    if (next.legacy !== legacyRef.current) setLegacy(next.legacy);
  }, [capability]);
  const onUnsupported = (0, import_react19.useCallback)(() => setLegacy(true), []);
  if (snap && (!capability || legacy)) return /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(LegacyUsagePanel, {});
  const selectPage = (next) => {
    setPage(next);
    if (next === "speed") setSpeedMounted(true);
  };
  const onTabKey = (event, index) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextIndex = 1 - index;
    const next = nextIndex === 0 ? "usage" : "speed";
    selectPage(next);
    tabRefs.current[nextIndex]?.focus();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "dyn-pet-dash-shell", children: [
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "dyn-pet-dash-page-tabs", role: "tablist", "aria-label": t("dash.panelTitle"), children: ["usage", "speed"].map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
      "button",
      {
        ref: (node) => {
          tabRefs.current[index] = node;
        },
        id: `foxbell-tab-${item}`,
        role: "tab",
        "aria-selected": page === item,
        "aria-controls": `foxbell-panel-${item}`,
        tabIndex: page === item ? 0 : -1,
        className: "dyn-pet-dash-tab" + (page === item ? " is-active" : ""),
        onClick: () => selectPage(item),
        onKeyDown: (event) => onTabKey(event, index),
        children: t(item === "usage" ? "dash2.usageTab" : "speed.tab")
      },
      item
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { id: "foxbell-panel-usage", role: "tabpanel", "aria-labelledby": "foxbell-tab-usage", className: "dyn-pet-dash-page", hidden: page !== "usage", children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(UsagePanel, { active: capability && page === "usage", onUnsupported, children: ({ query, span, usageRevision, onExportReady, onWindowConflict }) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(CostPanel, { active: page === "usage", query, span, usageRevision, onExportReady, onWindowConflict }) }) }),
    speedMounted ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { id: "foxbell-panel-speed", role: "tabpanel", "aria-labelledby": "foxbell-tab-speed", className: "dyn-pet-dash-page", hidden: page !== "speed", children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(SpeedPanel, { active: page === "speed", useSessions }) }) : null
  ] });
}

// src/client/styles.ts
var MINI_DETAIL_CSS = `
.dyn-pet-mini-detail { pointer-events: auto; cursor: pointer; margin-top: 2px; text-align: right; font-size: 11px; color: #8a6d3b; opacity: .85; }
.dyn-pet-mini-detail:hover { opacity: 1; text-decoration: underline; }
`;
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
.dyn-pet-settings-section { font-weight: 700; margin-top: 14px; padding-bottom: 2px; border-bottom: 1px solid rgba(122,74,43,.18); color:#7a4a2b; }
.dyn-pet-settings-row { position: relative; }
.dyn-pet-info { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; margin-left: 6px; border: 1px solid rgba(122,74,43,.4); border-radius: 999px; font-size: 10px; font-style: italic; font-weight: 700; color: #8a6d3b; cursor: help; vertical-align: 1px; user-select: none; }
.dyn-pet-info:hover { background: rgba(122,74,43,.12); }
/* v2.2.1\uFF1A\u81EA\u7ED8\u8BF4\u660E\u6C14\u6CE1\u2014\u2014hover \u5373\u73B0\uFF08\u539F\u751F title \u6709\u7EA6 1s \u5EF6\u8FDF\u4E14\u90E8\u5206\u73AF\u5883\u4E0D\u5F39\uFF09 */
.dyn-pet-info { position: relative; }
.dyn-pet-info:hover::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 8px);
  left: calc(100% + 10px);
  width: min(320px, 60vw);
  background: rgba(30, 26, 22, .96);
  color: #f3ece2;
  font-size: 13px; font-style: normal; font-weight: 400; line-height: 1.55;
  padding: 10px 14px; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
  white-space: normal;
  z-index: 2147483600;
  pointer-events: none;
  text-align: left;
  transform: none;
}
.dyn-pet-settings-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.dyn-pet-settings-row select { max-width: 140px; }
/* ---- v2.1 \u8BBE\u7F6E\u5361\u8349\u7A3F\u6001\uFF08v1.4.0 client.js L1098-1109 \u79FB\u690D\uFF1A\u5934\u90E8\u72B6\u6001\u5B57/\u53E3\u5F84\u6CE8/\u4FDD\u5B58\u6761/\u65E0\u6548\u6570\u5B57\u7EA2\u6846\uFF09---- */
.dyn-pet-settings-dirty { flex: none; color: #b45309; font-size: 12px; }
.dyn-pet-settings-saved { flex: none; color: #16a34a; font-size: 12px; }
.dyn-pet-settings-note { color: #999; font-size: 11px; line-height: 1.5; }
.dyn-pet-settings-savebar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.dyn-pet-settings-discard { background: transparent; color: #8b7355; border: 1px solid #d6c7b2; border-radius: 8px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
.dyn-pet-settings-save { background: #16a34a; color: #fff; border: none; border-radius: 8px; padding: 5px 18px; font-size: 13px; cursor: pointer; }
.dyn-pet-settings-save:disabled { background: #c9bdae; cursor: default; }
.dyn-pet-settings-row.bad input { border: 1px solid #ef4444; border-radius: 4px; }
/* ---- v2.2 R8 \u8BBE\u7F6E\u5361\u5BFC\u51FA\u8BC4\u8BED\u6587\u672C\u57DF\uFF08Task 14\uFF09---- */
.dyn-pet-settings-quote { flex: 1; max-width: 220px; border: 1px solid rgba(122,74,43,.35); border-radius: 6px; padding: 4px 6px; font-size: 12px; color: #3b2f23; background: #fff; font-family: inherit; line-height: 1.4; resize: vertical; box-sizing: border-box; }
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
/* ---- v2.1 \u8FF7\u4F60\u6761\uFF08v1.4.0 client.js L1110-1117 \u539F\u6837\u79FB\u690D\uFF1B7e16d62\uFF1A\u884C\u5185\u6362\u884C\u4E0D\u622A\u65AD\uFF09----
   CSS \u7559 scale=1 \u7248\u5F0F\uFF0C\u5B9E\u9645\u5B57\u53F7/\u5185\u8FB9\u8DDD/\u5BBD\u5EA6\u7531 MiniBar.tsx \u5185\u8054 px() \u7F29\u653E\u4E0B\u53D1\uFF08\u4E0E Sign.tsx \u540C\u53E3\u5F84\uFF09 */
.dyn-pet-mini-wrap { position: absolute; left: 100%; top: 12px; margin-left: 12px; z-index: 4; }
.dyn-pet-mini { width: 248px; background: rgba(255,252,248,0.97); border: 1px solid rgba(122,74,43,0.3); border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #7a4a2b; line-height: 1.6; box-shadow: 0 2px 8px rgba(0,0,0,0.14); pointer-events: none; }
.dyn-pet-mini-dial { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.dyn-pet-mini-bar { flex: 1; height: 6px; border-radius: 999px; background: rgba(122,74,43,0.15); overflow: hidden; }
.dyn-pet-mini-bar i { display: block; height: 100%; background: linear-gradient(90deg,#f59e0b,#ef4444); border-radius: 999px; transition: width .4s ease; }
.dyn-pet-mini-bar i.longrun { background: linear-gradient(90deg,#3BA7FF,#8D6BFF); }
.dyn-pet-mini-bar i.loaf { background: linear-gradient(90deg,#7c8aa0,#a8b4c4); }
.dyn-pet-mini-tier { font-weight: 700; white-space: nowrap; font-size: 14px; }
.dyn-pet-mini-tier.mood-busy { color: #b45309; }
.dyn-pet-mini-tier.mood-longrun { color: #6d5bd0; }
.dyn-pet-mini-tier.mood-loaf { color: #8fa3b8; }
.dyn-pet-mini-row { white-space: normal; word-break: break-word; }
.dyn-pet-mini-dim { color: #a07050; font-size: 11px; }
${MINI_DETAIL_CSS}
/* ---- v2.1 \u5C0F\u9ED1\u677F + \u{1F4D6} \u9650\u65F6\u5165\u53E3\uFF08v1.4.0 client.js L1118-1123 \u539F\u6837\u79FB\u690D\uFF1B\u884C normal \u6362\u884C per 7e16d62\uFF09----
   \u9ED1\u677F\u4E3A 310px \u56FA\u5B9A\u7248\u5F0F\uFF08fixed \u53F3\u4E0B\u6302\u70B9\u4E0E scale \u7F29\u653E\u7531 Pet.tsx boardLayer \u5185\u8054\u4E0B\u53D1\uFF09 */
.dyn-pet-board { width: 310px; background: linear-gradient(160deg, #26362e, #1e2b25 60%, #22302a); color: rgba(255,255,255,.92); border: 6px solid #9c7a55; border-radius: 10px; padding: 10px 12px 8px; font-size: 12.5px; line-height: 1.7; box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
.dyn-pet-board.farewell { border: 1px solid rgba(251,191,36,0.5); }
.dyn-pet-board-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 4px; }
.dyn-pet-board-x { background: transparent; border: none; color: rgba(255,255,255,.75); cursor: pointer; font-size: 13px; padding: 0 2px; }
.dyn-pet-board-x:hover { color: #fff; }
.dyn-pet-board-row { white-space: normal; word-break: break-word; }
.dyn-pet-board-row + .dyn-pet-board-kv, .dyn-pet-board-kv + .dyn-pet-board-kv { border-top: 1px dashed rgba(255,255,255,.18); }
.dyn-pet-board-kv { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 3px 0; }
.dyn-pet-board-kv .k { min-width: 0; }
/* v2.2.2\uFF1A\u6570\u503C\u6BB5\u53EF\u6536\u7F29\uFF08\u539F flex:none \u4F7F\u957F\u503C\u6574\u4F53\u6EA2\u51FA\u677F\u5BBD\u88AB\u88C1\u5207\uFF09\uFF1B\u77ED\u503C\u53F3\u5BF9\u9F50\u89C2\u611F\u4E0D\u53D8 */
.dyn-pet-board-kv .v { flex: 1 1 auto; min-width: 0; }
.dyn-pet-board-kv .k { flex: none; color: rgba(255,255,255,.55); font-size: 11px; }
.dyn-pet-board-kv .v { text-align: right; word-break: break-word; color: rgba(255,255,255,.92); text-shadow: 0 0 3px rgba(255,255,255,.18); }
/* v2.2.2 \u5DE5\u5177\u884C\u9010\u6761\u76EE\u6362\u884C\uFF1Aentry \u4E3A inline-block\uFF08\u6574\u4F53\u6362\u884C\u5355\u5143\uFF0C\u4E0D\u5728\u300C\uFF08\u5171 X \u5206\u949F\uFF09\u300D\u5185\u90E8\u65AD\u884C\uFF1B
   \u5355\u6761\u76EE\u8D85\u5BBD\u65F6\u5176\u5185\u90E8\u7167\u5E38\u8F6F\u6362\u884C\u515C\u5E95\uFF09\uFF0Csep \u95F4\u7684\u7A7A\u683C\u662F\u552F\u4E00\u6362\u884C\u70B9 */
.dyn-pet-board-kv-tools .entry { display: inline-block; }
/* v2.2.1 \u9ED1\u677F\u6A21\u578B\u884C\u4E0E\u5927\u770B\u677F\u5BF9\u9F50\u53E3\u5F84\u7EDF\u4E00\uFF1A\u540D\u79F0\u5DE6\u5BF9\u9F50 + \u6570\u503C\u53F3\u5BF9\u9F50\u56FA\u5B9A\u5BBD */
.dyn-pet-board-model .v { flex: 1 1 auto; display: flex; align-items: baseline; gap: 10px; text-align: left; }
.dyn-pet-board-model { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.dyn-pet-board-model .nm { flex: 1 1 auto; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-board-model .num { flex: none; min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
/* ---- v2.2 \u9ED1\u677F\u52A0\u6599\uFF08Task 11 R4\uFF09\uFF1Asparkline \u884C\uFF08\u884C\u5185 flex\uFF1A\u7070\u5B57 11px \u6807\u7B7E + \u8D8B\u52BF\u56FE\u5360\u4F59\u5BBD\uFF09\uFF1B
   \u5165\u53E3\u884C\u53F3\u5BF9\u9F50\u2014\u2014.dyn-pet-board \u975E flex \u5BB9\u5668\uFF0C\u7528 text-align \u800C\u975E align-self\uFF08Task10 \u6559\u8BAD\uFF09\uFF1B
   \u5165\u53E3\u884C\u662F\u9ED1\u677F\u5185\u7B2C\u4E8C\u4E2A\u53EF\u70B9\u5143\u7D20\uFF08\u5BB9\u5668\u65E0 pointer-events \u9650\u5236\uFF0C\u663E\u5F0F auto \u4FDD\u70B9\u51FB\uFF09 */
.dyn-pet-board-spark { display: flex; align-items: center; gap: 6px; }
.dyn-pet-board-spark-label { flex: none; color: rgba(255,255,255,.55); font-size: 11px; }
.dyn-pet-board-open { text-align: right; pointer-events: auto; cursor: pointer; color: rgba(255,255,255,.75); }
.dyn-pet-board-open:hover { text-decoration: underline; color: #fff; }
/* \u7C89\u7B14\u69FD\uFF1A\u6728\u8D28\u6A2A\u6761 + \u4E00\u652F\u7C89\u7B14 + \u4E00\u5757\u677F\u64E6\uFF08\u7EAF CSS \u88C5\u9970\uFF0C\u8BA8\u559C\u4E0D\u55A7\u5BBE\uFF09 */
.dyn-pet-board-tray { position: relative; height: 9px; margin: 10px -2px 2px; background: linear-gradient(#c39a6b, #9c7a55); border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,.3); }
.dyn-pet-board-tray::before { content: ""; position: absolute; left: 22px; top: -4px; width: 30px; height: 5px; background: #f5f2ea; border-radius: 2px; box-shadow: 0 1px 1px rgba(0,0,0,.25); }
.dyn-pet-board-tray::after { content: ""; position: absolute; right: 18px; top: -7px; width: 44px; height: 10px; background: #6b7484; border-radius: 2px; border-top: 3px solid #e8e5df; }
.dyn-pet-entry { position: absolute; right: -8px; top: -6px; background: #fffbe8; border: 1px solid rgba(122,74,43,0.5); color: #7a4a2b; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 3px 10px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.15); z-index: 3; }
/* ---- v2.2 L3 \u5927\u770B\u677F\uFF08Task 12\uFF0Cspec R5 Codex++ \u6392\u7248\uFF1Apadding 16 / hero 28px \u52A0\u7C97 / \u7F51\u683C\u4E24\u5217 /
   card \u5706\u89D2 10px \u6B21\u7EA7\u80CC\u666F / model-bar \u901A\u680F 5px \u5706\u89D2 / \u80F6\u56CA\u9009\u9879\u5361\uFF09\u3002
   \u9762\u677F\u8BED\u4E49\uFF086.6 \u89C4\u5219 7\uFF09\uFF1A\u9762\u677F\u81EA\u6EDA\u2014\u2014overflow:auto + height:100%\uFF0C\u6EDA\u52A8\u4E0D\u7A7F\u900F\u5916\u5C42 ---- */
.dyn-pet-dash { padding: 20px 28px; overflow: auto; height: 100%; box-sizing: border-box; color: #3b2f23; font-size: 16px; line-height: 1.6; max-width: 1020px; margin: 0 auto; background: var(--dsh-color-background, #fff); }
.dyn-pet-dash-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.dyn-pet-dash-head h2 { margin: 0; font-size: 20px; font-weight: 700; color: #7a4a2b; }
.dyn-pet-dash-tabs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dyn-pet-dash-tab { border: 1px solid rgba(122,74,43,.35); background: #fff; color: #7a4a2b; border-radius: 999px; padding: 4px 14px; font-size: 13px; cursor: pointer; }
.dyn-pet-dash-tab.is-active { background: #7a4a2b; color: #fff; border-color: #7a4a2b; }
.dyn-pet-dash-dates { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #7a4a2b; }
.dyn-pet-dash-dates input { border: 1px solid rgba(122,74,43,.35); border-radius: 6px; padding: 2px 4px; font-size: 12px; color: #3b2f23; background: #fff; }
.dyn-pet-dash-rangehint { color: #b45309; font-style: normal; font-size: 11px; }
/* ---- v2.2 R8 \u5927\u770B\u677F\u5934\u90E8\u5BFC\u51FA\u6309\u94AE\uFF08Task 14\uFF09\uFF1A\u590D\u5236\u6587\u672C / \u5BFC\u51FA\u56FE\u7247 ---- */
.dyn-pet-dash-actions { display: flex; align-items: center; gap: 6px; }
.dyn-pet-dash-actbtn.is-active { background: rgba(122,74,43,.14); }
.dyn-pet-dash-quotebar { display: flex; align-items: center; gap: 8px; padding: 8px 2px 2px; }
.dyn-pet-dash-quotebar input { flex: 1; min-width: 0; height: 30px; border: 1px solid rgba(122,74,43,.35); border-radius: 8px; padding: 0 10px; font-size: 13px; background: #fff; color: inherit; }
.dyn-pet-dash-quotebar input:focus { outline: none; border-color: rgba(122,74,43,.6); }
.dyn-pet-dash-actbtn { border: 1px solid rgba(122,74,43,.35); background: #fff; color: #7a4a2b; border-radius: 999px; padding: 3px 12px; font-size: 12px; cursor: pointer; }
.dyn-pet-dash-actbtn:hover { background: rgba(122,74,43,.08); }
.dyn-pet-dash-hero { padding: 10px 2px 6px; }
.dyn-pet-dash-hero-label { font-size: 14px; color: #a07050; }
.dyn-pet-dash-hero-num { font-size: 40px; font-weight: 750; color: #7a4a2b; line-height: 1.2; letter-spacing: .5px; font-variant-numeric: tabular-nums; }
.dyn-pet-dash-weekhit { font-size: 15px; color: #a07050; }
.dyn-pet-dash-rows { display: grid; grid-template-columns: 1fr 1fr; column-gap: 56px; margin: 10px 0 14px; }
.dyn-pet-dash-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 9px 2px; border-bottom: 1px solid rgba(122,74,43,.12); min-width: 0; }
.dyn-pet-dash-row span { font-size: 16px; color: #6b7280; }
.dyn-pet-dash-row strong { font-size: 16px; font-weight: 600; color: #1f2937; font-variant-numeric: tabular-nums; }
.dyn-pet-dash-card { border: 1px solid rgba(122,74,43,.16); border-radius: 10px; background: var(--dsh-color-background, #fff); padding: 10px 12px; margin-bottom: 12px; }
.dyn-pet-dash-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 17px; font-weight: 700; color: #7a4a2b; }
.dyn-pet-dash-meta { font-size: 14px; font-weight: 400; color: #a07050; }
.dyn-pet-dash-trendwrap { position: relative; }
.dyn-pet-dash-trendhit { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.dyn-pet-dash-tooltip { position: absolute; transform: translate(-50%, -130%); background: rgba(47,42,38,.94); color: #f3e9dc; font-size: 11px; padding: 3px 8px; border-radius: 6px; pointer-events: none; white-space: nowrap; z-index: 2; }
.dyn-pet-dash-model { display: grid; grid-template-columns: var(--model-name-w, 200px) var(--model-val-w, 84px) 1fr; align-items: center; gap: 12px; padding: 5px 0; font-size: 16px; }
/* v2.2.1 \u8FDB\u5EA6\u6761\u7B49\u957F\uFF1A\u540D\u79F0\u5217/\u6570\u503C\u5217\u5BBD\u7531 Panel \u5185 JS \u4EE5\u300C\u6700\u957F\u884C\u300D\u5B9E\u6D4B\u5199\u5165 CSS \u53D8\u91CF\uFF0C\u6240\u6709\u884C\u8FDB\u5EA6\u6761\u8D77\u70B9\u4E00\u81F4 */
.dyn-pet-dash-model-name { flex: none; min-width: 0; max-width: 100%; color: #7a4a2b; font-weight: 600; white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }
.dyn-pet-dash-model-val { text-align: right; color: #a07050; font-variant-numeric: tabular-nums; }
.dyn-pet-dash-model-bar { flex: 1; height: 5px; border-radius: 999px; background: rgba(122,74,43,.12); overflow: hidden; }
.dyn-pet-dash-model-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg,#3BA7FF,#8D6BFF); }
.dyn-pet-dash-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 640px; }
.dyn-pet-dash-toolcell { border: 1px solid rgba(122,74,43,.15); border-radius: 10px; background: rgba(255,252,248,.65); padding: 6px 10px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dyn-pet-dash-toolcell span { font-size: 14px; color: #6b7280; }
.dyn-pet-dash-toolcell strong { font-size: 17px; font-weight: 600; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-dash-empty { color: #a07050; font-size: 12px; padding: 4px 0; }
.dyn-pet-dash-foot { color: #a07050; font-size: 14px; padding-top: 2px; }
/* ---- Native usage/cost/speed extension: same main column, DSH theme tokens + Foxbell fallbacks. ---- */
.dyn-pet-dash-shell { height: 100%; min-height: 0; display: flex; flex-direction: column; color: var(--dsh-color-text, #3b2f23); }
.dyn-pet-dash-page-tabs { flex: none; display: flex; gap: 8px; padding: 12px 28px 0; max-width: 1020px; width: 100%; box-sizing: border-box; margin: 0 auto; }
.dyn-pet-dash-page { flex: 1 1 auto; min-height: 0; }
.dyn-pet-dash-page[hidden] { display: none; }
.dyn-pet-dash-actbtn:disabled { opacity: .45; cursor: not-allowed; }
.dyn-pet-dash-actions { flex-wrap: wrap; }
.dyn-pet-dash-notice { color: var(--dsh-color-text-secondary, #806b59); font-size: 12px; margin: 5px 0; }
.dyn-pet-dash-error { color: var(--dsh-color-danger, #a43232); background: color-mix(in srgb, currentColor 8%, transparent); border-radius: 8px; padding: 7px 10px; margin: 7px 0; font-size: 13px; }
.dyn-pet-dash-collapse { width: 100%; border: 0; background: transparent; cursor: pointer; text-align: left; padding: 0; }
.dyn-pet-dash-card-head select, .dyn-pet-speed-filters input, .dyn-pet-speed-filters select { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 7px; background: var(--dsh-color-background, #fff); color: inherit; padding: 4px 7px; font: inherit; font-size: 12px; }
.dyn-pet-dash-tab:focus-visible, .dyn-pet-dash-actbtn:focus-visible, .dyn-pet-speed-series-row:focus-visible { outline: 2px solid var(--dsh-color-primary, #3ba7ff); outline-offset: 2px; }
.dyn-pet-cost-head, .dyn-pet-cost-row { display: grid; grid-template-columns: minmax(160px,1.6fr) minmax(96px,1fr) minmax(76px,.8fr) 82px 40px; gap: 10px; align-items: start; }
.dyn-pet-cost-head { color: var(--dsh-color-text-secondary, #806b59); font-size: 11px; padding: 8px 2px 3px; }
.dyn-pet-cost-row { padding: 8px 2px; border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent); font-size: 13px; }
.dyn-pet-cost-row > span:first-child { min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }
.dyn-pet-cost-row strong { display: flex; flex-direction: column; font-variant-numeric: tabular-nums; }
.dyn-pet-cost-row small { color: var(--dsh-color-text-secondary, #806b59); font-weight: 400; }
.dyn-pet-cost-provider { color: var(--dsh-color-text-secondary, #806b59); font-size: 12px; font-weight: 700; padding-top: 7px; }
.dyn-pet-cost-detail { padding: 6px 8px 10px; background: color-mix(in srgb, currentColor 4%, transparent); border-radius: 7px; font-size: 11px; }
.dyn-pet-cost-detail-row { display: grid; grid-template-columns: 1.3fr .7fr 1fr .8fr 1fr; gap: 5px; padding-top: 5px; }
.dyn-pet-price-dialog-focus { display: contents; }
.dyn-pet-price-rule { border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; margin: 0 0 10px; padding: 9px; }
.dyn-pet-price-rule-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dyn-pet-price-rule label, .dyn-pet-price-cells label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; }
.dyn-pet-price-rule input, .dyn-pet-price-rule select { min-width: 0; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 6px; background: var(--dsh-color-background, #fff); color: inherit; padding: 5px; }
.dyn-pet-price-cells { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; margin: 7px 0; }
.dyn-pet-price-windows { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin: 7px 0; }
.dyn-pet-price-windows input { width: 52px; }
.dyn-pet-speed-current { display: grid; grid-template-columns: auto auto 1fr; align-items: baseline; gap: 12px; padding: 10px 2px; }
.dyn-pet-speed-current strong { font-size: 25px; }
.dyn-pet-speed-current small { color: var(--dsh-color-text-secondary, #806b59); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-speed-filters { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 10px; }
.dyn-pet-speed-filters input { flex: 1 1 180px; }
.dyn-pet-speed-layout { display: grid; grid-template-columns: minmax(190px,280px) minmax(0,1fr); gap: 12px; align-items: start; }
.dyn-pet-speed-series { order: 1; display: flex; flex-direction: column; gap: 5px; }
.dyn-pet-speed-detail { order: 2; min-width: 0; }
.dyn-pet-speed-series-row { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 8px; background: transparent; color: inherit; padding: 8px; text-align: left; cursor: pointer; }
.dyn-pet-speed-series-row.is-active { border-color: var(--dsh-color-primary, #3ba7ff); background: color-mix(in srgb, currentColor 6%, transparent); }
.dyn-pet-speed-series-row span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-speed-series-row small { color: var(--dsh-color-text-secondary, #806b59); }
.dyn-pet-speed-metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; margin-bottom: 8px; }
.dyn-pet-speed-metrics > div { display: flex; flex-direction: column; border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 8px; padding: 7px; min-width: 0; }
.dyn-pet-speed-metrics span, .dyn-pet-speed-metrics small { color: var(--dsh-color-text-secondary, #806b59); font-size: 11px; }
.dyn-pet-speed-metrics strong { font-size: 18px; }
.dyn-pet-speed-chart { position: relative; min-width: 0; }
.dyn-pet-speed-chart svg { display: block; width: 100%; height: auto; min-height: 210px; overflow: visible; }
.dyn-pet-speed-grid { stroke: color-mix(in srgb, currentColor 12%, transparent); stroke-width: 1; }
.dyn-pet-speed-axis { fill: var(--dsh-color-text-secondary, #806b59); font-size: 10px; font-variant-numeric: tabular-nums; }
.dyn-pet-speed-line { stroke: var(--dsh-color-primary, #3ba7ff); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.dyn-pet-speed-mark { fill: var(--dsh-color-primary, #3ba7ff); stroke: var(--dsh-color-background, #fff); stroke-width: 2; }
.dyn-pet-speed-crosshair { stroke: var(--dsh-color-text-secondary, #806b59); stroke-width: 1; pointer-events: none; }
.dyn-pet-speed-chart circle[role="button"] { cursor: pointer; }
.dyn-pet-speed-chart circle[role="button"]:focus-visible { outline: none; stroke: var(--dsh-color-primary, #3ba7ff); stroke-width: 2; }
.dyn-pet-speed-tooltip { display: flex; flex-direction: column; gap: 2px; position: absolute; right: 10px; top: 10px; max-width: min(360px,90%); padding: 8px 10px; border-radius: 8px; background: var(--dsh-color-elevated, rgba(47,42,38,.94)); color: var(--dsh-color-text, #f3e9dc); font-size: 11px; pointer-events: none; }
.dyn-pet-speed-table { margin-top: 8px; font-size: 11px; }
.dyn-pet-speed-table table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.dyn-pet-speed-table th, .dyn-pet-speed-table td { text-align: left; border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent); padding: 4px; }
.dyn-pet-dash-shell { container: foxbell-dashboard / inline-size; }
@container foxbell-dashboard (max-width: 760px) {
  .dyn-pet-dash { padding: 14px; }
  .dyn-pet-speed-layout { display: flex; flex-direction: column; }
  .dyn-pet-speed-detail { order: 1; width: 100%; }
  .dyn-pet-speed-series { order: 2; width: 100%; }
  .dyn-pet-speed-metrics { grid-template-columns: 1fr 1fr; }
  .dyn-pet-cost-head, .dyn-pet-cost-row { grid-template-columns: minmax(0,1.2fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.7fr) auto; gap: 4px; }
  .dyn-pet-cost-row > * { min-width: 0; overflow-wrap: anywhere; }
  .dyn-pet-cost-detail-row { grid-template-columns: 1fr 1fr; }
  .dyn-pet-price-cells { grid-template-columns: 1fr 1fr; }
  .dyn-pet-speed-current { grid-template-columns: 1fr auto; }
  .dyn-pet-speed-current small { grid-column: 1 / -1; }
}
@media (forced-colors: active) {
  .dyn-pet-speed-line, .dyn-pet-speed-mark { stroke: CanvasText; }
  .dyn-pet-speed-mark { fill: CanvasText; }
}
/* ---- v2.2 \u4FA7\u680F\u770B\u677F\u5165\u53E3\u56FE\u6807\uFF08Task 13 R6\uFF09\uFF1Asidebar.panellist \u6761\u76EE\uFF08dashboardSidebarEntry \u95E8\u63A7\u6CE8\u518C\uFF09---- */
.dyn-pet-sideicon { font-size: 20px; text-align: center; padding: 6px 0; cursor: pointer; user-select: none; -webkit-user-select: none; }
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
var import_jsx_runtime22 = require("react/jsx-runtime");
var sessionsList;
var sessionsListeners = /* @__PURE__ */ new Set();
function setSessionsList(service) {
  const list = service?.list;
  sessionsList = list && typeof list.getSnapshot === "function" ? list : void 0;
  for (const listener of [...sessionsListeners]) listener();
}
function makeUseSessions() {
  const read = () => {
    const list = sessionsList;
    try {
      const snap = list?.getSnapshot?.();
      if (!snap || typeof snap !== "object") return { current: void 0 };
      if (typeof snap.current === "string" && snap.current.length > 0) return { current: snap.current };
      const byId = snap.byId;
      if (byId && typeof byId === "object") {
        for (const [id, row] of Object.entries(byId)) {
          const n = row?.retainedBy?.mainView;
          if (typeof n === "number" && n > 0) return { current: id };
        }
      }
      return { current: void 0 };
    } catch {
      return { current: void 0 };
    }
  };
  return function useSessions(sel) {
    const [value, setValue] = import_react20.default.useState(() => sel(read()));
    import_react20.default.useEffect(() => {
      const sync = () => setValue(sel(read()));
      sessionsListeners.add(sync);
      const off = typeof sessionsList?.subscribe === "function" ? sessionsList.subscribe(sync) : void 0;
      sync();
      return () => {
        sessionsListeners.delete(sync);
        if (typeof off === "function") off();
      };
    }, []);
    return value;
  };
}
function OverlayEntry(props) {
  const ctx = props.ctx;
  const useSessions = props.useSessions;
  useLang();
  return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)(import_jsx_runtime22.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Pet, { ctx, useSessions }),
    /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(DialogHost, {})
  ] });
}
function apply(ctx) {
  const slots = ctx.get("slots") ?? ctx.slots;
  if (slots === void 0) return;
  adoptStyles();
  const start = () => {
    reportVisible(petStore.visible);
    appStore.start();
    startVoiceOwnership();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", schedulePoll);
    return () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", schedulePoll);
      appStore.stop();
      stopVoiceOwnership();
      setPanelSwitcher(null);
    };
  };
  if (typeof ctx.effect === "function") ctx.effect(start);
  else start();
  const scope = createHttpSettingsScope();
  if (typeof ctx.effect === "function") ctx.effect(() => appStore.attachSettings(scope));
  else appStore.attachSettings(scope);
  if (typeof ctx.inject === "function") ctx.inject(["sessions"], (c) => setSessionsList(c.sessions));
  else setSessionsList((() => {
    try {
      return ctx.get("sessions");
    } catch {
      return void 0;
    }
  })());
  const useSessions = makeUseSessions();
  slots.inject(
    "shell.overlay",
    () => slots.register(
      { name: "shell.overlay", id: "foxbell-pet", order: 100 },
      (props) => import_react20.default.createElement(OverlayEntry, Object.assign({}, props, { ctx, useSessions }))
    )
  );
  slots.inject(
    "sidebar.footer.action",
    () => slots.register(
      { name: "sidebar.footer.action", id: "foxbell-pet-toggle", order: 100, label: () => "Foxbell" },
      (props) => import_react20.default.createElement(PetToggle, props)
    )
  );
  slots.inject(
    "settings.plugin.item",
    () => slots.register(
      { name: "settings.plugin.item", key: "foxbell-pet" },
      () => import_react20.default.createElement(SettingsCard)
    )
  );
  if (typeof ctx.inject === "function") {
    ctx.inject(["layout"], (c) => {
      const layout = c && c.layout;
      if (layout && typeof layout.selectPanel === "function") {
        const attach = () => {
          setPanelSwitcher((id) => layout.selectPanel(id));
          return () => setPanelSwitcher(null);
        };
        if (typeof c.effect === "function") c.effect(attach);
        else attach();
      }
    });
  }
  if (typeof ctx.inject === "function") {
    ctx.inject(["locale"], (c) => {
      const locale = c && c.locale;
      if (locale && typeof locale.getSnapshot === "function" && typeof locale.subscribe === "function") {
        if (typeof c.effect === "function") c.effect(() => adoptLocaleService(locale));
        else adoptLocaleService(locale);
      }
    });
  }
  slots.inject(
    "main",
    () => slots.register(
      { name: "main", key: PANEL_ID },
      () => import_react20.default.createElement(DashboardPanel, { useSessions })
    )
  );
  slots.inject(
    "settings.section",
    () => slots.register(
      { name: "settings.section", id: "foxbell-pet", order: 30, label: () => t("settings.cardTitle") },
      () => import_react20.default.createElement(SettingsCard)
    )
  );
}
var inject = ["slots"];

return module.exports; } });
