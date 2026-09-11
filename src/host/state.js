// state.js — 项目状态聚合 + 效率看板聚合器（v2.1 移植）。
// B1 兼容修复：rc.1 Session 用 snapshotEvents() 方法（旧的会话事件数组属性已删除）。
// 判定逻辑与 v1.3.0 完全一致：优先级 error > approval > running > done；
// 红灯已读即消失；断联=运行中从 roots 消失。
// v2.1：scanSession 增看板 metrics（v1.4.0 scanSession metrics 段移植：正向一遍收集 +
// 倒序 decidedIds 过滤未决审批）；新增纯函数 buildDashboard（v1.4.0 computeProjects
// 看板聚合段移植，可喂裸事件数组直测）；createStateEngine 每轮 compute 聚合并缓存于
// dashboard()，警报基线跨轮保留。
// v2.2（Task 4）：buildDashboard 重构为 foldEntry/aggregateFold 折叠管线（usage 增
// models/tools/trend 快照字段，counts 由引擎并入）；createStateEngine 按 agentId 指纹
// （事件数:末事件 seq）增量缓存 scan+folded（P1：未变不重扫），trend 整点节流。
// 纯逻辑工厂 createStateEngine(deps)，便于 vitest 直接喂假会话。

import {
  sessionEvents, PACE_LABELS, derivePaceTier, dateKeyOf, zeroUsage, foldUsage,
  evaluateAlerts, summarize, summarizeStructured, estimateUserTokensByDay, hitRate, ageLabel,
  buildTrend, foldToolsByDay, hourKeyOf, summarizeRange,
} from './dashboard.js'

/** 文本助手（与 v1.3.0 相同：词元感知截断，CJK 每字 1 词元） */
export function blocksText(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

export function estimateTokens(s) {
  let n = 0
  let word = false
  for (const ch of s) {
    const c = ch.codePointAt(0)
    if (c >= 0x4e00 && c <= 0x9fff) { n += 1; word = false }
    else if (/\s/.test(ch)) { word = false }
    else { if (!word) { n += 1; word = true } }
  }
  return n
}

export function truncate(s, maxTokens) {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (estimateTokens(t) <= maxTokens) return t
  let n = 0
  let word = false
  let cut = t.length
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i)
    if (c >= 0x4e00 && c <= 0x9fff) { n += 1; word = false }
    else if (/\s/.test(t[i])) { word = false }
    else { if (!word) { n += 1; word = true } }
    if (n >= maxTokens) { cut = i + 1; break }
  }
  return t.slice(0, cut).trim() + '…'
}

/**
 * B1 核心：从 rc.1 Session 读事件快照（唯一的读取路径；旧数组属性用法已全量移除）。
 * snapshotEvents() 返回冻结数组，元素形状 {type, seq, time, data}。
 */
export function readEvents(session) {
  if (!session || typeof session.snapshotEvents !== 'function') return []
  try {
    const snap = session.snapshotEvents()
    return Array.isArray(snap) ? snap : []
  } catch { return [] }
}

// ---------- 效率看板聚合（v1.4.0 src/index.js L173-176 原样移植）----------
const USAGE_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
const ACTIVITY_TYPES = new Set(['user/message', 'assistant/message', 'tool/call', 'tool/result', 'turn/start', 'turn/end', 'approval/asked', 'approval/decided'])
// 近 5 分钟活跃事件数（pace 高强度判定输入）；窗口锚定调用方传入的 now
const events5mCount = (evts, nowMs) => evts.filter((e) => e && typeof e.time === 'number' && e.time > nowMs - 300000 && ACTIVITY_TYPES.has(e.type)).length

// 看板配置缺省（v1.4.0 Config schema 默认快照；readConfig 缺失/缺键时逐键回退）
const BOARD_DEFAULTS = {
  paceEnabled: true, paceIntenseEvents: 12, paceLongrunMin: 3, paceLoafStartMin: 15,
  usageEnabled: true, dayLimitTokens: 0, milestoneUnit: 1000000, approvalFlickerMin: 5,
}

