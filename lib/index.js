// Foxbell桌宠 — 持久化 Host 插件（随 dsh web 自动加载）
// 素材从插件包自带目录 assets/ 读取；客户端通过 HTTP 路由交互：
//   /dyn-pet-foxbell/state        → 项目状态快照（JSON）
//   /dyn-pet-foxbell/ack?agentId= → 标记项目"已读"
//   /dyn-pet-foxbell/spritesheet.webp / voice/<i> → 素材

import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { sessionEvents, derivePaceTier, PACE_LABELS, foldUsage, dateKeyOf, evaluateAlerts, summarize, ageLabel, zeroUsage } from './dashboard.js'

export const name = 'dsh-foxbell-pet'

// settings 命名空间：与 client 半卡片注册（settings.plugin.item 的 key）配对。
// 两边写同一个字符串，改名必须两边一起改。
export const FOXBELL_PET_NS = 'foxbell-pet'
export const ACTION_IDS = ['jumping', 'waving', 'failed', 'waiting', 'review', 'running']
const Action = z.union(ACTION_IDS)
export const Config = z.object({
  muted: z.boolean().default(false),
  talkative: z.boolean().default(true),
  doneAction: Action.default('jumping'),
  dblAction: Action.default('waving'),
  approvalAction: Action.default('waiting'),
  errorAction: Action.default('failed'),
  gravity: z.boolean().default(true),
  // ---------- 效率看板（spec 2026-09-09）：宿主聚合 + 客户端渲染共用的 12 项新配置 ----------
  paceEnabled: z.boolean().default(true),
  paceIntenseEvents: z.number().default(12),
  paceLongrunMin: z.number().default(3),
  paceLoafStartMin: z.number().default(15),
  usageEnabled: z.boolean().default(true),
  dayLimitTokens: z.number().default(0),
  milestoneUnit: z.number().default(1000000),
  approvalFlickerMin: z.number().default(5),
  summaryEnabled: z.boolean().default(true),
  summaryEntrySec: z.number().default(15),
  boardTtlSec: z.number().default(15),
  ttsEnabled: z.boolean().default(false),
})

// 硬依赖注入：等待这些宿主服务就绪后再 apply（持久插件在 composition 根挂载，
// 不像动态插件在会话上下文里服务已齐全）。
export const inject = ['webServer', 'fs', 'agents', 'sessions', 'sessionTitle']

