// 效率看板一期 —— 宿主侧纯函数集（无副作用、无宿主依赖，可被 node --test 直接测试）。
// 事件读取双兼容：rc.1+ 的 session.snapshotEvents() 优先，老版回退 session.events 属性。

export function sessionEvents(session) {
  if (session && typeof session.snapshotEvents === 'function') {
    try {
      const evts = session.snapshotEvents()
      if (Array.isArray(evts)) return evts
    } catch { /* fall through */ }
  }
  return session && Array.isArray(session.events) ? session.events : []
}

// ---------- 组件①：时长档位 ----------
// 规则（spec 6.1）：turn 开着——静默≥longrunSilentMs→长跑；5min 事件数≥intenseEvents→高强度；否则活跃。
// turn 关着——静默≥loafStartMs 起，每 +10/+20/+45 分钟升一阶摸鱼（默认 15/25/35/60min）。

export const PACE_LABELS = {
  intense: '高强度', active: '活跃', longrun: '长任务', idle: '空闲',
  loaf1: '摸鱼·小憩', loaf2: '摸鱼·躺平', loaf3: '摸鱼·咸鱼', loaf4: '摸鱼·咸鱼干',
}

export const DEFAULT_PACE = { intenseEvents: 12, longrunSilentMs: 3 * 60000, loafStartMs: 15 * 60000 }

const LOAF_STEPS_MS = [10 * 60000, 20 * 60000, 45 * 60000]

export function derivePaceTier(agg, now, opt) {
  const o = Object.assign({}, DEFAULT_PACE, opt || {})
  if (!agg || !Number.isFinite(agg.lastEventTime)) {
    return { tier: 'idle', sinceMs: null, label: PACE_LABELS.idle }
  }
  const sinceMs = Math.max(0, now - agg.lastEventTime)
  if (agg.turnOpen) {
    if (sinceMs >= o.longrunSilentMs) return { tier: 'longrun', sinceMs, label: PACE_LABELS.longrun }
    if ((agg.eventCount5m || 0) >= o.intenseEvents) return { tier: 'intense', sinceMs, label: PACE_LABELS.intense }
    return { tier: 'active', sinceMs, label: PACE_LABELS.active }
  }
  if (sinceMs >= o.loafStartMs + LOAF_STEPS_MS[2]) return { tier: 'loaf4', sinceMs, label: PACE_LABELS.loaf4 }
  if (sinceMs >= o.loafStartMs + LOAF_STEPS_MS[1]) return { tier: 'loaf3', sinceMs, label: PACE_LABELS.loaf3 }
  if (sinceMs >= o.loafStartMs + LOAF_STEPS_MS[0]) return { tier: 'loaf2', sinceMs, label: PACE_LABELS.loaf2 }
  if (sinceMs >= o.loafStartMs) return { tier: 'loaf1', sinceMs, label: PACE_LABELS.loaf1 }
  return { tier: 'idle', sinceMs, label: PACE_LABELS.idle }
}

// ---------- 组件②：token 三分账 ----------
// 与 harness token-meter 的 usage-projection 语义对齐（rc.1 验证）：最终 assistant/message
// 样本替换同 (turn,step) 的早期样本；llm/retry-started 关闭替换槽 → 重试样本累加。

export function dateKeyOf(ms) {
  const d = new Date(ms)
  const p = (x) => String(x).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

const USAGE_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
export const zeroUsage = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })

/** 事件消息源路由（v2.2 R2）：assistant/message.data.message.source.{provider,model}；
 *  缺失/非字符串 → null（记账归「未知」桶）。 */
export function routeSource(ev) {
  const src = ev && ev.data && ev.data.message && ev.data.message.source
  if (!src || typeof src !== 'object') return null
  const p = typeof src.provider === 'string' ? src.provider.trim() : ''
  const m = typeof src.model === 'string' ? src.model.trim() : ''
  return p && m ? { provider: p, model: m } : null
}

/** 整点桶键（本地时区）：YYYY-MM-DDTHH（与 dateKeyOf 同款 pad 拼接）。 */
export function hourKeyOf(ms) {
  const d = new Date(ms)
  return dateKeyOf(ms) + 'T' + String(d.getHours()).padStart(2, '0')
}

const UNKNOWN_ROUTE = '未知'
const routeBuckets = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requestCount: 0 })