/**
 * 会话事件扫描核心（v1.4.0 scanSession 主体，title 解析之外的全部派生）：
 * 看板 metrics（正向一遍收集 + 倒序 decidedIds 过滤未决审批）/ 最新2行状态 / 待批准 / 最近 turn/end。
 * dayStartMs 缺省按 -Infinity（全部事件计入「今日」）。
 */
function scanInfo(events, dayStartMs) {
  const dayStart = typeof dayStartMs === 'number' && Number.isFinite(dayStartMs) ? dayStartMs : -Infinity
  // 正向一遍：今日 turns/errors/toolCalls、最长 turn、最后事件时间、审批 ask 列表（效率看板指标）
  // toolStart/turnStartAt 为配对/归因内部表，不进入返回的 metrics（v2.1 契约只暴露 7 个字段）
  const metrics = { turns: 0, errors: 0, toolCalls: {}, toolDurMs: {}, longestTurnMs: 0, lastEventTime: null, pendingList: [] }
  const toolStart = {}
  const turnStartAt = {}
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const d = ev && ev.data
    if (!d || typeof ev.time !== 'number') continue
    if (ev.time > metrics.lastEventTime) metrics.lastEventTime = ev.time
    const today = ev.time >= dayStart
    if (ev.type === 'turn/start') { if (today) metrics.turns += 1; turnStartAt[d.turn] = ev.time }
    else if (ev.type === 'turn/end') {
      const r = d.reason
      if (today && r && (r.kind === 'error' || r.kind === 'interrupted')) metrics.errors += 1
      const startAt = turnStartAt[d.turn]
      if (typeof startAt === 'number' && today && ev.time - startAt > metrics.longestTurnMs) metrics.longestTurnMs = ev.time - startAt
    } else if (ev.type === 'tool/call' && typeof d.name === 'string' && today) {
      metrics.toolCalls[d.name] = (metrics.toolCalls[d.name] || 0) + 1
      if (d.callId !== undefined && d.callId !== null) toolStart[d.callId] = { name: d.name, at: ev.time }
    } else if (ev.type === 'tool/result') {
      // tool/result 经 message.source.callId（兜底首块 toolCallId）与 tool/call 配对；一次性消费，累计耗时
      const msg = d.message
      const callId = (msg && msg.source && msg.source.callId)
        || (msg && Array.isArray(msg.content) && msg.content[0] && msg.content[0].toolCallId)
      const start = (callId !== undefined && callId !== null) ? toolStart[callId] : null
      if (start) {
        metrics.toolDurMs[start.name] = (metrics.toolDurMs[start.name] || 0) + Math.max(0, ev.time - start.at)
        delete toolStart[callId]
      }
    } else if (ev.type === 'approval/asked' && typeof d.id === 'string') {
      metrics.pendingList.push({ id: d.id, at: ev.time })
    }
  }
  const lines = []
  let lastEnd = null
  let latestTurnStartSeq = null
  let pendingApproval = false
  const decidedIds = new Set()
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    const d = ev && ev.data
    if (!d) continue
    if (ev.type === 'approval/decided' && typeof d.id === 'string') decidedIds.add(d.id)
    if (ev.type === 'turn/start' && latestTurnStartSeq === null) latestTurnStartSeq = ev.seq
    if (ev.type === 'turn/end' && lastEnd === null) {
      const r = d.reason
      lastEnd = {
        seq: ev.seq,
        kind: r && r.kind ? r.kind : 'unknown',
        error: r && r.kind === 'error' && r.error ? String(r.error.message || r.error.code || 'error') : null,
      }
    }
  }
  // 未决审批（看板口径与 pendingApproval 一致）：出现过的 ask 若已有 decided 记录则不算挂起
  metrics.pendingList = metrics.pendingList.filter((p) => !decidedIds.has(p.id))
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    const d = ev && ev.data
    if (!d) continue
    if (ev.type === 'approval/asked' && typeof d.id === 'string' && !decidedIds.has(d.id)) pendingApproval = true
    if (lines.length >= 2) continue
    let text = ''
    if (ev.type === 'user/message') text = blocksText(d.content)
    else if (ev.type === 'assistant/message') text = blocksText(d.message && d.message.content)
    else if (ev.type === 'tool/result') text = blocksText(d.message && d.message.content)
    else if (ev.type === 'tool/call' && typeof d.name === 'string') text = '运行 ' + d.name + (typeof d.arguments === 'string' ? ' ' + d.arguments : '')
    if (!text) continue
    const ls = text.split('\n').map((l) => l.trim()).filter(Boolean)
    for (let k = ls.length - 1; k >= 0 && lines.length < 2; k--) lines.push(truncate(ls[k], 24))
  }
  return { lines, lastEnd, latestTurnStartSeq, pendingApproval, metrics }
}

