# 效率看板一期 实施计划（v1.4.0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 v1.3.0 代码基线上落地效率看板一期：5 组件（时长姿态引擎 / Token 计量器 / 审批召集链 / 小黑板 / 表达容器）+ 2 小增强（年龄标注、审批直达），对应 spec `docs/superpowers/specs/2026-09-09-efficiency-dashboard-brainstorm.md` 的「一期」24 条功能点。

**Architecture:** 胖宿主薄客户端——全部计算（档位/用量/警报/汇总/年龄）在宿主半 `src/dashboard.js` 纯函数 + `src/index.js` 聚合，经既有 `/dyn-pet-foxbell/state` 快照下发 `dashboard` 字段；客户端 `src/client.js` 只做渲染与交互（悬停迷你条/黑板/举牌/标题闪烁/菜单）。事件读取对 rc.1 的 `session.snapshotEvents()` 做双兼容。

**Tech Stack:** 纯 JS（无转译，`src→lib` 目录复制构建）；客户端 React 18 `require('react')` + `createElement`（无 JSX）；测试用 Node 内置 `node --test`； schemastery 配置 schema。

## Global Constraints（每个任务隐含遵守）

- 目标宿主：老 dsh（rc.7 约定）继续可用；事件读取双兼容 `session.snapshotEvents()`（rc.1+）与 `session.events`（老版）。设置卡注册**维持旧 API**（`installSettingsSection`）——rc.1 完整兼容是 v2.0.0 spec FR-2/FR-3 的范围，本计划不动。
- 客户端 bundle 纯度：`src/client.js` 只能 `require('react')`；禁止 import/export 语法（validate 检查产物为 CJS 风格 factory）。
- 版本：完成后 `package.json` → `1.4.0`；「关于」菜单同步。
- 不变量：localStorage 键 `dyn-pet-foxbell-visible` / `dyn-foxbell-pet:state-v1` / `dyn-pet-foxbell-x` 不改名；`/state` 轮询 1.5s 不变；路由前缀 `/dyn-pet-foxbell/` 不变。
- 口径：纯 token，不出现任何金额；白名单——宠物上不显示 prompt 原文/代码内容/密钥（工具名、标题、数字、时间可以）。
- 交互规则（spec 6.6）：单击每目标唯一行为；悬停纯读取（迷你条内无可点元素）；拖拽无附加命令；ESC 分层关闭（手动迷你条→黑板→菜单）；滚轮在宠物本体穿透、面板内滚动。
- 每个任务收尾必须三绿后提交：`npm run build && npm run validate && npm test`。
- 工作分支：`feature/efficiency-dashboard-p1`（从 `main` 切出）。

---

### Task 1: 分支 + 测试/构建基建 + snapshotEvents 双兼容采集器

**Files:**
- Create: `src/dashboard.js`（本任务只加 `sessionEvents`）
- Create: `test/dashboard.test.mjs`
- Modify: `scripts/build.mjs`（复制清单加 `dashboard.js`）
- Modify: `scripts/validate.mjs`（codeFiles 加 `src/dashboard.js`、`lib/dashboard.js`）
- Modify: `package.json`（scripts 加 `"test": "node --test test/"`）
- Modify: `src/index.js`（`scanSession` 的 `events` 取值改走 `sessionEvents`）
- Modify: `src/client.js`（不改逻辑——本任务仅验证构建链路）

**Interfaces:**
- Produces: `sessionEvents(session): Array` —— dashboard.js 的第一个导出；后续所有任务的事件来源。`import { sessionEvents } from './dashboard.js'`（host 侧相对导入）。

- [ ] **Step 1: 建分支**

```bash
cd /Users/jarvis/Documents/DeepSeek/DeepSeek-plugins/dsh-foxbell-pet
git checkout main && git pull --ff-only && git checkout -b feature/efficiency-dashboard-p1
```

- [ ] **Step 2: 写失败测试**

`test/dashboard.test.mjs`：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionEvents } from '../src/dashboard.js'

test('sessionEvents prefers snapshotEvents() when available', () => {
  const fake = [{ type: 'turn/start', seq: 1, time: 1000, data: { turn: 0 } }]
  const session = { snapshotEvents: () => fake }
  assert.equal(sessionEvents(session), fake)
})

test('sessionEvents falls back to legacy .events array', () => {
  const fake = [{ type: 'turn/end', seq: 2, time: 2000, data: { turn: 0, reason: { kind: 'stop' } } }]
  const session = { events: fake }
  assert.equal(sessionEvents(session), fake)
})

