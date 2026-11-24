import { serializeCostCsv } from "../src/host/cost-csv.js"
import { describe, expect, it } from 'vitest'
import { estimateCosts } from '../src/host/cost.js'
import { FIXTURE_MODEL, FIXTURE_PROVIDER, pricingSnapshotFixture } from './fixtures/pricing-catalog.mjs'

const span = { from: Date.parse('2026-11-20T00:00:00Z'), to: Date.parse('2026-11-22T00:00:00Z'), grain: 'hour' }
const route = { provider: FIXTURE_PROVIDER, model: FIXTURE_MODEL }

function tokens(inputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, outputTokens = 0) {
  return { inputTokens, cacheReadTokens, cacheWriteTokens, outputTokens }
}

function prices(inputTokens = '0', cacheReadTokens = '0', cacheWriteTokens = '0', outputTokens = '0') {
  return { inputTokens, cacheReadTokens, cacheWriteTokens, outputTokens }
}

function timed(at, tokenUsage, atRoute = route) {
  return { at, route: atRoute, tokens: tokenUsage }
}

function estimate({ slices, catalog = null, rules = [], querySpan = span }) {
  return estimateCosts({ slices, span: querySpan, catalog, rules, revision: 11, coverage: 'ready' })
}

describe('estimateCosts catalog and fixed-point arithmetic', () => {
  it('reports priced and unpriced token coverage independently', () => {
    const catalog = pricingSnapshotFixture({
      usd: [{ provider: route.provider, model: route.model, prices: prices('2', null, null, null) }],
      native: [], fx: null,
    })
    const snapshot = estimate({
      slices: [timed(span.from + 1, tokens(1_000_000, 0, 0, 1_000_000))], catalog,
    })
    expect(snapshot.rows[0].usd).toMatchObject({
      amount: '2', status: 'partial', pricedTokens: 1_000_000, unpricedTokens: 1_000_000, coverageRate: 0.5,
    })
  })

  it('prices cache read/write separately and prefers native CNY over conversion', () => {
    const snapshot = estimate({
      slices: [timed(span.from + 1, tokens(1_000_000, 1_000_000, 1_000_000, 1_000_000))],
      catalog: pricingSnapshotFixture(),
    })
    const row = snapshot.rows[0]
    expect(row.usd).toMatchObject({ amount: '10.75', status: 'priced', coverageRate: 1 })
    expect(row.cny).toMatchObject({ amount: '46.2', status: 'priced', coverageRate: 1 })
    expect(row.details.USD.map(detail => detail.amount)).toEqual(['2', '0.25', '0.5', '8'])
    expect(row.details.CNY.every(detail => !detail.converted)).toBe(true)
    expect(row.hitPct).toBe(0.5)
    expect(row.tokenUsage).toBe(4_000_000)
  })

  it('uses FX only when the target-native price is absent', () => {
    const usdOnlyRoute = { provider: FIXTURE_PROVIDER, model: 'synthetic-usd-only' }
    const snapshot = estimate({
      slices: [timed(span.from + 1, tokens(1_000_000, 0, 0, 1_000_000), usdOnlyRoute)],
      catalog: pricingSnapshotFixture(),
    })
    expect(snapshot.rows[0].usd.amount).toBe('4')
    expect(snapshot.rows[0].cny.amount).toBe('28')
    expect(snapshot.rows[0].details.CNY[0].converted).toBe(true)
  })

  it('does not report native CNY pricing metadata as USD when there is no FX', () => {
    const catalog = pricingSnapshotFixture({ usd: [], fx: null })
    const result = estimate({ slices: [timed(span.from + 1, tokens(1_000_000))], catalog })
    const row = result.rows[0]
    expect(row.cny.amount).not.toBeNull()
    expect(row.usd.status).toBe('unpriced')
    const cells = serializeCostCsv(result).split('\r\n')[1].split(',')
    expect(cells[11]).toBe('""')
    expect(cells[13]).toBe('')
    expect(cells[14]).toBe('none')
  })

  it('rounds once with nine-decimal half-up fixed-point arithmetic', () => {
    const tinyCatalog = pricingSnapshotFixture({
      usd: [{ provider: route.provider, model: route.model, prices: prices('0.000000001', '0', '0', '0') }],
      native: [], fx: null,
    })
    const half = estimate({ slices: [timed(span.from + 1, tokens(500_000))], catalog: tinyCatalog })
    const below = estimate({ slices: [timed(span.from + 1, tokens(499_999))], catalog: tinyCatalog })
    expect(half.rows[0].usd.amount).toBe('0.000000001')
    expect(below.rows[0].usd.amount).toBe('0')
    expect(half.rows[0].usd.status).toBe('priced')
  })

  it('does not match an unassigned route to a known catalog model', () => {
    const snapshot = estimate({
      slices: [timed(span.from + 1, tokens(1_000_000), { provider: null, model: FIXTURE_MODEL })],
      catalog: pricingSnapshotFixture(),
    })
    expect(snapshot.rows[0].usd.amount).toBeNull()
    expect(snapshot.rows[0].pricingBasis).toBe('none')
  })
})

