import { describe, it, expect } from 'vitest'
import { sessionEvents, estimateTokens, estimateUserTokensByDay, hitRate, blocksTextOf } from '../src/host/dashboard.js'
import { derivePaceTier, DEFAULT_PACE, PACE_LABELS } from '../src/host/dashboard.js'
import { foldUsage, dateKeyOf, hourKeyOf, buildTrend, summarizeRange, foldToolsByDay } from '../src/host/dashboard.js'
import { evaluateAlerts, formatTokens } from '../src/host/dashboard.js'
import { ageLabel, summarize } from '../src/host/dashboard.js'

describe('dashboard', () => {
  it('sessionEvents prefers snapshotEvents() when available', () => {
    const fake = [{ type: 'turn/start', seq: 1, time: 1000, data: { turn: 0 } }]
    const session = { snapshotEvents: () => fake }
    expect(sessionEvents(session)).toBe(fake)
  })

  it('sessionEvents falls back to legacy .events array', () => {
    const fake = [{ type: 'turn/end', seq: 2, time: 2000, data: { turn: 0, reason: { kind: 'stop' } } }]
    const session = { events: fake }
    expect(sessionEvents(session)).toBe(fake)
  })

  it('sessionEvents returns [] for broken session shapes', () => {
    expect(sessionEvents(null)).toEqual([])
    expect(sessionEvents({ snapshotEvents: () => { throw new Error('x') }, events: [1] })).toEqual([1])
    expect(sessionEvents({})).toEqual([])
  })

  const NOW = 1_000_000_000
  const agg = (o) => Object.assign({ turnOpen: false, lastEventTime: null, eventCount5m: 0 }, o)

  it('no events at all -> idle with null sinceMs', () => {
    expect(derivePaceTier(agg({}), NOW, {})).toEqual({ tier: 'idle', sinceMs: null, label: PACE_LABELS.idle })
  })

  it('turn open + silent >= 3min -> longrun', () => {
    const r = derivePaceTier(agg({ turnOpen: true, lastEventTime: NOW - 180001, eventCount5m: 3 }), NOW, {})
    expect(r.tier).toBe('longrun')
  })

  it('turn open + dense events -> intense (before longrun check fails)', () => {
    const r = derivePaceTier(agg({ turnOpen: true, lastEventTime: NOW - 1000, eventCount5m: DEFAULT_PACE.intenseEvents }), NOW, {})
    expect(r.tier).toBe('intense')
  })

  it('turn open + normal flow -> active', () => {
    const r = derivePaceTier(agg({ turnOpen: true, lastEventTime: NOW - 5000, eventCount5m: 2 }), NOW, {})
    expect(r.tier).toBe('active')
  })

  it('turn closed + silence hits loaf ladder 15/25/35/60min', () => {
    const m = (x) => derivePaceTier(agg({ lastEventTime: NOW - x * 60000 }), NOW, {}).tier
    expect(m(14)).toBe('idle')
    expect(m(16)).toBe('loaf1')
    expect(m(26)).toBe('loaf2')
    expect(m(36)).toBe('loaf3')
    expect(m(61)).toBe('loaf4')
  })

  it('custom loafStart shifts the ladder', () => {
    const r = derivePaceTier(agg({ lastEventTime: NOW - 6 * 60000 }), NOW, { loafStartMs: 5 * 60000 })
    expect(r.tier).toBe('loaf1')
  })

  const usage = (i, o, cr, cw) => ({ inputTokens: i, outputTokens: o, cacheReadTokens: cr, cacheWriteTokens: cw })
  const msg = (turn, step, u, time) => ({ type: 'assistant/message', time, data: { turn, step, usage: u } })

  it('dateKeyOf formats local YYYY-MM-DD', () => {
    const d = new Date(2026, 8, 9, 10, 30)
    expect(dateKeyOf(d.getTime())).toBe('2026-09-09')
  })

  it('foldUsage sums by day and grand', () => {
    const evts = [
      msg(0, 0, usage(100, 20, 5, 0), new Date(2026, 8, 9, 9).getTime()),
      msg(0, 1, usage(200, 30, 0, 8), new Date(2026, 8, 9, 11).getTime()),
      msg(1, 0, usage(50, 10, 0, 0), new Date(2026, 8, 8, 23).getTime()),
    ]
    const r = foldUsage(evts)
    expect(r.grand.inputTokens).toBe(350)
    expect(r.grand.outputTokens).toBe(60)
    expect(r.grand.cacheWriteTokens).toBe(8)
    expect(r.byDay['2026-09-09'].inputTokens).toBe(300)
    expect(r.byDay['2026-09-08'].inputTokens).toBe(50)
  })

  it('foldUsage replaces same (turn,step) sample instead of double counting', () => {
    const t = new Date(2026, 8, 9, 9).getTime()
    const r = foldUsage([msg(0, 0, usage(100, 20, 0, 0), t), msg(0, 0, usage(150, 25, 0, 0), t + 10)])
    expect(r.grand.inputTokens).toBe(150)
    expect(r.grand.outputTokens).toBe(25)
  })

  it('foldUsage: llm/retry-started makes next sample additive', () => {
    const t = new Date(2026, 8, 9, 9).getTime()
    const retry = { type: 'llm/retry-started', time: t + 5, data: { turn: 0, step: 0 } }
    const r = foldUsage([msg(0, 0, usage(100, 20, 0, 0), t), retry, msg(0, 0, usage(80, 10, 0, 0), t + 10)])
    expect(r.grand.inputTokens).toBe(180)
  })

  it('foldUsage ignores events without usage and tolerates junk', () => {
    const r = foldUsage([null, { type: 'user/message', time: 1, data: { content: [] } }, { type: 'assistant/message', time: 2, data: { turn: 0, step: 0 } }])
    expect(r.grand.inputTokens).toBe(0)
    expect(r.byDay).toEqual({})
  })

  it('formatTokens short formats', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(12345)).toBe('1.2万')
    expect(formatTokens(100000)).toBe('10万')
    expect(formatTokens(123456789)).toBe('1.23亿')
  })

  it('no alerts when limit disabled', () => {
    expect(evaluateAlerts({ dayTotal: 0, grandTotal: 0 }, { dayTotal: 999, grandTotal: 999 }, { dayLimitTokens: 0, milestoneUnit: 0 })).toEqual([])
  })

  it('day warn fires on crossing 80%, once', () => {
    const cfg = { dayLimitTokens: 100, milestoneUnit: 0 }
    const a = evaluateAlerts({ dayTotal: 0, grandTotal: 0 }, { dayTotal: 80, grandTotal: 0 }, cfg)
    expect(a.length).toBe(1); expect(a[0].kind).toBe('day-warn')
    const b = evaluateAlerts({ dayTotal: 85, grandTotal: 0 }, { dayTotal: 95, grandTotal: 0 }, cfg)
    expect(b.filter((x) => x.kind === 'day-warn').length).toBe(0)
  })

  it('day hit fires on crossing 100%', () => {
    const a = evaluateAlerts({ dayTotal: 80, grandTotal: 0 }, { dayTotal: 100, grandTotal: 0 }, { dayLimitTokens: 100, milestoneUnit: 0 })
    expect(a[0].kind).toBe('day-hit')
  })

  it('milestone fires once per crossed multiple', () => {
    const cfg = { dayLimitTokens: 0, milestoneUnit: 1000 }
    const a = evaluateAlerts({ dayTotal: 0, grandTotal: 999 }, { dayTotal: 0, grandTotal: 1001 }, cfg)
    expect(a.length).toBe(1); expect(a[0].kind).toBe('milestone'); expect(a[0].id).toBe('milestone:1')
    const b = evaluateAlerts({ dayTotal: 0, grandTotal: 1500 }, { dayTotal: 0, grandTotal: 1800 }, cfg)
    expect(b.length).toBe(0)
  })

  it('day rollover does not re-fire (prev=big yesterday, next=small today)', () => {
    const a = evaluateAlerts({ dayTotal: 90, grandTotal: 0 }, { dayTotal: 10, grandTotal: 0 }, { dayLimitTokens: 100, milestoneUnit: 0 })
    expect(a.length).toBe(0)
  })

  it('ageLabel formats seconds/minutes/hours', () => {
    expect(ageLabel(-1)).toBe('')
    expect(ageLabel(45)).toBe('45s')
    expect(ageLabel(125)).toBe('2m')
    expect(ageLabel(7300)).toBe('2h')
  })

  it('summarize folds per-session metrics into board fields', () => {
    const ps = [
      { title: 'A', turns: 3, errors: 1, toolCalls: { bash: 4, edit: 1 }, toolDurMs: { bash: 15000, edit: 500 }, longestTurnMs: 30000 },
      { title: 'B', turns: 2, errors: 0, toolCalls: { bash: 1, grep: 2 }, toolDurMs: { bash: 3000 }, longestTurnMs: 90000 },
    ]
    const day = { inputTokens: 90000, outputTokens: 12000, cacheReadTokens: 20000, cacheWriteTokens: 0 }
    const s = summarize(ps, day)
    expect(s.sessions).toBe(2)
    expect(s.turns).toBe(5)
    expect(s.errors).toBe(1)
    expect(s.longestText).toBe('1.5 分钟')
    expect(s.toolsText.includes('bash×5')).toBeTruthy()
    expect(s.toolsText.includes('18.0 秒')).toBeTruthy() // 工具耗时合并：15000+3000=18000ms（次数+耗时，spec 6.4/F31）
    // 五口径（2026-09-10）：请求输入=90000+20000=11万；命中 2万/11万=18.2%；不再展示四桶总和
    expect(s.tokensText.includes('请求输入 11万')).toBeTruthy()
    expect(s.tokensText.includes('缓存命中 2万')).toBeTruthy()
    expect(s.tokensText.includes('18.2%')).toBeTruthy()
  })

  it('summarize tolerates empty input', () => {
    const s = summarize([], null)
    expect(s.sessions).toBe(0); expect(s.toolsText).toBe('—'); expect(s.longestText).toBe('0 秒')
  })

  // ---------- review 修复回归（2026-09-10） ----------

  it('day alert ids carry dateKey so next day re-fires distinctly', () => {
    const cfg = { dayLimitTokens: 100, milestoneUnit: 0 }
    const a = evaluateAlerts({ dayTotal: 0, grandTotal: 0 }, { dayTotal: 82, grandTotal: 0 }, cfg, '2026-09-10')
    expect(a[0].id).toBe('day-warn:2026-09-10')
    const b = evaluateAlerts({ dayTotal: 0, grandTotal: 0 }, { dayTotal: 82, grandTotal: 0 }, cfg, '2026-09-11')
    expect(b[0].id).toBe('day-warn:2026-09-11')
  })

  it('foldUsage skips samples without finite time (no NaN day bucket)', () => {
    const r = foldUsage([{ type: 'assistant/message', data: { turn: 0, step: 0, usage: { inputTokens: 50, outputTokens: 5 } } }])
    expect(r.grand.inputTokens).toBe(0)
    expect(r.byDay).toEqual({})
  })

  // ---------- 五口径（2026-09-10 用户裁定） ----------

  it('estimateTokens counts CJK per char and ascii per word', () => {
    expect(estimateTokens('你好')).toBe(2)
    expect(estimateTokens('hello world')).toBe(2)
    expect(estimateTokens('你好 hello')).toBe(3)
    expect(estimateTokens('')).toBe(0)
  })

  it('estimateUserTokensByDay buckets user messages by day', () => {
    const t = new Date(2026, 8, 10, 9).getTime()
    const ev = [
      { type: 'user/message', time: t, data: { content: [{ type: 'text', text: '你好世界' }] } },
      { type: 'user/message', time: t + 1000, data: { content: [{ type: 'text', text: 'three words here' }] } },
      { type: 'assistant/message', time: t, data: { usage: {} } },
      { type: 'user/message', time: new Date(2026, 8, 9).getTime(), data: { content: [{ type: 'text', text: '昨天的' }] } },
      null,
    ]
    const r = estimateUserTokensByDay(ev)
    expect(r['2026-09-10']).toBe(4 + 3)
    expect(r['2026-09-09']).toBe(3)
  })

  it('hitRate: full, partial, and zero denominator', () => {
    expect(hitRate({ inputTokens: 0, cacheReadTokens: 100 })).toBe(1)
    expect(Math.abs(hitRate({ inputTokens: 100, cacheReadTokens: 300 }) - 0.75) < 1e-9).toBeTruthy()
    expect(hitRate({})).toBe(0)
    expect(hitRate(null)).toBe(0)
  })

  it('summarize tokensText uses five-caliber terminology', () => {
    const s = summarize([], { inputTokens: 884130, outputTokens: 77608, cacheReadTokens: 5315328, cacheWriteTokens: 0 }, 9300)
    expect(s.tokensText.includes('请求输入 619.9万')).toBeTruthy()
    expect(s.tokensText.includes('缓存命中 531.5万')).toBeTruthy()
    expect(s.tokensText.includes('85.7%')).toBeTruthy()
    expect(s.tokensText.includes('产出 7.8万')).toBeTruthy()
    expect(s.tokensText.includes('你的输入 ~9300(估) · 含子代理')).toBeTruthy()
    const zero = summarize([], null, 0)
    expect(zero.tokensText.includes('请求输入 0')).toBeTruthy()
    expect(zero.tokensText.includes('（缓存命中 0 · 0.0%）')).toBeTruthy()
  })

  // ---- v2.2 Task 1：byRoute / requestCount / byHour ----
  const mkMsg = (turn, step, time, usage, source) => ({
    type: 'assistant/message', time, data: { turn, step, usage, message: source ? { source } : undefined },
  })
  const U = (i, o, c) => ({ inputTokens: i, outputTokens: o, cacheReadTokens: c })

  it('foldUsage routes usage by provider/model and counts settled samples', () => {
    const evts = [
      mkMsg(0, 0, 1000, U(100, 10, 0), { provider: 'p1', model: 'm1' }),
      mkMsg(0, 1, 2000, U(50, 5, 20), { provider: 'p2', model: 'm2' }),
    ]
    const f = foldUsage(evts)
    expect(f.requestCount).toBe(2)
    expect(f.byRoute['p1/m1'].inputTokens).toBe(100)
    expect(f.byRoute['p2/m2'].cacheReadTokens).toBe(20)
    expect(f.byRoute['p1/m1'].requestCount).toBe(1)
  })

  it('foldUsage replacement moves usage between routes and decrements requestCount', () => {
    const evts = [
      mkMsg(0, 0, 1000, U(100, 10, 0), { provider: 'p1', model: 'm1' }),
      mkMsg(0, 0, 3000, U(70, 7, 0), { provider: 'p2', model: 'm2' }), // 同 (turn,step) 替换
    ]
    const f = foldUsage(evts)
    expect(f.requestCount).toBe(1)
    expect(f.byRoute['p1/m1']).toBeUndefined()           // 旧路由账全部冲回
    expect(f.byRoute['p2/m2'].inputTokens).toBe(70)
    expect(f.byRoute['p2/m2'].requestCount).toBe(1)
  })

  it('foldUsage missing source goes to 未知 bucket', () => {
    const f = foldUsage([mkMsg(0, 0, 1000, U(10, 1, 0), undefined)])
    expect(f.byRoute['未知'].inputTokens).toBe(10)
  })

  it('foldUsage byHour buckets by calendar hour key', () => {
    const t = new Date(2026, 8, 11, 14, 30, 0).getTime()
    const f = foldUsage([mkMsg(0, 0, t, U(10, 1, 0), { provider: 'p', model: 'm' })])
    expect(f.byHour['2026-09-11T14'].inputTokens).toBe(10)
    expect(hourKeyOf(t)).toBe('2026-09-11T14')
  })

  it('foldUsage carries requestCount on day/hour buckets and byDayRoute cross-dimension', () => {
    const t = new Date(2026, 8, 11, 14, 30, 0).getTime()
    const f = foldUsage([
      mkMsg(0, 0, t, U(10, 1, 0), { provider: 'p', model: 'm' }),
      mkMsg(0, 1, t + 1000, U(20, 2, 0), { provider: 'q', model: 'n' }),
    ])
    expect(f.byDay['2026-09-11'].requestCount).toBe(2)
    expect(f.byDayRoute['2026-09-11']['p/m'].inputTokens).toBe(10)
    expect(f.byDayRoute['2026-09-11']['q/n'].inputTokens).toBe(20)
    // 同 (turn,step) 替换：byDayRoute 同步冲回旧路由
    const g = foldUsage([
      mkMsg(0, 0, t, U(10, 1, 0), { provider: 'p', model: 'm' }),
      mkMsg(0, 0, t + 1000, U(5, 1, 0), { provider: 'q', model: 'n' }),
    ])
    expect(g.byDayRoute['2026-09-11']['p/m']).toBeUndefined()
    expect(g.byDayRoute['2026-09-11']['q/n'].inputTokens).toBe(5)
    expect(g.byDay['2026-09-11'].requestCount).toBe(1)
  })

  // ---- v2.2 Task 2：buildTrend / summarizeRange / foldToolsByDay ----
  const fold1 = () => foldUsage([
    mkMsg(0, 0, new Date(2026, 8, 11, 10, 0).getTime(), U(100, 40, 60), { provider: 'p', model: 'm1' }),
  ])

  it('buildTrend returns 14 ascending day buckets with zero-fill and derived fields', () => {
    const now = new Date(2026, 8, 11, 15, 0).getTime()
    const t = buildTrend([fold1()], now)
    expect(t.days).toHaveLength(14)
    expect(t.days[13].key).toBe('2026-09-11')
    expect(t.days[13].dayTotal).toBe(200)
    expect(t.days[13].requestTotal).toBe(160)
    expect(t.days[13].hitPct).toBeCloseTo(0.375, 5) // 60/160
    expect(t.days[13].requestCount).toBe(1)
    expect(t.days[0].key).toBe('2026-08-29')
    expect(t.days[0].dayTotal).toBe(0)
  })

  it('buildTrend returns 24 hour buckets for today only', () => {
    const now = new Date(2026, 8, 11, 15, 0).getTime()
    const t = buildTrend([fold1()], now)
    expect(t.hours).toHaveLength(24)
    expect(t.hours[10].requestTotal).toBe(160)
    expect(t.hours[0].key).toBe('2026-09-11T00')
    expect(t.hours[23].key).toBe('2026-09-11T23')
  })

  it('summarizeRange aggregates days/models/tools/userEst within [from, to]', () => {
    const now = new Date(2026, 8, 11, 15, 0).getTime()
    const f = fold1()
    const tools = { byDay: { '2026-09-11': { bash: { count: 3, durMs: 1200 } } } }
    const userEst = { '2026-09-11': 55 }
    const r = summarizeRange([f], [tools], [userEst], '2026-09-10', '2026-09-11')
    expect(r.days.map((d) => d.key)).toEqual(['2026-09-10', '2026-09-11'])
    expect(r.totals.requestTotal).toBe(160)
    expect(r.totals.userEst).toBe(55)
    expect(r.models[0]).toMatchObject({ route: 'p/m1', provider: 'p', model: 'm1', requestTotal: 160 })
    expect(r.tools[0]).toEqual({ name: 'bash', count: 3, durMs: 1200 })
  })

  it('foldToolsByDay counts tool calls and durations defensively', () => {
    const evts = [
      { type: 'tool/call', time: new Date(2026, 8, 11, 9).getTime(), data: { name: 'bash' } },
      { type: 'tool/result', time: new Date(2026, 8, 11, 9).getTime() + 500, data: { name: 'bash', durationMs: 500 } },
      { type: 'tool/call', time: new Date(2026, 8, 11, 9).getTime() + 600, data: {} }, // 无名 → 忽略
    ]
    const t = foldToolsByDay(evts)
    expect(t.byDay['2026-09-11'].bash).toEqual({ count: 2, durMs: 500 })
  })
})
