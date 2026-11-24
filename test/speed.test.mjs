import { describe, expect, it, vi } from 'vitest'
import { assistantStreamFirstTokenTime } from '@deepseek-ai/dsh-llm/assistant-stream'
import { loggedRetry, loggedStep } from './fixtures/dsh-stats.mjs'
import { foldSpeedFacts, querySpeed, routeKey } from '../src/host/speed.js'

const NOW = new Date(2026, 10, 22, 12, 20, 30).getTime()
const opts = { sessionId: 's', now: NOW, firstTokenTime: assistantStreamFirstTokenTime }
const key = routeKey({ provider: 'p', model: 'm' })

function stepAt(at, seq, output = 20, extra = {}) {
  return loggedStep({ at, seq, provider: 'p', model: 'm', output, ...extra })
}

function fact(at, seq, outputTokens = 20, decodeMs = 2_000, route = { provider: 'p', model: 'm' }) {
  return {
    sessionId: 's', seq, route, at, outputTokens, decodeMs,
    ttftMs: 1_000, modelMs: 3_000, toolMs: null,
  }
}

describe('foldSpeedFacts', () => {
  it('uses only the settled call first token, not a failed attempt first token', () => {
    const at = NOW - 20_000
    const events = loggedRetry({ at, seq: 100, provider: 'p', model: 'm', output: 50 })
    const facts = foldSpeedFacts(events, opts)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({
      sessionId: 's', seq: 103, at, outputTokens: 50,
      decodeMs: 2_000, ttftMs: null, modelMs: null, toolMs: null,
    })
  })

  it('rejects interrupted messages, missing starts, and ambiguous retry boundaries', () => {
    const at = NOW - 30_000
    const interrupted = stepAt(at, 200, 20, { turn: 1, step: 1, interrupted: true })
    expect(foldSpeedFacts(interrupted, opts)).toEqual([])

    const withoutStart = stepAt(at, 210, 20, { turn: 2, step: 1 }).filter((_, index) => index !== 0)
    const truncated = foldSpeedFacts(withoutStart, opts)
    expect(truncated).toHaveLength(1)
    expect(truncated[0]).toMatchObject({ decodeMs: null, ttftMs: null, modelMs: null })

    const retry = loggedRetry({ at, seq: 220, provider: 'p', model: 'm', turn: 3, step: 1 })
    retry[3].data.stream[0].time = retry[1].data.stream[0].time // only the failed attempt token remains
    const ambiguous = foldSpeedFacts(retry, opts)
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0]).toMatchObject({ decodeMs: null, ttftMs: null, modelMs: null })

    const sameMillisecond = loggedRetry({ at, seq: 240, provider: 'p', model: 'm', turn: 4, step: 1 })
    sameMillisecond[3].data.stream[0].time = sameMillisecond[2].time
    expect(foldSpeedFacts(sameMillisecond, opts)[0]).toMatchObject({ decodeMs: null, ttftMs: null })
  })

  it('keeps a settled response when a later turn is cancelled', () => {
    const events = [
      ...stepAt(NOW - 10_000, 300),
      { type: 'turn/end', time: NOW - 5_000, seq: 303, data: { turn: 1, reason: { kind: 'aborted' } } },
    ]
    expect(foldSpeedFacts(events, opts)[0].decodeMs).toBe(2_000)
  })

  it('deduplicates native event identity and leaves zero decode time out of TPS', () => {
    const events = stepAt(NOW - 10_000, 400)
    const duplicate = foldSpeedFacts([...events, ...events], opts)
    expect(duplicate).toHaveLength(1)

    const zero = stepAt(NOW - 10_000, 410)
    zero[1].data.stream[0].time = zero[1].time
    const facts = foldSpeedFacts(zero, opts)
    expect(facts[0].decodeMs).toBeNull()
    expect(facts[0].ttftMs).toBeNull()
    const view = querySpeed(facts, { range: '15m', selectedKey: key }, NOW, 'ready')
    expect(view.series[0].metrics).toMatchObject({ tps: null, n: 0, ttftN: 0, modelN: 1 })
  })

  it('attributes only matched tool calls to the settled model route', () => {
    const at = NOW - 20_000
    const base = stepAt(at, 500)
    const events = [
      base[0], base[1],
      { type: 'tool/call', time: at + 100, seq: 502, data: { turn: 1, step: 1, callId: 'call-a', name: ' synthetic', arguments: '{}' } },
      { type: 'tool/result', time: at + 1_100, seq: 503, data: { turn: 1, step: 1, message: { source: { callId: 'call-a' } } } },
      { type: 'tool/result', time: at + 1_200, seq: 504, data: { turn: 1, step: 1, message: { source: { callId: 'orphan' } } } },
      base[2],
    ]
    const facts = foldSpeedFacts(events, opts)
    expect(facts[0].toolMs).toBe(1_000)
    const view = querySpeed(facts, { range: '15m', selectedKey: key }, NOW, 'ready')
    expect(view.series[0].metrics).toMatchObject({ toolMs: 1_000, toolN: 1 })
  })

  it('drops facts outside the recent 24h cache window without discarding their older start', () => {
    const events = stepAt(NOW - 10_000, 600)
    events[0].time = NOW - 86_400_001
    events[1].data.stream[0].time = NOW - 11_000
    expect(foldSpeedFacts(events, opts)[0].modelMs).toBe(86_390_001)
    expect(foldSpeedFacts(stepAt(NOW - 86_400_001, 610), opts)).toEqual([])
    expect(foldSpeedFacts(stepAt(NOW + 1, 620), opts)).toEqual([])
  })

  it('contains helper failures in the reading', () => {
    const helper = vi.fn(() => { throw new Error('unsupported stream') })
    const facts = foldSpeedFacts(stepAt(NOW - 1_000, 700), { ...opts, firstTokenTime: helper })
    expect(facts[0]).toMatchObject({ decodeMs: null, ttftMs: null, modelMs: 3_000 })
  })
})

