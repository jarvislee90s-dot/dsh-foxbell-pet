// src/host/index.js
import { fileURLToPath } from "node:url";
import fs10 from "node:fs";
import os2 from "node:os";
import path10 from "node:path";
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

// src/host/usage-facts.js
var routeKey = ({ provider, model }) => JSON.stringify([provider, model]);
var BUCKETS = ["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"];
var UNKNOWN_ROUTE = () => ({ provider: null, model: null });
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var validCounter = (value) => Number.isSafeInteger(value) && value >= 0;
function routeSource(event) {
  const source = event?.data?.message?.source;
  if (!isObject(source) || source.kind !== void 0 && source.kind !== "model") return UNKNOWN_ROUTE();
  const field = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
  return { provider: field(source.provider), model: field(source.model) };
}
function counters(usage) {
  if (!isObject(usage)) return null;
  return Object.fromEntries(BUCKETS.map((bucket) => [
    bucket,
    usage[bucket] === void 0 ? 0 : validCounter(usage[bucket]) ? usage[bucket] : null
  ]));
}
function attemptKey(data) {
  if (data?.turn === void 0 || data?.turn === null || data?.step === void 0 || data?.step === null) return null;
  return JSON.stringify([typeof data.turn, data.turn, typeof data.step, data.step]);
}
function streamUsage(lastUsage2, stream) {
  if (typeof lastUsage2 !== "function" || !Array.isArray(stream)) return void 0;
  try {
    return lastUsage2(stream);
  } catch {
    return void 0;
  }
}
function foldUsageFacts(events, { lastUsage: lastUsage2 } = {}) {
  const facts = [];
  const openSlots = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  const input = Array.isArray(events) ? events : [];
  for (let eventIndex = 0; eventIndex < input.length; eventIndex += 1) {
    const event = input[eventIndex];
    if (!isObject(event) || !isObject(event.data)) continue;
    const data = event.data;
    const hasSeq = Number.isSafeInteger(event.seq) && event.seq >= 0;
    if (hasSeq && seen.has(event.seq)) continue;
    if (hasSeq) seen.add(event.seq);
    const key = attemptKey(data);
    if (event.type === "llm/retry-started") {
      if (key !== null) openSlots.delete(key);
      continue;
    }
    if (event.type !== "assistant/message" && event.type !== "assistant/attempt") continue;
    if (!Number.isFinite(event.time)) continue;
    const usage = event.type === "assistant/message" && isObject(data.usage) ? data.usage : streamUsage(lastUsage2, data.stream);
    const tokens = counters(usage);
    if (tokens === null) continue;
    const fact = {
      // Legacy folded fixtures may omit seq; real DSH events always carry it.
      seq: Number.isSafeInteger(event.seq) && event.seq >= 0 ? event.seq : eventIndex,
      at: event.time,
      route: routeSource(event),
      tokens
    };
    const open = key === null ? void 0 : openSlots.get(key);
    if (open) {
      facts[open.index] = fact;
      openSlots.set(key, { index: open.index });
    } else {
      const index = facts.length;
      facts.push(fact);
      if (key !== null) openSlots.set(key, { index });
    }
  }
  return facts;
}

// src/host/dashboard.js
function sessionEvents(session) {
  if (session && typeof session.snapshotEvents === "function") {
    try {
      const evts = session.snapshotEvents();
      if (Array.isArray(evts)) return evts;
    } catch {
    }
  }
  return session && Array.isArray(session.events) ? session.events : [];
}
var PACE_LABELS = {
  intense: "\u9AD8\u5F3A\u5EA6",
  active: "\u6D3B\u8DC3",
  longrun: "\u957F\u4EFB\u52A1",
  idle: "\u7A7A\u95F2",
  loaf1: "\u6478\u9C7C\xB7\u5C0F\u61A9",
  loaf2: "\u6478\u9C7C\xB7\u8EBA\u5E73",
  loaf3: "\u6478\u9C7C\xB7\u54B8\u9C7C",
  loaf4: "\u6478\u9C7C\xB7\u54B8\u9C7C\u5E72"
};
var DEFAULT_PACE = { intenseEvents: 12, longrunSilentMs: 3 * 6e4, loafStartMs: 15 * 6e4 };
var LOAF_STEPS_MS = [10 * 6e4, 20 * 6e4, 45 * 6e4];
function derivePaceTier(agg, now, opt) {
  const o = Object.assign({}, DEFAULT_PACE, opt || {});
  if (!agg || !Number.isFinite(agg.lastEventTime)) {
    return { tier: "idle", sinceMs: null, label: PACE_LABELS.idle };
  }
  const sinceMs = Math.max(0, now - agg.lastEventTime);
  if (agg.turnOpen) {
    if (sinceMs >= o.longrunSilentMs) return { tier: "longrun", sinceMs, label: PACE_LABELS.longrun };
    if ((agg.eventCount5m || 0) >= o.intenseEvents) return { tier: "intense", sinceMs, label: PACE_LABELS.intense };
    return { tier: "active", sinceMs, label: PACE_LABELS.active };
  }
  if (sinceMs >= o.loafStartMs + LOAF_STEPS_MS[2]) return { tier: "loaf4", sinceMs, label: PACE_LABELS.loaf4 };
  if (sinceMs >= o.loafStartMs + LOAF_STEPS_MS[1]) return { tier: "loaf3", sinceMs, label: PACE_LABELS.loaf3 };
  if (sinceMs >= o.loafStartMs + LOAF_STEPS_MS[0]) return { tier: "loaf2", sinceMs, label: PACE_LABELS.loaf2 };
  if (sinceMs >= o.loafStartMs) return { tier: "loaf1", sinceMs, label: PACE_LABELS.loaf1 };
  return { tier: "idle", sinceMs, label: PACE_LABELS.idle };
}
function dateKeyOf(ms) {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
var USAGE_KEYS = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"];
var zeroUsage = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
function hourKeyOf(ms) {
  const d = new Date(ms);
  return dateKeyOf(ms) + "T" + String(d.getHours()).padStart(2, "0");
}
var UNKNOWN_ROUTE2 = "\u672A\u77E5";
var routeBuckets = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requestCount: 0 });
function foldUsage(evts, { lastUsage: lastUsage2 } = {}) {
  const byDay = {};
  const byHour = {};
  const byRoute = {};
  const byDayRoute = {};
  const grand = zeroUsage();
  let requestCount = 0;
  const facts = foldUsageFacts(evts, { lastUsage: lastUsage2 });
  for (const fact of facts) {
    const day = dateKeyOf(fact.at);
    const hour = hourKeyOf(fact.at);
    const src = fact.route;
    const route = src.provider && src.model ? src.provider + "/" + src.model : UNKNOWN_ROUTE2;
    const d = byDay[day] || (byDay[day] = zeroUsage());
    const h = byHour[hour] || (byHour[hour] = zeroUsage());
    const r = byRoute[route] || (byRoute[route] = routeBuckets());
    const dr = byDayRoute[day] || (byDayRoute[day] = {});
    const rd = dr[route] || (dr[route] = routeBuckets());
    for (const k of USAGE_KEYS) {
      const value = fact.tokens[k] || 0;
      grand[k] += value;
      d[k] += value;
      h[k] += value;
      r[k] += value;
      rd[k] += value;
    }
    r.requestCount += 1;
    rd.requestCount += 1;
    d.requestCount = (d.requestCount || 0) + 1;
    h.requestCount = (h.requestCount || 0) + 1;
    requestCount += 1;
  }
  return { byDay, byHour, byRoute, byDayRoute, grand, requestCount, facts };
}
function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1e4) return String(Math.round(n));
  if (n < 1e8) {
    const v2 = (n / 1e4).toFixed(1);
    return (v2.endsWith(".0") ? v2.slice(0, -2) : v2) + "\u4E07";
  }
  const v = (n / 1e8).toFixed(2);
  return v.replace(/\.?0+$/, "") + "\u4EBF";
}
function evaluateAlerts(prev, next, cfg, dateKey2) {
  const out = [];
  const day = typeof dateKey2 === "string" && dateKey2 ? ":" + dateKey2 : "";
  const limit = cfg && cfg.dayLimitTokens > 0 ? cfg.dayLimitTokens : 0;
  if (limit > 0) {
    const warn = limit * 0.8;
    if (prev.dayTotal < warn && next.dayTotal >= warn) {
      out.push({ id: "day-warn" + day, kind: "day-warn", reached: next.dayTotal, text: "\u4ECA\u65E5 token \u5DF2\u7528 80% \xB7 " + formatTokens(next.dayTotal) });
    }
    if (prev.dayTotal < limit && next.dayTotal >= limit) {
      out.push({ id: "day-hit" + day, kind: "day-hit", reached: next.dayTotal, text: "\u4ECA\u65E5 token \u5DF2\u8FBE\u9608\u503C \xB7 " + formatTokens(next.dayTotal) });
    }
  }
  const unit = cfg && cfg.milestoneUnit > 0 ? cfg.milestoneUnit : 0;
  if (unit > 0) {
    const k = Math.floor(next.grandTotal / unit);
    if (k > 0 && Math.floor(prev.grandTotal / unit) < k) {
      out.push({ id: "milestone:" + k, kind: "milestone", reached: k * unit, text: "\u91CC\u7A0B\u7891\uFF1A\u7D2F\u8BA1 " + formatTokens(k * unit) + " token" });
    }
  }
  return out;
}
function ageLabel(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "";
  if (sec < 60) return Math.floor(sec) + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m";
  return Math.floor(sec / 3600) + "h";
}
var formatDur = (ms) => ms >= 6e4 ? (ms / 6e4).toFixed(1) + " \u5206\u949F" : ms >= 1e3 ? (ms / 1e3).toFixed(1) + " \u79D2" : Math.round(ms) + " \u6BEB\u79D2";
function summarize(perSession, dayUsage, userEst) {
  const list = Array.isArray(perSession) ? perSession : [];
  let turns = 0, errors = 0, longest = 0;
  const tools = {};
  const dur = {};
  for (const s of list) {
    turns += s.turns || 0;
    errors += s.errors || 0;
    if (s.longestTurnMs > longest) longest = s.longestTurnMs;
    const durMs = s.toolDurMs || {};
    for (const [n, c] of Object.entries(s.toolCalls || {})) {
      tools[n] = (tools[n] || 0) + c;
      dur[n] = (dur[n] || 0) + (durMs[n] || 0);
    }
  }
  const top = Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => dur[n] > 0 ? n + "\xD7" + c + "\uFF08\u5171 " + formatDur(dur[n]) + "\uFF09" : n + "\xD7" + c);
  const t = dayUsage || zeroUsage();
  const requestTotal = t.inputTokens + t.cacheReadTokens;
  return {
    sessions: list.length,
    turns,
    errors,
    // 五口径名词（spec 6.2/用户 2026-09-10 裁定）：请求输入=全文累计，命中率=缓存命中/请求输入，用户输入为启发式估算
    tokensText: "\u8BF7\u6C42\u8F93\u5165 " + formatTokens(requestTotal) + "\uFF08\u7F13\u5B58\u547D\u4E2D " + formatTokens(t.cacheReadTokens) + " \xB7 " + (requestTotal > 0 ? (t.cacheReadTokens / requestTotal * 100).toFixed(1) : "0.0") + "%\uFF09\xB7 \u4EA7\u51FA " + formatTokens(t.outputTokens) + " \xB7 \u4F60\u7684\u8F93\u5165 ~" + formatTokens(userEst || 0) + "(\u4F30) \xB7 \u542B\u5B50\u4EE3\u7406",
    toolsText: top.length ? top.join(" \xB7 ") : "\u2014",
    longestText: longest >= 6e4 ? (longest / 6e4).toFixed(1) + " \u5206\u949F" : Math.round(longest / 1e3) + " \u79D2"
  };
}
function summarizeStructured(perSession, dayUsage, userEst) {
  const list = Array.isArray(perSession) ? perSession : [];
  let longest = 0;
  const tools = {};
  const dur = {};
  for (const s of list) {
    if (s.longestTurnMs > longest) longest = s.longestTurnMs;
    const durMs = s.toolDurMs || {};
    for (const [n, c] of Object.entries(s.toolCalls || {})) {
      tools[n] = (tools[n] || 0) + c;
      dur[n] = (dur[n] || 0) + (durMs[n] || 0);
    }
  }
  const toolRows = Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name2, count]) => ({ name: name2, count, ms: dur[name2] || 0 }));
  const t = dayUsage || zeroUsage();
  const requestTotal = t.inputTokens + t.cacheReadTokens;
  return {
    tokens: {
      requestTotal,
      // 请求输入口径 = inputTokens + cacheReadTokens（与 usage.requestTotal 同源）
      cacheRead: t.cacheReadTokens,
      hitPct: requestTotal > 0 ? t.cacheReadTokens / requestTotal * 100 : 0,
      output: t.outputTokens,
      userEst: userEst || 0
    },
    toolRows,
    longest: longest > 0 ? { ms: longest } : null
    // 无已计量 turn 时 null（客户端按 '0 秒' 桶展示，与 zh 口径一致）
  };
}
function blocksTextOf(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks.filter((b) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
}
function estimateTokens(text) {
  let n = 0;
  let word = false;
  for (const ch of String(text || "")) {
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
function estimateUserTokensByDay(evts) {
  const byDay = {};
  for (const ev of Array.isArray(evts) ? evts : []) {
    if (!ev || ev.type !== "user/message" || typeof ev.time !== "number" || !Number.isFinite(ev.time)) continue;
    const d = ev && ev.data;
    if (!d) continue;
    const n = estimateTokens(blocksTextOf(d.content));
    if (n <= 0) continue;
    const day = dateKeyOf(ev.time);
    byDay[day] = (byDay[day] || 0) + n;
  }
  return byDay;
}
function hitRate(usage) {
  const u = usage || {};
  const denom = (u.inputTokens || 0) + (u.cacheReadTokens || 0);
  if (denom <= 0) return 0;
  return Math.min(1, Math.max(0, (u.cacheReadTokens || 0) / denom));
}
var dayTotalOf = (u) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;
var reqTotalOf = (u) => u.inputTokens + u.cacheReadTokens;
var shiftDayKey = (key, delta) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dateKeyOf(dt.getTime());
};
function buildTrend(folds, nowMs) {
  const todayKey = dateKeyOf(nowMs);
  const dayKeys = [];
  for (let i = 13; i >= 0; i--) dayKeys.push(shiftDayKey(todayKey, -i));
  const dayAcc = Object.fromEntries(dayKeys.map((k) => [k, zeroUsage()]));
  const hourAcc = {};
  for (let h = 0; h < 24; h++) hourAcc[todayKey + "T" + String(h).padStart(2, "0")] = zeroUsage();
  for (const f of Array.isArray(folds) ? folds : []) {
    if (!f) continue;
    for (const [k, u] of Object.entries(f.byDay || {})) {
      if (!dayAcc[k]) continue;
      for (const bk of USAGE_KEYS) dayAcc[k][bk] += u[bk] || 0;
      dayAcc[k].requestCount = (dayAcc[k].requestCount || 0) + (u.requestCount || 0);
    }
    for (const [k, u] of Object.entries(f.byHour || {})) {
      if (!hourAcc[k]) continue;
      for (const bk of USAGE_KEYS) hourAcc[k][bk] += u[bk] || 0;
      hourAcc[k].requestCount = (hourAcc[k].requestCount || 0) + (u.requestCount || 0);
    }
  }
  const day = (k, b) => ({ key: k, dayTotal: dayTotalOf(b), requestTotal: reqTotalOf(b), cacheRead: b.cacheReadTokens, outputTokens: b.outputTokens, hitPct: hitRate(b), requestCount: b.requestCount || 0 });
  return {
    days: dayKeys.map((k) => day(k, dayAcc[k])),
    hours: Object.entries(hourAcc).map(([k, u]) => ({ key: k, dayTotal: dayTotalOf(u), requestTotal: reqTotalOf(u), cacheRead: u.cacheReadTokens || 0, requestCount: u.requestCount || 0 }))
  };
}
function summarizeRange(folds, toolsByDayList, userEstByDayList, fromKey, toKey) {
  const dayKeys = [];
  for (let k = fromKey; k <= toKey && dayKeys.length < 31; k = shiftDayKey(k, 1)) dayKeys.push(k);
  const dayAcc = Object.fromEntries(dayKeys.map((k) => [k, zeroUsage()]));
  const routeAcc = {};
  for (const f of Array.isArray(folds) ? folds : []) {
    if (!f) continue;
    for (const [k, u] of Object.entries(f.byDay || {})) {
      if (!dayAcc[k]) continue;
      for (const bk of USAGE_KEYS) dayAcc[k][bk] += u[bk] || 0;
      dayAcc[k].requestCount = (dayAcc[k].requestCount || 0) + (u.requestCount || 0);
    }
    for (const k of dayKeys) {
      const dayRoute = f.byDayRoute && f.byDayRoute[k];
      if (!dayRoute) continue;
      for (const [route, r] of Object.entries(dayRoute)) {
        const slash = route.indexOf("/");
        const a = routeAcc[route] || (routeAcc[route] = {
          route,
          provider: slash > 0 ? route.slice(0, slash) : "",
          model: slash > 0 ? route.slice(slash + 1) : "",
          requestTotal: 0,
          cacheRead: 0,
          outputTokens: 0
        });
        a.requestTotal += r.inputTokens + r.cacheReadTokens;
        a.cacheRead += r.cacheReadTokens;
        a.outputTokens += r.outputTokens;
      }
    }
  }
  const totals2 = { requestTotal: 0, cacheRead: 0, outputTokens: 0, userEst: 0, hitPct: 0, requestCount: 0 };
  for (const est of Array.isArray(userEstByDayList) ? userEstByDayList : []) {
    if (!est) continue;
    for (const k of dayKeys) totals2.userEst += est[k] || 0;
  }
  const days = dayKeys.map((k) => {
    const b = dayAcc[k];
    return { key: k, dayTotal: dayTotalOf(b), requestTotal: reqTotalOf(b), cacheRead: b.cacheReadTokens, outputTokens: b.outputTokens, hitPct: hitRate(b), requestCount: b.requestCount || 0 };
  });
  totals2.requestTotal = days.reduce((s, d) => s + d.requestTotal, 0);
  totals2.cacheRead = days.reduce((s, d) => s + d.cacheRead, 0);
  totals2.outputTokens = days.reduce((s, d) => s + d.outputTokens, 0);
  totals2.requestCount = days.reduce((s, d) => s + d.requestCount, 0);
  totals2.hitPct = totals2.requestTotal > 0 ? totals2.cacheRead / totals2.requestTotal : 0;
  const models = Object.values(routeAcc).sort((a, b) => b.requestTotal - a.requestTotal);
  const toolsAcc = {};
  for (const t of Array.isArray(toolsByDayList) ? toolsByDayList : []) {
    if (!t || !t.byDay) continue;
    for (const k of dayKeys) {
      const day = t.byDay[k];
      if (!day) continue;
      for (const [name2, v] of Object.entries(day)) {
        const a = toolsAcc[name2] || (toolsAcc[name2] = { name: name2, count: 0, durMs: 0 });
        a.count += v.count || 0;
        a.durMs += v.durMs || 0;
      }
    }
  }
  const tools = Object.values(toolsAcc).sort((a, b) => b.count - a.count);
  return { from: fromKey, to: toKey, days, totals: totals2, models, tools };
}
function foldToolsByDay(evts) {
  const byDay = {};
  for (const ev of Array.isArray(evts) ? evts : []) {
    const d = ev && ev.data;
    if (!d || ev.type !== "tool/call" && ev.type !== "tool/result") continue;
    if (typeof ev.time !== "number" || !Number.isFinite(ev.time)) continue;
    const name2 = typeof d.name === "string" && d.name.trim() ? d.name.trim() : null;
    if (!name2) continue;
    const day = dateKeyOf(ev.time);
    const b = byDay[day] || (byDay[day] = {});
    const a = b[name2] || (b[name2] = { count: 0, durMs: 0 });
    if (ev.type === "tool/call") a.count += 1;
    if (ev.type === "tool/result" && typeof d.durationMs === "number" && Number.isFinite(d.durationMs) && d.durationMs > 0) a.durMs += d.durationMs;
  }
  return { byDay };
}

// src/host/local-clock.js
var MINUTE_MS = 6e4;
var localOffset = (at) => new Date(at).getTimezoneOffset() * MINUTE_MS;
function floorLocalBucket(at, width) {
  const offset = localOffset(at);
  const edge = Math.floor((at - offset) / width) * width + offset;
  if (!Number.isFinite(offset)) throw new RangeError("Invalid local clock timestamp");
  if (localOffset(edge) === offset) return edge;
  return floorLocalBucket(edge, width);
}
function nextLocalBucket(at, width) {
  const offset = localOffset(at);
  const next = (Math.floor((at - offset) / width) + 1) * width + offset;
  if (localOffset(next) === offset) return next;
  let low = at;
  let high = next;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localOffset(middle) === offset) low = middle;
    else high = middle;
  }
  return high;
}