export async function apply(ctx, config) {
  // 组合配置非法值不应拖垮整个插件：解析失败回落默认 schema 值
  let entry
  try { entry = Config(config ?? {}) } catch { entry = Config({}) }
  // 设置注册走宿主 settings 服务（dsh ≥ 0.1.2-rc.1；v2.0.0 spec FR-2 最小子集）。
  // 服务是异步就绪的：apply 时刻 ctx.get 多半为空，须 ctx.inject 等服务到位再注册
  // （in-tree llm-deepseek/llm-pi-ai 同款姿势）。attach 时 setSource 交回 scope live
  // getter，detach 时服务侧回退 () => entry；更老宿主无此服务 → 回调不运行，宠物照常。
  let configSource = () => entry
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, FOXBELL_PET_NS, Config, entry, {
      setSource: (current) => { if (typeof current === 'function') configSource = current },
      onChange: () => {},
    })
  })
  // 插件包目录（<pkg>/lib/index.js → <pkg>/），素材放在 <pkg>/assets/
  const PKG_DIR = fileURLToPath(new URL('../', import.meta.url))
  const sp = ctx.get('sandboxPolicy')
  const workspaceRoot = (sp && typeof sp === 'object' && typeof sp.workspaceRoot === 'string') ? sp.workspaceRoot : null
  const candidates = [
    PKG_DIR + 'assets', // 包内自带素材（安装即用，无需手动放素材）
  ]
  if (workspaceRoot) candidates.push(workspaceRoot + '/foxbell')

  let seq = 0
  const queue = []
  let spriteBytes = null
  let ASSET_DIR = null
  const voices = []
  const projects = new Map()
  const diag = { fsAvailable: false, workspaceRoot, probes: candidates.slice(), loadError: null, computeCount: 0, clientVisible: null }

  // ---------- 效率看板状态（跨轮询保留）----------
  let alertPrev = { dayTotal: 0, grandTotal: 0 } // 警报基线：无论 usageEnabled 与否每轮都推进，避免开启瞬间补发旧警报
  let paceState = { tier: 'idle', label: PACE_LABELS.idle, sinceMs: null }
  let summaryState = null
  let dashState = null

  const agents = ctx.get('agents')

  // ---------- 素材加载 ----------
  try {
    const fs = ctx.get('fs')
    if (fs === undefined) {
      diag.loadError = 'fs service unavailable via ctx.get(fs)'
    } else {
      diag.fsAvailable = true
      for (const dir of candidates) {
        try {
          const probe = await fs.resolve(dir + '/spritesheet.webp')
          const st = await fs.stat(probe)
          if (st && typeof st.size === 'number') { ASSET_DIR = dir; break }
        } catch (err) { diag.loadError = diag.loadError || ('probe failed: ' + dir + ' -> ' + String(err && err.message || err)) }
      }
      if (ASSET_DIR !== null) {
        const spriteTarget = await fs.resolve(ASSET_DIR + '/spritesheet.webp')
        const st = await fs.stat(spriteTarget)
        if (st && typeof st.size === 'number') spriteBytes = await fs.readBytes(spriteTarget, undefined, st.size + 1)
        let index = 0
        // 语音按子文件夹分组：顶层文件 → general；子文件夹 → 文件夹名作组（approval/error/done/...）
        const loadVoiceFiles = async (target, group) => {
          let entries = []
          try { entries = await fs.listDir(target) } catch (err) { if (group === 'general') diag.loadError = diag.loadError || ('voice dir failed: ' + String(err && err.message || err)); return }
          const files = entries.filter((e) => e && e.type === 'file' && /\.(m4a|mp4)$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
          for (const e of files) {
            try {
              const info = await fs.stat(e.target)
              const bytes = info && typeof info.size === 'number' ? await fs.readBytes(e.target, undefined, info.size + 1) : null
              if (bytes && bytes.length > 0) { voices.push({ index, name: e.name.replace(/\.(m4a|mp4)$/i, ''), bytes, group }); index += 1 }
            } catch (err) { console.error('voice load failed:', String(err && err.message || err)) }
          }
        }
        let voiceTarget = null
        try { voiceTarget = await fs.resolve(ASSET_DIR + '/voice') } catch {}
        if (voiceTarget) {
          await loadVoiceFiles(voiceTarget, 'general')
          let voiceTop = []
          try { voiceTop = await fs.listDir(voiceTarget) } catch { voiceTop = [] }
          for (const d of voiceTop) {
            if (d && d.type === 'directory') await loadVoiceFiles(d.target, d.name)
          }
        }
        // 无 voice 目录（素材平铺）时的兜底
        if (index === 0) await loadVoiceFiles(await fs.resolve(ASSET_DIR), 'general')
      }
    }
  } catch (err) {
    diag.loadError = diag.loadError || ('asset load failed: ' + String(err && err.message || err))
    console.error('asset load failed:', String(err && err.message || err))
  }

  // ---------- 文本助手 ----------
  const blocksText = (blocks) => {
    if (!Array.isArray(blocks)) return ''
    return blocks
      .filter((b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
  }
  const estimateTokens = (s) => {
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
  const truncate = (s, maxTokens) => {
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

  // ---------- 效率看板聚合（spec 2026-09-09 §6）----------
  const USAGE_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
  const ACTIVITY_TYPES = new Set(['user/message', 'assistant/message', 'tool/call', 'tool/result', 'turn/start', 'turn/end', 'approval/asked', 'approval/decided'])
  // 近 5 分钟活跃事件数（pace 高强度判定输入）
  const events5mCount = (evts, nowMs) => evts.filter((e) => e && typeof e.time === 'number' && e.time > nowMs - 300000 && ACTIVITY_TYPES.has(e.type)).length

  // ---------- 会话扫描：标题 / 最新2行状态 / 待批准 / 最近 turn/end / 看板指标 ----------
  // evts 可选：调用方已 sessionEvents(session) 采集过时传入复用，避免 snapshotEvents 重复分配
  const scanSession = (session, dayStartMs, evts) => {
    let title = null
    const st = ctx.get('sessionTitle')
    if (st !== undefined) {
      const snap = st.get(session)
      if (snap && typeof snap.title === 'string' && snap.title) title = snap.title
    }
    const events = evts || sessionEvents(session)
    // 正向一遍：今日 turns/errors/toolCalls、最长 turn、最后事件时间、审批 ask 列表（效率看板指标）
    // toolStart/toolDurMs：工具耗时配对（spec 6.4 指标集「工具调用 Top3（次数+耗时）」）
    const metrics = { turns: 0, errors: 0, toolCalls: {}, toolStart: {}, toolDurMs: {}, longestTurnMs: 0, turnStartAt: {}, lastEventTime: null, pendingList: [] }
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]
      const d = ev && ev.data
      if (!d || typeof ev.time !== 'number') continue
      if (ev.time > metrics.lastEventTime) metrics.lastEventTime = ev.time
      const today = ev.time >= dayStartMs
      if (ev.type === 'turn/start') { if (today) metrics.turns += 1; metrics.turnStartAt[d.turn] = ev.time }
      else if (ev.type === 'turn/end') {
        const r = d.reason
        if (today && r && (r.kind === 'error' || r.kind === 'interrupted')) metrics.errors += 1
        const startAt = metrics.turnStartAt[d.turn]
        if (typeof startAt === 'number' && today && ev.time - startAt > metrics.longestTurnMs) metrics.longestTurnMs = ev.time - startAt
      } else if (ev.type === 'tool/call' && typeof d.name === 'string' && today) {
        metrics.toolCalls[d.name] = (metrics.toolCalls[d.name] || 0) + 1
        if (d.callId !== undefined && d.callId !== null) metrics.toolStart[d.callId] = { name: d.name, at: ev.time }
      } else if (ev.type === 'tool/result') {
        // tool/result 经 message.source.callId（兜底首块 toolCallId）与 tool/call 配对；一次性消费，累计耗时
        const msg = d.message
        const callId = (msg && msg.source && msg.source.callId)
          || (msg && Array.isArray(msg.content) && msg.content[0] && msg.content[0].toolCallId)
        const start = (callId !== undefined && callId !== null) ? metrics.toolStart[callId] : null
        if (start) {
          metrics.toolDurMs[start.name] = (metrics.toolDurMs[start.name] || 0) + Math.max(0, ev.time - start.at)
          delete metrics.toolStart[callId]
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
    return { title, lines, lastEnd, latestTurnStartSeq, pendingApproval, metrics }
  }

  // ---------- 状态推导（优先级 error > approval > running > done）----------
  const derive = (a, info, prev, newCompletion) => {
    const endIsError = info.lastEnd !== null && (info.lastEnd.kind === 'error' || info.lastEnd.kind === 'interrupted')
    const hasNewerTurn = info.latestTurnStartSeq !== null && info.lastEnd !== null && info.latestTurnStartSeq > info.lastEnd.seq
    if (endIsError && !hasNewerTurn) {
      // 红灯已读即消失：新错误（或首轮加载时已存在的错误）显示红灯；用户 ack 后隐藏，再次报错重新亮红
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

  const computeProjects = () => {
    diag.computeCount += 1
    const sessions = ctx.get('sessions')
    const roots = agents !== undefined ? (() => { try { return agents.roots() } catch { return [] } })() : []
    const seen = new Set()
    const now = Date.now()
    // ---------- 效率看板聚合（spec 2026-09-09 §6）----------
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    const dayKey = dateKeyOf(now)
    let aggTurnOpen = false, aggLastEvent = null, agg5m = 0
    let dayUsage = zeroUsage(), grandTotal = 0, latestSession = null, latestTime = -1
    const approvals = []
    const perSessionMetrics = []
    for (const a of roots) {
      if (!a || a.id === undefined || a.id === null) continue
      seen.add(a.id)
      let info = { title: null, lines: [], lastEnd: null, latestTurnStartSeq: null, pendingApproval: false, metrics: null }
      let sessionEvts = null
      try {
        const session = sessions !== undefined ? sessions.get(a.id) : undefined
        if (session) {
          sessionEvts = sessionEvents(session) // 只采集一次：scanSession / foldUsage / 5min 活跃计数共用
          info = scanSession(session, dayStart.getTime(), sessionEvts)
        }
      } catch { /* keep defaults */ }
      // 看板：跨会话聚合 pace / token 三分账 / 审批 / 黑板信号
      const m = info.metrics
      if (m) {
        if (m.lastEventTime !== null) {
          if (m.lastEventTime > aggLastEvent) aggLastEvent = m.lastEventTime
          // 近 5 分钟窗口锚定 now（spec 6.1 高强度判定：近 5 分钟事件数），陈旧会话尾巴不计入全局强度
          agg5m += events5mCount(sessionEvts || [], now)
        }
        const hasOpenTurn = (info.latestTurnStartSeq !== null && info.lastEnd !== null && info.latestTurnStartSeq > info.lastEnd.seq)
          || (info.latestTurnStartSeq !== null && info.lastEnd === null)
        if (hasOpenTurn) aggTurnOpen = true
        const usage = sessionEvts ? foldUsage(sessionEvts) : { byDay: {}, grand: zeroUsage() }
        const dayB = usage.byDay[dayKey] || null
        if (dayB) for (const k of USAGE_KEYS) dayUsage[k] += dayB[k]
        grandTotal += usage.grand.inputTokens + usage.grand.outputTokens + usage.grand.cacheReadTokens + usage.grand.cacheWriteTokens
        if (m.lastEventTime !== null && m.lastEventTime > latestTime) {
          latestTime = m.lastEventTime
          const sB = dayB || zeroUsage()
          latestSession = { title: info.title || a.id, inputTokens: sB.inputTokens, outputTokens: sB.outputTokens, cacheReadTokens: sB.cacheReadTokens, cacheWriteTokens: sB.cacheWriteTokens }
        }
        perSessionMetrics.push({ title: info.title || a.id, turns: m.turns, errors: m.errors, toolCalls: m.toolCalls, toolDurMs: m.toolDurMs || {}, longestTurnMs: m.longestTurnMs })
        for (const pnd of m.pendingList) approvals.push({ id: a.id + ':' + pnd.id, title: info.title || a.id, waitMin: Math.floor((now - pnd.at) / 60000) })
      }
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
        age: ageLabel(m && m.lastEventTime != null ? Math.round((now - m.lastEventTime) / 1000) : NaN),
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
    // 宿主侧配置门读 live 值（设置卡改动当轮生效），逐键回退到 schema 默认快照
    const live = (() => { try { const v = configSource(); return v && typeof v === 'object' ? v : entry } catch { return entry } })()
    const cfgB = (k) => (typeof live[k] === 'boolean' ? live[k] : entry[k])
    const cfgN = (k) => (typeof live[k] === 'number' && Number.isFinite(live[k]) ? live[k] : entry[k])
    if (cfgB('paceEnabled')) {
      paceState = derivePaceTier({ turnOpen: aggTurnOpen, lastEventTime: aggLastEvent, eventCount5m: agg5m }, now, {
        intenseEvents: cfgN('paceIntenseEvents'),
        longrunSilentMs: cfgN('paceLongrunMin') * 60000,
        loafStartMs: cfgN('paceLoafStartMin') * 60000,
      })
    }
    const dayTotal = dayUsage.inputTokens + dayUsage.outputTokens + dayUsage.cacheReadTokens + dayUsage.cacheWriteTokens
    const newAlerts = cfgB('usageEnabled')
      ? evaluateAlerts(alertPrev, { dayTotal, grandTotal }, { dayLimitTokens: cfgN('dayLimitTokens'), milestoneUnit: cfgN('milestoneUnit') }, dayKey)
      : []
    alertPrev = { dayTotal, grandTotal } // 无论开关都推进基线，避免稍后开启时补发旧警报
    summaryState = summarize(perSessionMetrics, dayUsage)
    dashState = {
      pace: cfgB('paceEnabled') ? paceState : null, // 关闭时不下发档位：客户端据此清掉旧档位（关闭语义）
      // 二期预留（issue #4 F05）：按模型分布空桶——harness 事件暂无 model 字段（spec 附录 A），结构先立
      usage: { day: dayUsage, session: latestSession, grandTotal, models: {} },
      alerts: newAlerts,
      approvals: cfgN('approvalFlickerMin') > 0 ? approvals.filter((x) => x.waitMin >= 0) : [],
      summary: summaryState,
    }
  }

  const projectsList = () => {
    const out = []
    for (const [id, p] of projects) {
      if (!p || !p.status) continue
      out.push({ id, title: p.title || id, lines: p.lines || [], status: p.status, unread: !!p.unread, age: p.age || '' })
    }
    const rank = { error: 0, approval: 1, running: 2, done: 3 }
    out.sort((a, b) => (rank[a.status] - rank[b.status]) || String(a.title).localeCompare(String(b.title), 'zh'))
    return out
  }

  const snapshot = () => ({
    seq,
    completions: queue,
    runningSessions: projectsList().filter((p) => p.status === 'running').length,
    projects: projectsList(),
    dashboard: dashState,
    voices: voices.map((v) => ({ index: v.index, name: v.name, group: v.group || 'general' })),
  })

  const json = (res, body) => {
    const bytes = new TextEncoder().encode(body).length
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(bytes), 'cache-control': 'no-store' })
    res.end(body)
  }

  computeProjects()

  // ---------- HTTP 路由 ----------
  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    if (spriteBytes !== null) {
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dyn-pet-foxbell/spritesheet.webp',
        handler(req, res) {
          res.writeHead(200, { 'content-type': 'image/webp', 'content-length': String(spriteBytes.length), 'cache-control': 'public, max-age=3600' })
          res.end(spriteBytes)
        },
      }))
    }
    for (const v of voices) {
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dyn-pet-foxbell/voice/' + v.index,
        handler(req, res) {
          res.writeHead(200, { 'content-type': 'audio/mp4', 'content-length': String(v.bytes.length), 'cache-control': 'public, max-age=3600' })
          res.end(v.bytes)
        },
      }))
    }
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dyn-pet-foxbell/state',
      handler(req, res) {
        computeProjects()
        json(res, JSON.stringify(Object.assign(snapshot(), { assetDir: ASSET_DIR, spriteBytes: spriteBytes ? spriteBytes.length : null, diag })))
      },
    }))
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dyn-pet-foxbell/ack',
      handler(req, res) {
        let agentId = null
        try {
          const u = new URL(req.url || '/', 'http://x')
          agentId = u.searchParams.get('agentId')
        } catch { /* ignore */ }
        if (typeof agentId === 'string') {
          const p = projects.get(agentId)
          if (p) p.unread = false
        }
        json(res, JSON.stringify({ ok: true }))
      },
    }))
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dyn-pet-foxbell/client-diag',
      handler(req, res) {
        // 客户端上报它的 petStore.visible（0/1），用于诊断"宠物不显示"问题
        try {
          const u = new URL(req.url || '/', 'http://x')
          const v = u.searchParams.get('visible')
          if (v === '0' || v === '1') diag.clientVisible = v
        } catch { /* ignore */ }
        json(res, JSON.stringify({ ok: true }))
      },
    }))
    console.log('[foxbell-pet] host mounted: sprite=' + (spriteBytes ? spriteBytes.length : 0) + ' voices=' + voices.length + ' assetDir=' + ASSET_DIR)
  }
}