export function foldUsage(evts) {
  const byDay = {}
  const byHour = {}
  const byRoute = {}
  const byDayRoute = {}
  const grand = zeroUsage()
  let requestCount = 0
  let lastKey = null
  let lastBuckets = null
  let lastDay = null
  let lastHour = null
  let lastRoute = null
  // 冲回后全零的壳桶就地摘除：同 (turn,step) 替换不留 0 值残桶（否则旧路由/小时/日以 0 壳污染切片）
  const pruneIfEmpty = (parent, key) => {
    const t = parent && parent[key]
    if (!t) return
    if (USAGE_KEYS.every((k) => !t[k]) && !t.requestCount) delete parent[key]
  }
  const apply = (b, day, hour, route, sign) => {
    const d = byDay[day] || (byDay[day] = zeroUsage())
    const h = byHour[hour] || (byHour[hour] = zeroUsage())
    const r = byRoute[route] || (byRoute[route] = routeBuckets())
    const dr = byDayRoute[day] || (byDayRoute[day] = {})
    const rd = dr[route] || (dr[route] = routeBuckets())
    for (const k of USAGE_KEYS) {
      const v = (b[k] || 0) * sign
      grand[k] += v
      d[k] += v
      h[k] += v
      r[k] += v
      rd[k] += v
    }
    r.requestCount += sign
    rd.requestCount += sign
    d.requestCount = (d.requestCount || 0) + sign
    h.requestCount = (h.requestCount || 0) + sign
    requestCount += sign
    if (sign < 0) {
      pruneIfEmpty(byRoute, route)
      pruneIfEmpty(byDayRoute[day], route)
      if (byDayRoute[day] && !Object.keys(byDayRoute[day]).length) delete byDayRoute[day]
      pruneIfEmpty(byDay, day)
      pruneIfEmpty(byHour, hour)
    }
  }
  for (const ev of Array.isArray(evts) ? evts : []) {
    const d = ev && ev.data
    if (!d) continue
    if (ev.type === 'llm/retry-started') {
      lastKey = null; lastBuckets = null; lastDay = null; lastHour = null; lastRoute = null
      continue
    }
    if (ev.type !== 'assistant/message' || !d.usage || typeof d.usage !== 'object') continue
    if (typeof ev.time !== 'number' || !Number.isFinite(ev.time)) continue // 无时间戳的样本无法归日，跳过（防 NaN 桶）
    const u = d.usage
    const b = {}
    for (const k of USAGE_KEYS) b[k] = typeof u[k] === 'number' && Number.isFinite(u[k]) && u[k] > 0 ? u[k] : 0
    const key = d.turn + ':' + d.step
    const day = dateKeyOf(ev.time)
    const hour = hourKeyOf(ev.time)
    const src = routeSource(ev)
    const route = src ? src.provider + '/' + src.model : UNKNOWN_ROUTE
    if (key === lastKey && lastBuckets && lastDay) apply(lastBuckets, lastDay, lastHour, lastRoute, -1)
    apply(b, day, hour, route, 1)
    lastKey = key; lastBuckets = b; lastDay = day; lastHour = hour; lastRoute = route
  }
  return { byDay, byHour, byRoute, byDayRoute, grand, requestCount }
}

// ---------- 组件②：阈值阶梯与里程碑（跨阈值判定，天然一次性） ----------

export function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 10000) return String(Math.round(n))
  if (n < 100000000) {
    const v = (n / 10000).toFixed(1)
    return (v.endsWith('.0') ? v.slice(0, -2) : v) + '万'
  }
  const v = (n / 100000000).toFixed(2)
  return v.replace(/\.?0+$/, '') + '亿'
}

export function evaluateAlerts(prev, next, cfg, dateKey) {
  const out = []
  // 日阈值 id 带日键：长驻 SPA 里客户端按 id 去重（页面生命周期），无日键则次日的同档警报被永久静默
  const day = typeof dateKey === 'string' && dateKey ? ':' + dateKey : ''
  const limit = cfg && cfg.dayLimitTokens > 0 ? cfg.dayLimitTokens : 0
  if (limit > 0) {
    const warn = limit * 0.8
    if (prev.dayTotal < warn && next.dayTotal >= warn) {
      out.push({ id: 'day-warn' + day, kind: 'day-warn', text: '今日 token 已用 80% · ' + formatTokens(next.dayTotal) })
    }
    if (prev.dayTotal < limit && next.dayTotal >= limit) {
      out.push({ id: 'day-hit' + day, kind: 'day-hit', text: '今日 token 已达阈值 · ' + formatTokens(next.dayTotal) })
    }
  }
  const unit = cfg && cfg.milestoneUnit > 0 ? cfg.milestoneUnit : 0
  if (unit > 0) {
    const k = Math.floor(next.grandTotal / unit)
    if (k > 0 && Math.floor(prev.grandTotal / unit) < k) {
      out.push({ id: 'milestone:' + k, kind: 'milestone', text: '里程碑：累计 ' + formatTokens(k * unit) + ' token' })
    }
  }
  return out
}

