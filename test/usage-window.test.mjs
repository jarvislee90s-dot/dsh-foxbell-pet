import { afterEach, describe, expect, it } from 'vitest'
import { foldUsageFacts } from '../src/host/usage-facts.js'
import { aggregateUsageWindow, resolveUsageSpan } from '../src/host/usage-window.js'
import { loggedStep } from './fixtures/dsh-stats.mjs'

const ORIGINAL_TZ = process.env.TZ
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

function fact({ at, seq, provider = 'p', model = 'm', input = 30, output = 20, cacheRead = 0, cacheWrite = 0, turn = 1 }) {
  return foldUsageFacts(loggedStep({ at, seq, provider, model, input, output, cacheRead, cacheWrite, turn }))[0]
}

describe('resolveUsageSpan', () => {
  it('selects five complete epoch hours, including the previous day across midnight', () => {
    const gap = resolveUsageSpan({ preset: '5h' }, new Date(2026, 10, 22, 2, 20).getTime())
    expect(new Date(gap.from).getHours()).toBe(21)
    expect(new Date(gap.from).getDate()).toBe(21)
    expect(new Date(gap.to).getHours()).toBe(2)
    expect(gap.to - gap.from).toBe(5 * 60 * 60 * 1000)
    expect(gap.grain).toBe('hour')
  })

  it('uses inclusive local calendar days for 7d/30d and hour points for today', () => {
    const now = new Date(2026, 10, 22, 12, 30).getTime()
    const week = resolveUsageSpan({ preset: '7d' }, now)
    expect(new Date(week.from).getDate()).toBe(16)
    expect(new Date(week.to).getDate()).toBe(23)
    expect(week.grain).toBe('day')
    const month = resolveUsageSpan({ preset: '30d' }, now)
    expect(new Date(month.from).getDate()).toBe(24)
    expect(new Date(month.from).getMonth()).toBe(9)
    const today = resolveUsageSpan({ preset: 'today' }, now)
    expect(new Date(today.from).getHours()).toBe(0)
    expect(new Date(today.to).getDate()).toBe(23)
    expect(today.grain).toBe('hour')
  })

  it('validates real custom dates and inclusive at-most-31-day ranges', () => {
    const now = Date.parse('2026-11-22T00:00:00Z')
    const span = resolveUsageSpan({ preset: 'custom', from: '2026-01-01', to: '2026-01-31' }, now)
    expect(new Date(span.from).getDate()).toBe(1)
    expect(new Date(span.to).getMonth()).toBe(1)
    expect(new Date(span.to).getDate()).toBe(1)
    expect(() => resolveUsageSpan({ preset: 'custom', from: '2026-01-01', to: '2026-02-01' }, now)).toThrow(/31/)
    expect(() => resolveUsageSpan({ preset: 'custom', from: '2026-02-30', to: '2026-03-02' }, now)).toThrow()
    expect(() => resolveUsageSpan({ preset: 'custom', from: '2026-03-03', to: '2026-03-02' }, now)).toThrow()
    expect(() => resolveUsageSpan({ preset: 'custom', from: '2026-2-01', to: '2026-02-02' }, now)).toThrow()
    expect(resolveUsageSpan({ preset: 'custom', from: '2028-02-28', to: '2028-02-29' }, now)).toBeTypeOf('object')
  })

  it('retains 23-hour and 25-hour local today windows and their actual hour buckets', () => {
    process.env.TZ = 'America/New_York'
    const spring = resolveUsageSpan({ preset: 'today' }, new Date(2026, 2, 8, 12).getTime())
    expect((spring.to - spring.from) / 3600000).toBe(23)
    expect(aggregateUsageWindow({ query: { preset: 'today' }, now: new Date(2026, 2, 8, 12).getTime(), facts: [] }).points).toHaveLength(23)

    const autumn = resolveUsageSpan({ preset: 'today' }, new Date(2026, 10, 1, 12).getTime())
    expect((autumn.to - autumn.from) / 3600000).toBe(25)
    const points = aggregateUsageWindow({ query: { preset: 'today' }, now: new Date(2026, 10, 1, 12).getTime(), facts: [] }).points
    expect(points).toHaveLength(25)
    expect(points[1].to).toBe(points[1].from + 3600000)
    expect(points[2].from).toBe(points[1].to)
  })
})

