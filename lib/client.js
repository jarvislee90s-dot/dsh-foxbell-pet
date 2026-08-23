// Foxbell桌宠 — 持久化 Client 模块（__ModuleLoader__ bundle）
// 交互：单击形象=只挥手；双击形象=说话+挥手；点项目卡片=只切换会话（不发声）。
// 红灯(报错)已读即消失：报错项目成为当前会话时自动 ack，点卡片切换也 ack。
window.__ModuleLoader__.load({
  id: 'dsh-foxbell-pet',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    // 每个动画行的逐帧时长（ms），末帧停顿（Codex V2 契约 animation-rows.md）
    const ANIM = {
      idle: { row: 0, d: [280, 110, 110, 140, 140, 320] },
      'run-right': { row: 1, d: [120, 120, 120, 120, 120, 120, 120, 220] },
      'run-left': { row: 2, d: [120, 120, 120, 120, 120, 120, 120, 220] },
      waving: { row: 3, d: [140, 140, 140, 280] },
      jumping: { row: 4, d: [140, 140, 140, 140, 280] },
      failed: { row: 5, d: [140, 140, 140, 140, 140, 140, 140, 240] },
      waiting: { row: 6, d: [150, 150, 150, 150, 150, 260] },
      running: { row: 7, d: [120, 120, 120, 120, 120, 220] },
      review: { row: 8, d: [150, 150, 150, 150, 150, 280] },
    }
    // look 行 9+10：16 向顺时针（行9 列0..7 → 行10 列0..7），连续从左到右
    const LOOK_FRAMES = []
    for (let i = 0; i < 16; i++) {
      const row = i < 8 ? 9 : 10
      const col = i % 8
      LOOK_FRAMES.push({ x: -col * 192, y: -(row * 208) })
    }
    const STORE_KEY = 'dyn-pet-foxbell-visible'
    const CFG_KEY = 'dyn-foxbell-pet:state-v1'
    const CFG_DEFAULT = { muted: false, shoutOnDone: true, talkative: true, doneAction: 'jumping', pokeAction: 'waving' }
    const CFG_ACTIONS = ['jumping', 'waving', 'failed', 'waiting', 'review']
    const isAction = (v) => CFG_ACTIONS.includes(v)

    function createConfigStore() {
      let scope = null
      let pending = {}
      const listeners = new Set()
      const sanitize = (k, v) => {
        if (k === 'doneAction' || k === 'pokeAction') return isAction(v) ? v : CFG_DEFAULT[k]
        return !!v // booleans
      }
      const loadLocal = () => {
        try {
          const raw = localStorage.getItem(CFG_KEY)
          if (!raw) return {}
          const p = JSON.parse(raw)
          const out = {}
          for (const k of Object.keys(CFG_DEFAULT)) if (k in p) out[k] = sanitize(k, p[k])
          return out
        } catch { return {} }
      }
      const saveLocal = (v) => {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(v)) } catch {}
      }
      let local = Object.assign({}, CFG_DEFAULT, loadLocal())
      const resolve = () => {
        if (scope === null) return local
        const sv = scope.getSnapshot()
        if (!sv || sv.status !== 'ready' || !sv.value || typeof sv.value !== 'object') return local
        const merged = Object.assign({}, CFG_DEFAULT, local, sv.value)
        for (const k of Object.keys(CFG_DEFAULT)) {
          if (pending[k] !== undefined) merged[k] = pending[k]
          else if (sv.value[k] !== undefined) merged[k] = sanitize(k, sv.value[k])
        }
        return merged
      }
      const emit = () => { for (const fn of [...listeners]) fn() }
      return {
        getSnapshot: () => resolve(),
        subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
        set(patch) {
          const next = Object.assign({}, local)
          for (const k of Object.keys(CFG_DEFAULT)) if (patch[k] !== undefined) next[k] = sanitize(k, patch[k])
          local = next
          saveLocal(local)
          if (scope !== null) {
            for (const [k, v] of Object.entries(patch)) {
              if (v === undefined) continue
              pending[k] = v
              scope.set(k, v).then(
                () => { pending[k] = undefined; delete pending[k]; emit() },
                () => { pending[k] = undefined; delete pending[k]; emit() },
              )
            }
          }
          emit()
        },
        attachScope(s) {
          let seeded = false
          const sync = () => {
            const sv = s.getSnapshot()
            // 首次 ready 时做一次性 seed：localStorage 里 user 层没有的字段写进 scope
            if (!seeded && sv && sv.status === 'ready') {
              seeded = true
              const user = sv.user && typeof sv.user === 'object' ? sv.user : {}
              const legacy = loadLocal()
              for (const k of Object.keys(CFG_DEFAULT)) {
                if (legacy[k] !== undefined && !(k in user)) {
                  pending[k] = legacy[k]
                  s.set(k, legacy[k]).then(
                    () => { pending[k] = undefined; delete pending[k]; emit() },
                    () => { pending[k] = undefined; delete pending[k]; emit() },
                  )
                }
              }
            }
            emit()
          }
          scope = s
          const unsub = s.subscribe(sync)
          sync()
          return () => { unsub(); scope = null; pending = {}; emit() }
        },
      }
    }

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

    const cfgStore = createConfigStore()

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
      const [cfg, setCfg] = React.useState(cfgStore.getSnapshot())
      React.useEffect(() => cfgStore.subscribe(() => setCfg(cfgStore.getSnapshot())), [])
      const cfgRef = React.useRef(cfg)
      cfgRef.current = cfg

      const dragRef = React.useRef(null)
      const audioRef = React.useRef(null)
      const voiceElsRef = React.useRef(null)
      const blockedRef = React.useRef(false)
      const unlockRef = React.useRef(false)
      const sinceRef = React.useRef(null)
      const voicesRef = React.useRef([])
      const lastVoiceRefs = React.useRef({})
      const approvalVoiceAtRef = React.useRef(0)
      const timersRef = React.useRef([])
      const playRef = React.useRef(null)
      const speechGenRef = React.useRef(0)
      const projectsRef = React.useRef([])
      projectsRef.current = projects

      const [lookFrame, setLookFrame] = React.useState(-1)
      const [menu, setMenu] = React.useState(null) // { x, y } 或 null
      const [menuPage, setMenuPage] = React.useState(null) // null | 'Action' | 'Poke' | 'About'
      const menuRef = React.useRef(null)
      React.useEffect(() => {
        if (menu === null) return
        const onDown = (e) => { if (menuRef.current && menuRef.current.contains(e.target)) return; setMenu(null) }
        const onKey = (e) => { if (e.key === 'Escape') setMenu(null) }
        window.addEventListener('pointerdown', onDown, true)
        window.addEventListener('keydown', onKey)
        return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey) }
      }, [menu])
      const stateRef = React.useRef({ drag: null, transient: null, task: null, look: false })
      const transientGenRef = React.useRef(0)
      const bubbleGenRef = React.useRef(0)
      const prevStatusRef = React.useRef({})
      const lookStopRef = React.useRef(null)

      // ---- 全动画 JS 帧步进（逐帧时长 + 末帧停顿，契约 animation-rows.md）----
      const [frame, setFrame] = React.useState(0)
      const animRef = React.useRef('idle')
      const frameRef = React.useRef(0)
      const stepTimerRef = React.useRef(null)

      const later = (fn, ms) => {
        const dispose = petCtx.timeout(() => {
          const i = timersRef.current.indexOf(dispose)
          if (i >= 0) timersRef.current.splice(i, 1)
          fn()
        }, ms)
        timersRef.current.push(dispose)
        return dispose
      }
      const cancelStep = () => {
        if (stepTimerRef.current) { const d = stepTimerRef.current; stepTimerRef.current = null; try { d() } catch {} }
      }
      const stepLoop = () => {
        const def = ANIM[animRef.current] || ANIM.idle
        const i = frameRef.current
        const nd = def.d[i] || 160
        stepTimerRef.current = later(() => {
          frameRef.current = (i + 1) % def.d.length
          setFrame(frameRef.current)
          stepLoop()
        }, nd)
      }
      // 状态机：拖拽 > 瞬时事件 > 任务态 > look > idle；切换动画时重启帧步进
      const applyAnim = (key) => {
        if (animRef.current === key) return
        animRef.current = key
        setAnim(key)
        cancelStep()
        frameRef.current = 0
        setFrame(0)
        stepLoop()
      }
      const refreshAnim = () => {
        const s = stateRef.current
        applyAnim(s.drag || s.transient || s.task || (s.look ? 'look' : 'idle'))
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
          if (cfgRef.current.muted) return
          const gen = ++speechGenRef.current
          if (cfgRef.current.talkative) setBubble(text || voice.name) // muted 时已提前 return；talkative=false 时语音照播但无字幕
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
        // 组内随机选一条语音（组内不连续重复）；group 缺省=全部
        const pickVoice = (group) => {
          const all = voicesRef.current
          const list = group ? all.filter((v) => v.group === group) : all
          if (list.length === 0) return null
          const key = group || '__all__'
          const last = lastVoiceRefs.current[key] ?? -1
          let pick = Math.floor(Math.random() * list.length)
          if (list.length > 1) { while (pick === last) pick = Math.floor(Math.random() * list.length) }
          lastVoiceRefs.current[key] = pick
          return list[pick]
        }
        // 双击形象：general 组随机一句（字幕 = 该语音文件名，与播放内容一致）
        playRef.current = () => {
          const v = pickVoice('general') || pickVoice()
          if (!v) return
          playVoice(v, undefined, 'waving')
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
          // 出错 → 委屈动画 + error 组语音（若有）；字幕 = 语音文件名（状态已由红灯表达）
          if (errTitle) {
            const v = pickVoice('error')
            if (v) playVoice(v, undefined, 'failed')
            else playTransient('failed', 2500)
          }
          // 待批准出现 → approval 组语音（限频 10s）
          const prevHadApproval = Object.values(prev).includes('approval')
          if (anyApproval && !prevHadApproval) {
            const now = Date.now()
            if (now - approvalVoiceAtRef.current > 10000) {
              approvalVoiceAtRef.current = now
              const v = pickVoice('approval')
              if (v) playVoice(v, undefined, 'waiting')
            }
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
          const v = pickVoice('done') || pickVoice()
          if (!cfgRef.current.shoutOnDone) return
          if (!v) return
          playVoice(v, undefined, cfgRef.current.doneAction) // 原写死 'jumping'，改为读配置
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
        stepLoop()
        const dispose = petCtx.interval(() => refresh(), 1500)

        return () => {
          dispose()
          stopLook()
          cancelStep()
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
      // 全动画 JS 帧步进：look 用 lookFrame（16 向），其余行用 frame（契约逐帧时长）
      if (anim === 'look') {
        const f = Math.max(0, lookFrame)
        spriteStyle.backgroundPosition = LOOK_FRAMES[f].x + 'px ' + LOOK_FRAMES[f].y + 'px'
      } else {
        const def = ANIM[anim] || ANIM.idle
        const f = frame % def.d.length
        spriteStyle.backgroundPosition = (-f * 192) + 'px ' + (-(def.row * 208)) + 'px'
      }
      const rootStyle = { position: 'fixed', zIndex: 2147483000, pointerEvents: 'auto', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }
      if (pos) { rootStyle.left = pos.x; rootStyle.top = pos.y }
      else { rootStyle.right = 24; rootStyle.bottom = 76 }

      if (!visible) return null

      const shown = projects.slice(0, 6)
      const extra = projects.length - shown.length

      return React.createElement(React.Fragment, null,
        React.createElement('div', {
          className: 'dyn-pet-root',
          style: rootStyle,
          onPointerDown: onPointerDown,
          onPointerMove: onPointerMove,
          onPointerUp: onPointerUp,
          onDoubleClick: onDoubleClick,
          onContextMenu: (e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); setMenuPage(null) },
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
            className: 'dyn-pet-sprite',
            style: spriteStyle,
          }),
        ),
        menu !== null ? React.createElement('div', {
          ref: menuRef,
          className: 'dyn-pet-menu',
          style: { left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 320) },
        },
          menuPage === 'Action' ? React.createElement(React.Fragment, null,
            CFG_ACTIONS.map((a) => React.createElement('div', {
              key: a, className: 'dyn-pet-menu-item' + (cfg.doneAction === a ? ' sel' : ''),
              onClick: () => { cfgStore.set({ doneAction: a }); setMenu(null) },
            }, ACTION_LABEL[a] || a)),
          ) : menuPage === 'Poke' ? React.createElement(React.Fragment, null,
            CFG_ACTIONS.map((a) => React.createElement('div', {
              key: a, className: 'dyn-pet-menu-item' + (cfg.pokeAction === a ? ' sel' : ''),
              onClick: () => { cfgStore.set({ pokeAction: a }); setMenu(null) },
            }, ACTION_LABEL[a] || a)),
          ) : menuPage === 'About' ? React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'dyn-pet-menu-item', onClick: () => setMenu(null) }, 'dsh-foxbell-pet v1.3.0'),
          ) : React.createElement(React.Fragment, null,
            React.createElement(MenuToggle, { label: '🔊 声音', on: cfg.muted, onChange: (v) => cfgStore.set({ muted: v }) }),
            React.createElement(MenuToggle, { label: '📣 完成时喊', on: cfg.shoutOnDone, onChange: (v) => cfgStore.set({ shoutOnDone: v }) }),
            React.createElement(MenuToggle, { label: '💬 气泡', on: cfg.talkative, onChange: (v) => cfgStore.set({ talkative: v }) }),
            React.createElement('div', { className: 'dyn-pet-menu-divider' }),
            React.createElement(MenuSub, { label: '🎯 完成时动作', value: cfg.doneAction, onOpen: () => setMenuPage('Action') }),
            React.createElement(MenuSub, { label: '👉 戳我动作', value: cfg.pokeAction, onOpen: () => setMenuPage('Poke') }),
            React.createElement('div', { className: 'dyn-pet-menu-item', onClick: () => { if (playRef.current) playRef.current(); setMenu(null) } }, '🎬 表演一下'),
            React.createElement('div', { className: 'dyn-pet-menu-divider' }),
            React.createElement('div', { className: 'dyn-pet-menu-item', onClick: () => { petStore.set(false); setMenu(null) } }, '🦊 隐藏桌宠'),
            React.createElement('div', { className: 'dyn-pet-menu-item', onClick: () => setMenuPage('About') }, 'ℹ️ 关于'),
          ),
        ) : null,
      )
    }

    const ACTION_LABEL = { jumping: '跳一跳', waving: '挥挥手', failed: '委屈', waiting: '等待', review: '审查' }
    function MenuToggle({ on, label, onChange }) {
      return React.createElement('div', { className: 'dyn-pet-menu-row' },
        React.createElement('span', { className: 'dyn-pet-menu-label' }, label),
        React.createElement('button', {
          className: 'dyn-pet-menu-btn' + (on ? ' on' : ''),
          onClick: (e) => { e.stopPropagation(); onChange(!on) },
        }, on ? '开' : '关'),
      )
    }
    function MenuSub({ label, value, onOpen }) {
      return React.createElement('div', { className: 'dyn-pet-menu-row dyn-pet-menu-sub', onClick: onOpen },
        React.createElement('span', { className: 'dyn-pet-menu-label' }, label),
        React.createElement('span', { className: 'dyn-pet-menu-val' }, ACTION_LABEL[value] || value),
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
        .dyn-pet-menu { position: fixed; z-index: 2147483001; background: rgba(30,30,34,.96); color:#eee; font-size:13px; line-height:1.9; border-radius:10px; padding:4px 0; min-width:170px; box-shadow:0 6px 20px rgba(0,0,0,.4); cursor:default; user-select:none; }
        .dyn-pet-menu-item { padding: 3px 14px; cursor: pointer; }
        .dyn-pet-menu-item:hover { background: rgba(255,255,255,.08); }
        .dyn-pet-menu-item.sel { color: #fbbf24; }
        .dyn-pet-menu-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 3px 14px; }
        .dyn-pet-menu-btn { background:#3f3f46; color:#eee; border:none; border-radius:6px; font-size:12px; padding:1px 10px; cursor:pointer; }
        .dyn-pet-menu-btn.on { background:#16a34a; }
        .dyn-pet-menu-sub { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:3px 14px; cursor:pointer; }
        .dyn-pet-menu-sub:hover { background:rgba(255,255,255,.08); }
        .dyn-pet-menu-val { color:#a1a1aa; font-size:12px; }
        .dyn-pet-menu-divider { height:1px; margin:4px 10px; background:rgba(255,255,255,.12); }
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
