// Foxbell桌宠 — 持久化 Client 模块（__ModuleLoader__ bundle）
// 交互：单击形象=只挥手；双击形象=说话+挥手；点项目卡片=只切换会话（不发声）。
// 红灯(报错)已读即消失：报错项目成为当前会话时自动 ack，点卡片切换也 ack。
window.__ModuleLoader__.load({
  id: 'dsh-foxbell-pet',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    const ANIM = {
      idle: { row: 0, frames: 6, dur: 960, css: 'dyn-pet-anim-idle' },
      waving: { row: 3, frames: 4, dur: 560, css: 'dyn-pet-anim-waving' },
      jumping: { row: 4, frames: 5, dur: 700, css: 'dyn-pet-anim-jumping' },
    }
    const STORE_KEY = 'dyn-pet-foxbell-visible'
    const STATE_URL = '/dyn-pet-foxbell/state'
    const ACK_URL = '/dyn-pet-foxbell/ack'
    const DIAG_URL = '/dyn-pet-foxbell/client-diag'

    const reportVisible = (v) => {
      try { fetch(DIAG_URL + '?visible=' + (v ? '1' : '0')).catch(() => {}) } catch {}
    }

    const petStore = {
      visible: (() => { try { return localStorage.getItem(STORE_KEY) !== '0' } catch { return true } })(),
      listeners: new Set(),
      set(v) {
        this.visible = !!v
        try { localStorage.setItem(STORE_KEY, this.visible ? '1' : '0') } catch {}
        reportVisible(this.visible)
        for (const l of [...this.listeners]) l()
      },
      subscribe(l) { this.listeners.add(l); return () => { this.listeners.delete(l) } },
    }

    function PetToggle(props) {
      const wide = props.wide
      const [on, setOn] = React.useState(petStore.visible)
      React.useEffect(() => petStore.subscribe(() => setOn(petStore.visible)), [])
      return React.createElement('button', {
        className: 'dyn-pet-toggle' + (on ? ' on' : ' off'),
        title: on ? '隐藏Foxbell桌宠' : '显示Foxbell桌宠',
        onClick: (e) => { e.stopPropagation(); petStore.set(!petStore.visible) },
      },
        React.createElement('span', { className: 'dyn-pet-toggle-icon' }, '🦊'),
        wide ? React.createElement('span', { className: 'dyn-pet-toggle-text' }, on ? '隐藏' : '显示') : null,
      )
    }

    function Pet(props) {
      const petCtx = props.ctx
      const useSessions = props.useSessions
      const currentId = (typeof useSessions === 'function') ? useSessions((s) => s && s.current) : undefined
      const currentIdRef = React.useRef(currentId)
      currentIdRef.current = currentId

      const [anim, setAnim] = React.useState('idle')
      const [bubble, setBubble] = React.useState(null)
      const [projects, setProjects] = React.useState([])
      const [pos, setPos] = React.useState(null)
      const [visible, setVisible] = React.useState(petStore.visible)
      React.useEffect(() => petStore.subscribe(() => setVisible(petStore.visible)), [])

      const dragRef = React.useRef(null)
      const audioRef = React.useRef(null)
      const blockedRef = React.useRef(false)
      const unlockRef = React.useRef(false)
      const sinceRef = React.useRef(null)
      const voicesRef = React.useRef([])
      const lastVoiceRef = React.useRef(-1)
      const timersRef = React.useRef([])
      const playRef = React.useRef(null)
      const speechGenRef = React.useRef(0)
      const projectsRef = React.useRef([])
      projectsRef.current = projects

      React.useEffect(() => {
        const timers = timersRef.current
        const later = (fn, ms) => {
          const dispose = petCtx.timeout(() => {
            const i = timers.indexOf(dispose)
            if (i >= 0) timers.splice(i, 1)
            fn()
          }, ms)
          timers.push(dispose)
          return dispose
        }

        const audio = document.createElement('audio')
        audio.id = 'dyn-pet-foxbell-audio'
        audio.preload = 'auto'
        document.body.appendChild(audio)
        audioRef.current = audio

        const MIN_SPEECH = 2500
        // 播一段语音并显示字幕：字幕显示的就是播放的那条语音（voice.name）；
        // 字幕时长 = max(最短 2.5s, 语音时长 + 0.25s)，以时间长的为准。
        const playVoice = (voice, text) => {
          if (!voice) return
          const gen = ++speechGenRef.current
          setBubble(text || voice.name)
          setAnim('waving')
          later(() => { if (speechGenRef.current === gen) setAnim('idle') }, 1700)
          audio.muted = false
          audio.src = '/dyn-pet-foxbell/voice/' + voice.index
          const pr = audio.play()
          if (pr && typeof pr.catch === 'function') pr.catch(() => { blockedRef.current = true })
          let scheduled = false
          const schedule = (ms) => {
            if (scheduled || speechGenRef.current !== gen) return
            scheduled = true
            later(() => { if (speechGenRef.current === gen) setBubble(null) }, ms)
          }
          const tryDuration = () => {
            const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : 0
            schedule(Math.max(MIN_SPEECH, d + 250))
          }
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            tryDuration()
          } else {
            const onMeta = () => {
              audio.removeEventListener('loadedmetadata', onMeta)
              tryDuration()
            }
            audio.addEventListener('loadedmetadata', onMeta)
            later(() => { if (!scheduled) schedule(MIN_SPEECH) }, MIN_SPEECH + 800)
          }
        }
        // 双击形象：随机说一句（字幕 = 该语音文件名，与播放内容一致）
        playRef.current = () => {
          const list = voicesRef.current
          if (list.length === 0) return
          let pick = Math.floor(Math.random() * list.length)
          if (list.length > 1) { while (pick === lastVoiceRef.current) pick = Math.floor(Math.random() * list.length) }
          lastVoiceRef.current = pick
          playVoice(list[pick])
        }

        const ack = (agentId) => {
          try { fetch(ACK_URL + '?agentId=' + encodeURIComponent(agentId)).catch(() => {}) } catch {}
        }

        const applyProjects = (list) => {
          if (!Array.isArray(list)) return
          setProjects(list)
          // 已读即消失：done 或 error 且未读 且 是当前活跃会话 → 自动 ack（宿主按 unread 状态去重）
          const active = currentIdRef.current
          for (const p of list) {
            if (p && p.unread && (p.status === 'done' || p.status === 'error') && p.id === active) {
              ack(p.id)
            }
          }
        }
        const handleCompletions = (list) => {
          if (!Array.isArray(list) || list.length === 0) return
          const first = list[0]
          if (!first || first.agentId === undefined) return
          const proj = projectsRef.current.find((p) => p.id === first.agentId)
          const text = (proj && proj.title ? proj.title : '任务') + ' 已完成'
          const vl = voicesRef.current
          if (vl.length === 0) { setBubble(text); return }
          let pick = Math.floor(Math.random() * vl.length)
          if (vl.length > 1) { while (pick === lastVoiceRef.current) pick = Math.floor(Math.random() * vl.length) }
          lastVoiceRef.current = pick
          playVoice(vl[pick], text)
        }

        const refresh = () => fetch(STATE_URL)
          .then((res) => res.json())
          .then((r) => {
            if (!r || typeof r !== 'object' || typeof r.seq !== 'number') return
            const since = sinceRef.current
            sinceRef.current = r.seq
            if (Array.isArray(r.voices) && voicesRef.current.length === 0) voicesRef.current = r.voices
            applyProjects(r.projects)
            if (since !== null && Array.isArray(r.completions)) {
              handleCompletions(r.completions.filter((c) => c && typeof c.seq === 'number' && c.seq > since))
            }
          })
          .catch(() => {})

        refresh()
        const dispose = petCtx.interval(() => refresh(), 1500)

        return () => {
          dispose()
          for (const t of timers.splice(0)) t()
          audio.remove()
          audioRef.current = null
          playRef.current = null
        }
      }, [])

      const onProjectClick = (p) => {
        // 点卡片：只切换会话 + 标记已读，不触发语音
        try {
          const sessions = petCtx.get('sessions')
          if (sessions !== undefined) sessions.open(p.id)
        } catch (e) { /* unknown id or service missing */ }
        try { fetch(ACK_URL + '?agentId=' + encodeURIComponent(p.id)).catch(() => {}) } catch {}
      }

      const onPointerDown = (e) => {
        e.preventDefault()
        // 用户手势内解锁音频（muted 播放），保证定时器里的完成语音不被自动播放策略拦截
        if (!unlockRef.current) {
          unlockRef.current = true
          const a = audioRef.current
          if (a) {
            try {
              a.muted = true
              if (!a.src) a.src = '/dyn-pet-foxbell/voice/0'
              const pr = a.play()
              if (pr && typeof pr.catch === 'function') pr.catch(() => {})
            } catch {}
          }
        }
        const rect = e.currentTarget.getBoundingClientRect()
        dragRef.current = { pointerId: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      }
      const onPointerMove = (e) => {
        const d = dragRef.current
        if (!d || d.pointerId !== e.pointerId) return
        d.moved = true
        setPos({ x: e.clientX - d.dx, y: e.clientY - d.dy })
      }
      const onPointerUp = (e) => {
        const d = dragRef.current
        if (!d || d.pointerId !== e.pointerId) return
        dragRef.current = null
        if (!d.moved) {
          // 单击形象：只挥手，不说话
          setAnim('waving')
          const dispose = petCtx.timeout(() => setAnim('idle'), 1700)
          timersRef.current.push(dispose)
        }
        const audio = audioRef.current
        if (blockedRef.current && audio && audio.src) {
          const p = audio.play()
          if (p && typeof p.catch === 'function') p.catch(() => {})
        }
      }
      const onDoubleClick = (e) => {
        e.stopPropagation()
        // 双击形象：说话 + 挥手
        if (playRef.current) playRef.current()
      }

      const spriteStyle = { width: 192, height: 208, backgroundImage: "url('/dyn-pet-foxbell/spritesheet.webp')", backgroundSize: '1536px 2288px', cursor: 'grab' }
      const rootStyle = { position: 'fixed', zIndex: 2147483000, pointerEvents: 'auto', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }
      if (pos) { rootStyle.left = pos.x; rootStyle.top = pos.y }
      else { rootStyle.right = 24; rootStyle.bottom = 76 }

      if (!visible) return null

      const shown = projects.slice(0, 6)
      const extra = projects.length - shown.length

      return React.createElement('div', {
        className: 'dyn-pet-root',
        style: rootStyle,
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onDoubleClick: onDoubleClick,
      },
        React.createElement('div', { className: 'dyn-pet-top' },
          shown.map((p) => React.createElement('div', {
            key: p.id,
            className: 'dyn-pet-proj',
            onPointerDown: (e) => e.stopPropagation(),
            onClick: (e) => { e.stopPropagation(); onProjectClick(p) },
          },
            React.createElement('span', { className: 'dyn-pet-dot dot-' + p.status }),
            React.createElement('div', { className: 'dyn-pet-proj-body' },
              React.createElement('div', { className: 'dyn-pet-proj-title' }, p.title),
              Array.isArray(p.lines) ? p.lines.map((l, i) => React.createElement('div', { key: i, className: 'dyn-pet-proj-line' }, l)) : null,
            ),
          )),
          extra > 0 ? React.createElement('div', { className: 'dyn-pet-proj-more' }, '+' + extra + ' 更多') : null,
        ),
        bubble ? React.createElement('div', { className: 'dyn-pet-bubble' }, bubble) : null,
        React.createElement('div', {
          className: 'dyn-pet-sprite ' + (ANIM[anim] ? ANIM[anim].css : ANIM.idle.css),
          style: spriteStyle,
        }),
      )
    }

    const STYLE_ID = 'dyn-pet-styles'
    function adoptStyles() {
      if (document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        .dyn-pet-root { position: fixed; z-index: 2147483000; pointer-events: auto; user-select: none; -webkit-user-select: none; touch-action: none; }
        .dyn-pet-sprite { width: 192px; height: 208px; background-image: url('/dyn-pet-foxbell/spritesheet.webp'); background-size: 1536px 2288px; cursor: grab; }
        @keyframes dyn-pet-idle { from { background-position: 0px 0px; } to { background-position: -1152px 0px; } }
        @keyframes dyn-pet-waving { from { background-position: 0px -624px; } to { background-position: -768px -624px; } }
        @keyframes dyn-pet-jumping { from { background-position: 0px -832px; } to { background-position: -960px -832px; } }
        .dyn-pet-anim-idle { animation: dyn-pet-idle 0.96s steps(6, end) infinite; }
        .dyn-pet-anim-waving { animation: dyn-pet-waving 0.56s steps(4, end) infinite; }
        .dyn-pet-anim-jumping { animation: dyn-pet-jumping 0.7s steps(5, end) infinite; }
        .dyn-pet-top {
          position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 10px;
          display: flex; flex-direction: column; align-items: center; gap: 5px; pointer-events: none; z-index: 3;
          width: fit-content; max-width: 320px;
        }
        .dyn-pet-proj {
          pointer-events: auto; cursor: pointer; display: flex; align-items: flex-start; gap: 7px;
          background: rgba(255, 252, 248, 0.97); border: 1px solid rgba(122, 74, 43, 0.3); border-radius: 10px;
          padding: 5px 10px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
          font-size: 12px; line-height: 1.45; width: 100%; box-sizing: border-box;
        }
        .dyn-pet-proj:hover { border-color: rgba(122, 74, 43, 0.65); }
        .dyn-pet-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; margin-top: 4px; }
        .dot-running { background: #22c55e; box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25); }
        .dot-approval { background: #eab308; box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.25); }
        .dot-error { background: #ef4444; box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25); }
        .dot-done { background: #60a5fa; box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25); }
        .dyn-pet-proj-body { min-width: 0; }
        .dyn-pet-proj-title { font-weight: 700; color: #7a4a2b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dyn-pet-proj-line { color: #a07050; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dyn-pet-proj-more { pointer-events: none; color: #a07050; font-size: 11px; background: rgba(255, 252, 248, 0.9); border-radius: 999px; padding: 2px 8px; }
        .dyn-pet-bubble {
          position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 8px;
          background: rgba(255, 255, 255, 0.96); color: #7a4a2b; border: 1px solid rgba(122, 74, 43, 0.35); border-radius: 12px;
          padding: 6px 12px; font-size: 13px; line-height: 1.4; white-space: nowrap;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18); pointer-events: none; z-index: 2;
        }
        .dyn-pet-toggle {
          display: inline-flex; align-items: center; gap: 4px; background: transparent; border: none;
          color: #8b7355; font-size: 12px; cursor: pointer; padding: 4px 6px; border-radius: 8px;
        }
        .dyn-pet-toggle:hover { background: rgba(122, 74, 43, 0.08); }
        .dyn-pet-toggle-icon { font-size: 14px; line-height: 1; }
        .dyn-pet-toggle.off .dyn-pet-toggle-icon { filter: grayscale(1); opacity: 0.45; }
        .dyn-pet-toggle-text { font-size: 12px; line-height: 1; }
      `
      document.head.appendChild(style)
    }

    function apply(ctx) {
      const slots = ctx.get('slots') ?? ctx.slots
      if (slots === undefined) return
      adoptStyles()
      reportVisible(petStore.visible)
      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'foxbell-pet', order: 100 },
        (props) => React.createElement(Pet, Object.assign({}, props, { ctx: ctx })),
      ))
      slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'foxbell-pet-toggle', order: 100, label: () => 'Foxbell' },
        (props) => React.createElement(PetToggle, props),
      ))
    }

    module.exports = { name: 'dsh-foxbell-pet-client', inject: ['slots', 'timer'], apply }
    return module.exports
  },
})
