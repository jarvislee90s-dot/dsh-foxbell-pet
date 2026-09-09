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