// src/host/speed.js
var DAY_MS = 864e5;
var RANGE_MS = { "15m": 15 * 6e4, "1h": 60 * 6e4, "5h": 5 * 60 * 6e4, "24h": DAY_MS };
var BUCKET_MS = { "15m": 6e4, "1h": 5 * 6e4, "5h": 10 * 6e4, "24h": 60 * 6e4 };
var SPEED_RANGES = Object.freeze(Object.keys(RANGE_MS));
var SPEED_BUCKET_MS = Object.freeze({ ...BUCKET_MS });
function routeKey2(route) {
  return JSON.stringify([
    route && typeof route.provider === "string" ? route.provider : null,
    route && typeof route.model === "string" ? route.model : null
  ]);
}
var emptySessionSpeed = (sessionId, status) => ({ sessionId, tps: null, status });
var finite = (value) => typeof value === "number" && Number.isFinite(value);
var nonNegative = (value) => finite(value) && value >= 0;
var eventSeq = (value) => Number.isSafeInteger(value) && value >= 0;
var identity = (value) => Number.isSafeInteger(value) && value >= 0;
function readSessionSpeed({ sessions, projections } = {}, sessionId) {
  const id = typeof sessionId === "string" ? sessionId : String(sessionId ?? "");
  try {
    if (!sessions || typeof sessions.get !== "function") return emptySessionSpeed(id, "unsupported");
    if (!projections || typeof projections.snapshot !== "function") return emptySessionSpeed(id, "unsupported");
    const session = sessions.get(sessionId);
    if (!session) return emptySessionSpeed(id, "empty");
    const snapshot = projections.snapshot(session, /* @__PURE__ */ new Set(["sessionStats"]));
    const stats = snapshot && snapshot.values && snapshot.values.sessionStats;
    if (!stats || typeof stats !== "object") return emptySessionSpeed(id, "unsupported");
    if (!nonNegative(stats.decodeTokens) || !nonNegative(stats.decodeMs)) return emptySessionSpeed(id, "unsupported");
    if (stats.decodeTokens <= 0 || stats.decodeMs <= 0) return emptySessionSpeed(id, "empty");
    const tps = 1e3 * stats.decodeTokens / stats.decodeMs;
    if (!finite(tps) || tps <= 0) return emptySessionSpeed(id, "unsupported");
    return { sessionId: id, tps, status: "ready" };
  } catch {
    return emptySessionSpeed(id, "unsupported");
  }
}
function routeOf(data) {
  const source = data && data.message && data.message.source;
  if (!source || typeof source !== "object") return null;
  if (source.kind !== void 0 && source.kind !== "model") return null;
  const provider = typeof source.provider === "string" ? source.provider.trim() : "";
  const model = typeof source.model === "string" ? source.model.trim() : "";
  return provider && model ? { provider, model } : null;
}
function stepKey(turn, step) {
  return JSON.stringify([turn, step]);
}
function callIdOf(data) {
  const value = data && data.message && data.message.source && data.message.source.callId;
  return typeof value === "string" && value.length > 0 ? value : null;
}
function firstTokenOf(helper, stream) {
  if (typeof helper !== "function" || !Array.isArray(stream)) return null;
  try {
    const value = helper(stream);
    return finite(value) ? value : null;
  } catch {
    return null;
  }
}
function foldSpeedFacts(events, { sessionId, now, firstTokenTime: firstTokenTime2 } = {}) {
  const sid = typeof sessionId === "string" ? sessionId : String(sessionId ?? "");
  const hasNow = finite(now);
  const steps = /* @__PURE__ */ new Map();
  const messages = [];
  const seen = /* @__PURE__ */ new Set();
  for (let order = 0; order < (Array.isArray(events) ? events.length : 0); order += 1) {
    const event = events[order];
    if (!event || typeof event !== "object" || !eventSeq(event.seq) || seen.has(event.seq)) continue;
    seen.add(event.seq);
    const data = event.data;
    if (!data || typeof data !== "object" || !finite(event.time)) continue;
    if (!identity(data.turn) || !identity(data.step)) continue;
    const key = stepKey(data.turn, data.step);
    if (event.type === "step/start") {
      const state2 = steps.get(key) || { calls: /* @__PURE__ */ new Map(), discontinuity: null, latestMessage: null, closed: false };
      state2.start = { time: event.time, order };
      state2.latestMessage = null;
      state2.closed = false;
      steps.set(key, state2);
      continue;
    }
    const state = steps.get(key);
    if (event.type === "assistant/attempt" || event.type === "llm/retry-started") {
      if (state) state.discontinuity = { time: event.time, order };
      continue;
    }
    if (event.type === "assistant/message") {
      const next = state || { calls: /* @__PURE__ */ new Map(), discontinuity: null, latestMessage: null, closed: false };
      if (!state) steps.set(key, next);
      if (data.interrupted === true) {
        next.latestMessage = null;
        next.discontinuity = { time: event.time, order };
        continue;
      }
      const route = routeOf(data);
      if (!route) {
        next.latestMessage = null;
        continue;
      }
      const start = next.start;
      const reliableStart = !!start && start.order < order && start.time <= event.time;
      const first = reliableStart ? firstTokenOf(firstTokenTime2, data.stream) : null;
      const boundary = next.discontinuity;
      const afterDiscontinuity = !boundary || boundary.order < order && first > boundary.time;
      const alignedFirst = first !== null && start.time <= first && first < event.time && afterDiscontinuity ? first : null;
      const ownStart = reliableStart && (!boundary || start.order > boundary.order && start.time >= boundary.time);
      const usage = data.usage && typeof data.usage === "object" ? data.usage : null;
      const record = {
        sessionId: sid,
        seq: event.seq,
        route,
        at: event.time,
        outputTokens: usage && nonNegative(usage.outputTokens) ? usage.outputTokens : null,
        decodeMs: alignedFirst !== null && alignedFirst < event.time ? event.time - alignedFirst : null,
        ttftMs: ownStart && alignedFirst !== null ? alignedFirst - start.time : null,
        modelMs: ownStart ? event.time - start.time : null,
        toolTotal: 0,
        toolCount: 0,
        order
      };
      messages.push(record);
      next.latestMessage = record;
      continue;
    }
    if (!state) continue;
    if (event.type === "step/end") {
      state.closed = true;
      continue;
    }
    if (state.closed) continue;
    if (event.type === "tool/call") {
      const callId = typeof data.callId === "string" && data.callId.length > 0 ? data.callId : null;
      if (!callId || state.calls.has(callId)) continue;
      const target = state.latestMessage && state.latestMessage.at <= event.time ? state.latestMessage : null;
      state.calls.set(callId, { at: event.time, target, settled: false });
      continue;
    }
    if (event.type === "tool/result") {
      const callId = callIdOf(data);
      if (!callId) continue;
      const call = state.calls.get(callId);
      if (!call || call.settled) continue;
      call.settled = true;
      if (!call.target || event.time < call.at || hasNow && event.time > now) continue;
      call.target.toolTotal += event.time - call.at;
      call.target.toolCount += 1;
    }
  }
  const cutoff = hasNow ? now - DAY_MS : -Infinity;
  const upper = hasNow ? now : Infinity;
  return messages.filter((record) => record.at > cutoff && record.at <= upper).map((record) => ({
    sessionId: record.sessionId,
    seq: record.seq,
    route: { ...record.route },
    at: record.at,
    outputTokens: record.outputTokens,
    decodeMs: record.decodeMs,
    ttftMs: record.ttftMs,
    modelMs: record.modelMs,
    toolMs: record.toolCount > 0 ? record.toolTotal : null
  }));
}
function accumulator() {
  return {
    output: 0,
    decode: 0,
    n: 0,
    sessions: /* @__PURE__ */ new Set(),
    ttft: 0,
    ttftN: 0,
    model: 0,
    modelN: 0,
    tool: 0,
    toolN: 0
  };
}
function addFact(acc, fact) {
  if (finite(fact.outputTokens) && fact.outputTokens > 0 && finite(fact.decodeMs) && fact.decodeMs > 0) {
    acc.output += fact.outputTokens;
    acc.decode += fact.decodeMs;
    acc.n += 1;
    acc.sessions.add(fact.sessionId);
  }
  if (nonNegative(fact.ttftMs)) {
    acc.ttft += fact.ttftMs;
    acc.ttftN += 1;
  }
  if (nonNegative(fact.modelMs)) {
    acc.model += fact.modelMs;
    acc.modelN += 1;
  }
  if (nonNegative(fact.toolMs)) {
    acc.tool += fact.toolMs;
    acc.toolN += 1;
  }
}
function metricsOf(acc) {
  return {
    tps: acc.n > 0 && acc.decode > 0 ? 1e3 * acc.output / acc.decode : null,
    n: acc.n,
    ttftMs: acc.ttftN > 0 ? acc.ttft / acc.ttftN : null,
    ttftN: acc.ttftN,
    modelMs: acc.modelN > 0 ? acc.model : null,
    modelN: acc.modelN,
    toolMs: acc.toolN > 0 ? acc.tool : null,
    toolN: acc.toolN
  };
}
function compareRoutes(a, b) {
  const ar = a.route || {};
  const br = b.route || {};
  const ap = typeof ar.provider === "string" ? ar.provider : "";
  const bp = typeof br.provider === "string" ? br.provider : "";
  const am = typeof ar.model === "string" ? ar.model : "";
  const bm = typeof br.model === "string" ? br.model : "";
  return (ap < bp ? -1 : ap > bp ? 1 : 0) || (am < bm ? -1 : am > bm ? 1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
function querySpeed(facts, { range, selectedKey } = {}, now, coverage) {
  if (!Object.hasOwn(RANGE_MS, range)) throw new RangeError(`Unsupported speed range: ${String(range)}`);
  if (!finite(now)) throw new TypeError("querySpeed requires a finite now timestamp");
  const duration = RANGE_MS[range];
  const width = BUCKET_MS[range];
  const from = now - duration;
  const to = now;
  const groups = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  for (const fact of Array.isArray(facts) ? facts : []) {
    if (!fact || !finite(fact.at) || fact.at <= from || fact.at > to || !eventSeq(fact.seq)) continue;
    const sid = typeof fact.sessionId === "string" ? fact.sessionId : String(fact.sessionId ?? "");
    const identityKey = JSON.stringify([sid, fact.seq]);
    if (seen.has(identityKey)) continue;
    seen.add(identityKey);
    const route = {
      provider: fact.route && typeof fact.route.provider === "string" ? fact.route.provider : null,
      model: fact.route && typeof fact.route.model === "string" ? fact.route.model : null
    };
    const key = routeKey2(route);
    let group2 = groups.get(key);
    if (!group2) {
      group2 = { key, route, acc: accumulator(), facts: [] };
      groups.set(key, group2);
    }
    addFact(group2.acc, { ...fact, sessionId: sid });
    group2.facts.push(fact);
  }
  const series = [...groups.values()].map((group2) => ({
    key: group2.key,
    route: group2.route,
    sessions: group2.acc.sessions.size,
    metrics: metricsOf(group2.acc)
  })).sort(compareRoutes);
  const selected = series.some((row) => row.key === selectedKey) ? selectedKey : series[0] ? series[0].key : null;
  const group = selected === null ? null : groups.get(selected);
  const buckets = [];
  let edge = from;
  while (edge < to) {
    const next = nextLocalBucket(edge, width);
    const bucketFrom = edge;
    const bucketTo = Math.min(to, next);
    if (bucketFrom < bucketTo) {
      const acc = accumulator();
      if (group) {
        for (const fact of group.facts) {
          if (fact.at > bucketFrom && fact.at <= bucketTo) addFact(acc, fact);
        }
      }
      buckets.push({
        from: bucketFrom,
        to: bucketTo,
        isPartial: bucketTo - bucketFrom !== width,
        metrics: metricsOf(acc)
      });
    }
    edge = next;
  }
  return { from, to, coverage, series, selectedKey: selected, buckets };
}

// src/host/usage-window.js
var HOUR_MS = 60 * 60 * 1e3;
var BUCKETS2 = ["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"];
var hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
var validNow = (value) => typeof value === "number" && Number.isFinite(value);
function invalid(message) {
  throw new RangeError(message);
}
function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}
function shiftDate(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}
function parseDay(value, label) {
  if (typeof value !== "string") invalid(`Usage ${label} date is required`);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) invalid(`Invalid usage ${label} date`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(2e3, 0, 1, 0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    invalid(`Invalid usage ${label} date`);
  }
  return date;
}
function dayOrdinal(date) {
  const value = new Date(Date.UTC(2e3, date.getMonth(), date.getDate()));
  value.setUTCFullYear(date.getFullYear());
  return Math.floor(value.getTime() / 864e5);
}
function resolveUsageSpan(query, now) {
  if (!validNow(now)) invalid("Invalid usage range clock");
  const preset = query?.preset;
  if (preset === "5h") {
    const to = floorLocalBucket(now, HOUR_MS);
    return { from: to - 5 * HOUR_MS, to, grain: "hour" };
  }
  if (preset === "custom") {
    const fromDate = parseDay(query?.from, "from");
    const toDate = parseDay(query?.to, "to");
    const days2 = dayOrdinal(toDate) - dayOrdinal(fromDate) + 1;
    if (days2 < 1) invalid("Usage from date must not be after to date");
    if (days2 > 31) invalid("Usage custom range is limited to 31 days");
    return { from: fromDate.getTime(), to: shiftDate(toDate, 1).getTime(), grain: "day" };
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "today" ? 1 : 0;
  if (!days) invalid("Invalid usage preset");
  const today = startOfDay(now);
  const from = preset === "today" ? today : shiftDate(today, 1 - days);
  return {
    from: from.getTime(),
    to: shiftDate(today, 1).getTime(),
    grain: preset === "today" ? "hour" : "day"
  };
}
function dateKey(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function emptyBucket(from, to) {
  return {
    from,
    to,
    tokens: 0,
    requestTotal: 0,
    cacheRead: 0,
    cacheWrite: 0,
    uncachedInput: 0,
    outputTokens: 0,
    requestCount: 0,
    missing: /* @__PURE__ */ new Set()
  };
}
function point(bucket) {
  return {
    from: bucket.from,
    to: bucket.to,
    tokens: bucket.tokens,
    hitPct: bucket.missing.has("inputTokens") || bucket.missing.has("cacheReadTokens") ? null : bucket.requestTotal === 0 ? null : bucket.cacheRead / bucket.requestTotal
  };
}
function totals(bucket, userEst) {
  const uncached = bucket.missing.has("inputTokens") ? null : bucket.uncachedInput;
  return {
    requestTotal: bucket.requestTotal,
    cacheRead: bucket.missing.has("cacheReadTokens") ? null : bucket.cacheRead,
    cacheWrite: bucket.missing.has("cacheWriteTokens") ? null : bucket.cacheWrite,
    uncachedInput: uncached,
    outputTokens: bucket.missing.has("outputTokens") ? null : bucket.outputTokens,
    userEst,
    requestCount: bucket.requestCount,
    hitPct: bucket.requestTotal === 0 ? 0 : bucket.cacheRead / bucket.requestTotal
  };
}
function addFact2(target, fact) {
  target.requestCount += 1;
  const tokens = fact?.tokens && typeof fact.tokens === "object" ? fact.tokens : {};
  for (const bucket of BUCKETS2) {
    const value = tokens[bucket];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      target.missing.add(bucket);
      continue;
    }
    target.tokens += value;
    if (bucket === "cacheReadTokens") {
      target.cacheRead += value;
      target.requestTotal += value;
    } else if (bucket === "inputTokens") {
      target.uncachedInput += value;
      target.requestTotal += value;
    } else if (bucket === "cacheWriteTokens") {
      target.cacheWrite += value;
    } else if (bucket === "outputTokens") {
      target.outputTokens += value;
    }
  }
}
function makeBuckets(span) {
  const buckets = [];
  let cursor = span.from;
  while (cursor < span.to) {
    let next;
    if (span.grain === "hour") {
      next = nextLocalBucket(cursor, HOUR_MS);
    } else {
      next = shiftDate(cursor, 1).getTime();
    }
    if (!Number.isFinite(next) || next <= cursor) invalid("Invalid usage bucket boundary");
    next = Math.min(next, span.to);
    buckets.push(emptyBucket(cursor, next));
    cursor = next;
  }
  return buckets;
}
function bucketIndex(buckets, at) {
  let low = 0;
  let high = buckets.length - 1;
  while (low <= high) {
    const middle = low + high >> 1;
    const bucket = buckets[middle];
    if (at < bucket.from) high = middle - 1;
    else if (at >= bucket.to) low = middle + 1;
    else return middle;
  }
  return -1;
}
function normalizedRoute(route) {
  return {
    provider: typeof route?.provider === "string" && route.provider ? route.provider : null,
    model: typeof route?.model === "string" && route.model ? route.model : null
  };
}
function readTools(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row.name !== "string" || !row.name) return [];
    if (!Number.isFinite(row.count) || row.count < 0 || !Number.isFinite(row.durMs) || row.durMs < 0) return [];
    return [{ name: row.name, count: row.count, durMs: row.durMs }];
  });
}
function aggregateUsageWindow(input = {}) {
  const query = input.query || { preset: "7d" };
  const now = input.now === void 0 ? Date.now() : input.now;
  const span = input.span || resolveUsageSpan(query, now);
  if (!span || !validNow(span.from) || !validNow(span.to) || span.from >= span.to || !["hour", "day"].includes(span.grain)) {
    invalid("Invalid usage span");
  }
  const globalBuckets = makeBuckets(span);
  const global = emptyBucket(span.from, span.to);
  const routes = /* @__PURE__ */ new Map();
  const days = dayOrdinal(new Date(span.to - 1)) - dayOrdinal(new Date(span.from)) + 1;
  const previousFrom = query.preset === "5h" ? span.from - (span.to - span.from) : shiftDate(span.from, -days).getTime();
  const previous = emptyBucket(previousFrom, span.from);
  for (const fact of Array.isArray(input.facts) ? input.facts : []) {
    if (!fact || !validNow(fact.at)) continue;
    if (previousFrom <= fact.at && fact.at < span.from) addFact2(previous, fact);
    if (fact.at < span.from || fact.at >= span.to) continue;
    const route = normalizedRoute(fact.route);
    const key = routeKey(route);
    let row = routes.get(key);
    if (!row) {
      row = { route, key, total: emptyBucket(span.from, span.to), buckets: makeBuckets(span) };
      routes.set(key, row);
    }
    addFact2(global, fact);
    addFact2(row.total, fact);
    const index = bucketIndex(globalBuckets, fact.at);
    if (index >= 0) {
      addFact2(globalBuckets[index], fact);
      addFact2(row.buckets[index], fact);
    }
  }
  let dailyRange = query.preset === "5h" ? null : input.range || null;
  if (query.preset !== "5h" && typeof input.rangeSummary === "function") {
    dailyRange = input.rangeSummary(dateKey(span.from), dateKey(span.to - 1)) || null;
  } else if (query.preset !== "5h" && input.rangeSummary && typeof input.rangeSummary === "object") {
    dailyRange = input.rangeSummary;
  }
  const userEst = hasOwn(input, "userEst") ? typeof input.userEst === "number" && Number.isFinite(input.userEst) ? input.userEst : null : query.preset !== "5h" && Number.isFinite(dailyRange?.totals?.userEst) ? dailyRange.totals.userEst : null;
  const tools = hasOwn(input, "tools") ? readTools(input.tools) : readTools(dailyRange?.tools);
  const routeRows = [...routes.values()].map((row) => ({
    route: row.route,
    totals: totals(row.total, null),
    // user activity is never apportioned to models
    unobservedBuckets: BUCKETS2.filter((bucket) => row.total.missing.has(bucket)),
    points: row.buckets.map(point)
  })).sort((a, b) => b.totals.requestTotal - a.totals.requestTotal || b.totals.outputTokens - a.totals.outputTokens || routeKey(a.route).localeCompare(routeKey(b.route)));
  return {
    span: { from: span.from, to: span.to, grain: span.grain },
    revision: Number.isFinite(input.revision) ? input.revision : 0,
    coverage: ["ready", "loading", "limited"].includes(input.coverage) ? input.coverage : "ready",
    totals: totals(global, userEst),
    previousHitPct: previous.requestTotal > 0 && !previous.missing.has("inputTokens") && !previous.missing.has("cacheReadTokens") ? previous.cacheRead / previous.requestTotal : null,
    unobservedBuckets: BUCKETS2.filter((bucket) => global.missing.has(bucket)),
    points: globalBuckets.map(point),
    routes: routeRows,
    tools
  };
}

