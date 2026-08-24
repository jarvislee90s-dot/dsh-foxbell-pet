# Foxbell 交互娱乐性升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持狐狸形象与完成提醒功能不变的前提下，为 dsh-foxbell-pet 增加右键菜单、戳/完成动作绑定、拖拽物理手感与 dsh 设置卡片（rc.7+）。

**Architecture:** fox 现有 "host 扫描 + HTTP 素材伺服 + client 轮询" 架构零删除零重构；host 半新增 schemastery schema + settings 命名空间注册；client 半新增 ConfigStore（localStorage + settings scope 双后端）、右键菜单、物理手感。素材零改动（复用现有 11 行 spritesheet）。

**Tech Stack:** 纯 JS（ESM host / `__ModuleLoader__` CJS client）、React（dsh 运行时提供）、`@deepseek-ai/dsh-settings` + `@deepseek-ai/schemastery`（新增依赖）、`node scripts/build.mjs`（src→lib 拷贝）、`node scripts/validate.mjs`（静态校验）。

**参考实现（已下载到本机，可读）：** `%TEMP%\niulai-pet\index.js`（host settings 注册模式）、`%TEMP%\niulai-pet\src__client__config.ts`（ConfigStore 双后端模式）、`%TEMP%\niulai-pet\src__client__card.tsx`（设置卡片注册 API：`settingsScope.bind({namespace})` + `slots.inject('settings.plugin.item')`）。

**测试设施说明：** 本仓库无单元测试框架（纯 JS 插件 + `scripts/validate.mjs` 静态校验），TDD 适配为「先改 validate.mjs 加校验 → 实现 → 运行 build+validate 全绿 → 手动清单验证」。

**动作枚举（与现有 ANIM 表行一一对应，零新素材）：**
`jumping`(row4) / `waving`(row3) / `failed`(row5) / `waiting`(row6) / `review`(row8)

---

### Task 1: 依赖与 host 半 settings 命名空间注册

**Files:**
- Modify: `package.json`（依赖 +2）
- Modify: `src/index.js`（顶部 import + schema + apply 注册）
- Test: `node scripts/validate.mjs`（新增检查，见 Task 6；本任务先确保不破坏现有校验）

- [ ] **Step 1: package.json 加依赖**

```json
"dependencies": {
  "@deepseek-ai/dsh-settings": "^0.1.0-rc.7",
  "@deepseek-ai/schemastery": "^3.18.1"
}
```

（在现有 `scripts` 与 `files` 之间的位置加入 `dependencies` 块。）

- [ ] **Step 2: 安装依赖**

Run: `npm install`（若公司镜像不可达，改用 `npm install --registry=https://registry.npmmirror.com`）
Expected: `package-lock.json` 生成，node_modules 就绪。

- [ ] **Step 3: src/index.js 顶部加 import 与 schema**

在现有 `import { fileURLToPath } from 'node:url'` 之后追加：

```js
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
```

在文件顶部的 `export const name = 'dsh-foxbell-pet'` 之后追加：

```js
export const FOXBELL_PET_NS = settingsNamespace('foxbell-pet')
export const ACTION_IDS = ['jumping', 'waving', 'failed', 'waiting', 'review']
const Action = z.union(ACTION_IDS)
export const Config = z.object({
  muted: z.boolean().default(false),
  shoutOnDone: z.boolean().default(true),
  talkative: z.boolean().default(true),
  doneAction: Action.default('jumping'),
  pokeAction: Action.default('waving'),
})
```

- [ ] **Step 4: apply 签名加 config 并注册 settings**

`export async function apply(ctx)` 改为 `export async function apply(ctx, config)`，函数体第一行追加：

```js
  installSettingsSection(ctx, FOXBELL_PET_NS, Config, Config(config ?? {}), {
    setSource: () => {},
    onChange: () => {},
  })
```

- [ ] **Step 5: 构建并校验**