// ---------- 组件④：黑板汇总 + 年龄标注 ----------

export function ageLabel(sec) {
  if (!Number.isFinite(sec) || sec < 0) return ''
  if (sec < 60) return Math.floor(sec) + 's'
  if (sec < 3600) return Math.floor(sec / 60) + 'm'
  return Math.floor(sec / 3600) + 'h'
}

// 耗时格式化（工具 Top3 的「次数+耗时」用，spec 6.4）：分钟 / 秒 / 毫秒三档
const formatDur = (ms) => ms >= 60000
  ? (ms / 60000).toFixed(1) + ' 分钟'
  : ms >= 1000 ? (ms / 1000).toFixed(1) + ' 秒' : Math.round(ms) + ' 毫秒'

export function summarize(perSession, dayUsage, userEst) {
  const list = Array.isArray(perSession) ? perSession : []
  let turns = 0, errors = 0, longest = 0
  const tools = {}
  const dur = {}
  for (const s of list) {
    turns += s.turns || 0
    errors += s.errors || 0
    if (s.longestTurnMs > longest) longest = s.longestTurnMs
    const durMs = s.toolDurMs || {}
    for (const [n, c] of Object.entries(s.toolCalls || {})) {
      tools[n] = (tools[n] || 0) + c
      dur[n] = (dur[n] || 0) + (durMs[n] || 0)
    }
  }
  const top = Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([n, c]) => dur[n] > 0 ? n + '×' + c + '（共 ' + formatDur(dur[n]) + '）' : n + '×' + c)
  const t = dayUsage || zeroUsage()
  const requestTotal = t.inputTokens + t.cacheReadTokens
  return {
    sessions: list.length,
    turns,
    errors,
    // 五口径名词（spec 6.2/用户 2026-09-10 裁定）：请求输入=全文累计，命中率=缓存命中/请求输入，用户输入为启发式估算
    tokensText: '请求输入 ' + formatTokens(requestTotal) + '（缓存命中 ' + formatTokens(t.cacheReadTokens) + ' · '
      + (requestTotal > 0 ? (t.cacheReadTokens / requestTotal * 100).toFixed(1) : '0.0') + '%）· 产出 '
      + formatTokens(t.outputTokens) + ' · 你的输入 ~' + formatTokens(userEst || 0) + '(估) · 含子代理',
    toolsText: top.length ? top.join(' · ') : '—',
    longestText: longest >= 60000 ? (longest / 60000).toFixed(1) + ' 分钟' : Math.round(longest / 1000) + ' 秒',
  }
}

// Task 7 新增（纯增量，summarize 原样保留——test/dashboard.test.mjs 29 用例对 zh 字符串字节锁定）：
// 与 summarize 完全同口径聚合的结构化投影（RAW 数值，不做 zh 文案格式化），供客户端黑板行
// t()+fmtTokens 双语拼装。数值一致性由 test/state-dashboard.test.mjs 对 tokensText/toolsText/
// longestText 的同源断言钉住：hitPct 为 命中/请求输入*100 原始浮点（分母 0 记 0），客户端
// toFixed(1) 后与 zh 字符串内百分数逐位一致；toolRows 与 toolsText 同序（次数降序 Top3）。
export function summarizeStructured(perSession, dayUsage, userEst) {
  const list = Array.isArray(perSession) ? perSession : []
  let longest = 0
  const tools = {}
  const dur = {}
  for (const s of list) {
    if (s.longestTurnMs > longest) longest = s.longestTurnMs
    const durMs = s.toolDurMs || {}
    for (const [n, c] of Object.entries(s.toolCalls || {})) {
      tools[n] = (tools[n] || 0) + c
      dur[n] = (dur[n] || 0) + (durMs[n] || 0)
    }
  }
  const toolRows = Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, count]) => ({ name, count, ms: dur[name] || 0 }))
  const t = dayUsage || zeroUsage()
  const requestTotal = t.inputTokens + t.cacheReadTokens
  return {
    tokens: {
      requestTotal, // 请求输入口径 = inputTokens + cacheReadTokens（与 usage.requestTotal 同源）
      cacheRead: t.cacheReadTokens,
      hitPct: requestTotal > 0 ? t.cacheReadTokens / requestTotal * 100 : 0,
      output: t.outputTokens,
      userEst: userEst || 0,
    },
    toolRows,
    longest: longest > 0 ? { ms: longest } : null, // 无已计量 turn 时 null（客户端按 '0 秒' 桶展示，与 zh 口径一致）
  }
}