// src/host/state.js
function blocksText(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks.filter((b) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
}
function estimateTokens2(s) {
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
  if (estimateTokens2(t) <= maxTokens) return t;
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
var USAGE_KEYS2 = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"];
var ACTIVITY_TYPES = /* @__PURE__ */ new Set(["user/message", "assistant/message", "tool/call", "tool/result", "turn/start", "turn/end", "approval/asked", "approval/decided"]);
var BOARD_DEFAULTS = {
  paceEnabled: true,
  paceIntenseEvents: 12,
  paceLongrunMin: 3,
  paceLoafStartMin: 15,
  usageEnabled: true,
  dayLimitTokens: 0,
  milestoneUnit: 1e6,
  approvalFlickerMin: 5
};
function scanInfo(events, dayStartMs) {
  const dayStart = typeof dayStartMs === "number" && Number.isFinite(dayStartMs) ? dayStartMs : -Infinity;
  const metrics = { turns: 0, errors: 0, toolCalls: {}, toolDurMs: {}, longestTurnMs: 0, lastEventTime: null, pendingList: [] };
  const toolStart = {};
  const turnStartAt = {};
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const d = ev && ev.data;
    if (!d || typeof ev.time !== "number") continue;
    if (ev.time > metrics.lastEventTime) metrics.lastEventTime = ev.time;
    const today = ev.time >= dayStart;
    if (ev.type === "turn/start") {
      if (today) metrics.turns += 1;
      turnStartAt[d.turn] = ev.time;
    } else if (ev.type === "turn/end") {
      const r = d.reason;
      if (today && r && (r.kind === "error" || r.kind === "interrupted")) metrics.errors += 1;
      const startAt = turnStartAt[d.turn];
      if (typeof startAt === "number" && today && ev.time - startAt > metrics.longestTurnMs) metrics.longestTurnMs = ev.time - startAt;
    } else if (ev.type === "tool/call" && typeof d.name === "string" && today) {
      metrics.toolCalls[d.name] = (metrics.toolCalls[d.name] || 0) + 1;
      if (d.callId !== void 0 && d.callId !== null) toolStart[d.callId] = { name: d.name, at: ev.time };
    } else if (ev.type === "tool/result") {
      const msg = d.message;
      const callId = msg && msg.source && msg.source.callId || msg && Array.isArray(msg.content) && msg.content[0] && msg.content[0].toolCallId;
      const start = callId !== void 0 && callId !== null ? toolStart[callId] : null;
      if (start) {
        metrics.toolDurMs[start.name] = (metrics.toolDurMs[start.name] || 0) + Math.max(0, ev.time - start.at);
        delete toolStart[callId];
      }
    } else if (ev.type === "approval/asked" && typeof d.id === "string") {
      metrics.pendingList.push({ id: d.id, at: ev.time });
    }
  }
  const lines = [];
  let lastEnd = null;
  let latestTurnStartSeq = null;
  let pendingApproval = false;
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
  metrics.pendingList = metrics.pendingList.filter((p) => !decidedIds.has(p.id));
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
  return { lines, lastEnd, latestTurnStartSeq, pendingApproval, metrics };
}
function scanSession(session, getTitle, dayStartMs, evts) {
  let title = null;
  if (typeof getTitle === "function") {
    try {
      const snap = getTitle(session);
      if (snap && typeof snap.title === "string" && snap.title) title = snap.title;
    } catch {
    }
  }
  const events = evts || sessionEvents(session);
  return { title, ...scanInfo(events, dayStartMs) };
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
function foldRecentActivity(events, now) {
  const records = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  const cutoff = Number.isFinite(now) ? now - 24 * 36e5 : -Infinity;
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || !Number.isFinite(event.time) || event.time < cutoff || !event.data) continue;
    if (event.type !== "user/message" && event.type !== "tool/call" && event.type !== "tool/result") continue;
    if (Number.isSafeInteger(event.seq)) {
      if (seen.has(event.seq)) continue;
      seen.add(event.seq);
    }
    const at = event.time;
    let activity = records.get(at);
    if (!activity) records.set(at, activity = { userEst: 0, tools: /* @__PURE__ */ new Map() });
    if (event.type === "user/message") {
      activity.userEst += estimateTokens(blocksTextOf(event.data.content));
      continue;
    }
    const name2 = typeof event.data.name === "string" ? event.data.name.trim() : "";
    if (!name2) continue;
    let tool = activity.tools.get(name2);
    if (!tool) activity.tools.set(name2, tool = { name: name2, count: 0, durMs: 0 });
    if (event.type === "tool/call") tool.count += 1;
    else if (Number.isFinite(event.data.durationMs) && event.data.durationMs > 0) tool.durMs += event.data.durationMs;
  }
  return records;
}
function foldEntry(evts, options = {}) {
  return {
    usage: foldUsage(evts, { lastUsage: options.lastUsage }),
    speed: foldSpeedFacts(evts, {
      sessionId: options.sessionId,
      now: options.now,
      firstTokenTime: options.firstTokenTime
    }),
    userEstByDay: estimateUserTokensByDay(evts),
    toolsByDay: foldToolsByDay(evts),
    recentActivity: foldRecentActivity(evts, options.now)
  };
}
function aggregateFold(entries, cfg, now, alertPrev, extraFolds) {
  const sessions = Array.isArray(entries) ? entries : [];
  const live = cfg && typeof cfg === "object" ? cfg : {};
  const cfgB = (k) => typeof live[k] === "boolean" ? live[k] : BOARD_DEFAULTS[k];
  const cfgN = (k) => typeof live[k] === "number" && Number.isFinite(live[k]) ? live[k] : BOARD_DEFAULTS[k];
  const nowMs = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  const dayKey = dateKeyOf(nowMs);
  let aggTurnOpen = false, aggLastEvent = null, agg5m = 0;
  let dayUsage = zeroUsage(), grandTotal = 0, latestSession = null, latestTime = -1;
  let userEstToday = 0;
  const approvals = [];
  const perSessionMetrics = [];
  const folds = [];
  for (const s of sessions) {
    if (!s) continue;
    const sid = s.id !== void 0 && s.id !== null ? s.id : "";
    const stitle = s.title || sid;
    const info = s.scan;
    const m = info && info.metrics;
    if (s.folded) folds.push(s.folded);
    if (m) {
      if (m.lastEventTime !== null) {
        if (m.lastEventTime > aggLastEvent) aggLastEvent = m.lastEventTime;
        agg5m += s.recentCount || 0;
      }
      const hasOpenTurn = info.latestTurnStartSeq !== null && info.lastEnd !== null && info.latestTurnStartSeq > info.lastEnd.seq || info.latestTurnStartSeq !== null && info.lastEnd === null;
      if (hasOpenTurn) aggTurnOpen = true;
      const dayB = s.folded && s.folded.usage.byDay[dayKey] || null;
      if (m.lastEventTime !== null && m.lastEventTime > latestTime) {
        latestTime = m.lastEventTime;
        const sB = dayB || zeroUsage();
        latestSession = { title: stitle, inputTokens: sB.inputTokens, outputTokens: sB.outputTokens, cacheReadTokens: sB.cacheReadTokens, cacheWriteTokens: sB.cacheWriteTokens };
      }
      perSessionMetrics.push({ title: stitle, turns: m.turns, errors: m.errors, toolCalls: m.toolCalls, toolDurMs: m.toolDurMs || {}, longestTurnMs: m.longestTurnMs });
      for (const pnd of m.pendingList) approvals.push({ id: sid + ":" + pnd.id, title: stitle, waitMin: Math.floor((nowMs - pnd.at) / 6e4) });
    }
  }
  for (const f of Array.isArray(extraFolds) ? extraFolds : []) if (f) folds.push(f);
  for (const f of folds) {
    const usage = f.usage;
    userEstToday += f.userEstByDay[dayKey] || 0;
    const dayB = usage.byDay[dayKey] || null;
    if (dayB) for (const k of USAGE_KEYS2) dayUsage[k] += dayB[k];
    grandTotal += usage.grand.inputTokens + usage.grand.outputTokens + usage.grand.cacheReadTokens + usage.grand.cacheWriteTokens;
  }
  const routeDay = {};
  for (const f of folds) {
    const dayRoute = f.usage.byDayRoute && f.usage.byDayRoute[dayKey];
    if (!dayRoute) continue;
    for (const [route, r] of Object.entries(dayRoute)) {
      const slash = route.indexOf("/");
      const a = routeDay[route] || (routeDay[route] = {
        route,
        provider: slash > 0 ? route.slice(0, slash) : "",
        model: slash > 0 ? route.slice(slash + 1) : "",
        requestTotal: 0,
        cacheRead: 0,
        outputTokens: 0
      });
      a.requestTotal += r.inputTokens + r.cacheReadTokens;
      a.cacheRead += r.cacheReadTokens;
      a.outputTokens += r.outputTokens;
    }
  }
  const toolDay = {};
  for (const f of folds) {
    const day = f.toolsByDay && f.toolsByDay.byDay && f.toolsByDay.byDay[dayKey];
    if (!day) continue;
    for (const [name2, v] of Object.entries(day)) {
      const a = toolDay[name2] || (toolDay[name2] = { name: name2, count: 0, durMs: 0 });
      a.count += v.count || 0;
      a.durMs += v.durMs || 0;
    }
  }
  let paceState = { tier: "idle", label: PACE_LABELS.idle, sinceMs: null };
  if (cfgB("paceEnabled")) {
    paceState = derivePaceTier({ turnOpen: aggTurnOpen, lastEventTime: aggLastEvent, eventCount5m: agg5m }, nowMs, {
      intenseEvents: cfgN("paceIntenseEvents"),
      longrunSilentMs: cfgN("paceLongrunMin") * 6e4,
      loafStartMs: cfgN("paceLoafStartMin") * 6e4
    });
  }
  const dayTotal = dayUsage.inputTokens + dayUsage.outputTokens + dayUsage.cacheReadTokens + dayUsage.cacheWriteTokens;
  const prev = alertPrev && typeof alertPrev === "object" ? alertPrev : { dayTotal: 0, grandTotal: 0 };
  const newAlerts = cfgB("usageEnabled") ? evaluateAlerts(prev, { dayTotal, grandTotal }, { dayLimitTokens: cfgN("dayLimitTokens"), milestoneUnit: cfgN("milestoneUnit") }, dayKey) : [];
  const summaryState = summarize(perSessionMetrics, dayUsage, userEstToday);
  const summaryStructured = summarizeStructured(perSessionMetrics, dayUsage, userEstToday);
  return {
    pace: cfgB("paceEnabled") ? paceState : null,
    // 关闭时不下发档位：客户端据此清掉旧档位（关闭语义）
    usage: {
      day: dayUsage,
      // 五口径派生（2026-09-10 用户裁定）：请求输入=全文累计；命中率=命中/请求输入；用户输入为启发式估算
      requestTotal: dayUsage.inputTokens + dayUsage.cacheReadTokens,
      cacheHitRate: hitRate(dayUsage),
      userEst: userEstToday,
      session: latestSession === null ? null : Object.assign({}, latestSession, {
        requestTotal: latestSession.inputTokens + latestSession.cacheReadTokens
      }),
      grandTotal,
      // v2.2 R2/R5/R3 快照扩展：当日模型 Top6 / 当日工具 Top5 / 14 日+24 桶趋势。
      // models 由 v2.1 的 {} 二期占位桶转正为 RouteAgg[]（客户端 UsageSnapshot.models / Board 消费数组）。
      models: Object.values(routeDay).sort((a, b) => b.requestTotal - a.requestTotal).slice(0, 10),
      // v2.2.1 Top6→Top10（用户裁定：10 个模型全展示）
      tools: Object.values(toolDay).sort((a, b) => b.count - a.count).slice(0, 5),
      trend: buildTrend(folds.map((f) => f.usage), nowMs)
    },
    alerts: newAlerts,
    approvals: cfgN("approvalFlickerMin") > 0 ? approvals.filter((x) => x.waitMin >= 0) : [],
    // summary：zh 字符串（tokensText/toolsText/longestText，29 用例字节契约）+ Task 7 结构化增量字段
    summary: { ...summaryState, ...summaryStructured }
  };
}
function createStateEngine(deps) {
  const projects = /* @__PURE__ */ new Map();
  const queue = [];
  let seq = 0;
  let alertPrev = { dayTotal: 0, grandTotal: 0 };
  let dashState = null;
  const foldCache = /* @__PURE__ */ new Map();
  const stats = { rescans: 0 };
  let corpusRev = 0;
  let usageRevision = 0;
  let coverage = "limited";
  let trendCache = { hourKey: null, corpusRev: 0, value: null };
  let lastSpeedPrune = -Infinity;
  const pruneSpeed = (now) => {
    if (!Number.isFinite(now) || now < lastSpeedPrune) return;
    lastSpeedPrune = now;
    for (const entry of foldCache.values()) {
      const speed = entry.folded?.speed;
      const cutoff = now - 864e5;
      if (speed?.some((fact) => fact.at <= cutoff)) entry.folded.speed = speed.filter((fact) => fact.at > cutoff);
    }
  };
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
    pruneSpeed(now);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const boardEntries = [];
    const rescansBefore = stats.rescans;
    for (const a of roots) {
      if (!a || a.id === void 0 || a.id === null) continue;
      seen.add(a.id);
      let info = { title: null, lines: [], lastEnd: null, latestTurnStartSeq: null, pendingApproval: false, metrics: null };
      let boardEntry = null;
      try {
        const session = deps.getSession(a.id);
        if (session) {
          const evts = sessionEvents(session);
          const last = evts.length > 0 ? evts[evts.length - 1] : null;
          const fp = evts.length + ":" + (last && typeof last.seq === "number" ? last.seq : -1);
          let c = foldCache.get(a.id);
          if (!c || c.fp !== fp) {
            stats.rescans += 1;
            const recent = [];
            for (const e of evts) if (e && typeof e.time === "number" && ACTIVITY_TYPES.has(e.type) && e.time > now - 3e5) recent.push(e.time);
            const inherited = session && typeof session.inheritedEventCount === "number" && session.inheritedEventCount > 0 ? Math.floor(session.inheritedEventCount) : 0;
            c = {
              fp,
              scan: scanSession(session, deps.getTitle, dayStart.getTime(), evts),
              folded: foldEntry(inherited > 0 ? evts.slice(inherited) : evts, {
                sessionId: String(a.id),
                now,
                lastUsage: deps.lastUsage,
                firstTokenTime: deps.firstTokenTime
              }),
              recent
            };
            usageRevision += 1;
            foldCache.set(a.id, c);
          } else {
            if (c.scan === null) c.scan = scanSession(session, deps.getTitle, dayStart.getTime(), evts);
            while (c.recent.length > 0 && c.recent[0] <= now - 3e5) c.recent.shift();
          }
          info = c.scan;
          boardEntry = { id: a.id, title: info.title || a.id, scan: c.scan, folded: c.folded, recentCount: c.recent.length };
        }
      } catch {
      }
      if (boardEntry) boardEntries.push(boardEntry);
      const prev = projects.get(a.id);
      const newCompletion = prev !== void 0 && info.lastEnd !== null && info.lastEnd.seq > (prev.lastTurnEndSeq || -1);
      const derived = derive(a, info, prev, newCompletion);
      projects.set(a.id, {
        lastTurnEndSeq: info.lastEnd !== null ? info.lastEnd.seq : prev ? prev.lastTurnEndSeq : -1,
        status: derived ? derived.status : null,
        unread: derived ? derived.unread : false,
        title: derived && derived.title ? derived.title : prev && prev.title ? prev.title : a.id,
        lines: derived ? derived.lines : [],
        vanishAt: null,
        // 卡片年龄标注（v1.4.0 同款）：最后事件距今；无任何事件时 NaN → ageLabel 归 ''
        age: ageLabel(info.metrics && info.metrics.lastEventTime != null ? Math.round((now - info.metrics.lastEventTime) / 1e3) : NaN)
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
    const cfgRaw = (() => {
      try {
        const v = deps.readConfig ? deps.readConfig() : {};
        return v && typeof v === "object" ? v : {};
      } catch {
        return {};
      }
    })();
    const extraFolds = [];
    for (const [cid, c] of foldCache) {
      if (!seen.has(cid) && c && c.folded) extraFolds.push(c.folded);
    }
    dashState = aggregateFold(boardEntries, cfgRaw, now, alertPrev, extraFolds);
    const counts = { approval: 0, running: 0, done: 0 };
    for (const p of projects.values()) {
      if (!p || !p.status) continue;
      if (p.status === "approval") counts.approval += 1;
      else if (p.status === "running") counts.running += 1;
      else if (p.status === "done") counts.done += 1;
    }
    dashState.usage.counts = counts;
    const hk = hourKeyOf(now);
    if (trendCache.hourKey !== hk || stats.rescans !== rescansBefore || trendCache.corpusRev !== corpusRev) {
      trendCache = { hourKey: hk, corpusRev, value: dashState.usage.trend };
    } else {
      dashState.usage.trend = trendCache.value;
    }
    const du = dashState.usage.day;
    alertPrev = { dayTotal: du.inputTokens + du.outputTokens + du.cacheReadTokens + du.cacheWriteTokens, grandTotal: dashState.usage.grandTotal };
  };
  const list = () => {
    const out = [];
    for (const [id, p] of projects) {
      if (!p || !p.status) continue;
      out.push({ id, title: p.title || id, lines: p.lines || [], status: p.status, unread: !!p.unread, age: p.age || "" });
    }
    const rank = { error: 0, approval: 1, running: 2, done: 3 };
    out.sort((a, b) => rank[a.status] - rank[b.status] || String(a.title).localeCompare(String(b.title), "zh"));
    return out;
  };
  const contentRev = () => {
    const rows = list().map((p) => `${p.id}:${p.status}:${p.unread ? 1 : 0}:${p.title || ""}:${(p.lines || []).join("/")}`).join("|");
    const d = dashState || {};
    const u = d.usage || {};
    const alerts = Array.isArray(d.alerts) ? d.alerts : [];
    const approvals = Array.isArray(d.approvals) ? d.approvals : [];
    let maxWaitMin = 0;
    for (const a of approvals) {
      const w = a && typeof a.waitMin === "number" && Number.isFinite(a.waitMin) ? Math.floor(a.waitMin) : 0;
      if (w > maxWaitMin) maxWaitMin = w;
    }
    return [
      rows,
      queue.length,
      // 队列末 seq（review Important#1）：队列帽 8 后长度恒定，零用量补完成若不同时改变行内容，
      // 仅靠 length 的 rev 会误判 unchanged，completion 被 mergeUnchanged 的 seq 推进永久吞掉。
      queue.length ? queue[queue.length - 1].seq : 0,
      u.requestTotal || 0,
      u.grandTotal || 0,
      d.pace ? d.pace.tier : "",
      alerts.map((a) => a && a.id != null ? String(a.id) : "").join(","),
      maxWaitMin
    ].join("#");
  };
  const rangeSummary = (fromKey, toKey) => {
    const folds = [], tools = [], ests = [];
    for (const c of foldCache.values()) {
      folds.push(c.folded.usage);
      tools.push(c.folded.toolsByDay);
      ests.push(c.folded.userEstByDay);
    }
    return summarizeRange(folds, tools, ests, fromKey, toKey);
  };
  const usageFacts = () => {
    const facts = [];
    for (const c of foldCache.values()) {
      if (c && c.folded && Array.isArray(c.folded.usage.facts)) facts.push(...c.folded.usage.facts);
    }
    return { facts, coverage, revision: usageRevision };
  };
  const speedFacts = () => {
    const facts = [];
    const now = deps.now();
    pruneSpeed(now);
    for (const c of foldCache.values()) {
      if (!Array.isArray(c.folded?.speed)) continue;
      for (const fact of c.folded.speed) if (fact.at > now - 864e5 && fact.at <= now) facts.push(fact);
    }
    return { facts, coverage: typeof deps.firstTokenTime === "function" ? coverage : "unsupported", revision: usageRevision };
  };
  const usageWindow = (query) => {
    const now = deps.now();
    const span = resolveUsageSpan(query, now);
    const tools = /* @__PURE__ */ new Map();
    let userEst = 0, activitySessions = 0;
    for (const { folded } of foldCache.values()) {
      const hasUsage = folded.usage.facts?.some((fact) => fact.at >= span.from && fact.at < span.to);
      let hasActivity = false;
      if (query.preset === "5h") {
        for (const [at, activity] of folded.recentActivity) {
          if (at < span.from || at >= span.to) continue;
          hasActivity = true;
          userEst += activity.userEst;
          for (const tool of activity.tools.values()) {
            let total = tools.get(tool.name);
            if (!total) tools.set(tool.name, total = { name: tool.name, count: 0, durMs: 0 });
            total.count += tool.count;
            total.durMs += tool.durMs;
          }
        }
      } else {
        const fromDay = dateKeyOf(span.from), toDay = dateKeyOf(span.to - 1);
        hasActivity = [...Object.keys(folded.userEstByDay), ...Object.keys(folded.toolsByDay.byDay)].some((day) => day >= fromDay && day <= toDay);
      }
      if (hasUsage || hasActivity) activitySessions += 1;
    }
    const hourly = query.preset === "5h" ? { userEst, tools: [...tools.values()].sort((a, b) => b.count - a.count) } : {};
    return { ...aggregateUsageWindow({ ...usageFacts(), query, span, now, rangeSummary, ...hourly }), activitySessions };
  };
  const speedWindow = (range, selectedKey) => {
    const current = speedFacts();
    return querySpeed(current.facts, { range, selectedKey }, deps.now(), current.coverage);
  };
  return {
    compute,
    list,
    projects,
    queue,
    dashboard: () => dashState,
    // 效率看板聚合（首轮 compute 前为 null）
    // ---------- v2.4（Issue #9）：非根会话折叠入口（corpus.js 采集器喂数） ----------
    /** 写入/更新一条非根会话折叠。fromLive=true 为活期视角（可能缺终态尾巴，转冷时须终读）；
     *  指纹（事件数:末事件 seq）未变且视角相同则跳过。若该 id 现持有根条目（采集竞态：
     *  会话刚被恢复为根），保留其 scan/recent 由 roots 路径继续接管，只换折叠。 */
    noteCorpusSession(id, evts, fromLive) {
      if (typeof id !== "string" || id === "") return;
      const arr = Array.isArray(evts) ? evts : [];
      const last = arr.length > 0 ? arr[arr.length - 1] : null;
      const fp = arr.length + ":" + (last && typeof last.seq === "number" ? last.seq : -1);
      const prev = foldCache.get(id);
      if (prev && prev.fp === fp && prev.fromLive === !!fromLive) return;
      corpusRev += 1;
      usageRevision += 1;
      foldCache.set(id, {
        fp,
        scan: prev ? prev.scan : null,
        folded: foldEntry(arr, { sessionId: id, now: deps.now(), lastUsage: deps.lastUsage, firstTokenTime: deps.firstTokenTime }),
        recent: prev && Array.isArray(prev.recent) ? prev.recent : [],
        corpus: true,
        fromLive: !!fromLive
      });
    },
    /** 是否需要一次冷读（readSession 终读）：无条目、或现有折叠是活期视角（fromLive!==false，
     *  含根路径遗留的无标记条目）→ true；已有冷折叠（不可变）→ false。 */
    corpusNeedsColdRead(id) {
      const c = foldCache.get(id);
      return c ? c.fromLive !== false : true;
    },
    /** 存储侧删除的会话出账：只删 corpus 标记条目；根路径写入的条目（无标记）保持旧语义。 */
    pruneCorpus(keepIds) {
      const keep = keepIds instanceof Set ? keepIds : new Set(Array.isArray(keepIds) ? keepIds : []);
      for (const [id, c] of foldCache) {
        if (c && c.corpus && !keep.has(id)) {
          foldCache.delete(id);
          corpusRev += 1;
          usageRevision += 1;
        }
      }
    },
    get stats() {
      return stats;
    },
    // v2.2 诊断：rescans 重扫计数（测试/Task 6 contentRev 消费）
    // v2.4 诊断（真机验收观测点）：folds=corpus 标记折叠条数（子代理/已收尾会话），
    // rev=corpus 变更计数。/state 的 diag.corpus 透传——启动收敛期 folds 应分批增长后稳定。
    get corpusStats() {
      let folds = 0;
      for (const c of foldCache.values()) if (c && c.corpus) folds += 1;
      return { folds, rev: corpusRev };
    },
    ack(agentId) {
      const p = projects.get(agentId);
      if (p) p.unread = false;
    },
    nextSeq: () => seq,
    contentRev,
    // v2.2 Task 6：内容修订号（/state ?since 短路 + 全量快照顶层 rev）
    rangeSummary,
    // v2.2 Task 6：/dashboard/range 的引擎入口（R3）
    get usageRevision() {
      return usageRevision;
    },
    usageFacts,
    speedFacts,
    usageWindow,
    speedWindow,
    noteCoverage(value) {
      if (value !== coverage && (value === "ready" || value === "loading" || value === "limited")) {
        coverage = value;
        usageRevision += 1;
      }
    }
  };
}

// src/host/corpus.js
var CORPUS_WINDOW_MS = 32 * 864e5;
var CORPUS_COLD_READS_PER_CYCLE = 25;
var CORPUS_HOST_TIMEOUT_MS = 3e4;
var CORPUS_BACKOFF_MAX_ROUNDS = 6;
var withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, reject) => {
    setTimeout(() => reject(new Error(label + " timed out after " + ms + "ms")), ms);
  })
]);
function createCorpusCollector(deps, opt = {}) {
  const coldBudget = typeof opt.coldBudget === "number" && opt.coldBudget > 0 ? Math.floor(opt.coldBudget) : CORPUS_COLD_READS_PER_CYCLE;
  let busy = false;
  let disposed = false;
  let cycle = 0;
  const failedAt = /* @__PURE__ */ new Map();
  let backoff = 0;
  async function refresh() {
    if (disposed || busy || !deps || !deps.engine) return;
    if (backoff > 0) {
      backoff -= 1;
      return;
    }
    busy = true;
    cycle += 1;
    const t0 = Date.now();
    let liveN = 0, coldN = 0, failN = 0;
    try {
      const records = await withTimeout(deps.listRecords(), CORPUS_HOST_TIMEOUT_MS, "listSessions");
      if (disposed) return;
      const keep = /* @__PURE__ */ new Set();
      let roots = /* @__PURE__ */ new Set();
      try {
        const rid = typeof deps.rootIds === "function" ? deps.rootIds() : deps.rootIds;
        roots = new Set(rid || []);
      } catch {
      }
      const nowMs = typeof deps.now === "function" ? deps.now() : Date.now();
      const horizon = nowMs - CORPUS_WINDOW_MS;
      const coldQueue = [];
      const oldColdQueue = [];
      for (const r of Array.isArray(records) ? records : []) {
        if (!r || typeof r.id !== "string" || r.id === "") continue;
        keep.add(r.id);
        if (roots.has(r.id)) continue;
        const old = !r.live && typeof r.createdAt === "number" && Number.isFinite(r.createdAt) && r.createdAt < horizon;
        if (r.live) {
          const evts = typeof deps.liveEvents === "function" ? deps.liveEvents(r.id) : null;
          if (Array.isArray(evts)) {
            deps.engine.noteCorpusSession(r.id, evts, true);
            liveN += 1;
            continue;
          }
        }
        if (old) oldColdQueue.push(r.id);
        else coldQueue.push(r.id);
      }
      let budget = coldBudget;
      const needsRead = (id) => deps.engine.corpusNeedsColdRead(id) === true;
      for (const id of failedAt.keys()) if (!keep.has(id)) failedAt.delete(id);
      const byLastFailure = (a, b) => (failedAt.get(a) ?? 0) - (failedAt.get(b) ?? 0);
      coldQueue.sort(byLastFailure);
      oldColdQueue.sort(byLastFailure);
      const oldPending = oldColdQueue.some(needsRead);
      const recentCap = oldPending && coldQueue.some(needsRead) ? Math.max(0, budget - 1) : budget;
      if (coldQueue.some(needsRead) || oldPending) deps.engine.noteCoverage?.("loading");
      const readQueue = async (queue, cap) => {
        for (const id of queue) {
          if (disposed || budget <= 0 || cap <= 0 || failN >= 3) break;
          if (!needsRead(id)) continue;
          budget -= 1;
          cap -= 1;
          try {
            const evts = await withTimeout(deps.readEvents(id), CORPUS_HOST_TIMEOUT_MS, "readSession " + id);
            if (disposed) return;
            if (!Array.isArray(evts)) throw new Error("readSession returned a malformed event list");
            deps.engine.noteCorpusSession(id, evts, false);
            coldN += 1;
            failedAt.delete(id);
          } catch (err) {
            failedAt.set(id, cycle);
            failN += 1;
            console.warn("[foxbell-pet] corpus readSession failed: " + id + " -> " + String(err && err.message || err));
          }
        }
      };
      if (oldPending && recentCap < budget && (coldQueue.some((id) => failedAt.has(id)) || budget === 1 && cycle % 2 === 0)) {
        await readQueue(oldColdQueue, 1);
      }
      await readQueue(coldQueue, budget === 1 && cycle % 2 !== 0 ? 1 : recentCap);
      await readQueue(oldColdQueue, budget);
      if (disposed) return;
      if (typeof deps.engine.noteCoverage === "function") {
        const pending = coldQueue.some(needsRead) || oldColdQueue.some(needsRead);
        deps.engine.noteCoverage(failN > 0 ? "limited" : pending ? "loading" : "ready");
      }
      deps.engine.pruneCorpus(keep);
      if (liveN + coldN + failN > 0) {
        console.log("[foxbell-pet] corpus round: +" + liveN + " live +" + coldN + " cold" + (failN ? " " + failN + " failed" : "") + " in " + (Date.now() - t0) + "ms (records=" + (Array.isArray(records) ? records.length : -1) + ")");
      }
      backoff = 0;
    } catch (err) {
      if (disposed) return;
      if (deps.engine && typeof deps.engine.noteCoverage === "function") deps.engine.noteCoverage("limited");
      console.warn("[foxbell-pet] corpus refresh failed: " + String(err && err.message || err));
      if (/timed out/.test(String(err && err.message || err))) backoff = Math.min(backoff + 2, CORPUS_BACKOFF_MAX_ROUNDS);
    } finally {
      busy = false;
    }
  }
  return { refresh, dispose() {
    disposed = true;
  } };
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
var STATUS_404 = /* @__PURE__ */ new Set(["pet-not-found", "staging-not-found", "pet-dir-missing", "audio-not-found", "sheet-not-found", "capability-unavailable"]);
var STATUS_403 = /* @__PURE__ */ new Set(["owner-required"]);
var STATUS_409 = /* @__PURE__ */ new Set(["revision-conflict"]);
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
  "manifest-request-failed",
  "pricing-store-corrupt",
  "pricing-store-read-failed",
  "pricing-store-write-failed"
]);
function statusOfCode(code) {
  if (STATUS_404.has(code)) return 404;
  if (STATUS_403.has(code)) return 403;
  if (STATUS_409.has(code)) return 409;
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
  const fail2 = (detail) => {
    throw new PetError("manifest-invalid", detail);
  };
  const sv = raw.schemaVersion;
  if (!ACCEPTED_SCHEMA_VERSIONS.includes(sv)) fail2(`schemaVersion \u975E\u6CD5: ${sv}`);
  const mid = raw.id;
  if (typeof mid !== "string" || mid.length === 0) fail2("id \u7F3A\u5931");
  if (id !== null && mid !== id) fail2(`id \u4E0E\u76EE\u5F55\u4E0D\u4E00\u81F4: ${mid} != ${id}`);
  if (mid !== BUILTIN_PET_ID) {
    const p = petIdProblem(mid);
    if (p) fail2(`id \u975E\u6CD5: ${p.detail}`);
  }
  if (typeof raw.displayName !== "string" || raw.displayName.length === 0) fail2("displayName \u7F3A\u5931");
  const description = raw.description === void 0 ? "" : raw.description;
  if (typeof description !== "string") fail2("description \u975E\u5B57\u7B26\u4E32");
  const source = raw.source === void 0 ? "" : raw.source;
  if (typeof source !== "string" || source !== "" && !["codex", "petdex", "folder", "zip", "builtin"].includes(source)) {
    fail2(`source \u975E\u6CD5: ${source}`);
  }
  const svn = raw.spriteVersionNumber;
  if (![0, 1, 2].includes(svn)) fail2(`spriteVersionNumber \u975E\u6CD5: ${svn}`);
  const ssb = raw.spritesheetSizeBytes === void 0 ? 0 : raw.spritesheetSizeBytes;
  if (!isU64(ssb)) fail2("spritesheetSizeBytes \u975E\u6CD5");
  if (typeof raw.hasVoice !== "boolean") fail2("hasVoice \u975E\u5E03\u5C14");
  if (typeof raw.hasSubtitle !== "boolean") fail2("hasSubtitle \u975E\u5E03\u5C14");
  const rawVoices = raw.voices === void 0 ? [] : raw.voices;
  if (!Array.isArray(rawVoices)) fail2("voices \u975E\u6570\u7EC4");
  const voices = [];
  const seen = /* @__PURE__ */ new Set();
  for (const v of rawVoices) {
    if (!v || typeof v !== "object") fail2("voice \u6761\u76EE\u975E\u5BF9\u8C61");
    if (!VOICE_GROUPS.includes(v.group)) fail2(`voice \u5206\u7EC4\u975E\u6CD5: ${v.group}`);
    if (typeof v.name !== "string") fail2("voice.name \u975E\u5B57\u7B26\u4E32");
    if (!isVoiceRel(v.file)) fail2(`voice.file \u975E\u6CD5: ${v.file}`);
    if (!isU64(v.sizeBytes)) fail2(`voice.sizeBytes \u975E\u6CD5: ${v.file}`);
    if (!isU64(v.durationMs)) fail2(`voice.durationMs \u975E\u6CD5: ${v.file}`);
    if (seen.has(v.file)) fail2(`voice.file \u91CD\u590D: ${v.file}`);
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
    const fail2 = (err) => {
      try {
        fs4.rmSync(dest, { recursive: true, force: true });
      } catch {
      }
      reject(err);
    };
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err) {
        fail2(new PetError("zip-open-failed", `\u6253\u5F00\u538B\u7F29\u5305\u5931\u8D25: ${err.message}`).with("err", err.message));
        return;
      }
      const run = () => {
        if (zipfile.entryCount > maxFiles) {
          try {
            zipfile.close();
          } catch {
          }
          fail2(new PetError("zip-too-many-entries", `\u538B\u7F29\u5305\u6587\u4EF6\u6570\u8D85\u9650\uFF08>${maxFiles}\uFF09`).with("limit", String(maxFiles)));
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
            fail2(new PetError("zip-entry-illegal-path", `\u538B\u7F29\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\u6761\u76EE: ${entry.fileName}`).with("name", entry.fileName));
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
            fail2(new PetError("zip-entry-illegal-path", `\u538B\u7F29\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\u6761\u76EE: ${entry.fileName}`).with("name", entry.fileName));
            return;
          }
          zipfile.openReadStream(entry, (e2, readStream) => {
            if (e2) {
              try {
                zipfile.close();
              } catch {
              }
              fail2(new PetError("zip-read-failed", `\u8BFB\u53D6\u538B\u7F29\u5305\u5931\u8D25: ${e2.message}`).with("err", e2.message));
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
                fail2(new PetError("zip-total-over-limit", `\u538B\u7F29\u5305\u89E3\u538B\u603B\u91CF\u8D85\u9650\uFF08>${fmtLimit(maxTotal)}\uFF09`).with("limit", fmtLimit(maxTotal)));
              }
            });
            readStream.on("error", (e3) => {
              if (over) return;
              try {
                zipfile.close();
              } catch {
              }
              out.destroy();
              fail2(new PetError("zip-read-failed", `\u8BFB\u53D6\u538B\u7F29\u5305\u5931\u8D25: ${e3.message}`).with("err", e3.message));
            });
            out.on("error", (e4) => {
              if (over) return;
              try {
                zipfile.close();
              } catch {
              }
              fail2(new PetError("internal", `\u5199\u5165\u89E3\u538B\u6587\u4EF6\u5931\u8D25: ${e4.message}`));
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
            fail2(new PetError("zip-entry-illegal-path", `\u538B\u7F29\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\u6761\u76EE: ${e5.message}`).with("name", e5.message));
            return;
          }
          fail2(new PetError("zip-read-failed", `\u8BFB\u53D6\u538B\u7F29\u5305\u5931\u8D25: ${e5.message}`).with("err", e5.message));
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
  let path11;
  try {
    path11 = new URL(rawUrl).pathname;
  } catch {
    path11 = String(rawUrl || "").split("?")[0].split("#")[0];
  }
  const segs = path11.split("/").filter((s) => s.length > 0);
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
        let since = null;
        try {
          const u = new URL(req.url || "/", "http://x");
          hint = u.searchParams.get("pet");
          since = u.searchParams.get("since");
        } catch {
        }
        const engine = env.stateEngine;
        const revEngine = engine && typeof engine.contentRev === "function" ? engine : null;
        const envRevFn = env && typeof env.envRev === "function" ? env.envRev : null;
        const combinedRev = () => {
          const r = revEngine.contentRev();
          return envRevFn === null ? r : r + "#" + String(envRevFn(hint));
        };
        if (revEngine !== null && since !== null) {
          revEngine.compute();
          const rev = combinedRev();
          if (typeof rev === "string" && since === rev) {
            json(res, { rev, unchanged: true, ages: revEngine.list().map((p) => p.age || ""), seq: revEngine.nextSeq() });
            return;
          }
        }
        const body = env.snapshotExtra(hint);
        if (revEngine !== null) {
          const rev = combinedRev();
          if (typeof rev === "string") body.rev = rev;
        }
        json(res, body);
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
    kind: "exact",
    path: `${ROUTE_PREFIX}/dashboard/range`,
    handler(req, res) {
      try {
        const u = new URL(req.url || "/", "http://x");
        const from = u.searchParams.get("from") || "";
        const to = u.searchParams.get("to") || "";
        const cal = (s) => {
          const d = /* @__PURE__ */ new Date(s + "T00:00:00");
          return !Number.isNaN(d.getTime()) && d.getFullYear() === Number(s.slice(0, 4)) && d.getMonth() + 1 === Number(s.slice(5, 7)) && d.getDate() === Number(s.slice(8, 10));
        };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !cal(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !cal(to) || from > to) {
          throw new PetError("bad-request", "from/to \u9700\u4E3A\u771F\u5B9E\u65E5\u5386\u65E5 YYYY-MM-DD \u4E14 from<=to").with("from", from).with("to", to);
        }
        const days = Math.round(((/* @__PURE__ */ new Date(to + "T00:00:00")).getTime() - (/* @__PURE__ */ new Date(from + "T00:00:00")).getTime()) / 864e5) + 1;
        if (days > 31) throw new PetError("bad-request", "\u8DE8\u5EA6\u6700\u957F 31 \u5929").with("days", String(days));
        json(res, env.stateEngine.rangeSummary(from, to));
      } catch (e) {
        errJson(res, e);
      }
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
  reg({
    kind: "prefix",
    path: `${ROUTE_PREFIX}/sounds`,
    handler(req, res) {
      try {
        if (req.method !== "GET" && req.method !== "HEAD") throw new PetError("origin-forbidden", "\u97F3\u6548\u8DEF\u7531\u4EC5\u652F\u6301 GET");
        const u = new URL(req.url || "/", "http://x");
        let segs;
        try {
          segs = decodeURIComponent(u.pathname).split("/").filter(Boolean);
        } catch {
          throw new PetError("bad-request", "\u975E\u6CD5\u97F3\u6548\u8DEF\u5F84");
        }
        const file = segs.length === 3 ? segs[2] : "";
        if (!/^[a-z0-9-]+\.wav$/.test(file)) throw new PetError("bad-request", "\u975E\u6CD5\u97F3\u6548\u6587\u4EF6\u540D").with("file", file);
        sendFile(res, path7.join(env.pkgDir, "assets", "sounds", file), "audio/wav", "public, max-age=86400");
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

// src/host/dsh-stream.js
function isTokenDelta(chunk) {
  switch (chunk?.type) {
    case "text-delta":
    case "reasoning-delta":
      return typeof chunk.text === "string" && chunk.text !== "";
    case "tool-call-delta":
      return typeof chunk.argumentsDelta === "string" && chunk.argumentsDelta !== "" || chunk.name !== void 0;
    default:
      return false;
  }
}
function runFirstTokenTime(run) {
  const tools = run.type === "tool-call-chunks";
  if (!tools && run.type !== "text-chunks" && run.type !== "reasoning-chunks") return void 0;
  if (tools && run.name !== void 0) return run.time0;
  const fragments = tools ? run.args : run.texts;
  if (!Array.isArray(fragments)) return void 0;
  let time = run.time0;
  for (let index = 0; index < fragments.length; index += 1) {
    if (index > 0) time += run.dt?.[index - 1];
    if (typeof fragments[index] === "string" && fragments[index] !== "") return time;
  }
  return void 0;
}
function firstTokenTime(stream) {
  if (!Array.isArray(stream)) return void 0;
  for (const record of stream) {
    if (!record || typeof record !== "object") continue;
    const time = record.type === "chunk" ? isTokenDelta(record.chunk) ? record.time : void 0 : runFirstTokenTime(record);
    if (time !== void 0) return Number.isFinite(time) ? time : void 0;
  }
  return void 0;
}
function lastUsage(stream) {
  if (!Array.isArray(stream)) return void 0;
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (record?.type === "chunk" && record.chunk?.type === "usage") return record.chunk.usage;
  }
  return void 0;
}
var helpers = Promise.resolve(Object.freeze({ firstTokenTime, lastUsage }));
function loadStreamHelpers() {
  return helpers;
}

// src/host/price-rules.js
import fs8 from "node:fs";
import path8 from "node:path";
var PRICE_BUCKETS = ["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"];
var MAX_PRICE_RULES = 200;
var MAX_PRICE_WINDOWS = 24;
var PRICE_RE = /^\d+(\.\d{1,9})?$/;
var WEEKDAYS = new Map(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => [day, index]));
var ZONES = { local: void 0, asiaShanghai: "Asia/Shanghai", utc: "UTC" };
var formatters = /* @__PURE__ */ new Map();
var tmpCounter2 = 0;
function invalid2(detail) {
  return new PetError("pricing-rules-invalid", detail);
}
function clone(value) {
  return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
}
function normalizePrice(raw) {
  if (raw === null || raw === void 0 || raw === "") return null;
  if (typeof raw !== "string" || !PRICE_RE.test(raw) || !Number.isFinite(Number(raw))) {
    throw invalid2(`\u4EF7\u683C\u987B\u4E3A\u975E\u8D1F\u5341\u8FDB\u5236\u5B57\u7B26\u4E32\uFF0C\u6700\u591A 9 \u4F4D\u5C0F\u6570: ${String(raw)}`);
  }
  const [whole, fraction = ""] = raw.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}
function normalizeCells(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid2("\u4EF7\u683C\u6876\u5FC5\u987B\u662F\u5BF9\u8C61");
  const cells2 = {};
  for (const bucket of PRICE_BUCKETS) cells2[bucket] = normalizePrice(raw[bucket]);
  return cells2;
}
function hasPrice(cells2) {
  return PRICE_BUCKETS.some((bucket) => cells2[bucket] !== null);
}
function normalizeWindows(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PRICE_WINDOWS) {
    throw invalid2(`\u5206\u65F6\u7A97\u53E3\u6570\u91CF\u987B\u4E3A 1\u2013${MAX_PRICE_WINDOWS}`);
  }
  const windows = raw.map((window) => {
    if (!window || typeof window !== "object" || Array.isArray(window)) throw invalid2("\u5206\u65F6\u7A97\u53E3\u5FC5\u987B\u662F\u5BF9\u8C61");
    const { start, end } = window;
    if (!Number.isInteger(start) || start < 0 || start > 23 || !Number.isInteger(end) || end < 0 || end > 24) {
      throw invalid2("\u5206\u65F6\u7A97\u53E3\u8FB9\u754C\u5FC5\u987B\u662F\u6574\u70B9\uFF1Astart 0\u201323\uFF0Cend 0\u201324");
    }
    if (start === end) throw invalid2("\u5206\u65F6\u7A97\u53E3\u4E0D\u80FD\u4E3A\u96F6\u957F\u5EA6");
    return { start, end };
  });
  const expanded = [];
  for (let day = 0; day < 5; day++) {
    for (const { start, end } of windows) {
      const from = day * 24 + start;
      const to = start < end ? day * 24 + end : day * 24 + 24 + end;
      expanded.push({ from, to });
    }
  }
  expanded.sort((a, b) => a.from - b.from || a.to - b.to);
  for (let i = 1; i < expanded.length; i++) {
    if (expanded[i].from < expanded[i - 1].to) throw invalid2("\u5206\u65F6\u7A97\u53E3\u4E0D\u5F97\u91CD\u53E0\uFF08\u542B\u8DE8\u5348\u591C\u6EA2\u51FA\uFF09");
  }
  return windows.sort((a, b) => a.start - b.start || a.end - b.end);
}
function validateRules(raw) {
  if (!Array.isArray(raw)) throw invalid2("\u8BA1\u4EF7\u89C4\u5219\u5FC5\u987B\u662F\u6570\u7EC4");
  if (raw.length > MAX_PRICE_RULES) throw invalid2(`\u8BA1\u4EF7\u89C4\u5219\u6700\u591A ${MAX_PRICE_RULES} \u6761`);
  const seen = /* @__PURE__ */ new Set();
  return raw.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw invalid2("\u8BA1\u4EF7\u89C4\u5219\u5FC5\u987B\u662F\u5BF9\u8C61");
    if (typeof item.model !== "string" || item.model.trim().length === 0) throw invalid2("\u89C4\u5219 model \u4E0D\u80FD\u4E3A\u7A7A");
    const model = item.model.trim();
    if (item.provider !== null && (typeof item.provider !== "string" || item.provider.trim().length === 0)) {
      throw invalid2("\u89C4\u5219 provider \u5FC5\u987B\u662F null \u6216\u975E\u7A7A\u5B57\u7B26\u4E32");
    }
    const provider = item.provider === null ? null : item.provider.trim();
    if (item.currency !== "USD" && item.currency !== "CNY") throw invalid2("\u89C4\u5219\u5E01\u79CD\u5FC5\u987B\u662F USD \u6216 CNY");
    const key = JSON.stringify([provider, model]);
    if (seen.has(key)) throw invalid2(`\u540C\u4E00\u4F9B\u5E94\u5546 / \u6A21\u578B\u7684\u89C4\u5219\u91CD\u590D: ${key}`);
    seen.add(key);
    const base = { model, provider, currency: item.currency };
    if (item.kind === "fixed") {
      const prices = normalizeCells(item.prices);
      if (!hasPrice(prices)) throw invalid2("\u56FA\u5B9A\u4EF7\u81F3\u5C11\u586B\u5199\u4E00\u4E2A\u6709\u6548\u4EF7\u683C\u6876");
      return { ...base, kind: "fixed", prices };
    }
    if (item.kind === "time") {
      if (!Object.hasOwn(ZONES, item.zone)) throw invalid2("\u5206\u65F6\u533A\u5FC5\u987B\u662F local\u3001asiaShanghai \u6216 utc");
      const windows = normalizeWindows(item.windows);
      const peak = normalizeCells(item.peak);
      const offpeak = normalizeCells(item.offpeak);
      if (!hasPrice(peak) && !hasPrice(offpeak)) throw invalid2("\u5206\u65F6\u4EF7\u81F3\u5C11\u586B\u5199\u4E00\u4E2A\u6709\u6548\u4EF7\u683C\u6876");
      return { ...base, kind: "time", zone: item.zone, windows, peak, offpeak };
    }
    throw invalid2("\u89C4\u5219 kind \u5FC5\u987B\u662F fixed \u6216 time");
  });
}
function resolveRule(rules, route, normalizedModel) {
  if (!Array.isArray(rules) || typeof normalizedModel !== "string") return null;
  const candidates = rules.filter((rule) => rule && rule.model === normalizedModel);
  const provider = route && typeof route.provider === "string" ? route.provider : null;
  if (provider !== null) {
    const scoped = candidates.filter((rule) => rule.provider === provider);
    if (scoped.length > 1) return null;
    if (scoped.length === 1) return scoped[0];
  }
  const global = candidates.filter((rule) => rule.provider === null);
  return global.length === 1 ? global[0] : null;
}
function formatterFor(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONES[zone],
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23"
    }));
  }
  return formatters.get(zone);
}
function wallHour(at, zone) {
  const parts = formatterFor(zone).formatToParts(new Date(at));
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const day = WEEKDAYS.get(weekday);
  if (day === void 0 || !Number.isInteger(hour)) throw invalid2("\u65E0\u6CD5\u89E3\u6790\u5206\u65F6\u533A\u5899\u949F\u65F6\u95F4");
  return { day, hour };
}
var isWorkday = (day) => day >= 0 && day <= 4;
function priceBand(rule, at) {
  if (rule?.kind === "fixed") return "fixed";
  if (rule?.kind !== "time") return "dailyFallback";
  if (at === null || !Number.isFinite(at)) return "dailyFallback";
  const { day, hour } = wallHour(at, rule.zone);
  for (const { start, end } of rule.windows) {
    const inWindow = start < end ? isWorkday(day) && start <= hour && hour < end : isWorkday(day) && hour >= start || isWorkday((day + 6) % 7) && hour < end;
    if (inWindow) return "peak";
  }
  return "offpeak";
}
function conflict(revision) {
  return new PetError("revision-conflict", `\u8BA1\u4EF7\u89C4\u5219\u4FEE\u8BA2\u51B2\u7A81\uFF0C\u5F53\u524D revision=${revision}`);
}
function readSnapshot(file) {
  let text;
  try {
    text = fs8.readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { revision: 0, rules: [], error: null };
    return { revision: 0, rules: [], error: { code: "pricing-store-read-failed", detail: error.message } };
  }
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid2("\u89C4\u5219\u5FEB\u7167\u5FC5\u987B\u662F\u5BF9\u8C61");
    if (!Number.isSafeInteger(raw.revision) || raw.revision < 0) throw invalid2("\u89C4\u5219 revision \u975E\u6CD5");
    return { revision: raw.revision, rules: validateRules(raw.rules), error: null };
  } catch (error) {
    return {
      revision: 0,
      rules: [],
      error: { code: "pricing-store-corrupt", detail: String(error?.message || error) }
    };
  }
}
function openRuleStore(file) {
  return {
    get() {
      const state = readSnapshot(file);
      const snapshot = { revision: state.revision, rules: clone(state.rules) };
      if (state.error) snapshot.error = { code: state.error.code, detail: "Unable to read pricing rules" };
      return snapshot;
    },
    save(expectedRevision, rules) {
      const normalized = validateRules(rules);
      const dir = path8.dirname(file);
      const writers = file + ".writers";
      const id = `${process.pid}-${Date.now()}${tmpCounter2++}`;
      const claim = path8.join(writers, id);
      const tmp = path8.join(dir, `.rules-${id}.tmp`);
      let claimed = false;
      try {
        fs8.mkdirSync(writers, { recursive: true, mode: 448 });
        fs8.writeFileSync(claim, "", { flag: "wx", mode: 384 });
        claimed = true;
        for (const other of fs8.readdirSync(writers)) {
          if (other === id) continue;
          const match = /^([1-9]\d*)-\d+$/.exec(other);
          if (!match) continue;
          try {
            process.kill(Number(match[1]), 0);
          } catch (error) {
            if (error?.code === "ESRCH") {
              try {
                fs8.rmSync(path8.join(writers, other), { force: true });
              } catch {
              }
              continue;
            }
          }
          throw new PetError("revision-conflict", "Another host is saving pricing rules");
        }
        const state = readSnapshot(file);
        if (state.error) throw new PetError(state.error.code, `Unable to read pricing rules (${state.error.code})`);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== state.revision) throw conflict(state.revision);
        const next = { revision: state.revision + 1, rules: normalized };
        fs8.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}
`, { encoding: "utf8", mode: 384 });
        fs8.renameSync(tmp, file);
        return clone(next);
      } catch (error) {
        if (error instanceof PetError) throw error;
        throw new PetError("pricing-store-write-failed", "Unable to save pricing rules");
      } finally {
        if (claimed) {
          try {
            fs8.rmSync(tmp, { force: true });
          } catch {
          }
          try {
            fs8.rmSync(claim, { force: true });
          } catch {
          }
        }
      }
    }
  };
}

// src/host/price-catalog.js
import fs9 from "node:fs";
import path9 from "node:path";
import { createHash } from "node:crypto";
var USD_CATALOG_URL = "https://models.dev/api.json";
var FX_URL = "https://open.er-api.com/v6/latest/USD";
var NATIVE_TREE_URL = "https://api.github.com/repos/anomalyco/models.dev/git/trees/dev?recursive=1";
var NATIVE_RAW_BASE = "https://raw.githubusercontent.com/anomalyco/models.dev/dev/";
var PRICE_MAX_AGE_MS = 864e5;
var SOURCE_RETRY_MS = 3e5;
var MAX_NATIVE_FILES = 32;
var MAX_TOML_CONCURRENCY = 4;
var SIZE_LIMITS = Object.freeze({
  usd: 16 * 1024 * 1024,
  tree: 12 * 1024 * 1024,
  toml: 128 * 1024,
  fx: 256 * 1024
});
var FIXED_URLS = /* @__PURE__ */ new Set([USD_CATALOG_URL, FX_URL, NATIVE_TREE_URL]);
var NATIVE_PROVIDERS = /* @__PURE__ */ new Set(["zhipuai", "moonshotai-cn", "minimax-cn"]);
var PUBLIC_RE = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
var tmpCounter3 = 0;
function clone2(value) {
  return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
}
function sourceError(error) {
  return String(error?.message || error || "unknown error").slice(0, 300);
}
function publicPrice(raw) {
  if (raw === null || raw === void 0 || raw === "") return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  if (typeof raw === "number" && !Number.isFinite(raw)) return null;
  const text = String(raw);
  if (text.length > 1024 || !Number.isFinite(Number(text))) return null;
  const match = PUBLIC_RE.exec(text);
  if (!match) return null;
  const whole = match[1];
  const fraction = match[2] || "";
  const exponent = Number(match[3] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1e3) return null;
  const digits = `${whole}${fraction}`;
  const point2 = whole.length + exponent;
  let normalized;
  if (point2 <= 0) normalized = `0.${"0".repeat(-point2)}${digits}`;
  else if (point2 >= digits.length) normalized = `${digits}${"0".repeat(point2 - digits.length)}`;
  else normalized = `${digits.slice(0, point2)}.${digits.slice(point2)}`;
  let [left, right = ""] = normalized.split(".");
  left = left.replace(/^0+(?=\d)/, "");
  right = right.replace(/0+$/, "");
  if (right.length > 9 || !Number.isFinite(Number(`${left}${right ? `.${right}` : ""}`))) return null;
  return right ? `${left}.${right}` : left;
}
function cells(input, cacheRead, cacheWrite, output) {
  return {
    inputTokens: input,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: output
  };
}
function hasPrice2(prices) {
  return Object.values(prices).some((value) => value !== null);
}
function normalizeEntries(raw) {
  if (!Array.isArray(raw)) throw new Error("price entries must be an array");
  const entries = raw.map((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.provider !== "string" || typeof entry.model !== "string") {
      throw new Error("invalid price entry");
    }
    const prices = cells(
      publicPrice(entry.prices?.inputTokens),
      publicPrice(entry.prices?.cacheReadTokens),
      publicPrice(entry.prices?.cacheWriteTokens),
      publicPrice(entry.prices?.outputTokens)
    );
    if (!hasPrice2(prices)) throw new Error("price entry has no valid prices");
    return { provider: entry.provider, model: entry.model, prices };
  });
  entries.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  const keys = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    const key = JSON.stringify([entry.provider, entry.model]);
    if (keys.has(key)) throw new Error("duplicate price entry");
    keys.add(key);
  }
  return entries;
}
function parseUsdCatalog(json2) {
  const root = typeof json2 === "string" ? JSON.parse(json2) : json2;
  if (!root || typeof root !== "object" || Array.isArray(root)) throw new Error("models.dev catalog must be an object");
  const entries = [];
  for (const [provider, providerValue] of Object.entries(root)) {
    if (!providerValue || typeof providerValue !== "object" || !providerValue.models) continue;
    const models = Array.isArray(providerValue.models) ? providerValue.models.map((model) => [model?.id, model]) : Object.entries(providerValue.models);
    for (const [model, value] of models) {
      if (typeof model !== "string" || !value || typeof value !== "object" || !value.cost) continue;
      const prices = cells(
        publicPrice(value.cost.input),
        publicPrice(value.cost.cache_read),
        publicPrice(value.cost.cache_write),
        publicPrice(value.cost.output)
      );
      if (hasPrice2(prices)) entries.push({ provider, model, prices });
    }
  }
  return normalizeEntries(entries);
}
function numberAfter(line, marker) {
  const at = line.indexOf(marker);
  if (at < 0) return null;
  const rest = line.slice(at + marker.length);
  const match = /^\s*(\d+(?:\.\d+)?)/.exec(rest);
  return match ? publicPrice(match[1]) : null;
}
function numberBefore(line, marker) {
  const at = line.indexOf(marker);
  if (at < 0) return null;
  const before = line.slice(0, at);
  const match = /(\d+(?:\.\d+)?)\s*$/.exec(before);
  return match ? publicPrice(match[1]) : null;
}
function parseNativeCny(text) {
  if (typeof text !== "string") return null;
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith("#")) continue;
    const line = trimmed.slice(1).trim().toLowerCase();
    const listMarker = "list price: cny";
    const listAt = line.indexOf(listMarker);
    if (listAt >= 0) {
      const token = line.slice(listAt + listMarker.length).trim().split(/\s+/, 1)[0];
      const parts = token.split("/");
      if (parts.length === 3) {
        const rates = parts.map(publicPrice);
        if (rates.every((rate) => rate !== null)) return cells(rates[0], rates[1], null, rates[2]);
      }
    }
    if (line.startsWith("cny per 1m tokens")) {
      const parsed = cells(
        numberBefore(line, " in"),
        numberBefore(line, " cache read"),
        numberBefore(line, " cache write"),
        numberBefore(line, " out")
      );
      if (hasPrice2(parsed)) return parsed;
    }
    if (line.includes("input \xA5") && line.includes("output \xA5")) {
      return cells(
        numberAfter(line, "input \xA5"),
        numberAfter(line, "cache hit \xA5"),
        numberAfter(line, "cache write \xA5"),
        numberAfter(line, "output \xA5")
      );
    }
  }
  return null;
}
function findEntry(entries, route) {
  if (!Array.isArray(entries) || !route || typeof route.provider !== "string" || typeof route.model !== "string") return null;
  return entries.find((entry) => entry.provider === route.provider && entry.model === route.model) || null;
}
function lookupPrice(catalog, route, currency = "USD") {
  if (!catalog || currency !== "USD" && currency !== "CNY") return null;
  const entry = findEntry(currency === "CNY" ? catalog.native : catalog.usd, route);
  if (!entry) return null;
  return {
    provider: entry.provider,
    model: entry.model,
    pricingProvider: entry.provider,
    pricingModel: entry.model,
    currency,
    prices: clone2(entry.prices),
    source: currency === "CNY" ? "native-cny" : "models.dev",
    sourceAt: currency === "CNY" ? catalog.nativeAt ?? null : catalog.usdAt ?? null,
    snapshotId: catalog.id ?? null
  };
}
function nativePath(raw) {
  if (typeof raw !== "string") return null;
  const parts = raw.split("/");
  if (parts.length !== 4 || parts[0] !== "providers" || !NATIVE_PROVIDERS.has(parts[1]) || parts[2] !== "models") return null;
  const file = parts[3];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.toml$/.test(file) || file.includes("..")) return null;
  const model = file.slice(0, -5);
  if (!model) return null;
  return { path: raw, provider: parts[1], model };
}
function assertPublicUrl(raw) {
  if (FIXED_URLS.has(raw)) return;
  if (typeof raw === "string" && raw.startsWith(NATIVE_RAW_BASE) && nativePath(raw.slice(NATIVE_RAW_BASE.length))) return;
  throw new Error("public pricing URL rejected");
}
function freshAt(at, now) {
  return Number.isFinite(at) && now - at <= PRICE_MAX_AGE_MS;
}
function minimumUsableSourcesFresh(now, snapshot, maxAge = PRICE_MAX_AGE_MS) {
  return ["usdAt", "nativeAt", "fxAt"].every((key) => Number.isFinite(snapshot?.[key]) && now - snapshot[key] <= maxAge);
}
function emptySnapshot() {
  const sources = {};
  for (const key of ["usd", "native", "fx"]) sources[key] = { attemptedAt: null, error: null };
  return {
    schemaVersion: 1,
    id: null,
    usd: [],
    native: [],
    usdAt: null,
    nativeAt: null,
    fxAt: null,
    fx: null,
    syncedAt: null,
    sources,
    cacheError: null
  };
}
function validTime(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function loadSnapshot(file) {
  const empty = emptySnapshot();
  let raw;
  try {
    raw = JSON.parse(fs9.readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object") throw new Error("catalog snapshot must be an object");
    empty.usd = normalizeEntries(raw.usd);
    empty.native = normalizeEntries(raw.native);
    for (const key of ["usdAt", "nativeAt", "fxAt", "syncedAt"]) empty[key] = validTime(raw[key]);
    if (raw.fx !== null && raw.fx !== void 0) {
      const rate = publicPrice(raw.fx?.cnyPerUsd);
      if (rate === null || Number(rate) <= 0) throw new Error("invalid cached CNY FX");
      empty.fx = { cnyPerUsd: Number(rate) };
    }
    for (const key of ["usd", "native", "fx"]) {
      empty.sources[key] = {
        attemptedAt: validTime(raw.sources?.[key]?.attemptedAt),
        error: typeof raw.sources?.[key]?.error === "string" ? raw.sources[key].error : null
      };
    }
    empty.id = snapshotId(empty);
    return empty;
  } catch (error) {
    if (error?.code !== "ENOENT") empty.cacheError = `catalog cache ignored: ${sourceError(error)}`;
    return empty;
  }
}
function snapshotId(snapshot) {
  if (!snapshot.usd.length && !snapshot.native.length && !snapshot.fx) return null;
  const canonical = JSON.stringify({
    usd: snapshot.usd,
    native: snapshot.native,
    fx: snapshot.fx ? publicPrice(snapshot.fx.cnyPerUsd) : null
  });
  return createHash("sha256").update(canonical).digest("hex");
}
function persistSnapshot(file, snapshot) {
  const dir = path9.dirname(file);
  const tmp = path9.join(dir, `.catalog-${process.pid}-${tmpCounter3++}.tmp`);
  try {
    fs9.mkdirSync(dir, { recursive: true });
    fs9.writeFileSync(tmp, `${JSON.stringify(snapshot, null, 2)}
`, { encoding: "utf8", mode: 384 });
    fs9.renameSync(tmp, file);
  } catch (error) {
    try {
      fs9.rmSync(tmp, { force: true });
    } catch {
    }
    throw error;
  }
}
async function readCapped2(response, cap) {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > cap) throw new Error(`response exceeds ${cap} bytes`);
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > cap) throw new Error(`response exceeds ${cap} bytes`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    const bytes = Buffer.from(value);
    total += bytes.length;
    if (total > cap) {
      try {
        await reader.cancel();
      } catch {
      }
      throw new Error(`response exceeds ${cap} bytes`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
async function mapLimit(items, limit, fn) {
  const result = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (; ; ) {
      const index = cursor++;
      if (index >= items.length) return;
      result[index] = await fn(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  const settled = await Promise.allSettled(workers);
  const failed = settled.find((item) => item.status === "rejected");
  if (failed) throw failed.reason;
  return result;
}
function openPriceCatalog({ dir, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
  const file = path9.join(dir, "catalog.json");
  let snapshot = loadSnapshot(file);
  let inFlight = null;
  let disposed = false;
  let roundController = null;
  let roundTimer = null;
  const controllers = /* @__PURE__ */ new Set();
  function get() {
    const value = clone2(snapshot);
    value.errors = Object.fromEntries(["usd", "native", "fx"].map((key) => [key, value.sources[key].error]));
    value.stale = !minimumUsableSourcesFresh(now(), value);
    return value;
  }
  async function request(url, { cap, timeoutMs, accept }) {
    assertPublicUrl(url);
    if (disposed) throw new Error("pricing catalog disposed");
    const controller = new AbortController();
    controllers.add(controller);
    const abort = () => controller.abort();
    roundController?.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { accept },
        signal: controller.signal
      });
      if (!response || response.status >= 300 && response.status < 400 || !response.ok) {
        throw new Error(`public pricing HTTP ${response?.status ?? "invalid response"}`);
      }
      if (response.url && new URL(response.url).href !== new URL(url).href) throw new Error("public pricing redirect rejected");
      return await readCapped2(response, cap);
    } finally {
      clearTimeout(timer);
      roundController?.signal.removeEventListener("abort", abort);
      controllers.delete(controller);
    }
  }
  async function loadUsd() {
    const bytes = await request(USD_CATALOG_URL, {
      cap: SIZE_LIMITS.usd,
      timeoutMs: 35e3,
      accept: "application/json"
    });
    const entries = parseUsdCatalog(bytes.toString("utf8"));
    if (!entries.length) throw new Error("models.dev catalog has no validated prices");
    return entries;
  }
  async function loadFx() {
    const bytes = await request(FX_URL, { cap: SIZE_LIMITS.fx, timeoutMs: 15e3, accept: "application/json" });
    const json2 = JSON.parse(bytes.toString("utf8"));
    const rate = publicPrice(json2?.rates?.CNY);
    if (rate === null || Number(rate) <= 0) throw new Error("FX response has no positive CNY rate");
    return { cnyPerUsd: Number(rate) };
  }
  async function loadNative() {
    const treeBytes = await request(NATIVE_TREE_URL, {
      cap: SIZE_LIMITS.tree,
      timeoutMs: 35e3,
      accept: "application/vnd.github+json"
    });
    const tree = JSON.parse(treeBytes.toString("utf8"));
    if (!Array.isArray(tree?.tree) || tree.truncated === true) throw new Error("native price tree is invalid or truncated");
    const candidates = tree.tree.filter((item) => !item.type || item.type === "blob").map((item) => nativePath(item.path)).filter(Boolean).sort((a, b) => a.path.localeCompare(b.path)).slice(0, MAX_NATIVE_FILES);
    const parsed = await mapLimit(candidates, MAX_TOML_CONCURRENCY, async (candidate) => {
      const bytes = await request(`${NATIVE_RAW_BASE}${candidate.path}`, {
        cap: SIZE_LIMITS.toml,
        timeoutMs: 8e3,
        accept: "text/plain"
      });
      const prices = parseNativeCny(bytes.toString("utf8"));
      return prices ? { provider: candidate.provider, model: candidate.model, prices } : null;
    });
    return normalizeEntries(parsed.filter(Boolean));
  }
  async function perform(force, due) {
    const started = now();
    const next = clone2(snapshot);
    next.cacheError = null;
    for (const key of due) next.sources[key] = { attemptedAt: started, error: null };
    roundController = new AbortController();
    roundTimer = setTimeout(() => roundController?.abort(), 6e4);
    const loaders = { usd: loadUsd, native: loadNative, fx: loadFx };
    await Promise.all(due.map(async (key) => {
      try {
        const value = await loaders[key]();
        if (key === "fx") {
          next.fx = value;
          next.fxAt = now();
        } else {
          next[key] = value;
          next[`${key}At`] = now();
        }
        next.sources[key].error = null;
      } catch (error) {
        next.sources[key].error = sourceError(error);
      }
    }));
    clearTimeout(roundTimer);
    roundTimer = null;
    roundController = null;
    const syncedTimes = [next.usdAt, next.nativeAt, next.fxAt].filter(Number.isFinite);
    next.syncedAt = syncedTimes.length ? Math.max(...syncedTimes) : null;
    next.id = snapshotId(next);
    if (!disposed) {
      try {
        persistSnapshot(file, next);
      } catch (error) {
        next.cacheError = `catalog cache write failed: ${sourceError(error)}`;
      }
      snapshot = next;
    }
    return get();
  }
  function refresh({ force = false } = {}) {
    if (disposed) return Promise.resolve(get());
    if (inFlight) return inFlight;
    const at = now();
    const due = ["usd", "native", "fx"].filter((key) => {
      if (force) return true;
      const successAt = snapshot[`${key}At`];
      if (freshAt(successAt, at)) return false;
      const attempt = snapshot.sources[key];
      return !(attempt?.error && Number.isFinite(attempt.attemptedAt) && at - attempt.attemptedAt < SOURCE_RETRY_MS);
    });
    if (!due.length) return Promise.resolve(get());
    inFlight = perform(force, due).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (roundTimer) clearTimeout(roundTimer);
    roundController?.abort();
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }
  return { get, refresh, dispose };
}

// src/host/host-auth.js
function hostOwnerVerifier(connection) {
  if (connection && typeof connection.admit === "function") {
    return async (req) => {
      try {
        const admission = await connection.admit(req);
        return !!admission && typeof admission === "object" && "peer" in admission && admission.peer && admission.peer.principal && admission.peer.principal.kind === "owner";
      } catch {
        return false;
      }
    };
  }
  return null;
}

// src/host/cost.js
var NANO = 1000000000n;
var MILLION = 1000000n;
var DECIMAL_RE = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
function clone3(value) {
  return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
}
function maxTime(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.max(...valid) : null;
}
function routeKey3(route) {
  return JSON.stringify([route.provider, route.model]);
}
function normalizeRoute(route) {
  return {
    provider: typeof route?.provider === "string" && route.provider.length ? route.provider : null,
    model: typeof route?.model === "string" && route.model.length ? route.model : null
  };
}
function compareText(a, b) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
function tokenValue(raw) {
  if (raw === null || raw === void 0) return null;
  if (!Number.isSafeInteger(raw) || raw < 0) throw new TypeError(`invalid token count: ${String(raw)}`);
  return BigInt(raw);
}
function safeNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError("aggregated token count exceeds safe integer range");
  return number;
}
function decimalNano(raw) {
  if (raw === null || raw === void 0 || raw === "") return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  if (typeof raw === "number" && !Number.isFinite(raw)) return null;
  const text = String(raw);
  if (text.length > 1024 || !Number.isFinite(Number(text))) return null;
  const match = DECIMAL_RE.exec(text);
  if (!match) return null;
  const whole = match[1];
  const fraction = match[2] || "";
  const exponent = Number(match[3] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1e3) return null;
  const digits = `${whole}${fraction}`;
  const point2 = whole.length + exponent;
  let left;
  let right;
  if (point2 <= 0) {
    left = "0";
    right = `${"0".repeat(-point2)}${digits}`;
  } else if (point2 >= digits.length) {
    left = `${digits}${"0".repeat(point2 - digits.length)}`;
    right = "";
  } else {
    left = digits.slice(0, point2);
    right = digits.slice(point2);
  }
  left = left.replace(/^0+(?=\d)/, "") || "0";
  right = right.padEnd(9, "0");
  if (right.length > 9 && /[1-9]/.test(right.slice(9))) return null;
  right = right.slice(0, 9);
  return BigInt(left) * NANO + BigInt(right || "0");
}
function decimalText(raw) {
  const nano = decimalNano(raw);
  if (nano === null) return null;
  return formatScaled(nano);
}
function formatScaled(scaled) {
  const whole = scaled / NANO;
  const fraction = (scaled % NANO).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
function roundedRatio(numerator, denominator) {
  if (denominator <= 0n) throw new RangeError("fixed-point denominator must be positive");
  return (numerator * NANO + denominator / 2n) / denominator;
}
function emptyBucket2() {
  return { tokens: 0n, missing: false };
}
function addToken(bucket, value) {
  if (value === null) bucket.missing = true;
  else bucket.tokens += value;
}
function catalogSnapshot(catalog) {
  if (catalog && typeof catalog.get === "function") return catalog.get();
  return catalog && typeof catalog === "object" ? catalog : null;
}
function fxRate(snapshot) {
  const nano = decimalNano(snapshot?.fx?.cnyPerUsd);
  return nano !== null && nano > 0n ? nano : null;
}
function selectedManualCells(rule, slice, state) {
  if (!rule) return null;
  if (rule.kind === "fixed") return rule.prices;
  if (rule.kind !== "time") return null;
  const band = priceBand(rule, slice.at);
  if (band === "dailyFallback") state.dailyFallback = true;
  if (band === "peak") return rule.peak;
  return rule.offpeak;
}
function catalogChoice(snapshot, route, bucket, currency, fxNano) {
  const native = lookupPrice(snapshot, route, currency);
  const nativePrice = native?.prices?.[bucket];
  if (nativePrice !== null && nativePrice !== void 0) {
    return { price: nativePrice, source: "catalog", sourceAt: native.sourceAt, converted: false, entry: native };
  }
  if (!fxNano) return null;
  const otherCurrency = currency === "USD" ? "CNY" : "USD";
  const other = lookupPrice(snapshot, route, otherCurrency);
  const otherPrice = other?.prices?.[bucket];
  if (otherPrice === null || otherPrice === void 0) return null;
  return {
    price: otherPrice,
    source: "catalog",
    sourceAt: maxTime([other.sourceAt, snapshot.fxAt]),
    converted: true,
    entry: other
  };
}
function resolvePrice({ snapshot, route, bucket, currency, rule, cells: cells2, fxNano }) {
  const manualPrice = cells2?.[bucket];
  if (manualPrice !== null && manualPrice !== void 0) {
    if (rule.currency === currency) {
      return { price: manualPrice, source: "manual", sourceAt: null, converted: false, entry: null };
    }
    if (!fxNano) return null;
    return {
      price: manualPrice,
      source: "manual",
      sourceAt: snapshot?.fxAt ?? null,
      converted: true,
      entry: null
    };
  }
  return catalogChoice(snapshot, route, bucket, currency, fxNano);
}
function readingDetails(row, currency, context) {
  const { snapshot, rule, fxNano } = context;
  const rateForCommonDenominator = currency === "USD" && fxNano ? fxNano : NANO;
  const denominator = MILLION * NANO * rateForCommonDenominator;
  const details = [];
  const sources = /* @__PURE__ */ new Set();
  let totalNumerator = 0n;
  let pricedTokens = 0n;
  let unpricedTokens = 0n;
  let unknownTokens = false;
  let hasPriced = false;
  let priceUpdatedAt = null;
  let pricingProvider = null;
  let pricingModel = null;
  for (const bucket of PRICE_BUCKETS) {
    let numerator = 0n;
    let bucketPricedTokens = 0n;
    let bucketUnpricedTokens = 0n;
    let bucketHasPriced = false;
    let converted = false;
    let sourceAt = null;
    const bucketSources = /* @__PURE__ */ new Set();
    for (const item of row.slices) {
      const state = { dailyFallback: false };
      const cells2 = selectedManualCells(rule, item, state);
      if (state.dailyFallback) context.dailyFallback = true;
      const tokens = tokenValue(item.tokens?.[bucket]);
      if (tokens === null) {
        unknownTokens = true;
        continue;
      }
      const selected = resolvePrice({
        snapshot,
        route: row.route,
        bucket,
        currency,
        rule,
        cells: cells2,
        fxNano
      });
      if (!selected) {
        bucketUnpricedTokens += tokens;
        continue;
      }
      const unitPriceNano = decimalNano(selected.price);
      if (unitPriceNano === null) {
        bucketUnpricedTokens += tokens;
        continue;
      }
      let factor;
      if (!selected.converted) factor = currency === "USD" ? rateForCommonDenominator : NANO;
      else factor = currency === "USD" ? NANO : fxNano;
      numerator += tokens * unitPriceNano * factor;
      bucketPricedTokens += tokens;
      bucketHasPriced = true;
      hasPriced = true;
      converted ||= selected.converted;
      bucketSources.add(selected.source);
      sources.add(selected.source);
      if (Number.isFinite(selected.sourceAt)) sourceAt = Math.max(sourceAt ?? 0, selected.sourceAt);
      if (selected.entry) {
        pricingProvider = selected.entry.pricingProvider;
        pricingModel = selected.entry.pricingModel;
      }
    }
    const aggregate = row.buckets[bucket];
    const knownTokens = aggregate.tokens;
    if (aggregate.missing) unknownTokens = true;
    totalNumerator += numerator;
    pricedTokens += bucketPricedTokens;
    unpricedTokens += bucketUnpricedTokens;
    if (sourceAt !== null) priceUpdatedAt = Math.max(priceUpdatedAt ?? 0, sourceAt);
    const source = bucketSources.size === 0 ? null : bucketSources.size === 1 ? [...bucketSources][0] : "mixed";
    details.push({
      bucket,
      tokens: aggregate.missing ? null : safeNumber(knownTokens),
      unitPrice: bucketHasPriced && bucketPricedTokens > 0n ? formatScaled(roundedRatio(numerator * MILLION, denominator * bucketPricedTokens)) : null,
      amount: bucketHasPriced ? formatScaled(roundedRatio(numerator, denominator)) : null,
      source,
      sourceAt,
      converted
    });
  }
  const comparable = pricedTokens + unpricedTokens;
  if (!unknownTokens) safeNumber(comparable);
  const reading = {
    amount: hasPriced ? formatScaled(roundedRatio(totalNumerator, denominator)) : null,
    status: hasPriced ? unknownTokens || unpricedTokens > 0n ? "partial" : "priced" : "unpriced",
    pricedTokens: safeNumber(pricedTokens),
    unpricedTokens: unknownTokens ? null : safeNumber(unpricedTokens),
    coverageRate: unknownTokens || comparable === 0n ? null : Number(pricedTokens) / Number(comparable)
  };
  return {
    reading,
    details,
    sources,
    priceUpdatedAt,
    pricingProvider,
    pricingModel
  };
}
function pricingError(snapshot) {
  const errors = [];
  for (const key of ["usd", "native", "fx"]) {
    const error = snapshot?.sources?.[key]?.error ?? snapshot?.errors?.[key];
    if (error) errors.push(`${key}: ${error}`);
  }
  if (snapshot?.cacheError) errors.push(snapshot.cacheError);
  return errors.length ? errors.join("; ") : null;
}
function selectSlices(slices, span) {
  const timed = [];
  const daily = [];
  for (const raw of Array.isArray(slices) ? slices : []) {
    const route = normalizeRoute(raw?.route);
    if (raw?.at === null) {
      const day = raw.daySpan;
      if (day && Number.isFinite(day.from) && Number.isFinite(day.to) && day.from < day.to && span.from <= day.from && day.to <= span.to) {
        daily.push({ at: null, daySpan: { from: day.from, to: day.to }, route, tokens: raw.tokens });
      }
    } else if (Number.isFinite(raw?.at) && span.from <= raw.at && raw.at < span.to) {
      timed.push({ at: raw.at, route, tokens: raw.tokens });
    }
  }
  const accepted = [...timed];
  for (const day of daily) {
    const hasDetail = timed.some((item) => routeKey3(item.route) === routeKey3(day.route) && day.daySpan.from <= item.at && item.at < day.daySpan.to);
    if (!hasDetail) accepted.push(day);
  }
  return accepted;
}
function estimateCosts({ slices, span, catalog, rules, revision, coverage, rulesRevision: explicitRulesRevision }) {
  if (!span || !Number.isFinite(span.from) || !Number.isFinite(span.to) || span.from >= span.to) {
    throw new TypeError("invalid cost span");
  }
  const snapshot = catalogSnapshot(catalog);
  const ruleSnapshot = Array.isArray(rules) ? { rules, revision: 0 } : rules || { rules: [], revision: 0 };
  const ruleList = Array.isArray(ruleSnapshot.rules) ? ruleSnapshot.rules : [];
  const usageRevision = typeof revision === "object" ? revision.usage ?? 0 : revision ?? 0;
  const rulesRevision = explicitRulesRevision ?? (typeof revision === "object" && revision.rules !== void 0 ? revision.rules : ruleSnapshot.revision ?? 0);
  const selected = selectSlices(slices, span);
  const grouped = /* @__PURE__ */ new Map();
  for (const item of selected) {
    const key = routeKey3(item.route);
    if (!grouped.has(key)) {
      const buckets = {};
      for (const bucket of PRICE_BUCKETS) buckets[bucket] = emptyBucket2();
      grouped.set(key, { route: item.route, slices: [], buckets });
    }
    const row = grouped.get(key);
    row.slices.push(item);
    for (const bucket of PRICE_BUCKETS) addToken(row.buckets[bucket], tokenValue(item.tokens?.[bucket]));
  }
  const fxNano = fxRate(snapshot);
  const rows = [];
  for (const row of grouped.values()) {
    const normalizedModel = typeof row.route.model === "string" ? row.route.model.trim() || null : null;
    const rule = normalizedModel === null ? null : resolveRule(ruleList, row.route, normalizedModel);
    const usdContext = { snapshot, rule, fxNano, dailyFallback: false };
    const cnyContext = { ...usdContext };
    const usd = readingDetails(row, "USD", usdContext);
    const cny = readingDetails(row, "CNY", cnyContext);
    const metadata = (reading, context) => ({
      pricingProvider: reading.pricingProvider,
      pricingModel: reading.pricingModel,
      priceUpdatedAt: reading.priceUpdatedAt,
      pricingBasis: reading.sources.size === 0 ? "none" : reading.sources.size === 1 ? [...reading.sources][0] : "mixed",
      priceRuleKind: rule?.kind || "none",
      timePriceDailyFallback: context.dailyFallback
    });
    const pricing = { USD: metadata(usd, usdContext), CNY: metadata(cny, cnyContext) };
    const tokenMissing = PRICE_BUCKETS.some((bucket) => row.buckets[bucket].missing);
    const tokenUsage = tokenMissing ? null : safeNumber(PRICE_BUCKETS.reduce((sum, bucket) => sum + row.buckets[bucket].tokens, 0n));
    const hitKnown = !row.buckets.inputTokens.missing && !row.buckets.cacheReadTokens.missing;
    const requestTotal = row.buckets.inputTokens.tokens + row.buckets.cacheReadTokens.tokens;
    const hitPct = hitKnown ? requestTotal === 0n ? 0 : Number(row.buckets.cacheReadTokens.tokens) / Number(requestTotal) : null;
    rows.push({
      route: clone3(row.route),
      normalizedModel,
      tokenUsage,
      hitPct,
      usd: usd.reading,
      cny: cny.reading,
      details: { USD: usd.details, CNY: cny.details },
      // Top-level fields describe the USD export for existing consumers.
      ...pricing.USD,
      pricing
    });
  }
  rows.sort((a, b) => compareText(a.route.provider, b.route.provider) || compareText(a.route.model, b.route.model));
  return {
    span: { from: span.from, to: span.to, grain: span.grain },
    revision: usageRevision,
    rulesRevision,
    pricingSnapshotId: snapshot?.id ?? null,
    coverage,
    priceState: {
      stale: snapshot?.stale === true,
      syncedAt: snapshot?.syncedAt ?? maxTime([snapshot?.usdAt, snapshot?.nativeAt, snapshot?.fxAt]),
      error: pricingError(snapshot)
    },
    rows
  };
}
var fixedPoint = Object.freeze({ decimalNano, decimalText, formatScaled });

// src/host/cost-csv.js
var COST_CSV_COLUMNS = Object.freeze([
  "source_id",
  "observed_provider",
  "model_id",
  "normalized_model_id",
  "token_usage",
  "estimated_usd",
  "status",
  "priced_tokens",
  "unpriced_tokens",
  "coverage_rate",
  "pricing_provider",
  "pricing_model",
  "pricing_snapshot_id",
  "price_updated_at",
  "pricing_basis",
  "price_rule_kind",
  "time_price_daily_fallback",
  "range_from",
  "range_to"
]);
function csvTextCell(raw) {
  const value = String(raw ?? "");
  const safe = /^(?:[\t\r\n]|\s*[=+\-@])/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
function valueCell(raw) {
  return raw === null || raw === void 0 ? "" : String(raw);
}
function isoCell(raw) {
  if (!Number.isFinite(raw) || !Number.isFinite(new Date(raw).getTime())) return "";
  return new Date(raw).toISOString();
}
function serializeCostCsv(snapshot) {
  const lines = [COST_CSV_COLUMNS.join(",")];
  for (const row of snapshot?.rows || []) {
    const usd = row.usd || {};
    const values = [
      valueCell("dsh"),
      csvTextCell(row.route?.provider),
      csvTextCell(row.route?.model),
      csvTextCell(row.normalizedModel),
      valueCell(row.tokenUsage),
      valueCell(usd.amount),
      valueCell(usd.status),
      valueCell(usd.pricedTokens),
      valueCell(usd.unpricedTokens),
      valueCell(usd.coverageRate),
      csvTextCell(row.pricingProvider),
      csvTextCell(row.pricingModel),
      valueCell(snapshot?.pricingSnapshotId),
      isoCell(row.priceUpdatedAt),
      valueCell(row.pricingBasis),
      valueCell(row.priceRuleKind),
      valueCell(row.timePriceDailyFallback === true),
      isoCell(snapshot?.span?.from),
      isoCell(snapshot?.span?.to)
    ];
    lines.push(values.join(","));
  }
  return `${lines.join("\r\n")}\r
`;
}

// src/host/dashboard-routes.js
var MAX_RULES_BODY = 64 * 1024;
var ROUTE_PREFIX2 = "/dyn-pet-foxbell";
function send(res, body, status = 200) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(text)),
    "cache-control": "no-store"
  });
  res.end(text);
}
function fail(res, error) {
  const e = error instanceof PetError ? error : error instanceof RangeError ? new PetError("bad-request", error.message) : new PetError("internal", "Dashboard request failed");
  send(res, { code: e.code, params: e.params || {}, detail: e.detail }, e.status);
}
function sameOrigin(req) {
  const headers = req.headers || {};
  const origin = headers.origin;
  if (typeof origin !== "string" || origin === "") return true;
  const host = headers.host;
  if (typeof host !== "string" || host === "") return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.host === host;
}
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_RULES_BODY) throw new PetError("bad-request", "JSON body exceeds 64 KiB").with("limit", String(MAX_RULES_BODY));
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PetError("bad-request", "Request body is not valid JSON");
  }
}
function queryOf(req) {
  const u = new URL(req.url || "/", "http://invalid.local");
  const preset = u.searchParams.get("preset") || "7d";
  const query = { preset };
  if (u.searchParams.has("from")) query.from = u.searchParams.get("from") || "";
  if (u.searchParams.has("to")) query.to = u.searchParams.get("to") || "";
  return { u, query };
}
function requireStore(env) {
  if (!env.pricing || !env.pricing.rules || !env.pricing.catalog) {
    throw new PetError("capability-unavailable", "Pricing stores are unavailable on this host");
  }
  return env.pricing;
}
function registerDashboardRoutes(ctx, env) {
  if (!env || typeof env.verifyOwner !== "function") return false;
  const webServer = env.webServer ?? ctx.get("webServer");
  if (!webServer || typeof webServer.register !== "function") return false;
  const reg = (route2) => ctx.effect(() => webServer.register(route2));
  const route = (suffix, methods, handler) => reg({
    kind: "exact",
    path: `${ROUTE_PREFIX2}/dashboard/${suffix}`,
    async handler(req, res) {
      try {
        if (!methods.includes(req.method || "GET")) throw new PetError("bad-request", "HTTP method is not allowed");
        const verified = await env.verifyOwner(req);
        if (verified !== true) throw new PetError("owner-required", "Host-verified owner access is required");
        if (req.method === "POST" && !sameOrigin(req)) throw new PetError("origin-forbidden", "Cross-origin request rejected");
        send(res, await handler(req));
      } catch (error) {
        fail(res, error);
      }
    }
  });
  route("usage", ["GET"], async (req) => {
    if (!env.stateEngine || typeof env.stateEngine.usageWindow !== "function") {
      throw new PetError("capability-unavailable", "Shared usage facts are unavailable");
    }
    return env.stateEngine.usageWindow(queryOf(req).query);
  });
  route("cost", ["GET"], async (req) => {
    const { rules, catalog } = requireStore(env);
    const { u, query } = queryOf(req);
    const spanFrom = Number(u.searchParams.get("spanFrom"));
    const spanTo = Number(u.searchParams.get("spanTo"));
    if (!u.searchParams.has("spanFrom") || !u.searchParams.has("spanTo") || !Number.isSafeInteger(spanFrom) || !Number.isSafeInteger(spanTo)) {
      throw new PetError("bad-request", "spanFrom/spanTo must be Unix milliseconds");
    }
    const usage = env.stateEngine.usageWindow(query);
    if (usage.span.from !== spanFrom || usage.span.to !== spanTo || u.searchParams.has("usageRevision") && String(usage.revision) !== u.searchParams.get("usageRevision")) {
      throw new PetError("revision-conflict", "Usage window moved; query usage again before cost");
    }
    const ruleSnapshot = rules.get();
    const snapshot = estimateCosts({
      slices: env.stateEngine.usageFacts().facts,
      span: usage.span,
      catalog: catalog.get(),
      rules: ruleSnapshot.rules,
      rulesRevision: ruleSnapshot.revision,
      revision: usage.revision,
      coverage: usage.coverage
    });
    return { ...snapshot, csv: serializeCostCsv(snapshot) };
  });
  const requireActiveMount = () => {
    if (env.isActive?.() === false) throw new PetError("capability-unavailable", "Dashboard service has been unmounted");
  };
  route("price-rules", ["GET", "POST"], async (req) => {
    const { rules } = requireStore(env);
    if (req.method === "GET") return rules.get();
    const body = await readJson(req);
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
      throw new PetError("bad-request", "expectedRevision must be a non-negative integer");
    }
    const checked = validateRules(body.rules);
    requireActiveMount();
    return rules.save(body.expectedRevision, checked);
  });
  route("pricing-sync", ["POST"], async (req) => {
    const { catalog } = requireStore(env);
    const body = await readJson(req);
    if (typeof body.force !== "boolean") throw new PetError("bad-request", "force must be boolean");
    requireActiveMount();
    const snapshot = await catalog.refresh({ force: body.force });
    return {
      pricingSnapshotId: snapshot.id || null,
      usdAt: snapshot.usdAt || null,
      nativeAt: snapshot.nativeAt || null,
      fxAt: snapshot.fxAt || null,
      errors: Object.fromEntries(Object.entries(snapshot.sources || {}).map(([source, state]) => [source, state?.error || null]))
    };
  });
  route("session-speed", ["GET"], async (req) => {
    const { u } = queryOf(req);
    const sessionId = u.searchParams.get("sessionId") || "";
    if (!sessionId || sessionId.length > 256) throw new PetError("bad-request", "A bounded sessionId is required");
    return readSessionSpeed({ sessions: env.sessions, projections: env.sessionProjections }, sessionId);
  });
  route("speed", ["GET"], async (req) => {
    if (!env.stateEngine || typeof env.stateEngine.speedWindow !== "function") {
      throw new PetError("capability-unavailable", "Native speed facts are unavailable");
    }
    const { u } = queryOf(req);
    const range = u.searchParams.get("range") || "5h";
    const selectedKey = u.searchParams.get("selectedKey");
    return env.stateEngine.speedWindow(range, selectedKey || void 0);
  });
  return true;
}

// src/host/index.js
var name = "dsh-foxbell-pet";
var FOXBELL_PET_NS = "foxbell-pet";
var ENTRY_ID = "dsh-foxbell-pet";
var ACTION_IDS = ["jumping", "waving", "failed", "waiting", "review", "running"];
var Action = z.union(ACTION_IDS);
var ConfigSchema = z.object({
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
  activePetId: z.string().default(BUILTIN_PET_ID),
  // v2.1 效率看板 12 项（键名/默认值逐字对齐 v1.4.0 Config 契约；引擎逐键消费、缺键回退）。
  // 前 8 项为看板引擎门/阈值；summaryEntrySec/boardTtlSec/ttsEnabled/summaryEnabled 为客户端门。
  paceEnabled: z.boolean().default(true),
  paceIntenseEvents: z.number().default(12),
  paceLongrunMin: z.number().default(3),
  paceLoafStartMin: z.number().default(15),
  usageEnabled: z.boolean().default(true),
  dayLimitTokens: z.number().default(0),
  milestoneUnit: z.number().default(1e6),
  approvalFlickerMin: z.number().default(5),
  summaryEnabled: z.boolean().default(true),
  summaryEntrySec: z.number().default(15),
  boardTtlSec: z.number().default(15),
  ttsEnabled: z.boolean().default(false),
  // v2.2 用量看板配置（R6 侧栏入口/R8 导出姿态；客户端消费）。
  // v2.2.1：exportQuote 移除——自定义评语内联到看板头部（localStorage 草稿，不再是宿主配置键）
  dashboardSidebarEntry: z.boolean().default(false),
  exportPose: z.string().default("random")
});
var CONFIG_DEFAULTS = ConfigSchema({});
var Config = ConfigSchema.volatile();
var inject = ["webServer", "fs", "agents", "sessions", "sessionTitle"];
var petsDirCache = { root: null, rootMtimeMs: -1, pets: [], manifestMtimes: /* @__PURE__ */ new Map() };
var manifestMtimeOf = (root, id) => {
  try {
    return fs10.statSync(path10.join(root, id, MANIFEST_FILE)).mtimeMs;
  } catch {
    return -1;
  }
};
var rescanPets = (root, rootMtimeMs) => {
  const pets = listPets(root);
  const manifestMtimes = /* @__PURE__ */ new Map();
  for (const p of pets) manifestMtimes.set(p.id, manifestMtimeOf(root, p.id));
  petsDirCache.rootMtimeMs = rootMtimeMs;
  petsDirCache.pets = pets;
  petsDirCache.manifestMtimes = manifestMtimes;
};
var listPetsCached = (root) => {
  if (petsDirCache.root !== root) {
    petsDirCache.root = root;
    petsDirCache.rootMtimeMs = -1;
    petsDirCache.pets = [];
    petsDirCache.manifestMtimes = /* @__PURE__ */ new Map();
  }
  let rootMtime = -1;
  try {
    rootMtime = fs10.statSync(root).mtimeMs;
  } catch {
    return petsDirCache.rootMtimeMs === -1 ? [] : petsDirCache.pets;
  }
  let stale = rootMtime !== petsDirCache.rootMtimeMs;
  if (!stale) {
    for (const p of petsDirCache.pets) {
      if (manifestMtimeOf(root, p.id) !== petsDirCache.manifestMtimes.get(p.id)) {
        stale = true;
        break;
      }
    }
  }
  if (stale) rescanPets(root, rootMtime);
  return petsDirCache.pets;
};
var manifestCache = /* @__PURE__ */ new Map();
var loadManifestCached = (dir, opts) => {
  let mtime = -1;
  try {
    mtime = fs10.statSync(path10.join(dir, MANIFEST_FILE)).mtimeMs;
  } catch {
  }
  const c = manifestCache.get(dir);
  if (c && c.mtimeMs === mtime) return c.manifest;
  const m = loadManifest(dir, opts);
  manifestCache.set(dir, { mtimeMs: mtime, manifest: m });
  return m;
};
var __testables = { listPetsCached, loadManifestCached };
async function apply(ctx, config) {
  let entry;
  try {
    entry = ConfigSchema(config ?? {});
  } catch {
    entry = CONFIG_DEFAULTS;
  }
  let configSource = () => entry;
  let settingsAttached = false;
  const readConfig = () => {
    try {
      const v = configSource();
      return v && typeof v === "object" ? { ...entry, ...v } : entry;
    } catch {
      return entry;
    }
  };
  try {
    ctx.inject(["settings"], (sctx) => {
      const settings = sctx.settings;
      if (settings === void 0 || settings === null) return;
      if (typeof settings.installSection === "function") {
        settings.installSection(ctx, FOXBELL_PET_NS, ConfigSchema, entry, {
          setSource: (current) => {
            configSource = current;
            settingsAttached = true;
          },
          onChange: () => {
          }
        });
        return;
      }
      if (typeof settings.describe !== "function") {
        console.warn("[foxbell-pet] settings service present but exposes neither installSection nor describe");
        return;
      }
      const fiber = ctx && typeof ctx === "object" ? ctx.fiber : null;
      const rowId = fiber && typeof fiber === "object" && fiber.entry && typeof fiber.entry === "object" && fiber.entry.options && typeof fiber.entry.options === "object" ? fiber.entry.options.id : void 0;
      const entryId = typeof rowId === "string" && rowId.length > 0 ? rowId : ENTRY_ID;
      const readEntryValue = () => {
        try {
          const descriptors = settings.describe();
          if (!Array.isArray(descriptors)) return null;
          const d = descriptors.find((x) => x && typeof x === "object" && x.ns === entryId);
          return d && d.value && typeof d.value === "object" ? d.value : null;
        } catch {
          return null;
        }
      };
      let cachedValue = void 0;
      configSource = () => {
        if (cachedValue === void 0) {
          const value = readEntryValue();
          if (value !== null) cachedValue = value;
          return value;
        }
        return cachedValue;
      };
      settingsAttached = true;
      sctx.effect(() => sctx.on("settings/document-updated", (ns) => {
        if (ns === entryId) cachedValue = void 0;
      }));
      sctx.effect(() => () => {
        configSource = () => entry;
        settingsAttached = false;
        cachedValue = void 0;
      });
    });
  } catch (err) {
    console.warn("[foxbell-pet] settings wiring unavailable:", String(err && err.message || err));
  }
  const PETS_ROOT = petsRoot();
  const STAGING_ROOT = stagingRoot();
  const TRASH_ROOT = trashRoot();
  const CODEX_ROOT = codexRoot();
  const TMP_DIR = os2.tmpdir();
  try {
    fs10.mkdirSync(PETS_ROOT, { recursive: true });
    fs10.mkdirSync(STAGING_ROOT, { recursive: true });
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
    const raw = JSON.parse(fs10.readFileSync(path10.join(PKG_DIR, "assets", "pet.json"), "utf8"));
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
  const webServer = ctx.get("webServer");
  const optionalService = (name2) => {
    try {
      return ctx.get(name2);
    } catch {
      return void 0;
    }
  };
  const streamHelpers = await loadStreamHelpers();
  const engine = createStateEngine({
    roots: () => agents !== void 0 ? agents.roots() : [],
    getSession: (id) => sessions !== void 0 ? sessions.get(id) : void 0,
    getTitle: (session) => sessionTitle !== void 0 ? sessionTitle.get(session) : void 0,
    now: () => Date.now(),
    lastUsage: streamHelpers.lastUsage,
    firstTokenTime: streamHelpers.firstTokenTime,
    readConfig
    // v2.1 看板 8 键 live 读（整对象透传，引擎逐键判型回退 BOARD_DEFAULTS）
  });
  engine.compute();
  diag.corpusAvailable = false;
  const mountCorpus = (scope, sessionQuerySvc) => {
    if (!sessionQuerySvc || typeof sessionQuerySvc.listSessions !== "function" || typeof sessionQuerySvc.readSession !== "function") return;
    diag.corpusAvailable = true;
    const corpus = createCorpusCollector({
      listRecords: async () => {
        const recs = await sessionQuerySvc.listSessions();
        return (Array.isArray(recs) ? recs : []).map((r) => r && r.header && typeof r.header.id === "string" ? { id: r.header.id, createdAt: r.header.createdAt, live: !!r.live } : null);
      },
      readEvents: async (id) => {
        const snap = await sessionQuerySvc.readSession(id);
        if (!snap || !Array.isArray(snap.events)) throw new Error("sessionQuery.readSession returned no event list");
        const skip = typeof snap.inheritedEventCount === "number" && snap.inheritedEventCount > 0 ? Math.floor(snap.inheritedEventCount) : 0;
        return skip > 0 ? snap.events.slice(skip) : snap.events;
      },
      liveEvents: (id) => {
        try {
          const s = sessions !== void 0 ? sessions.get(id) : void 0;
          const evts = s ? sessionEvents(s) : null;
          if (!Array.isArray(evts)) return null;
          const skip = s && typeof s.inheritedEventCount === "number" && s.inheritedEventCount > 0 ? Math.floor(s.inheritedEventCount) : 0;
          return skip > 0 ? evts.slice(skip) : evts;
        } catch {
          return null;
        }
      },
      rootIds: () => (agents !== void 0 ? agents.roots() : []).map((a) => a && a.id !== void 0 && a.id !== null ? String(a.id) : "").filter(Boolean),
      engine,
      now: () => Date.now()
    });
    scope.effect(() => {
      void corpus.refresh();
      const timer = setInterval(() => {
        void corpus.refresh();
      }, 1e4);
      return () => {
        clearInterval(timer);
        corpus.dispose();
        diag.corpusAvailable = false;
        engine.noteCoverage("limited");
      };
    }, "foxbell-pet.corpusTimer");
  };
  Object.defineProperty(diag, "corpus", { enumerable: true, get: () => engine.corpusStats });
  Object.defineProperties(diag, {
    usageRevision: { enumerable: true, get: () => engine.usageRevision },
    usageHour: { enumerable: true, get: () => floorLocalBucket(Date.now(), 36e5) },
    usageDay: { enumerable: true, get: () => dateKeyOf(Date.now()) }
  });
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
      return String(fs10.statSync(path10.join(PETS_ROOT, id, "manifest.json")).mtimeMs);
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
    const m = loadManifestCached(path10.join(PETS_ROOT, id), { id });
    const exists = fs10.existsSync(path10.join(PETS_ROOT, id));
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
  const envRev = (hint) => {
    const id = activePetId(hint);
    return id + "/" + revOf(id) + "|" + listPetsCached(PETS_ROOT).map((s) => s.id + ":" + (s.displayName || "") + ":" + s.spriteVersionNumber).join(",") + "|" + [diag.additiveApiCapability, diag.sessionSpeedCapability, diag.corpusAvailable].map(Number).join("") + "|" + (diag.additiveApiCapability ? `${diag.usageRevision}:${diag.usageHour}:${diag.usageDay}` : "");
  };
  const snapshotExtra = (hint) => {
    engine.compute();
    diag.computeCount += 1;
    const active = activePetSnapshot(hint);
    const activeManifest = active.id === BUILTIN_PET_ID ? builtinManifest : loadManifestCached(path10.join(PETS_ROOT, active.id), { id: active.id });
    const projects = engine.list();
    return {
      seq: engine.nextSeq(),
      completions: engine.queue,
      runningSessions: projects.filter((p) => p.status === "running").length,
      projects,
      // v2.1 效率看板聚合（本轮 compute() 刚跑完，非 null；形状见 dashboard.js buildDashboard）
      dashboard: engine.dashboard(),
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
        ...listPetsCached(PETS_ROOT).map((s) => ({ ...s, builtin: false, dir: void 0 }))
      ],
      guard: guardSnapshot(hint),
      assetDir: ASSET_DIR,
      spriteBytes: spriteBytes ? spriteBytes.length : null,
      diag
    };
  };
  let sessionProjections;
  diag.additiveApiCapability = false;
  diag.sessionSpeedCapability = false;
  const dashboardEnv = {
    pkgDir: PKG_DIR,
    petsRoot: PETS_ROOT,
    stagingRoot: STAGING_ROOT,
    trashRoot: TRASH_ROOT,
    codexRoot: CODEX_ROOT,
    tmpDir: TMP_DIR,
    stateEngine: engine,
    sessions,
    get sessionProjections() {
      return sessionProjections;
    },
    snapshotExtra,
    envRev,
    builtin: {
      manifest: builtinManifest,
      assetDir: ASSET_DIR || path10.join(PKG_DIR, "assets"),
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
  };
  registerRoutes(ctx, dashboardEnv);
  const mountOwnedDashboard = (scope, connection) => {
    const owner = hostOwnerVerifier(connection);
    if (!owner || !webServer || typeof scope.effect !== "function") return;
    let current = true;
    const ownedEnv = Object.create(dashboardEnv);
    ownedEnv.webServer = webServer;
    ownedEnv.isActive = () => current;
    ownedEnv.verifyOwner = async (req) => current && await owner(req) === true && current;
    const pricingDir = path10.join(storeRoot(), "pricing");
    try {
      ownedEnv.pricing = {
        rules: openRuleStore(path10.join(pricingDir, "rules.json")),
        catalog: openPriceCatalog({ dir: pricingDir })
      };
    } catch (err) {
      console.warn("[foxbell-pet] pricing unavailable:", String(err && err.message || err));
    }
    scope.effect(() => () => {
      current = false;
      diag.additiveApiCapability = false;
      ownedEnv.pricing?.catalog.dispose();
    }, "foxbell-pet.dashboard");
    diag.additiveApiCapability = registerDashboardRoutes(scope, ownedEnv);
  };
  const mountProjections = (scope, service) => {
    if (!service || typeof service.snapshot !== "function") return;
    scope.effect(() => {
      sessionProjections = service;
      diag.sessionSpeedCapability = true;
      return () => {
        sessionProjections = void 0;
        diag.sessionSpeedCapability = false;
      };
    }, "foxbell-pet.sessionProjections");
  };
  const optional = (name2, mount) => {
    if (typeof ctx.inject === "function") {
      ctx.inject([name2], (scope) => mount(scope, scope[name2]));
    } else {
      const service = optionalService(name2);
      if (service !== void 0) mount(ctx, service);
    }
  };
  optional("connection", mountOwnedDashboard);
  optional("sessionProjections", mountProjections);
  optional("sessionQuery", mountCorpus);
  if (webServer !== void 0) {
    console.log("[foxbell-pet] host mounted: sprite=" + (spriteBytes ? spriteBytes.length : 0) + " builtinVoices=" + builtinVoices.length + " assetDir=" + ASSET_DIR + " pets=" + listPetsCached(PETS_ROOT).length + " sweptStaging=" + sweptCount);
  }
}
export {
  ACTION_IDS,
  CONFIG_DEFAULTS,
  Config,
  ConfigSchema,
  ENTRY_ID,
  FOXBELL_PET_NS,
  __testables,
  apply,
  inject,
  name
};
/*!
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
