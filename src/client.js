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
      'run-right': { row: 1, frames: 8, dur: 960, css: 'dyn-pet-anim-run-right' },
      'run-left': { row: 2, frames: 8, dur: 960, css: 'dyn-pet-anim-run-left' },
      waving: { row: 3, frames: 4, dur: 560, css: 'dyn-pet-anim-waving' },
      jumping: { row: 4, frames: 5, dur: 700, css: 'dyn-pet-anim-jumping' },
      failed: { row: 5, frames: 8, dur: 1120, css: 'dyn-pet-anim-failed' },
      waiting: { row: 6, frames: 6, dur: 900, css: 'dyn-pet-anim-waiting' },
      running: { row: 7, frames: 6, dur: 720, css: 'dyn-pet-anim-running' },
      review: { row: 8, frames: 6, dur: 900, css: 'dyn-pet-anim-review' },
    }
    // look 行 9+10：16 向顺时针（行9 列0..7 → 行10 列0..7），连续从左到右
    const LOOK_FRAMES = []
    for (let i = 0; i < 16; i++) {
      const row = i < 8 ? 9 : 10
      const col = i % 8
      LOOK_FRAMES.push({ x: -col * 192, y: -(row * 208) })
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
      const voiceElsRef = React.useRef(null)
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

      const [lookFrame, setLookFrame] = React.useState(-1)
      const stateRef = React.useRef({ drag: null, transient: null, task: null, look: false })
      const transientGenRef = React.useRef(0)
      const bubbleGenRef = React.useRef(0)
      const prevStatusRef = React.useRef({})
      const lookStopRef = React.useRef(null)

      const later = (fn, ms) => {
        const dispose = petCtx.timeout(() => {
          const i = timersRef.current.indexOf(dispose)
          if (i >= 0) timersRef.current.splice(i, 1)
          fn()
        }, ms)
        timersRef.current.push(dispose)
        return dispose
      }
      // 状态机：拖拽 > 瞬时事件 > 任务态 > look > idle
      const refreshAnim = () => {
        const s = stateRef.current
        if (s.drag) return setAnim(s.drag)
        if (s.transient) return setAnim(s.transient)
        if (s.task) return setAnim(s.task)
        if (s.look) return setAnim('look')
        setAnim('idle')
      }
      const playTransient = (anim, ms) => {
        const s = stateRef.current
        const gen = ++transientGenRef.current
        s.transient = anim
        refreshAnim()
        later(() => {
          if (transientGenRef.current === gen && s.transient === anim) {
            s.transient = null
            refreshAnim()
          }
        }, ms)
      }
      const showBubble = (text, ms) => {
        const gen = ++bubbleGenRef.current
        setBubble(text)
        later(() => { if (bubbleGenRef.current === gen) setBubble(null) }, ms)
      }
      const stopLook = () => {
        if (lookStopRef.current) {
          const d = lookStopRef.current
          lookStopRef.current = null
          try { d() } catch {}
          const idx = timersRef.current.indexOf(d)
          if (idx >= 0) timersRef.current.splice(idx, 1)
        }
        if (stateRef.current.look) {
          stateRef.current.look = false
          setLookFrame(-1)
        }
      }
      const startLook = () => {
        const s = stateRef.current
        if (s.drag || s.transient || s.task || s.look) return
        s.look = true
        setLookFrame(0)
        refreshAnim()
        let i = 0
        const stop = petCtx.interval(() => {
          i += 1
          if (i >= LOOK_FRAMES.length) {
            stopLook()
            refreshAnim()
            scheduleNextLook()
          } else {
            setLookFrame(i)
          }
        }, 250)
        lookStopRef.current = stop
        timersRef.current.push(stop)
      }
      const scheduleNextLook = () => {
        later(() => {
          const s = stateRef.current
          if (!s.drag && !s.transient && !s.task) startLook()
          else scheduleNextLook()
        }, 6000)
      }

      React.useEffect(() => {
        const audio = document.createElement('audio')
        audio.id = 'dyn-pet-foxbell-audio'
        audio.preload = 'auto'
        document.body.appendChild(audio)
        audioRef.current = audio

        const MIN_SPEECH = 2500
        // 播一段语音并显示字幕：字幕显示的就是播放的那条语音（voice.name）；
        // 字幕时长 = max(最短 2.5s, 语音时长 + 0.25s)，以时间长的为准。
        const playVoice = (voice, text, anim) => {
          if (!voice) return
          const gen = ++speechGenRef.current
          setBubble(text || voice.name)
          playTransient(anim || 'waving', 1700)
          // 优先用预加载元素（即时出声）；没有则回退共享 audio
          const el = voiceElsRef.current ? voiceElsRef.current[voice.index] : undefined
          const target = el || audio
          if (!el) {
            audio.muted = false
            audio.src = '/dyn-pet-foxbell/voice/' + voice.index
          } else {
            // 暂停其它在播的预载元素
            for (const a of voiceElsRef.current) { if (a !== el && !a.paused) { try { a.pause() } catch {} } }
            el.currentTime = 0
            el.muted = false
          }
          const pr = target.play()
          if (pr && typeof pr.catch === 'function') pr.catch(() => { blockedRef.current = true })
          let scheduled = false
          const schedule = (ms) => {
            if (scheduled || speechGenRef.current !== gen) return
            scheduled = true
            later(() => { if (speechGenRef.current === gen) setBubble(null) }, ms)
          }
          const tryDuration = () => {
            const d = Number.isFinite(target.duration) && target.duration > 0 ? target.duration * 1000 : 0
            schedule(Math.max(MIN_SPEECH, d + 250))
          }
          if (Number.isFinite(target.duration) && target.duration > 0) {
            tryDuration()
          } else {
            const onMeta = () => {
              target.removeEventListener('loadedmetadata', onMeta)
              tryDuration()
            }
            target.addEventListener('loadedmetadata', onMeta)
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
          playVoice(list[pick], undefined, 'waving')
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
          // ---- 状态驱动动画：任务状态差分 ----
          const prev = prevStatusRef.current
          const statuses = {}
          let anyApproval = false
          let anyDoneUnread = false
          let ownRunning = false
          let errTitle = null
          for (const p of list) {
            if (!p || !p.id) continue
            statuses[p.id] = p.status
            if (p.status === 'approval') anyApproval = true
            if (p.status === 'done' && p.unread) anyDoneUnread = true
            if (p.id === active && p.status === 'running') ownRunning = true
            if (p.status === 'error' && prev[p.id] !== 'error' && !errTitle) errTitle = p.title || '任务'
          }
          prevStatusRef.current = statuses
          // 出错 → 委屈动画 + 字幕（不播语音，语音均为正向句子）
          if (errTitle) {
            showBubble('呜… ' + errTitle + ' 报错了', 3000)
            playTransient('failed', 2500)
          }
          // 持续任务态：待批准(waiting) > 完成未读(review) > 自身运行(running)
          const task = anyApproval ? 'waiting' : (anyDoneUnread ? 'review' : (ownRunning ? 'running' : null))
          if (stateRef.current.task !== task) {
            stateRef.current.task = task
            refreshAnim()
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
          playVoice(vl[pick], text, 'jumping')
        }

        const refresh = () => fetch(STATE_URL)
          .then((res) => res.json())
          .then((r) => {
            if (!r || typeof r !== 'object' || typeof r.seq !== 'number') return
            const since = sinceRef.current
            sinceRef.current = r.seq
            if (Array.isArray(r.voices) && voicesRef.current.length === 0) {
              voicesRef.current = r.voices
              // 预加载语音：每个文件一个 Audio 元素，双击/完成时即时出声（避免每次现场拉取）
              voiceElsRef.current = r.voices.map((v) => {
                const a = new Audio('/dyn-pet-foxbell/voice/' + v.index)
                a.preload = 'auto'
                a.load()
                return a
              })
            }
            applyProjects(r.projects)
            if (since !== null && Array.isArray(r.completions)) {
              handleCompletions(r.completions.filter((c) => c && typeof c.seq === 'number' && c.seq > since))
            }
          })
          .catch(() => {})

        refresh()
        scheduleNextLook()
        const dispose = petCtx.interval(() => refresh(), 1500)

        return () => {
          dispose()
          stopLook()
          for (const t of timersRef.current.splice(0)) t()
          if (voiceElsRef.current) {
            for (const a of voiceElsRef.current) { try { a.pause(); a.src = '' } catch {} }
            voiceElsRef.current = null
          }
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
        dragRef.current = { pointerId: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, lastX: e.clientX, lastY: e.clientY, moved: false }
        stopLook()
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      }
      const onPointerMove = (e) => {
        const d = dragRef.current
        if (!d || d.pointerId !== e.pointerId) return
        d.moved = true
        const dx = e.clientX - d.lastX
        const dy = e.clientY - d.lastY
        d.lastX = e.clientX
        d.lastY = e.clientY
        setPos({ x: e.clientX - d.dx, y: e.clientY - d.dy })
        // 方向动画：上拖→跳跃；左拖→向左跑；右拖→向右跑
        let dir = null
        if (dy < -8) dir = 'jumping'
        else if (dx < -6) dir = 'run-left'
        else if (dx > 6) dir = 'run-right'
        if (dir && stateRef.current.drag !== dir) {
          stateRef.current.drag = dir
          refreshAnim()
        }
      }
      const onPointerUp = (e) => {
        const d = dragRef.current
        if (!d || d.pointerId !== e.pointerId) return
        dragRef.current = null
        stateRef.current.drag = null
        if (!d.moved) {
          // 单击形象：只挥手，不说话
          playTransient('waving', 1700)
        }
        refreshAnim()
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
      if (anim === 'look' && lookFrame >= 0) {
        spriteStyle.backgroundPosition = LOOK_FRAMES[lookFrame].x + 'px ' + LOOK_FRAMES[lookFrame].y + 'px'
      }
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
          className: 'dyn-pet-sprite ' + (anim === 'look' ? 'dyn-pet-anim-look' : (ANIM[anim] ? ANIM[anim].css : ANIM.idle.css)),
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
        @keyframes dyn-pet-run-right { from { background-position: 0px -208px; } to { background-position: -1536px -208px; } }
        @keyframes dyn-pet-run-left { from { background-position: 0px -416px; } to { background-position: -1536px -416px; } }
        @keyframes dyn-pet-failed { from { background-position: 0px -1040px; } to { background-position: -1536px -1040px; } }
        @keyframes dyn-pet-waiting { from { background-position: 0px -1248px; } to { background-position: -1152px -1248px; } }
        @keyframes dyn-pet-running { from { background-position: 0px -1456px; } to { background-position: -1152px -1456px; } }
        @keyframes dyn-pet-review { from { background-position: 0px -1664px; } to { background-position: -1152px -1664px; } }
        .dyn-pet-anim-idle { animation: dyn-pet-idle 0.96s steps(6, end) infinite; }
        .dyn-pet-anim-waving { animation: dyn-pet-waving 0.56s steps(4, end) infinite; }
        .dyn-pet-anim-jumping { animation: dyn-pet-jumping 0.7s steps(5, end) infinite; }
        .dyn-pet-anim-run-right { animation: dyn-pet-run-right 0.96s steps(8, end) infinite; }
        .dyn-pet-anim-run-left { animation: dyn-pet-run-left 0.96s steps(8, end) infinite; }
        .dyn-pet-anim-failed { animation: dyn-pet-failed 1.12s steps(8, end) infinite; }
        .dyn-pet-anim-waiting { animation: dyn-pet-waiting 0.9s steps(6, end) infinite; }
        .dyn-pet-anim-running { animation: dyn-pet-running 0.72s steps(6, end) infinite; }
        .dyn-pet-anim-review { animation: dyn-pet-review 0.9s steps(6, end) infinite; }
        .dyn-pet-anim-look { animation: none; }
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
