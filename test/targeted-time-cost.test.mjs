import { afterEach, describe, expect, it } from 'vitest'
import { loggedStep } from './fixtures/dsh-stats.mjs'
import { foldUsageFacts } from '../src/host/usage-facts.js'
import { aggregateUsageWindow, resolveUsageSpan } from '../src/host/usage-window.js'
import { querySpeed, routeKey } from '../src/host/speed.js'
import { estimateCosts } from '../src/host/cost.js'
import { serializeCostCsv } from '../src/host/cost-csv.js'
import { pricingSnapshotFixture, FIXTURE_MODEL, FIXTURE_PROVIDER } from './fixtures/pricing-catalog.mjs'

const ORIGINAL_TZ = process.env.TZ
afterEach(() => { if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ })
const route = { provider: FIXTURE_PROVIDER, model: FIXTURE_MODEL }

describe('targeted repeated-local-time windows and cost splitting', () => {
  it('keeps 05:30Z and 06:30Z separate on the 25-hour fall-back day', () => {
    process.env.TZ = 'America/New_York'
    const now = Date.parse('2026-11-01T12:00:00-05:00')
    const span = resolveUsageSpan({ preset: 'today' }, now)
    expect(span.from).toBe(Date.parse('2026-11-01T04:00:00Z'))
    expect(span.to).toBe(Date.parse('2026-11-02T05:00:00Z'))
    expect((span.to - span.from) / 3_600_000).toBe(25)

    const at = [Date.parse('2026-11-01T05:30:00Z'), Date.parse('2026-11-01T06:30:00Z')]
    const events = at.map((time, index) => ({ sessionId: 's', seq: index + 1, route, at: time, outputTokens: index === 0 ? 500 : 50, decodeMs: index === 0 ? 5000 : 1000, ttftMs: 1000, modelMs: 6000, toolMs: null }))
    const view = querySpeed(events, { range: '24h', selectedKey: routeKey(route) }, now, 'ready')
    const sampled = view.buckets.filter((bucket) => bucket.metrics.n > 0)
    expect(sampled).toHaveLength(2)
    expect(sampled.map((bucket) => bucket.from)).toEqual([Date.parse('2026-11-01T05:00:00Z'), Date.parse('2026-11-01T06:00:00Z')])
    expect(view.series[0].metrics).toMatchObject({ n: 2, tps: 550 / 6, ttftN: 2, modelN: 2 })

    const usageEvents = at.flatMap((time, index) => loggedStep({ at: time, seq: index * 10 + 10, provider: route.provider, model: route.model, input: 10, output: index === 0 ? 500 : 50, turn: index + 1 }))
    usageEvents.push(...loggedStep({ at: span.to, seq: 99, provider: route.provider, model: route.model, input: 999, output: 999, turn: 3 }))
    const usage = aggregateUsageWindow({ facts: foldUsageFacts(usageEvents), query: { preset: 'today' }, now, coverage: 'ready' })
    expect(usage.points).toHaveLength(25)
    expect(usage.points.filter((point) => point.tokens > 0).map((point) => point.from)).toEqual(at.map((time) => time - 30 * 60 * 1000))
    expect(usage.totals.outputTokens).toBe(550) // the event exactly at span.to is not counted
  })

  it('keeps exact USD and CSV window unchanged under different valid time-slice partitioning', () => {
    process.env.TZ = 'America/New_York'
    const now = Date.parse('2026-11-01T12:00:00-05:00')
    const span = resolveUsageSpan({ preset: 'today' }, now)
    const at = [Date.parse('2026-11-01T05:30:00Z'), Date.parse('2026-11-01T06:30:00Z')]
    const makeEvents = (split) => split
      ? at.flatMap((time, index) => loggedStep({ at: time, seq: index * 10 + 1, provider: route.provider, model: route.model, input: 500_000, output: 500_000, cacheRead: 500_000, cacheWrite: 500_000, turn: index + 1 }))
      : loggedStep({ at: at[0], seq: 3, provider: route.provider, model: route.model, input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 })
    const single = estimateCosts({ slices: foldUsageFacts(makeEvents(false)), span, catalog: pricingSnapshotFixture(), rules: [], revision: 7, coverage: 'ready' })
    const split = estimateCosts({ slices: foldUsageFacts(makeEvents(true)), span, catalog: pricingSnapshotFixture(), rules: [], revision: 7, coverage: 'ready' })
    expect(single.rows[0].usd).toMatchObject({ amount: '10.75', status: 'priced', coverageRate: 1 })
    expect(split.rows[0].usd).toEqual(single.rows[0].usd)
    expect(split.rows[0].details.USD.map((detail) => detail.amount)).toEqual(['2', '0.25', '0.5', '8'])
    const fields = serializeCostCsv(split).split('\r\n')[1].split(',')
    expect(fields[5]).toBe('10.75')
    expect(fields[17]).toBe('2026-11-01T04:00:00.000Z')
    expect(fields[18]).toBe('2026-11-02T05:00:00.000Z')
  })
})