Run: `node scripts/build.mjs && node scripts/validate.mjs`
Expected: `lib/index.js <- src/index.js` 输出；validate 全绿（现有检查项）。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/index.js lib/index.js
git commit -m "feat: register foxbell-pet settings namespace (rc.7+)"
```

---

### Task 2: client 端 ConfigStore + 行为配置接入

**Files:**
- Modify: `src/client.js`

**语义定标：** `muted`=总静音（不播任何语音）；`shoutOnDone`=完成语音开关（关掉则完成时只动嘴不说话）；`talkative`=语音字幕气泡开关（false 时语音照播但不出气泡）；`doneAction`/`pokeAction`=动作枚举（见头部枚举）。

- [ ] **Step 1: factory 内新增 ConfigStore（放在 `STORE_KEY` 常量定义之后）**

```js
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
                  s.set(k, legacy[k]).then(() => {}, () => {})
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
```

- [ ] **Step 2: 在 Pet 组件外创建全局 store 并在组件内订阅**

在 `const petStore = {...}` 定义之后加：

```js
    const cfgStore = createConfigStore()
```

在 `Pet` 组件内 `const [visible, setVisible] = ...` 之后加：

```js
      const [cfg, setCfg] = React.useState(cfgStore.getSnapshot())
      React.useEffect(() => cfgStore.subscribe(() => setCfg(cfgStore.getSnapshot())), [])
      const cfgRef = React.useRef(cfg)
      cfgRef.current = cfg
```

- [ ] **Step 3: muted / shoutOnDone / talkative 接入现有语音路径**

在 `playVoice` 函数开头（`if (!voice) return` 之后）加：

```js
          if (cfgRef.current.muted) return
```

并将 `playVoice` 内的 `setBubble(text || voice.name)` 包一层：

```js
          if (cfgRef.current.talkative) setBubble(text || voice.name) // muted 时已提前 return；talkative=false 时语音照播但无字幕
```

在 `handleCompletions` 里 `const v = pickVoice('done') || pickVoice()` 之后加：

```js
          if (!cfgRef.current.shoutOnDone) return
          playVoice(v, undefined, cfgRef.current.doneAction) // 原写死 'jumping'，改为读配置
```

（把原 `playVoice(v, undefined, 'jumping')` 调用替换为上面这行。）

- [ ] **Step 4: 构建校验**

Run: `node scripts/build.mjs && node scripts/validate.mjs`
Expected: 全绿；`lib/client.js <- src/client.js`。

- [ ] **Step 5: Commit**

```bash
git add src/client.js lib/client.js
git commit -m "feat: config store + muted/shoutOnDone/talkative wiring (v1.3.0)"
```

---

### Task 3: 右键菜单（PetMenu）

**Files:**
- Modify: `src/client.js`

**实现：** 在 Pet 组件内加 `menu` 状态，`onContextMenu` 打开，点击外部 / Esc 关闭；菜单用 React 渲染到根节点内（fixed 定位在桌宠上方）；子页面模式实现动作选择（`menuPage: null | 'doneAction' | 'pokeAction'`）。

- [ ] **Step 1: 菜单状态与事件**

在 `const [lookFrame, setLookFrame] = React.useState(-1)` 附近加：

```js
      const [menu, setMenu] = React.useState(null) // { x, y } 或 null
      const [menuPage, setMenuPage] = React.useState(null) // null | 'actions' | 'about'
      const menuRef = React.useRef(null)
```

根 div 的 props 增加：

```js
        onContextMenu: (e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); setMenuPage(null) },
```

增加关闭副作用（放现有 `React.useEffect(() => {...}, [])` 同处或新 useEffect）：

```js
      React.useEffect(() => {
        if (menu === null) return
        const onDown = (e) => { if (menuRef.current && menuRef.current.contains(e.target)) return; setMenu(null) }
        const onKey = (e) => { if (e.key === 'Escape') setMenu(null) }
        window.addEventListener('pointerdown', onDown, true)
        window.addEventListener('keydown', onKey)
        return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey) }
      }, [menu])
```

- [ ] **Step 2: 菜单组件函数**

在 Pet 组件外（STYLE 定义前）定义：

```js
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
    const ACTION_LABEL = { jumping: '跳一跳', waving: '挥挥手', failed: '委屈', waiting: '等待', review: '审查' }