// ---------- 五口径补充：用户输入估算（①口径）与命中率（⑤口径） ----------
// provider 不单独上报用户侧输入；对 user/message 文本做启发式计数（CJK 逐字 + ASCII 按词），
// 与宿主截断所用 estimateTokens 同款口径。展示端须带「(估)」标注（F71 诚实标注）。

export function blocksTextOf(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

export function estimateTokens(text) {
  let n = 0
  let word = false
  for (const ch of String(text || '')) {
    const c = ch.codePointAt(0)
    if (c >= 0x4e00 && c <= 0x9fff) { n += 1; word = false }
    else if (/\s/.test(ch)) { word = false }
    else { if (!word) { n += 1; word = true } }
  }
  return n
}

export function estimateUserTokensByDay(evts) {
  const byDay = {}
  for (const ev of Array.isArray(evts) ? evts : []) {
    if (!ev || ev.type !== 'user/message' || typeof ev.time !== 'number' || !Number.isFinite(ev.time)) continue
    const d = ev && ev.data
    if (!d) continue
    const n = estimateTokens(blocksTextOf(d.content))
    if (n <= 0) continue
    const day = dateKeyOf(ev.time)
    byDay[day] = (byDay[day] || 0) + n
  }
  return byDay
}

/** 缓存命中率（⑤口径）：cacheRead / (uncached input + cacheRead)，分母为 0 时记 0。 */
export function hitRate(usage) {
  const u = usage || {}
  const denom = (u.inputTokens || 0) + (u.cacheReadTokens || 0)
  if (denom <= 0) return 0
  return Math.min(1, Math.max(0, (u.cacheReadTokens || 0) / denom))
}

// ---------- v2.2 R3：趋势窗口（14 日 + 当日 24 整点桶）与区间聚合 ----------

const dayTotalOf = (u) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens
const reqTotalOf = (u) => u.inputTokens + u.cacheReadTokens

const shiftDayKey = (key, delta) => {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return dateKeyOf(dt.getTime())
}

/** folds: foldUsage() 产物数组（每会话一份）。days=近 14 日升序零填充；hours=今日 0-23 整点桶。
 *  requestCount 由 Task 1 的 byDay/byHour 桶透传。 */
export function buildTrend(folds, nowMs) {
  const todayKey = dateKeyOf(nowMs)
  const dayKeys = []
  for (let i = 13; i >= 0; i--) dayKeys.push(shiftDayKey(todayKey, -i))
  const dayAcc = Object.fromEntries(dayKeys.map((k) => [k, zeroUsage()]))
  const hourAcc = {}
  for (let h = 0; h < 24; h++) hourAcc[todayKey + 'T' + String(h).padStart(2, '0')] = zeroUsage()
  for (const f of Array.isArray(folds) ? folds : []) {
    if (!f) continue
    for (const [k, u] of Object.entries(f.byDay || {})) {
      if (!dayAcc[k]) continue
      for (const bk of USAGE_KEYS) dayAcc[k][bk] += u[bk] || 0
      dayAcc[k].requestCount = (dayAcc[k].requestCount || 0) + (u.requestCount || 0)
    }
    for (const [k, u] of Object.entries(f.byHour || {})) {
      if (!hourAcc[k]) continue
      for (const bk of USAGE_KEYS) hourAcc[k][bk] += u[bk] || 0
      hourAcc[k].requestCount = (hourAcc[k].requestCount || 0) + (u.requestCount || 0)
    }
  }
  const day = (k, b) => ({ key: k, dayTotal: dayTotalOf(b), requestTotal: reqTotalOf(b), cacheRead: b.cacheReadTokens, outputTokens: b.outputTokens, hitPct: hitRate(b), requestCount: b.requestCount || 0 })
  return {
    days: dayKeys.map((k) => day(k, dayAcc[k])),
    hours: Object.entries(hourAcc).map(([k, u]) => ({ key: k, dayTotal: dayTotalOf(u), requestTotal: reqTotalOf(u), requestCount: u.requestCount || 0 })),
  }
}

/** 区间聚合（/dashboard/range 数据核）。folds/toolsByDayList/userEstByDayList 与会话一一对应。
 *  模型聚合走 byDayRoute 日切片（Task 1 交叉维度）——绝不用会话全量 byRoute（跨日旧账会污染区间）。 */
export function summarizeRange(folds, toolsByDayList, userEstByDayList, fromKey, toKey) {
  const dayKeys = []
  for (let k = fromKey; k <= toKey && dayKeys.length <= 31; k = shiftDayKey(k, 1)) dayKeys.push(k)
  const dayAcc = Object.fromEntries(dayKeys.map((k) => [k, zeroUsage()]))
  const routeAcc = {}
  for (const f of Array.isArray(folds) ? folds : []) {
    if (!f) continue
    for (const [k, u] of Object.entries(f.byDay || {})) {
      if (!dayAcc[k]) continue
      for (const bk of USAGE_KEYS) dayAcc[k][bk] += u[bk] || 0
      dayAcc[k].requestCount = (dayAcc[k].requestCount || 0) + (u.requestCount || 0)
    }
    for (const k of dayKeys) {
      const dayRoute = f.byDayRoute && f.byDayRoute[k]
      if (!dayRoute) continue
      for (const [route, r] of Object.entries(dayRoute)) {
        const slash = route.indexOf('/')
        const a = routeAcc[route] || (routeAcc[route] = {
          route,
          provider: slash > 0 ? route.slice(0, slash) : '',
          model: slash > 0 ? route.slice(slash + 1) : '',
          requestTotal: 0, cacheRead: 0, outputTokens: 0,
        })
        a.requestTotal += r.inputTokens + r.cacheReadTokens
        a.cacheRead += r.cacheReadTokens
        a.outputTokens += r.outputTokens
      }
    }
  }
  const totals = { requestTotal: 0, cacheRead: 0, outputTokens: 0, userEst: 0, hitPct: 0, requestCount: 0 }
  for (const est of Array.isArray(userEstByDayList) ? userEstByDayList : []) {
    if (!est) continue
    for (const k of dayKeys) totals.userEst += est[k] || 0
  }
  const days = dayKeys.map((k) => {
    const b = dayAcc[k]
    return { key: k, dayTotal: dayTotalOf(b), requestTotal: reqTotalOf(b), cacheRead: b.cacheReadTokens, outputTokens: b.outputTokens, hitPct: hitRate(b), requestCount: b.requestCount || 0 }
  })
  totals.requestTotal = days.reduce((s, d) => s + d.requestTotal, 0)
  totals.cacheRead = days.reduce((s, d) => s + d.cacheRead, 0)
  totals.outputTokens = days.reduce((s, d) => s + d.outputTokens, 0)
  totals.requestCount = days.reduce((s, d) => s + d.requestCount, 0)
  totals.hitPct = totals.requestTotal > 0 ? totals.cacheRead / totals.requestTotal : 0
  const models = Object.values(routeAcc).sort((a, b) => b.requestTotal - a.requestTotal)
  const toolsAcc = {}
  for (const t of Array.isArray(toolsByDayList) ? toolsByDayList : []) {
    if (!t || !t.byDay) continue
    for (const k of dayKeys) {
      const day = t.byDay[k]
      if (!day) continue
      for (const [name, v] of Object.entries(day)) {
        const a = toolsAcc[name] || (toolsAcc[name] = { name, count: 0, durMs: 0 })
        a.count += v.count || 0
        a.durMs += v.durMs || 0
      }
    }
  }
  const tools = Object.values(toolsAcc).sort((a, b) => b.count - a.count)
  return { from: fromKey, to: toKey, days, totals, models, tools }
}

/** 工具调用按日折叠（/dashboard/range 的工具区数据核；防御式读 name/durationMs）。
 *  计数口径（Task 2 测试钉死 count:2）：带名的 tool/call 与 tool/result 各计一次；耗时仅由带
 *  durationMs 的 tool/result 累加。注意与 v2.1 scanSession 的 toolCalls（仅 tool/call 计数）口径不同。 */
export function foldToolsByDay(evts) {
  const byDay = {}
  for (const ev of Array.isArray(evts) ? evts : []) {
    const d = ev && ev.data
    if (!d || (ev.type !== 'tool/call' && ev.type !== 'tool/result')) continue
    if (typeof ev.time !== 'number' || !Number.isFinite(ev.time)) continue
    const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : null
    if (!name) continue
    const day = dateKeyOf(ev.time)
    const b = byDay[day] || (byDay[day] = {})
    const a = b[name] || (b[name] = { count: 0, durMs: 0 })
    a.count += 1
    if (ev.type === 'tool/result' && typeof d.durationMs === 'number' && Number.isFinite(d.durationMs) && d.durationMs > 0) a.durMs += d.durationMs
  }
  return { byDay }
}