/**
 * 会话扫描：标题 / 最新2行状态 / 待批准 / 最近 turn/end / 看板指标。
 * dayStartMs（可选）：metrics 的「今日」起点（本地零点）；evts（可选）：调用方已
 * sessionEvents(session) 采集过时传入复用，避免快照重复分配（只采集一次原则）。
 * v2.1：事件读取统一走 ./dashboard.js 的 sessionEvents 双兼容读取器（readEvents 保留不动）。
 */
export function scanSession(session, getTitle, dayStartMs, evts) {
  let title = null
  if (typeof getTitle === 'function') {
    try {
      const snap = getTitle(session)
      if (snap && typeof snap.title === 'string' && snap.title) title = snap.title
    } catch { /* keep null */ }
  }
  const events = evts || sessionEvents(session)
  return { title, ...scanInfo(events, dayStartMs) }
}

/** 状态推导（优先级 error > approval > running > done；与 v1.3.0 相同） */
export function derive(a, info, prev, newCompletion) {
  const endIsError = info.lastEnd !== null && (info.lastEnd.kind === 'error' || info.lastEnd.kind === 'interrupted')
  const hasNewerTurn = info.latestTurnStartSeq !== null && info.lastEnd !== null && info.latestTurnStartSeq > info.lastEnd.seq
  if (endIsError && !hasNewerTurn) {
    const fresh = prev === undefined ? true : info.lastEnd.seq > (prev.lastTurnEndSeq || -1)
    const keepUnread = prev !== undefined && prev.status === 'error' && prev.unread
    if (fresh || keepUnread) {
      const lines = ['本轮运行失败']; if (info.lines[0]) lines.push(info.lines[0])
      return { status: 'error', unread: true, title: info.title, lines }
    }
    return null
  }
  if (info.pendingApproval) {
    const lines = ['等待批准']; if (info.lines[0]) lines.push(info.lines[0])
    return { status: 'approval', unread: true, title: info.title, lines }
  }
  if (a.status === 'running') {
    return { status: 'running', unread: false, title: info.title, lines: info.lines }
  }
  if (newCompletion || (prev !== undefined && prev.status === 'done' && prev.unread)) {
    return { status: 'done', unread: true, title: info.title, lines: ['已完成'] }
  }
  return null
}

/**
 * 单会话折叠（v2.2 Task 4）：引擎增量缓存的最小单位。usage 三维账（foldUsage：
 * byDay/byHour/byRoute/byDayRoute/grand/requestCount）+ 用户输入按日估算 + 工具调用按日。
 * 引擎按指纹缓存折叠结果；时间派生量（pace/approvals/summary 行）不进缓存、每轮重算。
 */
export function foldEntry(evts) {
  return {
    usage: foldUsage(evts),
    userEstByDay: estimateUserTokensByDay(evts),
    toolsByDay: foldToolsByDay(evts),
  }
}

/**
 * 效率看板聚合——兼容入口（v2.2 Task 4 起为薄折叠层）：签名与返回与 v2.1 完全一致。
 * sessionsData: [{ id, title, events }]（events 为原始事件数组；无会话可解析的 root 不进
 * 数组——与源 m=null 跳过口径一致），折叠成 FoldEntry 后交 aggregateFold。scan 以 dayStart=0
 * 采集（全部事件计入 metrics「今日」；pace/usage/summary 不消费 lines 当日性，与按本地零点
 * 采集对既有用例逐字段等价）。cfg: 看板 8 项配置（缺键逐键回退 BOARD_DEFAULTS）；
 * alertPrev: 上一轮 { dayTotal, grandTotal } 警报基线（缺省按 0 起步）。
 */