```

- [ ] **Step 3: 菜单渲染（root 的兄弟节点，fixed 定位，避免 root 拖拽事件冲突）**

Pet 组件 return 改为 `React.createElement(React.Fragment, null, rootDiv, menuEl)`：现有根 div 保持原样；在它之后插入（`menu !== null` 时）：

```js
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
```

（`cfg` 使用组件 state；菜单内所有写操作走 `cfgStore.set`，菜单与设置卡片共享。`About` 页渲染一行版本文本即可：`React.createElement('div', { className: 'dyn-pet-menu-item', onClick: () => setMenu(null) }, 'dsh-foxbell-pet v1.3.0')`。）

- [ ] **Step 4: 菜单样式**

在 `adoptStyles()` 的 style 文本末尾（`} 之前）追加：

```css
        .dyn-pet-menu { position: fixed; z-index: 2147483001; background: rgba(30,30,34,.96); color:#eee; font-size:13px; line-height:1.9; border-radius:10px; padding:4px 0; min-width:170px; box-shadow:0 6px 20px rgba(0,0,0,.4); cursor:default; user-select:none; }
        .dyn-pet-menu-item { padding: 3px 14px; cursor: pointer; }
        .dyn-pet-menu-item:hover { background: rgba(255,255,255,.08); }
        .dyn-pet-menu-item.sel { color: #fbbf24; }
        .dyn-pet-menu-toggle { display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 3px 14px; }
        .dyn-pet-menu-label { }
        .dyn-pet-menu-btn { background:#3f3f46; color:#eee; border:none; border-radius:6px; font-size:12px; padding:1px 10px; cursor:pointer; }
        .dyn-pet-menu-btn.on { background:#16a34a; }
        .dyn-pet-menu-sub { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:3px 14px; cursor:pointer; }
        .dyn-pet-menu-sub:hover { background:rgba(255,255,255,.08); }
        .dyn-pet-menu-val { color:#a1a1aa; font-size:12px; }
        .dyn-pet-menu-divider { height:1px; margin:4px 10px; background:rgba(255,255,255,.12); }
```

- [ ] **Step 5: 构建校验**

Run: `node scripts/build.mjs && node scripts/validate.mjs`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src/client.js lib/client.js
git commit -m "feat: right-click menu (toggles/actions/perf/show-about) (v1.3.0)"
```

---

### Task 4: 拖拽物理手感（重力坠落 + 抛掷惯性 + 压扁回弹）

**Files:**
- Modify: `src/client.js`

**实现：** 拖拽 pointermove 采样最近 150ms 指针轨迹；pointerup 且 moved 时计算水平速度 vx，进入 rAF 坠落循环（重力 + 水平惯性阻尼），落地压扁回弹后若 vx 仍大继续水平滑行，否则回默认位。

- [ ] **Step 1: 采样与状态字段**

在 `const dragRef = React.useRef(null)` 附近加：

```js
      const physRef = React.useRef({ samples: [], fallRaf: 0 })
      const spriteRef = React.useRef(null)
```

- [ ] **Step 2: pointermove 采样（现有函数内追加）**

在 `onPointerMove` 的 `d.lastX = e.clientX; d.lastY = e.clientY` 之后加：

```js
        const ph = physRef.current
        const now = performance.now()
        ph.samples.push({ t: now, x: e.clientX, y: e.clientY })
        while (ph.samples.length > 0 && now - ph.samples[0].t > 150) ph.samples.shift()
```

- [ ] **Step 3: pointerup 启动物理（现有 `onPointerUp` 改造）**

将 `onPointerUp` 中 `if (!d.moved) { playTransient('waving', 1700) }` 的 `'waving'` 替换为 `cfgRef.current.pokeAction`（单击改播可配动作，时长 1700ms），并在 `refreshAnim()` 之后追加物理启动逻辑：

```js
        const ph = physRef.current
        if (d.moved && ph.samples.length >= 2) {
          const first = ph.samples[0]
          const last = ph.samples[ph.samples.length - 1]
          const dt = (last.t - first.t) / 1000
          const vx = dt > 0 ? (last.x - first.x) / dt : 0
          ph.samples = []
          startFall(last.x, last.y, vx)
        } else {
          ph.samples = []
        }