describe('querySpeed', () => {
  it('computes weighted sum/sum TPS and never averages per-response TPS', () => {
    const firstAt = NOW - 120_000
    const secondAt = NOW - 60_000
    const first = stepAt(firstAt, 800, 500, { turn: 1, step: 1 })
    first[0].time = firstAt - 6_000
    first[1].data.stream[0].time = firstAt - 5_000
    const second = stepAt(secondAt, 810, 50, { turn: 2, step: 1 })
    second[1].data.stream[0].time = secondAt - 1_000
    const facts = foldSpeedFacts([...first, ...second], opts)
    facts[0].toolMs = 100
    facts[1].toolMs = 300
    const view = querySpeed(facts, { range: '15m', selectedKey: key }, NOW, 'ready')
    expect(view.series[0].metrics.tps).toBeCloseTo(1_000 * 550 / 6_000)
    expect(view.series[0].metrics).toMatchObject({
      n: 2, ttftMs: 1_500, ttftN: 2, modelMs: 9_000, modelN: 2, toolMs: 400, toolN: 2,
    })
    expect(view.series[0].sessions).toBe(1)
    expect(view.buckets.find((bucket) => bucket.metrics.n === 0)?.metrics.tps).toBeNull()
  })

  it('uses (from,to] for both the range and each wall-clock bucket', () => {
    const initial = querySpeed([], { range: '15m', selectedKey: key }, NOW, 'ready')
    const { from, to } = initial
    const boundary = initial.buckets[0].to
    const facts = [
      fact(from, 900),
      fact(boundary, 901, 10, 1_000),
      fact(boundary, 901, 10, 1_000), // duplicate identity
      fact(boundary + 1, 902, 20, 1_000),
      fact(to, 903, 30, 1_000),
    ]
    const view = querySpeed(facts, { range: '15m', selectedKey: key }, NOW, 'ready')
    expect(view.from).toBe(to - 15 * 60_000)
    expect(view.buckets).toHaveLength(16)
    expect(view.buckets[0].isPartial).toBe(true)
    expect(view.buckets.at(-1).isPartial).toBe(true)
    expect(view.buckets[0].metrics).toMatchObject({ n: 1, tps: 10 })
    expect(view.buckets[1].metrics).toMatchObject({ n: 1, tps: 20 })
    expect(view.buckets.at(-1).metrics).toMatchObject({ n: 1, tps: 30 })
    expect(view.series[0].metrics.n).toBe(3)
  })

  it('keeps routes separate, falls back to an available selection, and preserves coverage', () => {
    const other = { provider: 'q', model: 'm' }
    const facts = [fact(NOW - 1_000, 1_000), fact(NOW - 1_000, 1_001, 40, 2_000, other)]
    const view = querySpeed(facts, { range: '5h', selectedKey: 'missing' }, NOW, 'limited')
    expect(view.series).toHaveLength(2)
    expect(view.selectedKey).toBe(key)
    expect(view.coverage).toBe('limited')
    expect(view.buckets.every((bucket) => bucket.metrics.tps === null || bucket.metrics.n > 0)).toBe(true)
    expect(view.buckets).toHaveLength(31)
  })

  it('supports all fixed ranges and rejects arbitrary windows', () => {
    expect(querySpeed([], { range: '1h' }, NOW, 'ready').buckets).toHaveLength(13)
    expect(querySpeed([], { range: '24h' }, NOW, 'ready').buckets).toHaveLength(25)
    expect(querySpeed([], { range: '15m' }, NOW, 'unsupported').coverage).toBe('unsupported')
    expect(() => querySpeed([], { range: '7d' }, NOW, 'ready')).toThrow(RangeError)
  })
})