export function buildDashboard(sessionsData, cfg, now, alertPrev) {
  const nowMs = typeof now === 'number' && Number.isFinite(now) ? now : Date.now()
  const entries = (Array.isArray(sessionsData) ? sessionsData : []).flatMap((s) => {
    if (!s) return [] // 与原 `if (!s) continue` 同口径：假条目整条剔除
    const evts = Array.isArray(s.events) ? s.events : []
    const sid = s.id !== undefined && s.id !== null ? s.id : ''
    return [{
      id: sid,
      title: s.title || sid,
      scan: scanInfo(evts, 0),
      folded: foldEntry(evts),
      recentCount: events5mCount(evts, nowMs), // 兼容路径现算 5min 活跃数（引擎路径由缓存 recent 提供）
    }]
  })
  return aggregateFold(entries, cfg, now, alertPrev)
}

/**
 * 效率看板聚合核心（v2.2 Task 4 新导出纯函数）：消费折叠条目
 * FoldEntry: { id, title, scan: scanInfo 产物, folded: foldEntry 产物, recentCount?: number }。
 * 逐字段复刻 v2.1 buildDashboard 语义（pace / usage 五口径 / alerts / approvals / summary），
 * 仅新增 usage.models（当日 Top6 模型账）/ usage.tools（当日 Top5 工具账）/ usage.trend
 * （14 日 + 当日 24 整点桶）。recentCount：近 5 分钟活跃事件数——兼容层由 events5mCount
 * 现算，引擎由缓存 recent 裁剪提供。usage.counts 不在此产出：引擎组装时从 projects Map
 * 并入（本函数保持无会话表依赖）。
 */