```

- [ ] **Step 4: 坠落函数（定义在 `onPointerUp` 之后、`onDoubleClick` 之前）**

```js
      const GRAVITY = 1400 // px/s^2
      const DAMP = 0.86
      const MIN_VX = 24
      const startFall = (x0, y0, vx0) => {
        const ph = physRef.current
        if (ph.fallRaf) cancelAnimationFrame(ph.fallRaf)
        let x = x0, y = y0, vx = vx0, vy = 0
        let last = performance.now()
        const ground = window.innerHeight - 76 - 18 // 与默认 bottom:76 的落点对齐
        const tick = (t) => {
          const dt = Math.min(0.05, (t - last) / 1000)
          last = t
          vy += GRAVITY * dt
          y += vy * dt
          vx *= Math.pow(DAMP, dt * 60)
          x += vx * dt
          if (y >= ground) {
            y = ground
            squashAnim()
            if (Math.abs(vx) < MIN_VX) {
              setPos(null) // 回默认锚点
              ph.fallRaf = 0
              return
            }
          }
          setPos({ x, y })
          ph.fallRaf = requestAnimationFrame(tick)
        }
        ph.fallRaf = requestAnimationFrame(tick)
      }
```

（`startFall` 是组件作用域 const，`onPointerUp` 事件回调运行时已初始化，无 TDZ 问题。）

- [ ] **Step 5: 压扁回弹**

加函数（`startFall` 之后）：

```js
      const squashAnim = () => {
        const el = spriteRef.current
        if (!el) return
        el.style.transition = 'transform 60ms ease-out'
        el.style.transform = 'scale(1, 0.55)'
        setTimeout(() => {
          el.style.transition = 'transform 240ms cubic-bezier(.34,1.56,.64,1)'
          el.style.transform = 'scale(1, 1)'
          setTimeout(() => { el.style.transition = ''; el.style.transform = '' }, 260)
        }, 60)
      }
```

并给 sprite div（`className: 'dyn-pet-sprite'` 那个）加 `ref: spriteRef`。

- [ ] **Step 6: 清理**

在组件 cleanup（现有 `return () => {...}`）里加：

```js
          if (physRef.current.fallRaf) cancelAnimationFrame(physRef.current.fallRaf)
```

- [ ] **Step 7: 构建 + 手动验证清单**

Run: `node scripts/build.mjs && node scripts/validate.mjs`
Expected: 全绿。手动（浏览器）：拖起松手→重力坠落+压扁回弹；快速横甩→水平惯性滑行；单击→播 pokeAction（默认挥挥）；右键→菜单弹出。

- [ ] **Step 8: Commit**

```bash
git add src/client.js lib/client.js
git commit -m "feat: drag physics (gravity fall, throw inertia, squash bounce) (v1.3.0)"
```

---

### Task 5: 设置卡片（rc.7+，settingsScope + slots）

**Files:**
- Modify: `src/client.js`

- [ ] **Step 1: 设置卡片组件（文件内、`apply` 之前定义）**

```js
    function SettingsCard(props) {
      const ctx = props.ctx
      const [cfg, setCfg] = React.useState(cfgStore.getSnapshot())
      React.useEffect(() => cfgStore.subscribe(() => setCfg(cfgStore.getSnapshot())), [])
      const toggle = (k, v) => cfgStore.set({ [k]: v })
      const rows = [
        { k: 'muted', label: '声音' },
        { k: 'shoutOnDone', label: '完成时喊' },
        { k: 'talkative', label: '气泡' },
      ]
      return React.createElement('div', { className: 'dyn-pet-settings' },
        rows.map((r) => React.createElement('label', { key: r.k, className: 'dyn-pet-settings-row' },
          React.createElement('span', null, r.label),
          React.createElement('input', { type: 'checkbox', checked: !!cfg[r.k], onChange: (e) => toggle(r.k, e.target.checked) }),
        )),
        React.createElement('div', { className: 'dyn-pet-settings-row' },
          React.createElement('span', null, '完成时动作'),
          React.createElement('select', { value: cfg.doneAction, onChange: (e) => toggle('doneAction', e.target.value) },
            CFG_ACTIONS.map((a) => React.createElement('option', { key: a, value: a }, ACTION_LABEL[a] || a)),
          ),
        ),
        React.createElement('div', { className: 'dyn-pet-settings-row' },
          React.createElement('span', null, '戳我动作'),
          React.createElement('select', { value: cfg.pokeAction, onChange: (e) => toggle('pokeAction', e.target.value) },
            CFG_ACTIONS.map((a) => React.createElement('option', { key: a, value: a }, ACTION_LABEL[a] || a)),
          ),
        ),
      )
    }

    function registerSettingsCard(ctx) {
      if (!ctx.get('settingsScope')) return
      const scope = ctx.settingsScope.bind({ namespace: 'foxbell-pet' })
      ctx.effect(() => cfgStore.attachScope(scope))
      const slots = ctx.get('slots') ?? ctx.slots
      if (slots === undefined) return
      slots.inject('settings.plugin.item', () => slots.register(
        { name: 'settings.plugin.item', id: 'foxbell-pet-settings', order: 100, label: () => 'Foxbell' },
        (props) => React.createElement(SettingsCard, Object.assign({}, props, { ctx })),
      ))
    }
