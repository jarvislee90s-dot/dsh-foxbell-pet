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