describe('aggregateUsageWindow', () => {
  it('filters [from,to), keeps previous-day 5h facts, and never substitutes daily activity', () => {
    const now = new Date(2026, 10, 22, 2, 20).getTime()
    const span = resolveUsageSpan({ preset: '5h' }, now)
    let rangeCalls = 0
    const facts = [
      fact({ at: span.from - 1, seq: 1, input: 999 }),
      fact({ at: new Date(2026, 10, 21, 22, 30).getTime(), seq: 2, provider: 'p/a', input: 30, cacheRead: 10, cacheWrite: 5, output: 20 }),
      fact({ at: new Date(2026, 10, 22, 1, 30).getTime(), seq: 3, provider: 'p', model: 'a/m', input: 10, cacheRead: 20, output: 5 }),
      fact({ at: span.to, seq: 4, input: 888 }),
    ]
    const window = aggregateUsageWindow({
      facts, query: { preset: '5h' }, now, revision: 9, coverage: 'loading',
      rangeSummary: () => { rangeCalls += 1; return { totals: { userEst: 777 }, tools: [{ name: 'today-only', count: 8, durMs: 4 }] } },
    })
    expect(rangeCalls).toBe(0)
    expect(window.totals).toMatchObject({ requestTotal: 70, cacheRead: 30, outputTokens: 25, userEst: null, requestCount: 2, hitPct: 30 / 70 })
    expect(window.points).toHaveLength(5)
    expect(window.points.reduce((sum, point) => sum + point.tokens, 0)).toBe(100)
    expect(window.points[0].hitPct).toBeNull()
    expect(window.points[1].tokens).toBe(65)
    expect(window.points[4].tokens).toBe(35)
    expect(window.revision).toBe(9)
    expect(window.coverage).toBe('loading')
    expect(window.tools).toEqual([])
    expect(window.routes.map((row) => row.route)).toEqual([
      { provider: 'p/a', model: 'm' },
      { provider: 'p', model: 'a/m' },
    ])
  })

  it('keeps the same model on different providers and an unknown route in separate rows', () => {
    const now = new Date(2026, 10, 22, 12).getTime()
    const unknown = loggedStep({ at: now - 2000, seq: 12, provider: 'x', model: 'same', input: 1, output: 2 })
    delete unknown[1].data.message.source
    const facts = [
      fact({ at: now - 4000, seq: 10, provider: 'a', model: 'same', input: 10 }),
      fact({ at: now - 3000, seq: 11, provider: 'b', model: 'same', input: 20 }),
      ...foldUsageFacts(unknown),
    ]
    const window = aggregateUsageWindow({ facts, query: { preset: 'today' }, now })
    expect(window.routes.map((row) => row.route)).toEqual([
      { provider: 'b', model: 'same' },
      { provider: 'a', model: 'same' },
      { provider: null, model: null },
    ])
    expect(window.totals.requestCount).toBe(3)
  })

  it('derives previous-equal-window hit rate from facts and hides it without a denominator', () => {
    const now = new Date(2026, 10, 22, 12, 20).getTime()
    const span = resolveUsageSpan({ preset: '5h' }, now)
    const withPrevious = aggregateUsageWindow({
      facts: [fact({ at: span.from - 1000, seq: 13, input: 10, cacheRead: 5, output: 0 }), fact({ at: span.from + 1000, seq: 14, input: 20, cacheRead: 10 })],
      span, query: { preset: '5h' }, now,
    })
    expect(withPrevious.previousHitPct).toBe(5 / 15)
    const withoutPrevious = aggregateUsageWindow({ facts: [fact({ at: span.from + 1000, seq: 15 })], span, query: { preset: '5h' }, now })
    expect(withoutPrevious.previousHitPct).toBeNull()
  })

  it('counts an omitted cache bucket as zero, matching the DSH token-meter total', () => {
    const now = new Date(2026, 10, 22, 12).getTime()
    const events = loggedStep({ at: now - 1000, seq: 15, provider: 'p', model: 'm', input: 10, output: 2 })
    delete events[1].data.usage.cacheReadTokens
    const window = aggregateUsageWindow({ facts: foldUsageFacts(events), query: { preset: 'today' }, now })
    expect(window.unobservedBuckets ?? []).not.toContain('cacheReadTokens')
    expect(window.totals.cacheRead).toBe(0)
    expect(window.totals.requestTotal).toBe(10)
    expect(window.points.find((point) => point.tokens > 0)?.hitPct).toBe(0)
  })

  it('still suppresses the hit ratio when a reported bucket is not a valid count', () => {
    const now = new Date(2026, 10, 22, 12).getTime()
    const events = loggedStep({ at: now - 1000, seq: 16, provider: 'p', model: 'm', input: 10, output: 2 })
    events[1].data.usage.cacheReadTokens = -1
    const window = aggregateUsageWindow({ facts: foldUsageFacts(events), query: { preset: 'today' }, now })
    expect(window.unobservedBuckets).toContain('cacheReadTokens')
    expect(window.points.find((point) => point.tokens > 0)?.hitPct).toBeNull()
  })

  it('uses the existing daily projection for day-exact user estimates and tools, preserving zero', () => {
    const now = new Date(2026, 10, 22, 12).getTime()
    const calls = []
    const window = aggregateUsageWindow({
      facts: [fact({ at: new Date(2026, 10, 16).getTime(), seq: 20 })],
      query: { preset: '7d' }, now,
      rangeSummary: (from, to) => {
        calls.push([from, to])
        return { totals: { userEst: 0 }, tools: [{ name: 'Bash', count: 3, durMs: 900 }] }
      },
    })
    expect(calls).toEqual([['2026-11-16', '2026-11-22']])
    expect(window.totals.userEst).toBe(0)
    expect(window.routes[0].totals.userEst).toBeNull()
    expect(window.tools).toEqual([{ name: 'Bash', count: 3, durMs: 900 }])
    expect(window.points).toHaveLength(7)
    expect(window.points[0].tokens).toBe(50)
  })

  it('accepts explicit span-exact 5h activity without reading a daily fallback', () => {
    const now = new Date(2026, 10, 22, 2, 20).getTime()
    const window = aggregateUsageWindow({
      facts: [], query: { preset: '5h' }, now, userEst: 0,
      tools: [{ name: 'Read', count: 1, durMs: 20 }],
      rangeSummary: { totals: { userEst: 500 }, tools: [{ name: 'wrong', count: 9, durMs: 9 }] },
    })
    expect(window.totals.userEst).toBe(0)
    expect(window.tools).toEqual([{ name: 'Read', count: 1, durMs: 20 }])
  })
})
