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

export function foldUsage(evts) {
  const byDay = {}
  const grand = zeroUsage()
  let lastKey = null
  let lastBuckets = null
  let lastDay = null
  const apply = (b, day, sign) => {
    for (const k of USAGE_KEYS) {
      const v = (b[k] || 0) * sign
      grand[k] += v
      const d = byDay[day] || (byDay[day] = zeroUsage())
      d[k] += v
    }
  }
  for (const ev of Array.isArray(evts) ? evts : []) {
    const d = ev && ev.data
    if (!d) continue
    if (ev.type === 'llm/retry-started') { lastKey = null; lastBuckets = null; continue }
    if (ev.type !== 'assistant/message' || !d.usage || typeof d.usage !== 'object') continue
    const u = d.usage
    const b = {}
    for (const k of USAGE_KEYS) b[k] = typeof u[k] === 'number' && Number.isFinite(u[k]) && u[k] > 0 ? u[k] : 0
    const key = d.turn + ':' + d.step
    const day = dateKeyOf(ev.time)
    if (key === lastKey && lastBuckets && lastDay) apply(lastBuckets, lastDay, -1)
    apply(b, day, 1)
    lastKey = key; lastBuckets = b; lastDay = day
  }
  return { byDay, grand }
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

export function evaluateAlerts(prev, next, cfg) {
  const out = []
  const limit = cfg && cfg.dayLimitTokens > 0 ? cfg.dayLimitTokens : 0
  if (limit > 0) {
    const warn = limit * 0.8
    if (prev.dayTotal < warn && next.dayTotal >= warn) {
      out.push({ id: 'day-warn', kind: 'day-warn', text: '今日 token 已用 80% · ' + formatTokens(next.dayTotal) })
    }
    if (prev.dayTotal < limit && next.dayTotal >= limit) {
      out.push({ id: 'day-hit', kind: 'day-hit', text: '今日 token 已达阈值 · ' + formatTokens(next.dayTotal) })
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

export function summarize(perSession, dayUsage) {
  const list = Array.isArray(perSession) ? perSession : []
  let turns = 0, errors = 0, longest = 0
  const tools = {}
  for (const s of list) {
    turns += s.turns || 0
    errors += s.errors || 0
    if (s.longestTurnMs > longest) longest = s.longestTurnMs
    for (const [n, c] of Object.entries(s.toolCalls || {})) tools[n] = (tools[n] || 0) + c
  }
  const top = Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => n + '×' + c)
  const t = dayUsage || zeroUsage()
  const total = t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens
  return {
    sessions: list.length,
    turns,
    errors,
    tokensText: formatTokens(total) + '（入 ' + formatTokens(t.inputTokens) + ' · 出 ' + formatTokens(t.outputTokens) + ' · 缓存读 ' + formatTokens(t.cacheReadTokens) + '）',
    toolsText: top.length ? top.join(' · ') : '—',
    longestText: longest >= 60000 ? (longest / 60000).toFixed(1) + ' 分钟' : Math.round(longest / 1000) + ' 秒',
  }
}
