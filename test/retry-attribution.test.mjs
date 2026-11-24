import { describe, expect, it } from 'vitest'
import { loggedRetry, loggedStep } from './fixtures/dsh-stats.mjs'
import { foldUsageFacts } from '../src/host/usage-facts.js'
import { foldSpeedFacts, querySpeed } from '../src/host/speed.js'
import { createStateEngine } from '../src/host/state.js'

const lastUsage = (stream) => [...stream].reverse().find((record) => record.chunk?.type === 'usage')?.chunk.usage
const firstTokenTime = (stream) => stream.find((record) => record.chunk?.type === 'text-delta')?.time
const routeKey = (route) => JSON.stringify([route.provider, route.model])

describe('complex retry: usage accounting and native speed admission stay independent', () => {
  it('keeps two official failed usage samples but emits speed only for the proven final success', () => {
    const events = loggedRetry({ at: 10_000, seq: 100, provider: 'p', model: 'm', failedOutput: 4, output: 10 })
    const secondAttempt = structuredClone(events[1])
    secondAttempt.seq = 103
    secondAttempt.time = 6_500
    secondAttempt.data.stream.find((record) => record.chunk?.type === 'usage').chunk.usage.outputTokens = 7
    const secondRetry = { ...events[2], seq: 104, time: 7_000 }
    events[3].seq = 105
    events[4].seq = 106
    events.splice(3, 0, secondAttempt, secondRetry)

    const usage = foldUsageFacts(events, { lastUsage })
    expect(usage.map((fact) => [fact.route.provider, fact.tokens.outputTokens])).toEqual([[null, 4], [null, 7], ['p', 10]])
    expect(usage.map((fact) => fact.seq)).toEqual([101, 103, 105])
    expect(usage.every((fact) => fact.tokens.cacheReadTokens === null)).toBe(true)

    const speed = foldSpeedFacts(events, { sessionId: 'synthetic-session', now: 20_000, firstTokenTime })
    expect(speed).toHaveLength(1)
    expect(speed[0]).toMatchObject({ sessionId: 'synthetic-session', seq: 105, outputTokens: 10, decodeMs: 2_000, ttftMs: null, modelMs: null })
    const view = querySpeed(speed, { range: '15m', selectedKey: routeKey({ provider: 'p', model: 'm' }) }, 20_000, 'ready')
    expect(view.series[0].metrics).toMatchObject({ n: 1, tps: 5 })

    const engine = createStateEngine({ roots: () => [], getSession: () => undefined, getTitle: () => undefined, now: () => 20_000, lastUsage, firstTokenTime })
    engine.noteCorpusSession('synthetic-session', events, false)
    engine.noteCoverage('ready')
    expect(engine.usageFacts()).toMatchObject({ coverage: 'ready' })
    expect(engine.usageFacts().facts.map((fact) => fact.tokens.outputTokens)).toEqual([4, 7, 10])
    expect(engine.speedFacts().facts).toHaveLength(1)
    expect(engine.speedFacts().facts[0]).toMatchObject({ sessionId: 'synthetic-session', seq: 105, outputTokens: 10 })
  })

  it('does not double-count an exact duplicate settlement in either projection', () => {
    const events = loggedStep({ at: 10_000, seq: 200, provider: 'p', model: 'm', output: 20 })
    const duplicated = [...events, ...events]
    expect(foldUsageFacts(duplicated, { lastUsage })).toHaveLength(1)
    expect(foldSpeedFacts(duplicated, { sessionId: 's', now: 20_000, firstTokenTime })).toHaveLength(1)
  })

  it('keeps official interrupted usage in Token accounting while excluding it from speed', () => {
    const events = loggedStep({ at: 10_000, seq: 300, provider: 'p', model: 'm', output: 20, interrupted: true })
    const usage = foldUsageFacts(events, { lastUsage })
    expect(usage).toHaveLength(1)
    expect(usage[0].tokens.outputTokens).toBe(20)
    expect(foldSpeedFacts(events, { sessionId: 's', now: 20_000, firstTokenTime })).toEqual([])
  })
})