test('sessionEvents returns [] for broken session shapes', () => {
  assert.deepEqual(sessionEvents(null), [])
  assert.deepEqual(sessionEvents({ snapshotEvents: () => { throw new Error('x') }, events: [1] }), [1])
  assert.deepEqual(sessionEvents({}), [])
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test test/dashboard.test.mjs`
Expected: FAIL（`Cannot find module '../src/dashboard.js'`）

- [ ] **Step 4: 最小实现**

`src/dashboard.js`：

```js
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
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test test/dashboard.test.mjs`
Expected: 3 pass

- [ ] **Step 6: 接线 index.js + 构建/校验脚本**

`src/index.js` 第 7-9 行 import 区追加：

```js
import { sessionEvents } from './dashboard.js'
```

`scanSession` 内（原 `const events = session && Array.isArray(session.events) ? session.events : []`，约 158 行）替换为：

```js
    const events = sessionEvents(session)
```

`scripts/build.mjs` 复制循环改为：

```js
for (const f of ['index.js', 'client.js', 'dashboard.js']) {
```

`scripts/validate.mjs` 的 codeFiles 改为：

```js
const codeFiles = ['src/index.js', 'src/client.js', 'src/dashboard.js', 'lib/index.js', 'lib/client.js', 'lib/dashboard.js']
```

`package.json` scripts 加：

```json
"test": "node --test test/"
```

- [ ] **Step 7: 三绿 + 提交**

```bash
npm run build && npm run validate && npm test
git add -A && git commit -m "feat(dashboard): 测试/构建基建 + snapshotEvents 双兼容采集器"
```

Expected: build 同步 3 个文件；validate 无红；test 3 pass。

---

### Task 2: derivePaceTier 时长档位引擎（组件①）

**Files:**
- Modify: `src/dashboard.js`
- Test: `test/dashboard.test.mjs`

**Interfaces:**
- Produces:
  - `PACE_LABELS: {intense,active,longrun,idle,loaf1..loaf4}` 中文名表
  - `DEFAULT_PACE = { intenseEvents: 12, longrunSilentMs: 180000, loafStartMs: 900000 }`
  - `derivePaceTier(agg, now, opt?) -> { tier: string, sinceMs: number|null, label: string }`；`agg = { turnOpen: boolean, lastEventTime: number|null, eventCount5m: number }`（Task 6 由宿主跨会话聚合）。档位判定顺序（turn 开着）：长跑(静默≥longrunSilentMs) > 高强度(5min 事件数≥intenseEvents) > 活跃；turn 关着：摸鱼阶梯 [loafStart, +10m, +20m, +45m]（默认 15/25/35/60 分钟）> 空闲。

- [ ] **Step 1: 写失败测试**（追加到 `test/dashboard.test.mjs`）

```js
import { derivePaceTier, DEFAULT_PACE, PACE_LABELS } from '../src/dashboard.js'

const NOW = 1_000_000_000
const agg = (o) => Object.assign({ turnOpen: false, lastEventTime: null, eventCount5m: 0 }, o)

test('no events at all -> idle with null sinceMs', () => {
  assert.deepEqual(derivePaceTier(agg({}), NOW, {}), { tier: 'idle', sinceMs: null, label: PACE_LABELS.idle })
})

test('turn open + silent >= 3min -> longrun', () => {
  const r = derivePaceTier(agg({ turnOpen: true, lastEventTime: NOW - 180001, eventCount5m: 3 }), NOW, {})
  assert.equal(r.tier, 'longrun')
})

test('turn open + dense events -> intense (before longrun check fails)', () => {
  const r = derivePaceTier(agg({ turnOpen: true, lastEventTime: NOW - 1000, eventCount5m: DEFAULT_PACE.intenseEvents }), NOW, {})
  assert.equal(r.tier, 'intense')
})

test('turn open + normal flow -> active', () => {
  const r = derivePaceTier(agg({ turnOpen: true, lastEventTime: NOW - 5000, eventCount5m: 2 }), NOW, {})
  assert.equal(r.tier, 'active')
})

test('turn closed + silence hits loaf ladder 15/25/35/60min', () => {
  const m = (x) => derivePaceTier(agg({ lastEventTime: NOW - x * 60000 }), NOW, {}).tier
  assert.equal(m(14), 'idle')
  assert.equal(m(16), 'loaf1')
  assert.equal(m(26), 'loaf2')
  assert.equal(m(36), 'loaf3')
  assert.equal(m(61), 'loaf4')
})

test('custom loafStart shifts the ladder', () => {
  const r = derivePaceTier(agg({ lastEventTime: NOW - 6 * 60000 }), NOW, { loafStartMs: 5 * 60000 })
  assert.equal(r.tier, 'loaf1')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`  → Expected: FAIL（derivePaceTier 未导出）

- [ ] **Step 3: 实现**（追加到 `src/dashboard.js`）

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`  → Expected: 全部 pass

- [ ] **Step 5: 三绿 + 提交**

```bash
npm run build && npm run validate && npm test
git add -A && git commit -m "feat(dashboard): derivePaceTier 时长档位引擎（长跑/高强度/活跃/摸鱼四阶）"
```

---

### Task 3: foldUsage token 三分账（组件②数据核，含 retry 语义）

**Files:**
- Modify: `src/dashboard.js`
- Test: `test/dashboard.test.mjs`

**Interfaces:**
- Produces:
  - `dateKeyOf(ms): string`（本地时区 `YYYY-MM-DD`）
  - `foldUsage(evts) -> { byDay: { [dateKey]: {inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens} }, grand: {…同四键} }`
  - 语义与 harness `packages/llm/token-meter/src/usage-projection.ts`（rc.1）一致：只统计 `assistant/message` 事件的 `data.usage`（流式 usage chunk 会被最终消息样本替换，跳过即可）；同 `(turn,step)` 的重复样本做替换而非累加；`llm/retry-started` 关闭替换槽，使重试的下一个样本累加。字段名：`inputTokens/outputTokens/cacheReadTokens/cacheWriteTokens`（缺失按 0）。

- [ ] **Step 1: 写失败测试**（追加）

```js
import { foldUsage, dateKeyOf } from '../src/dashboard.js'

const usage = (i, o, cr, cw) => ({ inputTokens: i, outputTokens: o, cacheReadTokens: cr, cacheWriteTokens: cw })
const msg = (turn, step, u, time) => ({ type: 'assistant/message', time, data: { turn, step, usage: u } })

test('dateKeyOf formats local YYYY-MM-DD', () => {
  const d = new Date(2026, 8, 9, 10, 30)
  assert.equal(dateKeyOf(d.getTime()), '2026-09-09')
})

test('foldUsage sums by day and grand', () => {
  const evts = [
    msg(0, 0, usage(100, 20, 5, 0), new Date(2026, 8, 9, 9).getTime()),
    msg(0, 1, usage(200, 30, 0, 8), new Date(2026, 8, 9, 11).getTime()),
    msg(1, 0, usage(50, 10, 0, 0), new Date(2026, 8, 8, 23).getTime()),
  ]
  const r = foldUsage(evts)
  assert.equal(r.grand.inputTokens, 350)
  assert.equal(r.grand.outputTokens, 60)
  assert.equal(r.grand.cacheWriteTokens, 8)
  assert.equal(r.byDay['2026-09-09'].inputTokens, 300)
  assert.equal(r.byDay['2026-09-08'].inputTokens, 50)
})

test('foldUsage replaces same (turn,step) sample instead of double counting', () => {
  const t = new Date(2026, 8, 9, 9).getTime()
  const r = foldUsage([msg(0, 0, usage(100, 20, 0, 0), t), msg(0, 0, usage(150, 25, 0, 0), t + 10)])
  assert.equal(r.grand.inputTokens, 150)
  assert.equal(r.grand.outputTokens, 25)
})

test('foldUsage: llm/retry-started makes next sample additive', () => {
  const t = new Date(2026, 8, 9, 9).getTime()
  const retry = { type: 'llm/retry-started', time: t + 5, data: { turn: 0, step: 0 } }
  const r = foldUsage([msg(0, 0, usage(100, 20, 0, 0), t), retry, msg(0, 0, usage(80, 10, 0, 0), t + 10)])
  assert.equal(r.grand.inputTokens, 180)
})

test('foldUsage ignores events without usage and tolerates junk', () => {
  const r = foldUsage([null, { type: 'user/message', time: 1, data: { content: [] } }, { type: 'assistant/message', time: 2, data: { turn: 0, step: 0 } }])
  assert.equal(r.grand.inputTokens, 0)
  assert.deepEqual(r.byDay, {})
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`  → Expected: FAIL

- [ ] **Step 3: 实现**（追加到 `src/dashboard.js`）

```js
// ---------- 组件②：token 三分账 ----------
// 与 harness token-meter 的 usage-projection 语义对齐（rc.1 验证）：最终 assistant/message
// 样本替换同 (turn,step) 的早期样本；llm/retry-started 关闭替换槽 → 重试样本累加。

export function dateKeyOf(ms) {
  const d = new Date(ms)
  const p = (x) => String(x).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

const USAGE_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
const zeroUsage = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })

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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`  → Expected: 全部 pass

- [ ] **Step 5: 三绿 + 提交**

```bash
npm run build && npm run validate && npm test
git add -A && git commit -m "feat(dashboard): foldUsage token 三分账（按天聚合 + 同槽替换 + retry 累加）"
```

---

### Task 4: evaluateAlerts 日阈值阶梯与里程碑（组件②被动喊）

**Files:**
- Modify: `src/dashboard.js`
- Test: `test/dashboard.test.mjs`

**Interfaces:**
- Produces:
  - `formatTokens(n): string`（`<1万` 显示整数；`<1亿` 显示 `x.x万`；再大 `x.x亿`，去掉尾零）
  - `evaluateAlerts(prev, next, cfg) -> [{ id, kind, text }]`；`prev/next = { dayTotal, grandTotal }`，`cfg = { dayLimitTokens, milestoneUnit }`（0=关）。**跨阈值判定**：仅当 `prev < 阈值 ≤ next` 才发——天然每档一次，无需持久化去重。kind：`'day-warn'`（80%）/ `'day-hit'`（100%）/ `'milestone'`（grand 过 unit 整数倍）。

- [ ] **Step 1: 写失败测试**（追加）

```js
import { evaluateAlerts, formatTokens } from '../src/dashboard.js'

test('formatTokens short formats', () => {
  assert.equal(formatTokens(999), '999')
  assert.equal(formatTokens(12345), '1.2万')
  assert.equal(formatTokens(100000), '10万')
  assert.equal(formatTokens(123456789), '1.23亿')
})

test('no alerts when limit disabled', () => {
  assert.deepEqual(evaluateAlerts({ dayTotal: 0, grandTotal: 0 }, { dayTotal: 999, grandTotal: 999 }, { dayLimitTokens: 0, milestoneUnit: 0 }), [])
})

test('day warn fires on crossing 80%, once', () => {
  const cfg = { dayLimitTokens: 100, milestoneUnit: 0 }
  const a = evaluateAlerts({ dayTotal: 0, grandTotal: 0 }, { dayTotal: 80, grandTotal: 0 }, cfg)
  assert.equal(a.length, 1); assert.equal(a[0].kind, 'day-warn')
  const b = evaluateAlerts({ dayTotal: 85, grandTotal: 0 }, { dayTotal: 95, grandTotal: 0 }, cfg)
  assert.equal(b.filter((x) => x.kind === 'day-warn').length, 0)
})

test('day hit fires on crossing 100%', () => {
  const a = evaluateAlerts({ dayTotal: 80, grandTotal: 0 }, { dayTotal: 100, grandTotal: 0 }, { dayLimitTokens: 100, milestoneUnit: 0 })
  assert.equal(a[0].kind, 'day-hit')
})

test('milestone fires once per crossed multiple', () => {
  const cfg = { dayLimitTokens: 0, milestoneUnit: 1000 }
  const a = evaluateAlerts({ dayTotal: 0, grandTotal: 999 }, { dayTotal: 0, grandTotal: 1001 }, cfg)
  assert.equal(a.length, 1); assert.equal(a[0].kind, 'milestone'); assert.equal(a[0].id, 'milestone:1')
  const b = evaluateAlerts({ dayTotal: 0, grandTotal: 1500 }, { dayTotal: 0, grandTotal: 1800 }, cfg)
  assert.equal(b.length, 0)
})

test('day rollover does not re-fire (prev=big yesterday, next=small today)', () => {
  const a = evaluateAlerts({ dayTotal: 90, grandTotal: 0 }, { dayTotal: 10, grandTotal: 0 }, { dayLimitTokens: 100, milestoneUnit: 0 })
  assert.equal(a.length, 0)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`  → Expected: FAIL

- [ ] **Step 3: 实现**（追加到 `src/dashboard.js`）

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`  → Expected: 全部 pass

- [ ] **Step 5: 三绿 + 提交**

```bash
npm run build && npm run validate && npm test
git add -A && git commit -m "feat(dashboard): evaluateAlerts 日阈值阶梯(80/100)与里程碑，跨阈值一次性判定"
```

---

### Task 5: ageLabel + summarize 黑板汇总（组件④数据）

**Files:**
- Modify: `src/dashboard.js`
- Test: `test/dashboard.test.mjs`

**Interfaces:**
- Produces:
  - `ageLabel(sec): string`（`''`/`'12s'`/`'3m'`/`'2h'`）
  - `summarize(perSession, dayUsage) -> { sessions, turns, errors, tokensText, toolsText, longestText }`（`perSession: [{ title, turns, errors, toolCalls: {name:count}, longestTurnMs }]`，`dayUsage` 为 foldUsage 的某日桶；输出展示字符串由宿主拼好——薄客户端只渲染）。

- [ ] **Step 1: 写失败测试**（追加）

```js
import { ageLabel, summarize } from '../src/dashboard.js'

test('ageLabel formats seconds/minutes/hours', () => {
  assert.equal(ageLabel(-1), '')
  assert.equal(ageLabel(45), '45s')
  assert.equal(ageLabel(125), '2m')
  assert.equal(ageLabel(7300), '2h')
})

test('summarize folds per-session metrics into board fields', () => {
  const ps = [
    { title: 'A', turns: 3, errors: 1, toolCalls: { bash: 4, edit: 1 }, longestTurnMs: 30000 },
    { title: 'B', turns: 2, errors: 0, toolCalls: { bash: 1, grep: 2 }, longestTurnMs: 90000 },
  ]
  const day = { inputTokens: 90000, outputTokens: 12000, cacheReadTokens: 20000, cacheWriteTokens: 0 }
  const s = summarize(ps, day)
  assert.equal(s.sessions, 2)
  assert.equal(s.turns, 5)
  assert.equal(s.errors, 1)
  assert.equal(s.longestText, '1.5 分钟')
  assert.ok(s.toolsText.includes('bash×5'))
  assert.ok(s.tokensText.includes('12.2万'))
})

test('summarize tolerates empty input', () => {
  const s = summarize([], null)
  assert.equal(s.sessions, 0); assert.equal(s.toolsText, '—'); assert.equal(s.longestText, '0 秒')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`  → Expected: FAIL

- [ ] **Step 3: 实现**（追加到 `src/dashboard.js`）

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`  → Expected: 全部 pass

- [ ] **Step 5: 三绿 + 提交**

```bash
npm run build && npm run validate && npm test
git add -A && git commit -m "feat(dashboard): ageLabel 年龄标注 + summarize 黑板汇总"
```

---

### Task 6: 宿主集成——/state 扩展 dashboard 字段 + Config 新配置

**Files:**
- Modify: `src/index.js`
- Test: 手工验证（本任务是接线，纯逻辑已在 Task 2-5 覆盖；`npm run validate` 检查语法与一致性）

**Interfaces:**
- Consumes: Task 1-5 的全部导出。
- Produces（`/dyn-pet-foxbell/state` 新增字段，客户端 Task 7-14 依赖的**唯一契约**）：

```js
dashboard: {
  pace: { tier, label, sinceMs },                 // derivePaceTier 全局聚合结果
  usage: {
    day:   { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },  // 今日全项目合计
    session: { title, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } | null,  // 最近活跃会话今日
    grandTotal: number,                            // 全项目累计（里程碑口径）
  },
  alerts: [ { id, kind, text } ],                  // 本次轮询新产生的警报（客户端按 id 去重播报）
  approvals: [ { id, title, waitMin } ],           // 各会话未决审批与已等待分钟
  summary: { sessions, turns, errors, tokensText, toolsText, longestText },
}
// projects[] 每项新增：age: string（ageLabel，如 '3m'；无事件 ''）
```

- [ ] **Step 1: 扩展 Config schema**（`src/index.js` 的 `Config` 对象追加字段）

```js
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
```

- [ ] **Step 2: scanSession 扩展**——在 `scanSession` 中增加一次正向遍历（放在现有两个逆向循环之前），收集今日指标与全局信号。`scanSession(session, dayStartMs)` 签名加第二参：

在 `const lines = []` 之前加入：

```js
    const metrics = { turns: 0, errors: 0, toolCalls: {}, longestTurnMs: 0, turnStartAt: {}, lastEventTime: null, pendingList: [] }
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
        const st = metrics.turnStartAt[d.turn]
        if (typeof st === 'number' && today && ev.time - st > metrics.longestTurnMs) metrics.longestTurnMs = ev.time - st
      } else if (ev.type === 'tool/call' && typeof d.name === 'string' && today) {
        metrics.toolCalls[d.name] = (metrics.toolCalls[d.name] || 0) + 1
      } else if (ev.type === 'approval/asked' && typeof d.id === 'string') {
        metrics.pendingList.push({ id: d.id, at: ev.time })
      }
    }
    const pendingIds = new Set()
    for (let i = events.length - 1; i >= 0; i--) {   // 未决审批：倒序记 decided，正向遇到未 decided 的 asked 即挂起
      const ev = events[i]
      const d = ev && ev.data
      if (!d) continue
      if (ev.type === 'approval/decided' && typeof d.id === 'string') pendingIds.add(d.id)
    }
    metrics.pendingList = metrics.pendingList.filter((p) => !pendingIds.has(p.id))
```

`return { title, lines, lastEnd, latestTurnStartSeq, pendingApproval, metrics }`（metrics 挂进返回值）。

- [ ] **Step 3: computeProjects 聚合 dashboard**——`computeProjects` 内（`const now = Date.now()` 之后）加：

```js
    // ---------- 效率看板聚合（spec 2026-09-09 §6）----------
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    const dayKey = dateKeyOf(now)
    let aggTurnOpen = false, aggLastEvent = null, agg5m = 0
    let dayUsage = zeroUsage(), grandTotal = 0, latestSession = null, latestTime = -1
    const approvals = []
    const perSessionMetrics = []
```

roots 循环内（`scanSession` 调用改为 `scanSession(session, dayStart.getTime())`，拿到 `info.metrics` 后）：

```js
      const m = info.metrics
      if (m) {
        if (m.lastEventTime !== null) { if (m.lastEventTime > aggLastEvent) aggLastEvent = m.lastEventTime; agg5m += events5mCount(sessionEventsCache, m.lastEventTime) }
        const hasOpenTurn = info.latestTurnStartSeq !== null && info.lastEnd !== null && info.latestTurnStartSeq > info.lastEnd.seq
          || (info.latestTurnStartSeq !== null && info.lastEnd === null)
        if (hasOpenTurn) aggTurnOpen = true
        const usage = foldUsage(sessionEventsCache)
        const dayB = usage.byDay[dayKey] || null
        if (dayB) for (const k of USAGE_KEYS_LOCAL) dayUsage[k] += dayB[k]
        grandTotal += usage.grand.inputTokens + usage.grand.outputTokens + usage.grand.cacheReadTokens + usage.grand.cacheWriteTokens
        if (m.lastEventTime !== null && m.lastEventTime > latestTime) { latestTime = m.lastEventTime; latestSession = { title: p-title-or-id, usage: dayB || zeroUsageLocal() } }
        perSessionMetrics.push({ title: (info.title || a.id), turns: m.turns, errors: m.errors, toolCalls: m.toolCalls, longestTurnMs: m.longestTurnMs })
        for (const pnd of m.pendingList) approvals.push({ id: a.id + ':' + pnd.id, title: info.title || a.id, waitMin: Math.floor((now - pnd.at) / 60000) })
      }
```

实现注意（执行者照此落地，命名以可读为准）：
- `sessionEventsCache` = 该会话的 `sessionEvents(session)` 结果（在循环开头取一次，`scanSession` 与 `foldUsage` 共用，避免两次采集）。
- `events5mCount` 为本地小函数：`evts.filter((e) => e && typeof e.time === 'number' && e.time > now - 300000 && ACTIVITY_TYPES.has(e.type)).length`，`ACTIVITY_TYPES = new Set(['user/message','assistant/message','tool/call','tool/result','turn/start','turn/end','approval/asked','approval/decided'])`。
- `zeroUsage()/USAGE_KEYS_LOCAL` 直接从 dashboard.js 再导出一份 `zeroUsage`（在 dashboard.js 追加 `export function zeroUsage()`——把 Task 3 的内部函数提为导出，Task 3 的实现改为 `export const zeroUsage = () => ({...})`，测试不需变）。
- pace 聚合结果与警报（模块级状态，函数外声明）：

```js
  let alertPrev = { dayTotal: 0, grandTotal: 0 }
  let paceState = { tier: 'idle', label: PACE_LABELS.idle, sinceMs: null }
  let summaryState = null
```

computeProjects 尾部：

```js
    if (config.paceEnabled) {
      paceState = derivePaceTier({ turnOpen: aggTurnOpen, lastEventTime: aggLastEvent, eventCount5m: agg5m }, now, {
        intenseEvents: config.paceIntenseEvents, longrunSilentMs: config.paceLongrunMin * 60000, loafStartMs: config.paceLoafStartMin * 60000,
      })
    }
    const dayTotal = dayUsage.inputTokens + dayUsage.outputTokens + dayUsage.cacheReadTokens + dayUsage.cacheWriteTokens
    const newAlerts = config.usageEnabled
      ? evaluateAlerts(alertPrev, { dayTotal, grandTotal }, { dayLimitTokens: config.dayLimitTokens, milestoneUnit: config.milestoneUnit })
      : []
    alertPrev = { dayTotal, grandTotal }
    summaryState = summarize(perSessionMetrics, dayUsage)
    dashState = {
      pace: paceState,
      usage: { day: dayUsage, session: latestSession, grandTotal },
      alerts: newAlerts,
      approvals: config.approvalFlickerMin > 0 ? approvals.filter((x) => x.waitMin >= 0) : [],
      summary: summaryState,
    }
```

（`let dashState = null` 声明在 apply 顶部状态区。）

- [ ] **Step 4: snapshot 下发**——`projectsList()` 的 `out.push({...})` 加 `age: p.age || ''`；computeProjects 里每个 project 记录 `age: ageLabel(m && m.lastEventTime != null ? Math.round((now - m.lastEventTime) / 1000) : NaN)`。`snapshot()` 返回对象追加：

```js
    dashboard: dashState,
```

import 行改为：

```js
import { sessionEvents, derivePaceTier, PACE_LABELS, foldUsage, dateKeyOf, evaluateAlerts, summarize, formatTokens, ageLabel, zeroUsage } from './dashboard.js'
```

（`formatTokens` 若宿主侧未直接用可不 import——以实际使用为准，validate 只查语法。）

- [ ] **Step 5: 验证 + 提交**

```bash
npm run build && npm run validate && npm test
curl -s http://127.0.0.1:3080/dyn-pet-foxbell/state | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const j=JSON.parse(s);console.log(JSON.stringify(j.dashboard,null,1));console.log('ages:',j.projects.map(p=>p.age))})"
```

（dsh web 未跑时跳过 curl，仅静态三绿。）Expected: `dashboard` 含 pace/usage/alerts/approvals/summary，projects 带 age。

```bash
git add -A && git commit -m "feat(dashboard): /state 下发 dashboard 快照（pace/usage/alerts/approvals/summary/age）+ 12 项新配置"
```

---

### Task 7: 客户端配置管道（CFG 默认值/清洗/设置卡数字行/右键三项 + 会话一览子页）

**Files:**
- Modify: `src/client.js`
- Test: 手工 QA

**Interfaces:**
- Consumes: 宿主 Config 新字段（键名与 Global Constraints 一致）。
- Produces: `cfgStore` 支持新键；设置卡出现 4 个开关 + 8 个数字输入；右键菜单新增「🏷 今日用量」（→ setMiniMode('manual')，Task 10 提供该 setter）、「📊 查看最近总结」（→ setBoard('manual')，Task 12 提供）、「🗂 会话一览」子页（→ 会话列表，点击走 onProjectClick）。

- [ ] **Step 1: CFG_DEFAULT 与清洗**——`CFG_DEFAULT` 替换为：

```js
    const CFG_DEFAULT = { muted: false, talkative: true, doneAction: 'jumping', dblAction: 'waving', approvalAction: 'waiting', errorAction: 'failed', gravity: true, paceEnabled: true, paceIntenseEvents: 12, paceLongrunMin: 3, paceLoafStartMin: 15, usageEnabled: true, dayLimitTokens: 0, milestoneUnit: 1000000, approvalFlickerMin: 5, summaryEnabled: true, summaryEntrySec: 15, boardTtlSec: 15, ttsEnabled: false }
    const CFG_ACTIONS = ['jumping', 'waving', 'failed', 'waiting', 'review', 'running']
    const ACTION_KEYS = ['doneAction', 'dblAction', 'approvalAction', 'errorAction']
    const BOOL_KEYS = ['muted', 'talkative', 'gravity', 'paceEnabled', 'usageEnabled', 'summaryEnabled', 'ttsEnabled']
    const NUM_KEYS = ['paceIntenseEvents', 'paceLongrunMin', 'paceLoafStartMin', 'dayLimitTokens', 'milestoneUnit', 'approvalFlickerMin', 'summaryEntrySec', 'boardTtlSec']
    const NUM_RANGE = { paceIntenseEvents: [1, 1000], paceLongrunMin: [1, 120], paceLoafStartMin: [1, 240], dayLimitTokens: [0, 1e9], milestoneUnit: [0, 1e9], approvalFlickerMin: [0, 120], summaryEntrySec: [5, 60], boardTtlSec: [5, 120] }
    const isAction = (v) => CFG_ACTIONS.includes(v)
    const clampNum = (k, v) => {
      const n = Number(v)
      if (!Number.isFinite(n)) return CFG_DEFAULT[k]
      const [lo, hi] = NUM_RANGE[k]
      return Math.min(hi, Math.max(lo, Math.round(n)))
    }
```

`sanitize` 替换为：

```js
      const sanitize = (k, v) => {
        if (ACTION_KEYS.includes(k)) return isAction(v) ? v : CFG_DEFAULT[k]
        if (NUM_KEYS.includes(k)) return clampNum(k, v)
        return !!v
      }
```

- [ ] **Step 2: 设置卡数字行**——`SettingsCard` 的 `rows` 后追加布尔行与数字行渲染：

```js
      const boolRows2 = [
        { k: 'paceEnabled', label: '节奏档位' },
        { k: 'usageEnabled', label: '用量统计' },
        { k: 'summaryEnabled', label: '工作总结' },
        { k: 'ttsEnabled', label: 'TTS 朗读' },
      ]
      const numRows = [
        { k: 'dayLimitTokens', label: '日 token 阈值(0=关)' },
        { k: 'milestoneUnit', label: '里程碑步长(0=关)' },
        { k: 'paceIntenseEvents', label: '高强度事件数/5min' },
        { k: 'paceLongrunMin', label: '长任务静默(分)' },
        { k: 'paceLoafStartMin', label: '摸鱼起点(分)' },
        { k: 'approvalFlickerMin', label: '审批闪烁(分,0=关)' },
        { k: 'summaryEntrySec', label: '总结入口时长(秒)' },
        { k: 'boardTtlSec', label: '黑板停留(秒)' },
      ]
```

渲染（插在现有 actionRows 渲染之后）：

```js
        boolRows2.map((r) => React.createElement('label', { key: r.k, className: 'dyn-pet-settings-row' },
          React.createElement('span', null, r.label),
          React.createElement('input', { type: 'checkbox', checked: !!cfg[r.k], onChange: (e) => toggle(r.k, e.target.checked) }),
        )),
        numRows.map((r) => React.createElement('label', { key: r.k, className: 'dyn-pet-settings-row' },
          React.createElement('span', null, r.label),
          React.createElement('input', { type: 'number', value: cfg[r.k], onChange: (e) => toggle(r.k, e.target.value) }),
        )),
```

- [ ] **Step 3: 右键菜单三项 + 会话一览子页**——主菜单（`About` 分支之前的默认分支）在 `ACTION_MENU` 渲染后、divider 前插入：

```js
              React.createElement('div', { className: 'dyn-pet-menu-divider' }),
              React.createElement('div', { className: 'dyn-pet-menu-item', onClick: () => { setMenu(null); miniOpen() } }, '🏷 今日用量'),
              React.createElement('div', { className: 'dyn-pet-menu-item', onClick: () => { setMenu(null); boardOpen() } }, '📊 查看最近总结'),
              React.createElement('div', { className: 'dyn-pet-menu-item', onClick: () => setMenuPage('Sessions') }, '🗂 会话一览'),
```

`menuPage === 'Sessions'` 分支（与 About 分支并列）：

```js
            : menuPage === 'Sessions' ? React.createElement(SessionsPage, { list: projects, onPick: (p) => { setMenu(null); onProjectClickInner(p) } })
```

（`onProjectClickInner` 即组件内现有 `onProjectClick`；SessionsPage 放组件外定义：）

```js
    function SessionsPage({ list, onPick }) {
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'dyn-pet-menu-item dyn-pet-menu-back', onClick: () => backFromSessions() }, '← 返回'),
        (list || []).length === 0 ? React.createElement('div', { className: 'dyn-pet-menu-item', style: { cursor: 'default' } }, '暂无会话') :
          list.map((p) => React.createElement('div', { key: p.id, className: 'dyn-pet-menu-item', onClick: () => onPick(p) },
            React.createElement('span', { className: 'dyn-pet-dot dot-' + p.status, style: { display: 'inline-block', marginRight: 8 } }),
            p.title || p.id,
          )),
      )
    }
```

（`backFromSessions` 由调用处传 `onBack: () => setMenuPage(null)` 更简——执行者用 props 传 `onBack`，去掉全局函数。）
`miniOpen`/`boardOpen` 本任务先建占位函数（Pet 组件内 `const miniOpen = () => {}` / `const boardOpen = () => {}`），Task 10/12 替换为真实现。

- [ ] **Step 4: 手工 QA + 提交**

`npm run build && npm run validate && npm test` 三绿；dsh web 内：右键菜单出现三项；「会话一览」列出各会话带色点、点击跳转；设置卡出现 4 开关 + 8 数字行，改动后刷新仍保留。

```bash
git add -A && git commit -m "feat(dashboard): 客户端配置管道——12 新键清洗/设置卡开关与数字行/右键今日用量+最近总结+会话一览"
```

---

### Task 8: 档位接入动画（组件①客户端半）

**Files:**
- Modify: `src/client.js`
- Test: 手工 QA

**Interfaces:**
- Consumes: `/state.dashboard.pace.tier`。
- Produces: 动画规则（spec 6.1 降级版——现有图集无狂奔/看表/咸鱼专属行）：`task === 'running' && tier === 'longrun'` → 播 `'waiting'`（看表代用）；tier 为 `loaf1..4` → 抑制 look 环视（咸鱼不东张西望）；其余维持现有优先级链（拖拽 > 瞬时 > 任务态 > look > idle）。**不变速**。

- [ ] **Step 1: dashRef 与档位读取**——Pet 组件内加：

```js
      const [pace, setPace] = React.useState(null)   // { tier, label, sinceMs }
      const paceRef = React.useRef(null)
```

大 effect 的 `refresh()` 处理链中（`applyProjects(r.projects)` 之后）加：

```js
            const dash = r.dashboard
            if (dash && dash.pace) { paceRef.current = dash.pace; setPace(dash.pace) }
```

- [ ] **Step 2: 动画优先级接入**——`refreshAnim` 改为：

```js
      const tierAnim = () => {
        const s = stateRef.current
        const tier = paceRef.current && paceRef.current.tier
        if (s.task === 'running' && tier === 'longrun') return 'waiting' // 长任务看表（代用行）
        return null
      }
      const refreshAnim = () => {
        const s = stateRef.current
        applyAnim(s.drag || s.transient || s.task || tierAnim() || (s.look ? 'look' : 'idle'))
      }
```

并在 `applyProjects` 更新 task 后、以及 `setPace` 生效路径末尾各调一次 `refreshAnim()`（档位变化也要重算——最简单：`React.useEffect(() => { refreshAnim() }, [pace])`）。

- [ ] **Step 3: 摸鱼抑制 look**——`startLook` 开头 guard：

```js
        const tier = paceRef.current && paceRef.current.tier
        if (tier === 'loaf1' || tier === 'loaf2' || tier === 'loaf3' || tier === 'loaf4') { scheduleNextLook(); return }
```

- [ ] **Step 4: 手工 QA + 提交**

构造验证：跑一个长任务（让 turn 开着静默 ≥3 分钟）→ 宠物切 `waiting` 行；静置 15 分钟 → 环视停止（档位 loaf1）。三绿后提交：

```bash
git add -A && git commit -m "feat(dashboard): 档位接入动画——长任务看表代用 + 摸鱼抑制环视（不变速）"
```

---

### Task 9: 卡片年龄标注（F83）+ 审批直达行为确认（F82）

**Files:**
- Modify: `src/client.js`
- Test: 手工 QA

**Interfaces:**
- Consumes: `projects[].age`（宿主已发字符串，如 `'3m'`；空串=无）。
- Produces: 卡片首行动态行行尾灰色年龄标注。F82 智能跳转 = 现有 `onProjectClick`（`sessions.open`）即「直达」：打开会话后审批命令在会话视图内阻塞展示，无需额外锚点——本任务仅更新注释与验证行为，不改代码路径。

- [ ] **Step 1: 渲染年龄**——卡片 lines 渲染处（`lines.map`）改为首行带后缀：

```js
                Array.isArray(p.lines) ? p.lines.map((l, i) => React.createElement('div', { key: i, className: 'dyn-pet-proj-line' },
                  l,
                  i === 0 && p.age ? React.createElement('span', { className: 'dyn-pet-age' }, ' ' + p.age) : null,
                )) : null,
```

- [ ] **Step 2: CSS**——`adoptStyles` 追加：

```css
        .dyn-pet-age { color: #c4a484; font-size: 10px; }
```

- [ ] **Step 3: 注释与验证**——`onProjectClick` 头注释补一行：`// 智能跳转（spec 6.3/6.6）：有待审批的会话，sessions.open 后审批命令在会话视图内直接可见`。QA：点带审批的红/黄卡 → 打开会话后审批命令可见；卡片首行行尾出现灰色 `12s/3m`。

- [ ] **Step 4: 三绿 + 提交**

```bash
npm run build && npm run validate && npm test
git add -A && git commit -m "feat(dashboard): 卡片行尾年龄标注 + 审批直达行为确认"
```

---

### Task 10: 悬停迷你条 + 节奏表盘（组件②主动查 + F52/F53/F60）

**Files:**
- Modify: `src/client.js`
- Test: 手工 QA

**Interfaces:**
- Consumes: `dashboard.pace`、`dashboard.usage`、`projects[]`（状态计数）。
- Produces: `MiniBar` 组件与 `miniMode` state（`null | 'hover' | 'manual'`）；`setMiniMode`；hover 0.5s 出现、移开消失；拖拽隐藏；与黑板互斥（黑板开着时不渲染）；Task 7 的 `miniOpen` 替换为 `() => setMiniMode('manual')`。**迷你条内零可点元素**。

- [ ] **Step 1: state 与 hover 逻辑**——Pet 组件加：

```js
      const [miniMode, setMiniMode] = React.useState(null)   // null | 'hover' | 'manual'
      const miniRef = React.useRef(null)
      const hoverTimerRef = React.useRef(null)
      const clearHoverTimer = () => { if (hoverTimerRef.current) { const d = hoverTimerRef.current; hoverTimerRef.current = null; try { d() } catch {} } }
```

sprite 元素（`dyn-pet-sprite` 的 div）加：

```js
            onPointerEnter: () => { if (miniMode !== 'manual') { clearHoverTimer(); hoverTimerRef.current = later(() => setMiniMode('hover'), 500) } },
            onPointerLeave: () => { clearHoverTimer(); if (miniMode === 'hover') setMiniMode(null) },
```

`onPointerDown` 开头（拖拽即隐藏）：`clearHoverTimer(); if (miniMode !== 'manual') setMiniMode(null)`。黑板开着时不渲染迷你条：渲染处 guard `board === null`（board state 由 Task 12 建；本任务先以 `const [board, setBoard] = React.useState(null)` 占位，`boardOpen` 占位替换为 `() => setBoard('manual')`）。

- [ ] **Step 2: MiniBar 组件**（组件外定义）：

```js
    const TIER_PCT = { intense: 100, active: 65, longrun: 50, idle: 20, loaf1: 12, loaf2: 8, loaf3: 5, loaf4: 3 }
    function MiniBar({ dash, projects }) {
      const pace = (dash && dash.pace) || {}
      const u = (dash && dash.usage) || {}
      const day = u.day || {}
      const daySum = (day.inputTokens || 0) + (day.outputTokens || 0) + (day.cacheReadTokens || 0) + (day.cacheWriteTokens || 0)
      const sess = u.session
      const sessSum = sess ? (sess.inputTokens || 0) + (sess.outputTokens || 0) + (sess.cacheReadTokens || 0) + (sess.cacheWriteTokens || 0) : null
      const counts = { approval: 0, running: 0, done: 0 }
      for (const p of projects || []) { if (counts[p.status] !== undefined) counts[p.status] += 1 }
      const fmt = (n) => n >= 100000000 ? (n / 100000000).toFixed(2).replace(/\.?0+$/, '') + '亿' : n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : String(Math.round(n || 0))
      return React.createElement('div', { className: 'dyn-pet-mini' },
        React.createElement('div', { className: 'dyn-pet-mini-dial' },
          React.createElement('div', { className: 'dyn-pet-mini-bar' }, React.createElement('i', { style: { width: (TIER_PCT[pace.tier] || 20) + '%' } })),
          React.createElement('span', { className: 'dyn-pet-mini-tier' }, pace.label || '空闲'),
        ),
        React.createElement('div', { className: 'dyn-pet-mini-row' }, '今日 ' + fmt(daySum) + (sessSum !== null ? ' · 本会话 ' + fmt(sessSum) : '')),
        React.createElement('div', { className: 'dyn-pet-mini-row' }, (counts.approval ? counts.approval + ' 等审批 · ' : '') + (counts.running ? counts.running + ' 运行 · ' : '') + (counts.done ? counts.done + ' 完成' : '') || '暂无进行中会话'),
        sess && sess.title ? React.createElement('div', { className: 'dyn-pet-mini-row dyn-pet-mini-dim' }, sess.title) : null,
      )
    }
```

- [ ] **Step 3: 渲染与 CSS**——Pet fragment 内（bubble 之后）：

```js
        miniMode !== null && board === null ? React.createElement('div', { ref: miniRef, className: 'dyn-pet-mini-wrap' },
          React.createElement(MiniBar, { dash: dashUiRef.current, projects: projects })) : null,
```

（`dashUiRef` = Pet 组件内保存最近一次 `r.dashboard` 的 ref；在大 effect 的 setPace 处同步 `dashUiRef.current = dash`；再补 `const [, forceMini] = React.useReducer((x) => x + 1, 0)` 并在 dashboard 更新时调用，保证迷你条数据随轮询刷新。）CSS：

```css
        .dyn-pet-mini-wrap { position: absolute; left: 100%; top: 12px; margin-left: 12px; z-index: 4; }
        .dyn-pet-mini { width: 210px; background: rgba(255,252,248,0.97); border: 1px solid rgba(122,74,43,0.3); border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #7a4a2b; line-height: 1.6; box-shadow: 0 2px 8px rgba(0,0,0,0.14); pointer-events: none; }
        .dyn-pet-mini-dial { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .dyn-pet-mini-bar { flex: 1; height: 6px; border-radius: 999px; background: rgba(122,74,43,0.15); overflow: hidden; }
        .dyn-pet-mini-bar i { display: block; height: 100%; background: linear-gradient(90deg,#f59e0b,#ef4444); border-radius: 999px; transition: width .4s ease; }
        .dyn-pet-mini-tier { font-weight: 700; white-space: nowrap; }
        .dyn-pet-mini-row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dyn-pet-mini-dim { color: #a07050; font-size: 11px; }
```

（`pointer-events: none` 落实「纯读取、不拦截下方点击」；手动模式同款——它依然零交互，点外部由 Task 14 的全局关闭处理。）

- [ ] **Step 4: 手工 QA + 提交**

悬停宠物 0.5s → 右侧浮出迷你条（表盘档位 + 今日/本会话 + 计数）；移开消失；拖拽中不出现；右键「今日用量」→ 手动出现。三绿后提交：

```bash
git add -A && git commit -m "feat(dashboard): 悬停迷你条+节奏表盘（hover 0.5s/手动/拖拽隐藏/纯只读）"
```

---

### Task 11: 举牌 + 警报语音三优先级（组件⑤：牌/泡分工 + F57 TTS）

**Files:**
- Modify: `src/client.js`
- Test: 手工 QA

**Interfaces:**
- Consumes: `dashboard.alerts[]`（`{id, kind, text}`）。
- Produces: `sign` state（牌面文本，ttl 4.2s）；警报播报三优先级 **usage 语音组 > TTS > 静默**；`seenAlertsRef` 客户端按 id 去重。

- [ ] **Step 1: 举牌 state 与消费**——Pet 组件加 `const [sign, setSign] = React.useState(null)`；大 effect 的 refresh 处理链（setPace 之后）：

```js
            if (Array.isArray(dash && dash.alerts)) {
              for (const a of dash.alerts) {
                if (!a || typeof a.id !== 'string' || seenAlertsRef.current.has(a.id)) continue
                seenAlertsRef.current.add(a.id)
                if (!cfgRef.current.usageEnabled) continue
                setSign(a.text)
                later(() => setSign(null), 4200)
                playTransient('jumping', 1600)
                if (cfgRef.current.muted) continue
                const v = pickVoice('usage')
                if (v) { playVoice(v, a.text, 'jumping'); continue }
                if (cfgRef.current.ttsEnabled && typeof window !== 'undefined' && window.speechSynthesis) {
                  try { const u = new window.SpeechSynthesisUtterance(a.text); u.lang = 'zh-CN'; window.speechSynthesis.speak(u) } catch {}
                }
              }
            }
```

（`seenAlertsRef = React.useRef(new Set())` 声明在组件顶部 ref 区。）

- [ ] **Step 2: 渲染与 CSS**——sprite 之前（`dyn-pet-top` 之后）：

```js
          sign ? React.createElement('div', { className: 'dyn-pet-sign' }, '🏷 ', sign) : null,
```

```css
        .dyn-pet-sign { position: absolute; bottom: 85%; left: 60%; transform: rotate(-4deg); background: #fffbe8; border: 1px solid rgba(122,74,43,0.45); color: #7a4a2b; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); pointer-events: none; z-index: 3; white-space: nowrap; }
```

- [ ] **Step 3: usage 语音组（可选资产）**——`assets/voice/usage/` 放 0 条也可（三优先级自动降级）；若放音频，`npm run validate` 不要求该组存在，勿把它加进必查组。

- [ ] **Step 4: 手工 QA + 提交**

把 `dayLimitTokens` 设为很小值（如 1000）→ 下一次对话后举牌「今日 token 已用 80%…」；无 usage 语音组 + ttsEnabled 开 → 浏览器朗读；两者皆无 → 静默只举牌。三绿后提交：

```bash
git add -A && git commit -m "feat(dashboard): 举牌警报 + 语音三优先级（usage 组 > TTS > 静默）"
```

---

### Task 12: 小黑板 + 📖 限时入口 + 关宠分发 + 菜单唤回（组件④客户端半）

**Files:**
- Modify: `src/client.js`
- Test: 手工 QA

**Interfaces:**
- Consumes: `dashboard.summary`（宿主拼好的展示字段）、`completions` 差分（已有）、`summaryEnabled/summaryEntrySec/boardTtlSec` 配置。
- Produces: `board` state（`null | { mode: 'manual' | 'farewell' }`）；入口 `entry` state；Board 组件（✕/点外部/ESC/自动消失四路关闭——ESC 在 Task 14 统一收口）；关宠（petStore visible 真→假）→ farewell 黑板。

- [ ] **Step 1: state 与入口触发**——Pet 组件加：

```js
      const [board, setBoard] = React.useState(null)
      const [entry, setEntry] = React.useState(false)
      const boardRef = React.useRef(null)
      const petRootRef = React.useRef(null)
```

大 effect `handleCompletions` 末尾追加：

```js
          if (cfgRef.current.summaryEnabled) {
            setEntry(true)
            later(() => setEntry(false), (cfgRef.current.summaryEntrySec || 15) * 1000)
          }
```

关宠 farewell（Pet 组件加 effect）：

```js
      React.useEffect(() => petStore.subscribe((v) => {
        setVisible(petStore.visible)
        if (petStore.visible === false && cfgRef.current.summaryEnabled && dashUiRef.current && dashUiRef.current.summary) {
          setBoard({ mode: 'farewell' })
          later(() => setBoard(null), (cfgRef.current.boardTtlSec || 15) * 1000)
        }
      }), [])
```

（现有 `petStore.subscribe(() => setVisible(...))` 的 effect 合并成上面这一个。）

- [ ] **Step 2: Board 组件与渲染**（组件外定义）：

```js
    function Board({ dash, mode, ttlSec, onClose }) {
      const s = (dash && dash.summary) || null
      if (!s) return null
      return React.createElement('div', { className: 'dyn-pet-board' + (mode === 'farewell' ? ' farewell' : '') },
        React.createElement('div', { className: 'dyn-pet-board-head' },
          React.createElement('span', null, mode === 'farewell' ? '今日收工 🦊' : '工作小结'),
          React.createElement('button', { className: 'dyn-pet-board-x', onClick: (e) => { e.stopPropagation(); onClose() } }, '✕'),
        ),
        React.createElement('div', { className: 'dyn-pet-board-row' }, '会话 ' + s.sessions + ' · turn ' + s.turns + ' · 报错 ' + s.errors),
        React.createElement('div', { className: 'dyn-pet-board-row' }, '今日 token ' + s.tokensText),
        React.createElement('div', { className: 'dyn-pet-board-row' }, '工具 Top3 ' + s.toolsText),
        React.createElement('div', { className: 'dyn-pet-board-row' }, '最长单 turn ' + s.longestText),
      )
    }
```

渲染：黑板与迷你条互斥规则=黑板优先。Pet fragment 末尾（menu 之后）：

```js
        board !== null ? React.createElement('div', { ref: boardRef, style: { position: 'fixed', right: 24, bottom: 76, zIndex: 2147483000 } },
          React.createElement(Board, { dash: dashUiRef.current, mode: board.mode, ttlSec: cfg.boardTtlSec, onClose: () => setBoard(null) })) : null,
        entry && visible ? React.createElement('div', { className: 'dyn-pet-entry', onClick: (e) => { e.stopPropagation(); setEntry(false); setBoard({ mode: 'manual' }) } }, '📖 总结') : null,
```

注意：`if (!visible) return null` 现在只应跳过宠物主 root（黑板 farewell 要在隐藏后仍渲染）——把 `if (!visible) return null` 移到主 root 元素的三元里（`visible ? React.createElement('div', { ref: petRootRef, className: 'dyn-pet-root', ... }, ...) : null`），黑板/菜单渲染保留在 fragment 层。CSS：

```css
        .dyn-pet-board { width: 260px; background: #2f2a26; color: #f3e9dc; border-radius: 12px; padding: 10px 12px; font-size: 12.5px; line-height: 1.7; box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
        .dyn-pet-board.farewell { border: 1px solid rgba(251,191,36,0.5); }
        .dyn-pet-board-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 4px; }
        .dyn-pet-board-x { background: transparent; border: none; color: #d6c7b2; cursor: pointer; font-size: 13px; padding: 0 2px; }
        .dyn-pet-board-row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dyn-pet-entry { position: absolute; right: -8px; top: -6px; background: #fffbe8; border: 1px solid rgba(122,74,43,0.5); color: #7a4a2b; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 3px 10px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.15); z-index: 3; }
```

（入口挂在主 root 内 sprite 右上——主 root 隐藏时入口随 `visible` guard 消失 ✓。）

- [ ] **Step 3: Task 7 占位替换**——`boardOpen` 改为 `() => setBoard({ mode: 'manual' })`。

- [ ] **Step 4: 手工 QA + 提交**

跑完一个任务 → 📖 入口出现 15s；点击 → 黑板展开 15s 自动消失；✕/点黑板外关闭；右键「查看最近总结」随时唤回；隐藏桌宠 → farewell 黑板出现后自动消失，宠物保持隐藏。三绿后提交：

```bash
git add -A && git commit -m "feat(dashboard): 小黑板+限时总结入口+关宠分发+菜单唤回（黑板优先/零常驻）"
```

---

### Task 13: 标题闪烁（组件③页外召集）

**Files:**
- Modify: `src/client.js`
- Test: 手工 QA

**Interfaces:**
- Consumes: `dashboard.approvals[]`（`{id, title, waitMin}`）、`approvalFlickerMin`（0=关）、`document.visibilityState`。
- Produces: 页面不可见且存在 `waitMin ≥ N` 的未决审批 → `document.title` 每秒轮换 `🦊 审批等待中…`/原标题；回到页面或审批 decided（approvals 不再满足）即恢复。

- [ ] **Step 1: effect**——Pet 组件加（依赖空数组，全部走 ref）：

```js
      React.useEffect(() => {
        const base = document.title
        let on = false, t = null, flip = false
        const stop = () => { if (t) { clearInterval(t); t = null } if (on) { document.title = base; on = false } }
        const tick = () => {
          const min = cfgRef.current.approvalFlickerMin
          const dash = dashUiRef.current
          const hit = min > 0 && dash && Array.isArray(dash.approvals)
            && dash.approvals.some((a) => a && a.waitMin >= min)
            && document.visibilityState !== 'visible'
          if (hit && !on) {
            on = true
            t = setInterval(() => { flip = !flip; document.title = flip ? '🦊 审批等待中…' : base }, 1000)
          } else if (!hit && on) stop()
        }
        tick()
        const iv = setInterval(tick, 1500)
        const onVis = () => tick()
        document.addEventListener('visibilitychange', onVis)
        return () => { clearInterval(iv); stop(); document.removeEventListener('visibilitychange', onVis) }
      }, [])
```

- [ ] **Step 2: 手工 QA + 提交**

造一个待审批会话（等 ≥ 配置分钟数），切到其他标签页 → 标签页标题闪烁；回页面/批准后恢复。三绿后提交：

```bash
git add -A && git commit -m "feat(dashboard): 审批等待超时的标签页标题闪烁（页不可见才启动）"
```

---

### Task 14: ESC 分层关闭 + 滚轮穿透（spec 6.6 规则 7/8 + 轮 6 缺口）

**Files:**
- Modify: `src/client.js`
- Test: 手工 QA

**Interfaces:**
- Produces: ESC 一次剥一层（手动迷你条 → 黑板 → 菜单）；手动迷你条/黑板点外部关闭；宠物本体与迷你条上滚轮转发给下方可滚动元素，黑板/菜单内部正常滚动。

- [ ] **Step 1: 统一 ESC 与外部点击**——现有菜单 effect 里的 `onKey`（Escape → setMenu(null)）**删除**（避免双关），`onDown` 保留。新增统一 effect：

```js
      React.useEffect(() => {
        const onKey = (e) => {
          if (e.key !== 'Escape') return
          if (miniMode === 'manual') { setMiniMode(null); return }
          if (board !== null) { setBoard(null); return }
          if (menu !== null) setMenu(null)
        }
        const onDown = (e) => {
          if (miniMode !== 'manual' && board === null) return
          const t = e.target
          if (miniRef.current && miniRef.current.contains(t)) return
          if (boardRef.current && boardRef.current.contains(t)) return
          if (petRootRef.current && petRootRef.current.contains(t)) return
          if (menuRef.current && menuRef.current.contains(t)) return
          if (miniMode === 'manual') setMiniMode(null)
          if (board !== null) setBoard(null)
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('pointerdown', onDown, true)
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown, true) }
      }, [miniMode, board, menu])
```

- [ ] **Step 2: 滚轮穿透**——Pet 组件加工具函数并挂到主 root 的 `onWheel`：

```js
      const scrollableAncestor = (el) => {
        let n = el
        while (n && n !== document.body && n !== document.documentElement) {
          const st = getComputedStyle(n)
          if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll|overlay/.test(st.overflowY)) return n
          n = n.parentElement
        }
        return document.scrollingElement || document.body
      }
      const onWheel = (e) => {
        const root = e.currentTarget
        const prev = root.style.pointerEvents
        root.style.pointerEvents = 'none'
        const el = document.elementFromPoint(e.clientX, e.clientY)
        root.style.pointerEvents = prev || 'auto'
        if (!el) return
        const sc = scrollableAncestor(el)
        if (sc) sc.scrollTop += e.deltaY
      }
```

主 root div 属性追加 `onWheel: onWheel,`（黑板/菜单是独立 fixed 元素不经过该 handler，内部滚动天然正常）。

- [ ] **Step 3: 手工 QA + 提交**

手动迷你条开 → ESC 关迷你条（黑板仍在则再 ESC 关黑板，再 ESC 关菜单）；黑板 ✕ 与点外部等价；宠物悬在会话滚动区上滚滚轮 → 会话列表滚动而不是被挡。三绿后提交：

```bash
git add -A && git commit -m "feat(dashboard): ESC 分层关闭 + 宠物区滚轮穿透（spec 6.6 规则 7/8）"
```

---

### Task 15: v1.4.0 收尾——版本/CHANGELOG/README/全量 QA

**Files:**
- Modify: `package.json`（version 1.4.0）
- Modify: `src/client.js`（About 菜单 `v1.3.0` → `v1.4.0`）
- Modify: `CHANGELOG.md`、`README.md`、`README.en.md`

**Interfaces:** 无代码接口；发布文档。

- [ ] **Step 1: 版本与文案**——`package.json` version → `1.4.0`；About 菜单版本号同步；CHANGELOG 新增 `1.4.0` 段（效率看板一期：节奏档位/Token 计量器与阈值举牌/审批标题闪烁/工作小黑板/悬停迷你条/年龄标注/会话一览/12 项新配置；纯 token 口径说明）；README 两语言加「效率看板」小节（功能清单 + 交互速查表，内容取 spec 6.6 三层表）。

- [ ] **Step 2: 全量手工 QA**（在 dsh web rc 环境）：

1. 悬停 0.5s 迷你条出现/移开消失/右键今日用量手动开/ESC 关。
2. `dayLimitTokens=1000` 跑一轮对话 → 举牌 80% → 100%，各一次；`milestoneUnit=1000` 过关播一次。
3. 待审批等 5 分钟 + 切标签页 → 标题闪烁；批准 → 恢复。
4. 完成任务 → 📖 入口 15s → 点开黑板 → 自动消失；隐藏桌宠 → farewell 黑板。
5. 长任务静默 3 分钟 → waiting 行；静置 15 分钟 → 环视停。
6. 卡片行尾年龄标注随轮询更新；点卡片跳会话正常。
7. 会话一览子页列出全部会话、色点正确、点击跳转。
8. 滚轮穿透、拖拽物理、双击语音、四场景动作绑定回归正常。

- [ ] **Step 3: 三绿 + 提交 + 合并准备**

```bash
npm run build && npm run validate && npm test
git add -A && git commit -m "chore(release): v1.4.0 效率看板一期（5 组件 + 年龄标注/审批直达）"
```

（合并回 main 走 finishing-a-development-branch 流程，不在本计划内。）

---

## Self-Review 记录

- Spec 覆盖：一期 24 点 ↔ 任务映射——F28/F27/F29→T2/T6/T8；F13/F14/F37→T4/T6/T11；F52/F53/F60→T10；F26/F55/F82→T6/T9/T13；F35/F36→T5/T6/T12；F01/F05/F06/F08/F31→T3/T5/T6（F05 模型维度事件无 model 字段，一期 `usage.session` 不含模型桶，已在 tracking issue 记录）；F57→T11；F58→T7；F61→T11；F54/F83→T9/T10/T12 布局；纪律 5 条→T8/T10/T11/T14。无遗漏。
- 占位符扫描：Task 7 的 `miniOpen/boardOpen` 占位是**任务间接口**（T10/T12 显式替换），非未完成项；无 TBD。
- 类型一致性：`sessionEvents/derivePaceTier/foldUsage/dateKeyOf/evaluateAlerts/formatTokens/summarize/ageLabel/zeroUsage` 命名在 T1-T6 一致；`dashboard` 快照字段与 T7-T14 消费一致；`miniMode/board/entry/sign/pace` state 命名跨任务一致。
- 已知降级（记录进 tracking issue）：intense/loaf 无专属动画行（图集限制）；F05 模型维度待 harness 事件暴露 model 字段；审批锚点增强待 WebUI 锚点 API。