```

- [ ] **Step 2: apply 中注册**

在 `apply` 函数的 `slots.inject('sidebar.footer.action', ...)` 之后加：

```js
      const settingsScope = ctx.get('settingsScope')
      if (settingsScope !== undefined) {
        registerSettingsCard(ctx)
      }
```

（client 的 inject 数组保持不变——`settingsScope` 用 `ctx.get` 可选读取，避免 rc.6 下 inject 挂起。）

- [ ] **Step 3: 卡片样式（追加到 adoptStyles）**

```css
        .dyn-pet-settings { padding: 8px 12px; font-size: 13px; color: #333; display: flex; flex-direction: column; gap: 6px; min-width: 220px; }
        .dyn-pet-settings-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .dyn-pet-settings-row select { max-width: 140px; }
```

- [ ] **Step 4: 构建 + 校验**

Run: `node scripts/build.mjs && node scripts/validate.mjs`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/client.js lib/client.js
git commit -m "feat: settings card via settings.plugin.item (rc.7+) (v1.3.0)"
```

---

### Task 6: 文档、validate 扩展与演示页

**Files:**
- Modify: `scripts/validate.mjs`
- Modify: `README.md`、`CHANGELOG.md`
- Modify: `demo/index.html`（展示新交互说明即可）

- [ ] **Step 1: validate.mjs 增加配置项校验**

在现有素材/JSON 检查之后追加（读 `src/index.js` 与 `src/client.js` 文本断言）：

```js
// v1.3.0: 交互配置一致性
const srcIndex = read(srcIndexPath)
const srcClient = read(srcClientPath)
check(/-['"]foxbell-pet['"]/, 'settings namespace key in index.js')
check(/installSettingsSection/, 'host registers settings section')
check(/doneAction/, 'config field doneAction present in client')
check(/pokeAction/, 'config field pokeAction present in client')
check(/dyn-pet-menu/, 'menu styles present in client')
```

（按现有 validate.mjs 的实际结构用 read/check 辅助函数实现，不强行改 API——沿用文件里已有的工具。）

- [ ] **Step 2: README 更新**

在「功能」节追加 v1.3.0 三条：右键菜单、拖拽物理手感、设置卡片（rc.7+），并把「交互」表补右键/戳动作/手感行。

- [ ] **Step 3: CHANGELOG 追加**

```markdown
## [1.3.0] - 2026-08-18
### Added
- 右键菜单：声音/完成时喊/气泡开关、完成时动作与戳我动作绑定、表演一下、隐藏、关于
- 拖拽物理手感：松手重力坠落、水平抛掷惯性、落地压扁回弹
- 设置卡片（dsh rc.7+，settings.plugin.item）：与右键菜单读写同一份配置
- 配置持久化：localStorage + settings scope 双后端（~/.dsh/settings.yaml）
```

- [ ] **Step 4: 构建校验**

Run: `node scripts/build.mjs && node scripts/validate.mjs`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add scripts/validate.mjs README.md CHANGELOG.md demo/index.html
git commit -m "docs: v1.3.0 changelog, README, validate checks"
```

---

## 验收清单（全部任务完成后）

- [ ] `npm install` 无错误，`npm run build` + `npm run validate` 全绿
- [ ] 右键菜单弹开/关闭、各开关即时生效
- [ ] 动作绑定：完成时动作与戳我动作生效且互相独立
- [ ] 物理手感：坠落/惯性/压扁回弹
- [ ] 设置卡片：rc.7+ 环境出现卡片；菜单改值 → 卡片同步（双向）
- [ ] 完成提醒主流程不回归（done 语音 + 动作 + 气泡）
- [ ] rc.6 模拟：无卡片，功能走 localStorage 正常
