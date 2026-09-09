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
