// state.js — 项目状态聚合（B1 兼容修复：rc.1 Session 用 snapshotEvents() 方法，
// 旧的会话事件数组属性已删除）。判定逻辑与 v1.3.0 完全一致：
//   优先级 error > approval > running > done；红灯已读即消失；断联=运行中从 roots 消失。
// 纯逻辑工厂 createStateEngine(deps)，便于 vitest 直接喂假会话。

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

/** 会话扫描：标题 / 最新2行状态 / 待批准 / 最近 turn/end（与 v1.3.0 相同） */
export function scanSession(session, getTitle) {
  let title = null
  if (typeof getTitle === 'function') {
    try {
      const snap = getTitle(session)
      if (snap && typeof snap.title === 'string' && snap.title) title = snap.title
    } catch { /* keep null */ }
  }
  const lines = []
  let lastEnd = null
  let latestTurnStartSeq = null
  let pendingApproval = false
  const events = readEvents(session)
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
  return { title, lines, lastEnd, latestTurnStartSeq, pendingApproval }
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
 * 状态引擎：持有 projects Map 与完成队列，compute() 每轮重算。
 * deps: { roots(), getSession(id), getTitle(session), now() }
 */
export function createStateEngine(deps) {
  const projects = new Map()
  const queue = []
  let seq = 0

  const compute = () => {
    const roots = (() => { try { return deps.roots() || [] } catch { return [] } })()
    const seen = new Set()
    const now = deps.now()
    for (const a of roots) {
      if (!a || a.id === undefined || a.id === null) continue
      seen.add(a.id)
      let info = { title: null, lines: [], lastEnd: null, latestTurnStartSeq: null, pendingApproval: false }
      try {
        const session = deps.getSession(a.id)
        if (session) info = scanSession(session, deps.getTitle)
      } catch { /* keep defaults */ }
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
  }

  const list = () => {
    const out = []
    for (const [id, p] of projects) {
      if (!p || !p.status) continue
      out.push({ id, title: p.title || id, lines: p.lines || [], status: p.status, unread: !!p.unread })
    }
    const rank = { error: 0, approval: 1, running: 2, done: 3 }
    out.sort((a, b) => (rank[a.status] - rank[b.status]) || String(a.title).localeCompare(String(b.title), 'zh'))
    return out
  }

  return {
    compute,
    list,
    projects,
    queue,
    ack(agentId) {
      const p = projects.get(agentId)
      if (p) p.unread = false
    },
    nextSeq: () => seq,
  }
}