describe('estimateCosts manual rules and time slices', () => {
  it('keeps an explicit manual zero as a real priced zero', () => {
    const rule = { model: FIXTURE_MODEL, provider: FIXTURE_PROVIDER, currency: 'USD', kind: 'fixed', prices: prices('0') }
    const snapshot = estimate({
      slices: [timed(span.from + 1, tokens(1_000_000))], catalog: pricingSnapshotFixture(), rules: { revision: 7, rules: [rule] },
    })
    expect(snapshot.rows[0].usd).toMatchObject({ amount: '0', status: 'priced', pricedTokens: 1_000_000 })
    expect(snapshot.rows[0].pricingBasis).toBe('manual')
    expect(snapshot.rows[0].priceRuleKind).toBe('fixed')
    expect(snapshot.rulesRevision).toBe(7)
  })

  it('does not replace an unconvertible manual CNY price with a USD catalog price', () => {
    const rule = { model: FIXTURE_MODEL, provider: null, currency: 'CNY', kind: 'fixed', prices: prices('14') }
    const snapshot = estimate({
      slices: [timed(span.from + 1, tokens(1_000_000))],
      catalog: pricingSnapshotFixture({ fx: null }), rules: [rule],
    })
    expect(snapshot.rows[0].cny.amount).toBe('14')
    expect(snapshot.rows[0].usd.amount).toBeNull()
    expect(snapshot.rows[0].usd.status).toBe('unpriced')
  })

  it('falls back blank manual cells to the catalog and marks a mixed basis', () => {
    const rule = { model: FIXTURE_MODEL, provider: null, currency: 'USD', kind: 'fixed', prices: prices('4', null, null, null) }
    const snapshot = estimate({
      slices: [timed(span.from + 1, tokens(1_000_000, 1_000_000))], catalog: pricingSnapshotFixture(), rules: [rule],
    })
    expect(snapshot.rows[0].details.USD[0]).toMatchObject({ amount: '4', source: 'manual' })
    expect(snapshot.rows[0].details.USD[1]).toMatchObject({ amount: '0.25', source: 'catalog' })
    expect(snapshot.rows[0].pricingBasis).toBe('mixed')
  })

  it('weights Friday peak/offpeak unit prices by tokens across time slices', () => {
    const rule = {
      model: FIXTURE_MODEL, provider: null, currency: 'USD', kind: 'time', zone: 'utc',
      windows: [{ start: 23, end: 2 }], peak: prices('10'), offpeak: prices('2'),
    }
    const snapshot = estimate({
      slices: [
        timed(Date.parse('2026-11-20T22:00:00Z'), tokens(1_000_000)),
        timed(Date.parse('2026-11-20T23:00:00Z'), tokens(3_000_000)),
      ],
      rules: [rule],
    })
    expect(snapshot.rows[0].usd.amount).toBe('32')
    expect(snapshot.rows[0].details.USD[0].unitPrice).toBe('8')
    expect(snapshot.rows[0].priceRuleKind).toBe('time')
  })

  it('uses offpeak for a fully contained day-only slice and never double counts same-day detail', () => {
    const rule = {
      model: FIXTURE_MODEL, provider: null, currency: 'USD', kind: 'time', zone: 'utc',
      windows: [{ start: 9, end: 17 }], peak: prices('10'), offpeak: prices('2'),
    }
    const daySpan = { from: Date.parse('2026-11-20T00:00:00Z'), to: Date.parse('2026-11-21T00:00:00Z') }
    const day = { at: null, daySpan, route, tokens: tokens(1_000_000) }
    const daily = estimate({ slices: [day], rules: [rule] })
    expect(daily.rows[0].usd.amount).toBe('2')
    expect(daily.rows[0].timePriceDailyFallback).toBe(true)

    const withDetail = estimate({
      slices: [day, timed(Date.parse('2026-11-20T10:00:00Z'), tokens(1_000_000))], rules: [rule],
    })
    expect(withDetail.rows[0].usd.amount).toBe('10')
    expect(withDetail.rows[0].tokenUsage).toBe(1_000_000)
    expect(withDetail.rows[0].timePriceDailyFallback).toBe(false)
  })
})

describe('estimateCosts null and snapshot semantics', () => {
  it('distinguishes unknown token denominators from confirmed zero', () => {
    const catalog = pricingSnapshotFixture({ native: [], fx: null })
    const snapshot = estimate({
      slices: [timed(span.from + 1, tokens(1_000_000, null, 0, 0))], catalog,
    })
    const row = snapshot.rows[0]
    expect(row.usd).toMatchObject({ amount: '2', status: 'partial', pricedTokens: 1_000_000, unpricedTokens: null, coverageRate: null })
    expect(row.tokenUsage).toBeNull()
    expect(row.hitPct).toBeNull()
    expect(row.details.USD[1].tokens).toBeNull()
  })

  it('accepts a separately supplied rule revision for the shared host query', () => {
    const snapshot = estimateCosts({
      slices: [], span, catalog: null, rules: [], rulesRevision: 19, revision: 11, coverage: 'ready',
    })
    expect(snapshot.rulesRevision).toBe(19)
  })

  it('freezes span, revisions and price state in the returned JSON-safe snapshot', () => {
    const snapshot = estimate({
      slices: [timed(span.from - 1, tokens(9_000_000)), timed(span.from + 1, tokens(1_000_000))],
      catalog: pricingSnapshotFixture(), rules: { revision: 3, rules: [] },
    })
    expect(snapshot.span).toEqual(span)
    expect(snapshot.revision).toBe(11)
    expect(snapshot.rulesRevision).toBe(3)
    expect(snapshot.pricingSnapshotId).toBe('synthetic-snapshot-id')
    expect(snapshot.rows[0].tokenUsage).toBe(1_000_000)
    expect(() => JSON.stringify(snapshot)).not.toThrow()
  })
})
