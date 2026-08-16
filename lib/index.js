// Foxbell桌宠 — 持久化 Host 插件（随 dsh web 自动加载）
// 素材从插件包自带目录 assets/ 读取；客户端通过 HTTP 路由交互：
//   /dyn-pet-foxbell/state        → 项目状态快照（JSON）
//   /dyn-pet-foxbell/ack?agentId= → 标记项目"已读"
//   /dyn-pet-foxbell/spritesheet.webp / voice/<i> → 素材

import { fileURLToPath } from 'node:url'

export const name = 'dsh-foxbell-pet'

// 硬依赖注入：等待这些宿主服务就绪后再 apply（持久插件在 composition 根挂载，
// 不像动态插件在会话上下文里服务已齐全）。
export const inject = ['webServer', 'fs', 'agents', 'sessions', 'sessionTitle']

export async function apply(ctx) {
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
        let entries = []
        try { entries = await fs.listDir(await fs.resolve(ASSET_DIR + '/voice')) } catch (err) { diag.loadError = diag.loadError || ('voice dir failed: ' + String(err && err.message || err)) }
        if (entries.length === 0) { try { entries = await fs.listDir(await fs.resolve(ASSET_DIR)) } catch { entries = [] } }
        const files = entries.filter((e) => e && e.type === 'file' && /\.(m4a|mp4)$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
        let index = 0
        for (const e of files) {
          try {
            const info = await fs.stat(e.target)
            const bytes = info && typeof info.size === 'number' ? await fs.readBytes(e.target, undefined, info.size + 1) : null
            if (bytes && bytes.length > 0) { voices.push({ index, name: e.name.replace(/\.(m4a|mp4)$/i, ''), bytes }); index += 1 }
          } catch (err) { console.error('voice load failed:', String(err && err.message || err)) }
        }
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

  // ---------- 会话扫描：标题 / 最新2行状态 / 待批准 / 最近 turn/end ----------
  const scanSession = (session) => {
    let title = null
    const st = ctx.get('sessionTitle')
    if (st !== undefined) {
      const snap = st.get(session)
      if (snap && typeof snap.title === 'string' && snap.title) title = snap.title
    }
    const lines = []
    let lastEnd = null
    let latestTurnStartSeq = null
    let pendingApproval = false
    const events = session && Array.isArray(session.events) ? session.events : []
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
    for (const a of roots) {
      if (!a || a.id === undefined || a.id === null) continue
      seen.add(a.id)
      let info = { title: null, lines: [], lastEnd: null, latestTurnStartSeq: null, pendingApproval: false }
      try {
        const session = sessions !== undefined ? sessions.get(a.id) : undefined
        if (session) info = scanSession(session)
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

  const projectsList = () => {
    const out = []
    for (const [id, p] of projects) {
      if (!p || !p.status) continue
      out.push({ id, title: p.title || id, lines: p.lines || [], status: p.status, unread: !!p.unread })
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
    voices: voices.map((v) => ({ index: v.index, name: v.name })),
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
