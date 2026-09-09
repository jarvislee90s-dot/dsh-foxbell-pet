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

import { ageLabel, summarize } from '../src/dashboard.js'

test('ageLabel formats seconds/minutes/hours', () => {
  assert.equal(ageLabel(-1), '')
  assert.equal(ageLabel(45), '45s')
  assert.equal(ageLabel(125), '2m')
  assert.equal(ageLabel(7300), '2h')
})

test('summarize folds per-session metrics into board fields', () => {
  const ps = [
    { title: 'A', turns: 3, errors: 1, toolCalls: { bash: 4, edit: 1 }, toolDurMs: { bash: 15000, edit: 500 }, longestTurnMs: 30000 },
    { title: 'B', turns: 2, errors: 0, toolCalls: { bash: 1, grep: 2 }, toolDurMs: { bash: 3000 }, longestTurnMs: 90000 },
  ]
  const day = { inputTokens: 90000, outputTokens: 12000, cacheReadTokens: 20000, cacheWriteTokens: 0 }
  const s = summarize(ps, day)
  assert.equal(s.sessions, 2)
  assert.equal(s.turns, 5)
  assert.equal(s.errors, 1)
  assert.equal(s.longestText, '1.5 分钟')
  assert.ok(s.toolsText.includes('bash×5'))
  assert.ok(s.toolsText.includes('18.0 秒')) // 工具耗时合并：15000+3000=18000ms（次数+耗时，spec 6.4/F31）
  assert.ok(s.tokensText.includes('12.2万'))
})

test('summarize tolerates empty input', () => {
  const s = summarize([], null)
  assert.equal(s.sessions, 0); assert.equal(s.toolsText, '—'); assert.equal(s.longestText, '0 秒')
})

// ---------- review 修复回归（2026-09-10） ----------

test('day alert ids carry dateKey so next day re-fires distinctly', () => {
  const cfg = { dayLimitTokens: 100, milestoneUnit: 0 }
  const a = evaluateAlerts({ dayTotal: 0, grandTotal: 0 }, { dayTotal: 82, grandTotal: 0 }, cfg, '2026-09-10')
  assert.equal(a[0].id, 'day-warn:2026-09-10')
  const b = evaluateAlerts({ dayTotal: 0, grandTotal: 0 }, { dayTotal: 82, grandTotal: 0 }, cfg, '2026-09-11')
  assert.equal(b[0].id, 'day-warn:2026-09-11')
})

test('foldUsage skips samples without finite time (no NaN day bucket)', () => {
  const r = foldUsage([{ type: 'assistant/message', data: { turn: 0, step: 0, usage: { inputTokens: 50, outputTokens: 5 } } }])
  assert.equal(r.grand.inputTokens, 0)
  assert.deepEqual(r.byDay, {})
})
