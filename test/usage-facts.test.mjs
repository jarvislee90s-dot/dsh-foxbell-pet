import { describe, expect, it } from 'vitest'
import { loadStreamHelpers } from '../src/host/dsh-stream.js'
import { foldUsageFacts, routeKey as hostRouteKey } from '../src/host/usage-facts.js'
import { routeKey as clientRouteKey } from '../src/client/dashboard-contract.ts'
import { loggedRetry, loggedStep } from './fixtures/dsh-stats.mjs'

const lastUsage = (stream) => {
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index]
    if (record?.chunk?.type === 'usage') return record.chunk.usage
  }
  return undefined
}

describe('usage route identity', () => {
  it('uses JSON tuples on both sides, including slashes and null fields', () => {
    const routes = [
      { provider: 'p/a', model: 'm' },
      { provider: 'p', model: 'a/m' },
      { provider: null, model: 'm' },
      { provider: 'p', model: null },
      { provider: null, model: null },
    ]
    for (const route of routes) expect(hostRouteKey(route)).toBe(clientRouteKey(route))
    expect(hostRouteKey(routes[0])).not.toBe(hostRouteKey(routes[1]))
    expect(hostRouteKey(routes[0])).toBe('["p/a","m"]')
  })
})

describe('foldUsageFacts', () => {
  it('keeps failed retry usage independent and never backfills its route', () => {
    const facts = foldUsageFacts(loggedRetry({
      at: 20_000, seq: 200, provider: 'p', model: 'm', failedOutput: 4, output: 10,
    }), { lastUsage })
    expect(facts.map((fact) => [fact.route.provider, fact.tokens.outputTokens])).toEqual([[null, 4], ['p', 10]])
    expect(facts[1].tokens.cacheWriteTokens).toBeNull()
    expect(facts.map((fact) => fact.seq)).toEqual([201, 203])
  })

  it('replaces an open provisional attempt with the final settlement', () => {
    const retry = loggedRetry({ at: 30_000, seq: 300, provider: 'p', model: 'm', failedOutput: 4, output: 10 })
    const events = [retry[0], retry[1], ...retry.slice(3)]
    const facts = foldUsageFacts(events, { lastUsage })
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ seq: 303, route: { provider: 'p', model: 'm' } })
    expect(facts[0].tokens.outputTokens).toBe(10)
  })

  it('closes replacement only for the retry event matching turn/step', () => {
    const retry = loggedRetry({ at: 40_000, seq: 400, provider: 'p', model: 'm', failedOutput: 4, output: 10 })
    const mismatched = { ...retry[2], data: { ...retry[2].data, step: 99 } }
    expect(foldUsageFacts([retry[0], retry[1], mismatched, ...retry.slice(3)], { lastUsage })).toHaveLength(1)
    expect(foldUsageFacts(retry, { lastUsage })).toHaveLength(2)
  })

  it('deduplicates another final sample for the same open attempt', () => {
    const events = loggedStep({ at: 50_000, seq: 500, provider: 'p', model: 'm', output: 10 })
    const later = { ...events[1], seq: 505, time: 51_000, data: { ...events[1].data, usage: { ...events[1].data.usage, outputTokens: 12 } } }
    const facts = foldUsageFacts([...events, later], { lastUsage })
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ seq: 505, at: 51_000 })
    expect(facts[0].tokens.outputTokens).toBe(12)
  })

  it('preserves explicit zero, turns missing or unsafe counters into null, and keeps partial routes', () => {
    const events = loggedStep({ at: 60_000, seq: 600, provider: 'p', model: 'm', input: 1.5, output: 8, cacheRead: 0 })
    delete events[1].data.message.source.provider
    events[1].data.usage.cacheWriteTokens = -1
    const [fact] = foldUsageFacts(events, { lastUsage })
    expect(fact.route).toEqual({ provider: null, model: 'm' })
    expect(fact.tokens).toEqual({ inputTokens: null, cacheReadTokens: 0, cacheWriteTokens: null, outputTokens: 8 })
  })

  it('prefers explicit final usage over the stream and ignores attempts without the helper', () => {
    const events = loggedRetry({ at: 70_000, seq: 700, provider: 'p', model: 'm', failedOutput: 4, output: 10 })
    events[3].data.stream.find((record) => record.chunk?.type === 'usage').chunk.usage.outputTokens = 999
    events[3].data.usage = { ...events[3].data.usage, outputTokens: 10 }
    expect(foldUsageFacts(events).map((fact) => fact.tokens.outputTokens)).toEqual([10])
    expect(foldUsageFacts(events, { lastUsage }).map((fact) => fact.tokens.outputTokens)).toEqual([4, 10])
  })

  it('does not infer fork boundaries; the caller supplies only the child suffix', () => {
    const inherited = loggedStep({ at: 80_000, seq: 800, provider: 'p', model: 'm', turn: 1, input: 100 })
    const own = loggedStep({ at: 90_000, seq: 900, provider: 'p', model: 'm', turn: 2, input: 50 })
    const childEvents = [...inherited, ...own]
    const facts = [
      ...foldUsageFacts(inherited),
      ...foldUsageFacts(childEvents.slice(inherited.length)),
    ]
    expect(facts.map((fact) => fact.tokens.inputTokens)).toEqual([100, 50])
  })
})

describe('loadStreamHelpers', () => {
  it('loads the optional public module once and degrades without rejection', async () => {
    const pending = loadStreamHelpers()
    expect(loadStreamHelpers()).toBe(pending)
    const helpers = await pending
    expect(helpers).toBeTypeOf('object')
    expect(helpers.lastUsage(null)).toBeUndefined()
    expect(helpers.firstTokenTime(null)).toBeUndefined()
    const packed = [{ type: 'text-chunks', time0: 100, texts: ['', 'token'], dt: [23] }]
    expect(helpers.firstTokenTime(packed)).toBe(123)
    expect(helpers.lastUsage([
      { type: 'chunk', time: 90, chunk: { type: 'usage', usage: { outputTokens: 2 } } },
      { type: 'chunk', time: 150, chunk: { type: 'usage', usage: { outputTokens: 10 } } },
    ])).toEqual({ outputTokens: 10 })
  })
})
