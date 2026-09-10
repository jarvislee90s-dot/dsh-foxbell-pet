// 效率看板聚合测试（Task 2 / v2.1）：scanSession metrics 段 + 纯函数 buildDashboard +
// 引擎 dashboard() 缓存与警报基线。buildDashboard 直喂 4 个会话的裸事件数组，不走 cordis。
// 移植源：git show 886b303:src/index.js 的 scanSession metrics 段与 computeProjects 聚合段。
import { describe, it, expect } from 'vitest'
import { buildDashboard, scanSession, createStateEngine } from '../src/host/state.js'
import { dateKeyOf, PACE_LABELS } from '../src/host/dashboard.js'

const NOW = new Date(2026, 8, 11, 12, 0, 0, 0).getTime() // 本地 2026-09-11 12:00
const DAY = dateKeyOf(NOW) // '2026-09-11'
const DAY_START = (() => { const d = new Date(NOW); d.setHours(0, 0, 0, 0); return d.getTime() })()
const YESTERDAY = NOW - 24 * 60 * 60 * 1000
const MIN = 60 * 1000

const ev = (type, seq, time, data) => ({ type, seq, time, data })

/** 4 个假会话（裸事件数组）：开着的 turn / 昨日+今日用量 / 未决审批 / 陈旧关闭会话 */
function fourSessions() {
  const s1 = [
    ev('turn/start', 1, NOW - 60 * 1000, { turn: 1 }),
    ev('user/message', 2, NOW - 50 * 1000, { content: [{ type: 'text', text: '帮我看下构建日志' }] }),
    ev('assistant/message', 3, NOW - 40 * 1000, { turn: 1, step: 1, usage: { inputTokens: 1000, outputTokens: 400, cacheReadTokens: 3000, cacheWriteTokens: 200 } }),
    ev('tool/call', 4, NOW - 30 * 1000, { name: 'Bash', callId: 'c1', arguments: 'ls' }),
    ev('tool/result', 5, NOW - 25 * 1000, { message: { source: { callId: 'c1' }, content: [{ type: 'text', text: 'ok' }] } }),
    ev('assistant/message', 6, NOW - 20 * 1000, { turn: 1, step: 2, usage: { inputTokens: 500, outputTokens: 600, cacheReadTokens: 1000, cacheWriteTokens: 0 } }),
  ]
  const s2 = [
    ev('assistant/message', 1, YESTERDAY, { turn: 0, step: 0, usage: { inputTokens: 10000, outputTokens: 2000, cacheReadTokens: 5000, cacheWriteTokens: 1000 } }),
    ev('turn/start', 2, NOW - 10 * MIN, { turn: 2 }),
    ev('turn/end', 3, NOW - 9 * MIN, { turn: 2, reason: { kind: 'error', error: { message: 'boom' } } }),
    ev('approval/asked', 4, NOW - 8 * MIN, { id: 'a1' }),
    ev('approval/decided', 5, NOW - 7 * MIN, { id: 'a1', outcome: 'allowed-once' }),
    ev('user/message', 6, NOW - 6 * MIN, { content: [{ type: 'text', text: 'hi world' }] }),
  ]
  const s3 = [
    ev('turn/start', 1, NOW - 5 * MIN, { turn: 3 }),
    ev('approval/asked', 2, NOW - 2 * MIN, { id: 'p1' }),
  ]
  const s4 = [
    ev('turn/start', 1, NOW - 60 * MIN, { turn: 9 }),
    ev('assistant/message', 2, NOW - 59 * MIN, { turn: 9, step: 1, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
    ev('turn/end', 3, NOW - 58 * MIN, { turn: 9, reason: { kind: 'completed' } }),
  ]
  return [
    { id: 's1', title: 'alpha', events: s1 },
    { id: 's2', title: 'beta', events: s2 },
    { id: 's3', title: 'gamma', events: s3 },
    { id: 's4', title: 'delta', events: s4 },
  ]
}

describe('buildDashboard（4 会话假事件直喂）', () => {
  it('跨会话 pace：任一会话 turn 开着即进 active 带（关 turn + 长静默走摸鱼阶）', () => {
    const dash = buildDashboard(fourSessions(), {}, NOW)
    expect(dash.pace).toEqual({ tier: 'active', sinceMs: 20000, label: PACE_LABELS.active })
    const onlyStale = buildDashboard([fourSessions()[3]], {}, NOW)
    expect(onlyStale.pace.tier).toBe('loaf3') // 关 turn + 58min 静默：无 turnOpen 不进 active 带
  })

  it('usage 今日桶累加（昨日样本不入日桶）+ grandTotal + requestTotal + 命中率 + models 空桶', () => {
    const dash = buildDashboard(fourSessions(), {}, NOW)
    expect(dash.usage.day).toEqual({ inputTokens: 1600, outputTokens: 1050, cacheReadTokens: 4000, cacheWriteTokens: 200 })
    expect(dash.usage.grandTotal).toBe(24850) // 6700 (s1) + 18000 (s2 含昨日) + 150 (s4)
    expect(dash.usage.requestTotal).toBe(5600) // input + cacheRead
    expect(dash.usage.cacheHitRate).toBeCloseTo(4000 / 5600, 12)
    expect(dash.usage.models).toEqual({})
  })

  it('usage.session = 最后活跃会话的今日分账（含 requestTotal 派生）', () => {
    const dash = buildDashboard(fourSessions(), {}, NOW)
    expect(dash.usage.session).toEqual({
      title: 'alpha', inputTokens: 1500, outputTokens: 1000, cacheReadTokens: 4000, cacheWriteTokens: 200, requestTotal: 5500,
    })
  })

  it('approvals：未决审批带 waitMin，已 decided 的过滤掉', () => {
    const dash = buildDashboard(fourSessions(), {}, NOW)
    expect(dash.approvals).toEqual([{ id: 's3:p1', title: 'gamma', waitMin: 2 }])
  })

  it('summary：tokensText 五口径名词 + 轮次/错误/工具/最长回合', () => {
    const dash = buildDashboard(fourSessions(), {}, NOW)
    expect(dash.summary.sessions).toBe(4)
    expect(dash.summary.turns).toBe(4)
    expect(dash.summary.errors).toBe(1)
    for (const noun of ['请求输入', '缓存命中', '产出', '你的输入', '含子代理', '%']) {
      expect(dash.summary.tokensText).toContain(noun)
    }
    expect(dash.summary.tokensText).toContain('请求输入 5600')
    expect(dash.summary.toolsText).toContain('Bash×1（共 5.0 秒）')
    expect(dash.summary.longestText).toBe('2.0 分钟') // s4 的 120000ms 为最长回合
  })

  it('userEst：今日用户输入启发式估算跨会话累加（CJK 逐字 + ASCII 按词）', () => {
    const dash = buildDashboard(fourSessions(), {}, NOW)
    expect(dash.usage.userEst).toBe(10) // 8 个中文字 + "hi world" 2 词
  })

  it('alerts：跨阈值判定带 day key（day-warn:<date>），传入上一轮基线后不重复', () => {
    const first = buildDashboard(fourSessions(), { dayLimitTokens: 1000 }, NOW)
    expect(first.alerts.map((a) => a.id)).toEqual(['day-warn:' + DAY, 'day-hit:' + DAY])
    const du = first.usage.day
    const again = buildDashboard(fourSessions(), { dayLimitTokens: 1000 }, NOW, {
      dayTotal: du.inputTokens + du.outputTokens + du.cacheReadTokens + du.cacheWriteTokens,
      grandTotal: first.usage.grandTotal,
    })
    expect(again.alerts).toEqual([])
  })

  it('alerts：里程碑按 grandTotal 跨档一次', () => {
    const dash = buildDashboard(
      [{ id: 'm', title: 'm', events: [ev('assistant/message', 1, NOW - MIN, { turn: 1, step: 1, usage: { inputTokens: 1500000 } })] }],
      { milestoneUnit: 1000000 }, NOW,
    )
    expect(dash.alerts.map((a) => a.id)).toEqual(['milestone:1'])
  })

  it('配置门：approvalFlickerMin=0 清空 approvals；paceEnabled=false 下发 null；usageEnabled=false 无警报', () => {
    const data = fourSessions()
    expect(buildDashboard(data, { approvalFlickerMin: 0 }, NOW).approvals).toEqual([])
    expect(buildDashboard(data, { paceEnabled: false }, NOW).pace).toBe(null)
    expect(buildDashboard(data, { usageEnabled: false }, NOW).alerts).toEqual([])
  })
})

describe('scanSession metrics 段（v1.4.0 移植）', () => {
  it('今日 turns/errors/最长回合/最后事件时间；dayStartMs 缺省时全部计入今日', () => {
    const events = [
      ev('turn/start', 1, YESTERDAY, { turn: 0 }),
      ev('turn/end', 2, YESTERDAY + 1000, { turn: 0, reason: { kind: 'completed' } }),
      ev('turn/start', 3, NOW - 60 * 1000, { turn: 1 }),
      ev('turn/end', 4, NOW - 30 * 1000, { turn: 1, reason: { kind: 'interrupted' } }),
    ]
    const m = scanSession({ snapshotEvents: () => events.slice() }, null, DAY_START).metrics
    expect(m.turns).toBe(1) // 昨日的 turn/start 不计入今日
    expect(m.errors).toBe(1) // 今日 interrupted
    expect(m.longestTurnMs).toBe(30000)
    expect(m.lastEventTime).toBe(NOW - 30 * 1000)
    // 第三参缺省：无「今日」边界 → 全部计入
    expect(scanSession({ snapshotEvents: () => events.slice() }, null).metrics.turns).toBe(2)
  })

  it('pendingList 倒序 decidedIds 过滤未决审批（与 pendingApproval 口径一致）', () => {
    const events = [
      ev('approval/asked', 1, NOW - 5 * MIN, { id: 'gone' }),
      ev('approval/decided', 2, NOW - 4 * MIN, { id: 'gone', outcome: 'allowed-once' }),
      ev('approval/asked', 3, NOW - 2 * MIN, { id: 'kept' }),
    ]
    const info = scanSession({ snapshotEvents: () => events }, null, DAY_START)
    expect(info.metrics.pendingList).toEqual([{ id: 'kept', at: NOW - 2 * MIN }])
    expect(info.pendingApproval).toBe(true)
  })

  it('tool 耗时配对：message.source.callId 与首块 toolCallId 兜底，一次性消费累计', () => {
    const events = [
      ev('tool/call', 1, NOW - 4000, { name: 'Read', callId: 'r1' }),
      ev('tool/result', 2, NOW - 1500, { message: { content: [{ type: 'tool_use', toolCallId: 'r1' }] } }),
      ev('tool/call', 3, NOW - 3000, { name: 'Bash', callId: 'b1' }),
      ev('tool/result', 4, NOW - 1000, { message: { source: { callId: 'b1' }, content: [] } }),
    ]
    const m = scanSession({ snapshotEvents: () => events }, null, DAY_START).metrics
    expect(m.toolCalls).toEqual({ Read: 1, Bash: 1 })
    expect(m.toolDurMs).toEqual({ Read: 2500, Bash: 2000 })
  })
})

describe('createStateEngine dashboard()', () => {
  function harness(roots, sessions, opt = {}) {
    const eng = createStateEngine({
      roots: () => roots,
      getSession: (id) => sessions.get(id),
      getTitle: () => undefined,
      now: () => NOW,
      ...(opt.readConfig ? { readConfig: opt.readConfig } : {}),
    })
    return eng
  }

  it('首轮 compute 前 dashboard() 为 null；compute 后返回聚合（readConfig 缺省 → 默认门全开）', () => {
    const sessions = new Map([['g', { snapshotEvents: () => [ev('approval/asked', 1, NOW - 2 * MIN, { id: 'x' })] }]])
    const eng = harness([{ id: 'g', status: 'running' }], sessions)
    expect(eng.dashboard()).toBe(null)
    eng.compute()
    const dash = eng.dashboard()
    expect(dash).not.toBe(null)
    expect(dash.approvals).toEqual([{ id: 'g:x', title: 'g', waitMin: 2 }])
    expect(dash.summary.sessions).toBe(1)
    expect(dash.usage.models).toEqual({})
  })

  it('alerts 跨 compute：日阈值首次越过时发一次（id 带 day key），基线推进后不重复', () => {
    const events = []
    const sessions = new Map([['p1', { snapshotEvents: () => events }]])
    const eng = harness([{ id: 'p1', status: 'idle' }], sessions, { readConfig: () => ({ dayLimitTokens: 1000 }) })
    eng.compute()
    expect(eng.dashboard().alerts).toEqual([])
    events.push(ev('assistant/message', 1, NOW - MIN, { turn: 1, step: 1, usage: { inputTokens: 1000 } }))
    eng.compute()
    expect(eng.dashboard().alerts.map((a) => a.id)).toEqual(['day-warn:' + DAY, 'day-hit:' + DAY])
    eng.compute() // 无新增用量：基线已推进，不再补发
    expect(eng.dashboard().alerts).toEqual([])
  })

  it('readConfig 抛错 → 回退默认配置，不拖垮 compute', () => {
    const sessions = new Map([['p1', { snapshotEvents: () => [] }]])
    const eng = harness([{ id: 'p1', status: 'idle' }], sessions, { readConfig: () => { throw new Error('cfg boom') } })
    eng.compute()
    expect(eng.dashboard()).not.toBe(null)
  })
})