export function aggregateFold(entries, cfg, now, alertPrev) {
  const sessions = Array.isArray(entries) ? entries : []
  const live = cfg && typeof cfg === 'object' ? cfg : {}
  // 配置门逐键判型回退（v1.4.0 cfgB/cfgN 原样语义）
  const cfgB = (k) => (typeof live[k] === 'boolean' ? live[k] : BOARD_DEFAULTS[k])
  const cfgN = (k) => (typeof live[k] === 'number' && Number.isFinite(live[k]) ? live[k] : BOARD_DEFAULTS[k])
  const nowMs = typeof now === 'number' && Number.isFinite(now) ? now : Date.now()
  const dayKey = dateKeyOf(nowMs)
  let aggTurnOpen = false, aggLastEvent = null, agg5m = 0
  let dayUsage = zeroUsage(), grandTotal = 0, latestSession = null, latestTime = -1
  let userEstToday = 0
  const approvals = []
  const perSessionMetrics = []
  for (const s of sessions) {
    if (!s) continue
    const sid = s.id !== undefined && s.id !== null ? s.id : ''
    const stitle = s.title || sid
    const info = s.scan
    const m = info && info.metrics
    if (m) {
      if (m.lastEventTime !== null) {
        if (m.lastEventTime > aggLastEvent) aggLastEvent = m.lastEventTime
        // 近 5 分钟窗口锚定 now（v1.4.0 已验证修正：陈旧会话尾巴不计入全局强度）
        agg5m += s.recentCount || 0
      }
      const hasOpenTurn = (info.latestTurnStartSeq !== null && info.lastEnd !== null && info.latestTurnStartSeq > info.lastEnd.seq)
        || (info.latestTurnStartSeq !== null && info.lastEnd === null)
      if (hasOpenTurn) aggTurnOpen = true
      const usage = s.folded.usage
      userEstToday += s.folded.userEstByDay[dayKey] || 0
      const dayB = usage.byDay[dayKey] || null
      if (dayB) for (const k of USAGE_KEYS) dayUsage[k] += dayB[k]
      grandTotal += usage.grand.inputTokens + usage.grand.outputTokens + usage.grand.cacheReadTokens + usage.grand.cacheWriteTokens
      if (m.lastEventTime !== null && m.lastEventTime > latestTime) {
        latestTime = m.lastEventTime
        const sB = dayB || zeroUsage()
        latestSession = { title: stitle, inputTokens: sB.inputTokens, outputTokens: sB.outputTokens, cacheReadTokens: sB.cacheReadTokens, cacheWriteTokens: sB.cacheWriteTokens }
      }
      perSessionMetrics.push({ title: stitle, turns: m.turns, errors: m.errors, toolCalls: m.toolCalls, toolDurMs: m.toolDurMs || {}, longestTurnMs: m.longestTurnMs })
      for (const pnd of m.pendingList) approvals.push({ id: sid + ':' + pnd.id, title: stitle, waitMin: Math.floor((nowMs - pnd.at) / 60000) })
    }
  }
  // ---------- v2.2 快照扩展三段（folded 已缓存，零重扫成本） ----------
  // ① models 当日账（R2）：从 byDayRoute[dayKey] 日切片聚合（Task 1 交叉维度，跨日旧账不污染）
  const routeDay = {}
  for (const s of sessions) {
    const dayRoute = s && s.folded && s.folded.usage.byDayRoute && s.folded.usage.byDayRoute[dayKey]
    if (!dayRoute) continue
    for (const [route, r] of Object.entries(dayRoute)) {
      const slash = route.indexOf('/')
      const a = routeDay[route] || (routeDay[route] = {
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
  // ①b tools 当日账（R5）：foldToolsByDay 的 { byDay } 日切片聚合（计数口径=带名 tool/call）
  const toolDay = {}
  for (const s of sessions) {
    const day = s && s.folded && s.folded.toolsByDay && s.folded.toolsByDay.byDay && s.folded.toolsByDay.byDay[dayKey]
    if (!day) continue
    for (const [name, v] of Object.entries(day)) {
      const a = toolDay[name] || (toolDay[name] = { name, count: 0, durMs: 0 })
      a.count += v.count || 0
      a.durMs += v.durMs || 0
    }
  }
  // ---------- pace 档位 / 阈值警报 / 黑板汇总 ----------
  let paceState = { tier: 'idle', label: PACE_LABELS.idle, sinceMs: null }
  if (cfgB('paceEnabled')) {
    paceState = derivePaceTier({ turnOpen: aggTurnOpen, lastEventTime: aggLastEvent, eventCount5m: agg5m }, nowMs, {
      intenseEvents: cfgN('paceIntenseEvents'),
      longrunSilentMs: cfgN('paceLongrunMin') * 60000,
      loafStartMs: cfgN('paceLoafStartMin') * 60000,
    })
  }
  const dayTotal = dayUsage.inputTokens + dayUsage.outputTokens + dayUsage.cacheReadTokens + dayUsage.cacheWriteTokens
  const prev = alertPrev && typeof alertPrev === 'object' ? alertPrev : { dayTotal: 0, grandTotal: 0 }
  const newAlerts = cfgB('usageEnabled')
    ? evaluateAlerts(prev, { dayTotal, grandTotal }, { dayLimitTokens: cfgN('dayLimitTokens'), milestoneUnit: cfgN('milestoneUnit') }, dayKey)
    : []
  // 黑板汇总每轮重算覆盖（v1.4.0 summaryState 语义：无跨轮粘滞）
  const summaryState = summarize(perSessionMetrics, dayUsage, userEstToday)
  // Task 7 增量（黑板行双语结构化）：在 zh 字符串之外追加 RAW 数值字段（tokens/toolRows/longest），
  // 客户端 t()+fmtTokens 拼装——zh 拼装与上方 zh 字符串逐字节一致（test/state-dashboard 同源断言钉住）
  const summaryStructured = summarizeStructured(perSessionMetrics, dayUsage, userEstToday)
  return {
    pace: cfgB('paceEnabled') ? paceState : null, // 关闭时不下发档位：客户端据此清掉旧档位（关闭语义）
    usage: {
      day: dayUsage,
      // 五口径派生（2026-09-10 用户裁定）：请求输入=全文累计；命中率=命中/请求输入；用户输入为启发式估算
      requestTotal: dayUsage.inputTokens + dayUsage.cacheReadTokens,
      cacheHitRate: hitRate(dayUsage),
      userEst: userEstToday,
      session: latestSession === null ? null : Object.assign({}, latestSession, {
        requestTotal: latestSession.inputTokens + latestSession.cacheReadTokens,
      }),
      grandTotal,
      // v2.2 R2/R5/R3 快照扩展：当日模型 Top6 / 当日工具 Top5 / 14 日+24 桶趋势。
      // models 由 v2.1 的 {} 二期占位桶转正为 RouteAgg[]（客户端 UsageSnapshot.models / Board 消费数组）。
      models: Object.values(routeDay).sort((a, b) => b.requestTotal - a.requestTotal).slice(0, 6),
      tools: Object.values(toolDay).sort((a, b) => b.count - a.count).slice(0, 5),
      trend: buildTrend(sessions.map((s) => (s && s.folded) ? s.folded.usage : null), nowMs),
    },
    alerts: newAlerts,
    approvals: cfgN('approvalFlickerMin') > 0 ? approvals.filter((x) => x.waitMin >= 0) : [],
    // summary：zh 字符串（tokensText/toolsText/longestText，29 用例字节契约）+ Task 7 结构化增量字段
    summary: { ...summaryState, ...summaryStructured },
  }
}

/**
 * 状态引擎：持有 projects Map 与完成队列，compute() 每轮重算。
 * deps: { roots(), getSession(id), getTitle(session), now(), readConfig?() }
 * readConfig（可选）: () => 看板 8 项配置；缺失/抛错时逐键回退 BOARD_DEFAULTS（默认门全开）。
 */
export function createStateEngine(deps) {
  const projects = new Map()
  const queue = []
  let seq = 0
  // ---------- 效率看板状态（跨轮询保留；v1.4.0 alertPrev/dashState 语义移植）----------
  let alertPrev = { dayTotal: 0, grandTotal: 0 } // 警报基线：无论 usageEnabled 与否每轮都推进，避免开启瞬间补发旧警报
  let dashState = null // dashboard() 在首轮 compute 前为 null
  // ---------- v2.2 Task 4（R1/P1 增量缓存）----------
  // 已知边界（fp 缓存设计取舍，接受）：缓存行内的 scan 指标（turns/errors/tool 计数）按采集
  // 时刻的「今日」算好随 fp 缓存——空闲会话跨零点后这些当日计数保持午夜前的旧值，直到该会话
  // 下一个事件（fp 变化触发重扫）才刷新。当日性随会话活动即时自愈，不为跨零点空闲专门重扫。
  const foldCache = new Map() // agentId → { fp, scan, folded, recent: number[] }；fp=事件数:末事件 seq
  const stats = { rescans: 0 } // 诊断计数：累计实际重扫次数（含首轮；fp 未变的轮次复用缓存不计数）
  let trendCache = { hourKey: null, value: null } // trend 整点锚定节流（R3）

  const compute = () => {
    const roots = (() => { try { return deps.roots() || [] } catch { return [] } })()
    const seen = new Set()
    const now = deps.now()
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
    const boardEntries = []
    const rescansBefore = stats.rescans // 本轮是否有任一指纹变化（trend 节流判据之一）
    for (const a of roots) {
      if (!a || a.id === undefined || a.id === null) continue
      seen.add(a.id)
      let info = { title: null, lines: [], lastEnd: null, latestTurnStartSeq: null, pendingApproval: false, metrics: null }
      let boardEntry = null
      try {
        const session = deps.getSession(a.id)
        if (session) {
          const evts = sessionEvents(session) // 只采集一次：指纹 / scanSession / foldEntry 共用
          const last = evts.length > 0 ? evts[evts.length - 1] : null
          const fp = evts.length + ':' + (last && typeof last.seq === 'number' ? last.seq : -1)
          let c = foldCache.get(a.id)
          if (!c || c.fp !== fp) {
            stats.rescans += 1
            const recent = []
            for (const e of evts) if (e && typeof e.time === 'number' && ACTIVITY_TYPES.has(e.type) && e.time > now - 300000) recent.push(e.time)
            c = { fp, scan: scanSession(session, deps.getTitle, dayStart.getTime(), evts), folded: foldEntry(evts), recent }
            foldCache.set(a.id, c)
          } else {
            // 5 分钟活跃窗滑动：只裁剪，不重扫（谓词与 events5mCount 一致：time > now-300000）
            while (c.recent.length > 0 && c.recent[0] <= now - 300000) c.recent.shift()
          }
          // P1 核心：derive/状态卡/age/看板全部读缓存 scan（时间派生量由 aggregateFold 每轮从缓存重算）
          info = c.scan
          boardEntry = { id: a.id, title: info.title || a.id, scan: c.scan, folded: c.folded, recentCount: c.recent.length }
        }
      } catch { /* keep defaults */ }
      if (boardEntry) boardEntries.push(boardEntry)
      const prev = projects.get(a.id)
      const newCompletion = prev !== undefined && info.lastEnd !== null && info.lastEnd.seq > (prev.lastTurnEndSeq || -1)
      const derived = derive(a, info, prev, newCompletion)
      projects.set(a.id, {
        lastTurnEndSeq: info.lastEnd !== null ? info.lastEnd.seq : (prev ? prev.lastTurnEndSeq : -1),
        status: derived ? derived.status : null,
        unread: derived ? derived.unread : false,
        title: (derived && derived.title) ? derived.title : ((prev && prev.title) ? prev.title : a.id),
        lines: derived ? derived.lines : [],
        vanishAt: null,
        // 卡片年龄标注（v1.4.0 同款）：最后事件距今；无任何事件时 NaN → ageLabel 归 ''
        age: ageLabel(info.metrics && info.metrics.lastEventTime != null ? Math.round((now - info.metrics.lastEventTime) / 1000) : NaN),
      })
      if (derived !== null && derived.status === 'done' && newCompletion) {
        queue.push({ seq: ++seq, at: now, agentId: a.id })
        if (queue.length > 8) queue.shift()
      }
    }
    // 从 roots 消失的项目：运行中消失=断联（红）；否则隐藏，60s 后清理
    for (const [id, p] of projects) {
      if (seen.has(id)) { p.vanishAt = null; continue }
      if (p.status === 'running') { p.status = 'error'; p.unread = true; p.lines = ['断联'] }
      else if (p.status === 'done' || p.status === null) { p.status = null; p.unread = false }
      p.vanishAt = p.vanishAt || now
      if (now - p.vanishAt > 60000) projects.delete(id)
    }
    // ---------- 效率看板：pace 档位 / 阈值警报 / 黑板汇总 → dashState ----------
    // 配置门读 live 值（readConfig 缺失或抛错时逐键回退默认——默认门全开）
    const cfgRaw = (() => {
      try {
        const v = deps.readConfig ? deps.readConfig() : {}
        return v && typeof v === 'object' ? v : {}
      } catch { return {} }
    })()
    dashState = aggregateFold(boardEntries, cfgRaw, now, alertPrev)
    // v2.2 usage.counts（MiniBar 计数口径 follow-up）：引擎侧从 projects Map 并入
    // （与 list() 同口径：仅 status 非空的项目计数；aggregateFold 不产 counts）
    const counts = { approval: 0, running: 0, done: 0 }
    for (const p of projects.values()) {
      if (!p || !p.status) continue
      if (p.status === 'approval') counts.approval += 1
      else if (p.status === 'running') counts.running += 1
      else if (p.status === 'done') counts.done += 1
    }
    dashState.usage.counts = counts
    // trend 节流（R3 整点锚定）：整点变化或本轮任一指纹变化才采纳重算结果，否则复用缓存
    // （同整点且 folded 未变 → 重算值与缓存值等价，替换为纯性能优化）
    const hk = hourKeyOf(now)
    if (trendCache.hourKey !== hk || stats.rescans !== rescansBefore) {
      trendCache = { hourKey: hk, value: dashState.usage.trend }
    } else {
      dashState.usage.trend = trendCache.value
    }
    // 警报基线推进：无论 usageEnabled 与否都推进（v1.4.0 alertPrev 语义），数值取自本轮聚合结果
    const du = dashState.usage.day
    alertPrev = { dayTotal: du.inputTokens + du.outputTokens + du.cacheReadTokens + du.cacheWriteTokens, grandTotal: dashState.usage.grandTotal }
  }

  const list = () => {
    const out = []
    for (const [id, p] of projects) {
      if (!p || !p.status) continue
      out.push({ id, title: p.title || id, lines: p.lines || [], status: p.status, unread: !!p.unread, age: p.age || '' })
    }
    const rank = { error: 0, approval: 1, running: 2, done: 3 }
    out.sort((a, b) => (rank[a.status] - rank[b.status]) || String(a.title).localeCompare(String(b.title), 'zh'))
    return out
  }

  // ---------- v2.2 Task 6（P3/R3）：内容修订号 + 跨日区间汇总 ----------
  // contentRev：本轮 compute 后的内容变更令牌（/state ?since 短路判据）。组成 = list() 各行
  // id:status:unread:title:lines（'|' 连接）+ 完成队列长度 + 当日请求输入 + 累计总量 + pace 档位
  // + 警报 id + 审批最大等待分钟（取整），以 '#' 连接。id 进行串（终审修复：纯行内容会把
  // 不同 id 同内容的两张卡折成同一令牌）；审批等待取 dashState.approvals（与看板同源，
  // aggregateFold 每轮以当前 now 重算 waitMin）的最大值向下取整——挂起审批期间 rev 每整分钟
  // 推进一次，客户端 waitMin 门槛（标题闪烁）不再被稳定 rev 冻结。age 刻意不参与（ages 每轮
  // 都在变的派生量，进 rev 会让短路永不命中）。
  const contentRev = () => {
    const rows = list().map((p) => `${p.id}:${p.status}:${p.unread ? 1 : 0}:${p.title || ''}:${(p.lines || []).join('/')}`).join('|')
    const d = dashState || {}
    const u = d.usage || {}
    const alerts = Array.isArray(d.alerts) ? d.alerts : []
    const approvals = Array.isArray(d.approvals) ? d.approvals : []
    let maxWaitMin = 0
    for (const a of approvals) {
      const w = a && typeof a.waitMin === 'number' && Number.isFinite(a.waitMin) ? Math.floor(a.waitMin) : 0
      if (w > maxWaitMin) maxWaitMin = w
    }
    return [
      rows,
      queue.length,
      // 队列末 seq（review Important#1）：队列帽 8 后长度恒定，零用量补完成若不同时改变行内容，
      // 仅靠 length 的 rev 会误判 unchanged，completion 被 mergeUnchanged 的 seq 推进永久吞掉。
      queue.length ? queue[queue.length - 1].seq : 0,
      u.requestTotal || 0,
      u.grandTotal || 0,
      d.pace ? d.pace.tier : '',
      alerts.map((a) => (a && a.id != null) ? String(a.id) : '').join(','),
      maxWaitMin,
    ].join('#')
  }
  // rangeSummary（/dashboard/range，R3）：遍历 foldCache 折叠产物交 Task 2 summarizeRange
  // （usage 三维账 / 工具按日 / 用户输入按日估算）——指纹未变的会话零重扫，直接吃缓存。
  const rangeSummary = (fromKey, toKey) => {
    const folds = [], tools = [], ests = []
    for (const c of foldCache.values()) {
      folds.push(c.folded.usage)
      tools.push(c.folded.toolsByDay)
      ests.push(c.folded.userEstByDay)
    }
    return summarizeRange(folds, tools, ests, fromKey, toKey)
  }

  return {
    compute,
    list,
    projects,
    queue,
    dashboard: () => dashState, // 效率看板聚合（首轮 compute 前为 null）
    get stats() { return stats }, // v2.2 诊断：rescans 重扫计数（测试/Task 6 contentRev 消费）
    ack(agentId) {
      const p = projects.get(agentId)
      if (p) p.unread = false
    },
    nextSeq: () => seq,
    contentRev, // v2.2 Task 6：内容修订号（/state ?since 短路 + 全量快照顶层 rev）
    rangeSummary, // v2.2 Task 6：/dashboard/range 的引擎入口（R3）
  }
}
