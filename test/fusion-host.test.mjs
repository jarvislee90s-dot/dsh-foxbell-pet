import { createStateEngine } from "../src/host/state.js"
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { estimateCosts } from '../src/host/cost.js'
import { foldSpeedFacts, querySpeed, routeKey } from '../src/host/speed.js'
import { foldUsageFacts } from '../src/host/usage-facts.js'

const route = { provider: 'fixture-provider', model: 'fixture-model' }
const identity = { turn: 1, step: 1 }
const lastUsage = (stream) => stream.findLast((record) => record.chunk?.type === 'usage')?.chunk.usage
const firstTokenTime = (stream) => stream.find((record) => record.chunk?.type === 'text-delta')?.time

function retryEvents() {
  const usage = { inputTokens: 30, outputTokens: 10 }
  return [
    { type: 'step/start', time: 2_000, seq: 100, data: identity },
    { type: 'assistant/attempt', time: 5_000, seq: 101, data: {
      ...identity, stream: [
        { time: 3_000, chunk: { type: 'text-delta', text: 'failed' } },
        { time: 4_000, chunk: { type: 'usage', usage: { inputTokens: 8, outputTokens: 4 } } },
      ],
    } },
    { type: 'llm/retry-started', time: 6_000, seq: 102, data: identity },
    // The successful stream proves its first token, but no successful start is logged.
    { type: 'assistant/message', time: 10_000, seq: 103, data: {
      ...identity, message: { role: 'assistant', source: { kind: 'model', ...route } }, usage,
      stream: [
        { time: 8_000, chunk: { type: 'text-delta', text: 'success' } },
        { time: 9_000, chunk: { type: 'usage', usage } },
      ],
    } },
    { type: 'step/end', time: 10_001, seq: 104, data: identity },
  ]
}

it('counts each failed and successful usage sample once when the whole retry log is replayed', () => {
  const events = retryEvents()
  const project = (log) => foldUsageFacts(log, { lastUsage })
    .map((fact) => [fact.seq, fact.route.provider, fact.tokens.outputTokens])
  const expected = [[101, null, 4], [103, route.provider, 10]]
  expect(project(events)).toEqual(expected)
  expect(project([...events, ...structuredClone(events)])).toEqual(expected)
})

function retrySpeed() {
  return foldSpeedFacts(retryEvents(), { sessionId: 'fusion-fixture', now: 20_000, firstTokenTime })
}

it('leaves start-relative timings unknown when only the failed attempt start is logged', () => {
  expect(retrySpeed()).toMatchObject([{ seq: 103, ttftMs: null, modelMs: null }])
})

it('keeps TPS from the successful decode interval without needing a successful start', () => {
  const view = querySpeed(retrySpeed(), { range: '15m', selectedKey: routeKey(route) }, 20_000, 'ready')
  expect(view.series[0]?.metrics).toMatchObject({ n: 1, tps: 5 })
})

const spanModule = new URL('../src/host/usage-window.js', import.meta.url).href
const hour = 3_600_000

it.each([
  ['the second New York 01:00 after a fall-back', 'America/New_York', '2026-11-01T01:20:00-05:00', '2026-11-01T06:00:00Z'],
  ['a Lord Howe local hour after a half-hour fall-back', 'Australia/Lord_Howe', '2026-04-05T02:20:00+10:30', '2026-04-04T15:30:00Z'],
])('ends the 5h span at %s', (_label, tz, now, end) => {
  // Set TZ at process startup instead of mutating the Vitest worker environment.
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { resolveUsageSpan } from ${JSON.stringify(spanModule)}
    console.log(JSON.stringify(resolveUsageSpan({ preset: '5h' }, Date.parse(process.argv[1]))))
  `, now], { env: { ...process.env, TZ: tz }, encoding: 'utf8', timeout: 5_000 })
  const to = Date.parse(end)
  expect(JSON.parse(output)).toMatchObject({ from: to - 5 * hour, to, grain: 'hour' })
})

it('rounds micro-cost after summing equally priced slices of the same total usage', () => {
  const span = { from: 0, to: 5 * hour, grain: 'hour' }
  const catalog = { usd: [{ ...route, prices: { outputTokens: '0.0004' } }], native: [] }
  const estimate = (parts) => estimateCosts({
    slices: parts.map((outputTokens, index) => ({
      route, source: 'event', at: (index + 1) * hour, tokens: {
        inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens,
      },
    })),
    span, catalog, rules: [], revision: 1, coverage: 'ready',
  }).rows[0]?.usd

  // Each one-token share is $0.0000000004; rounding the shares separately loses all three.
  const single = estimate([3])
  expect(single?.amount).toBe('0.000000001')
  expect(estimate([1, 1, 1])).toEqual(single)
})

it('reports old export and activity counters from the same 5h window', () => {
  const engine = createStateEngine({ roots: () => [], now: () => new Date(2026, 10, 22, 2, 20).getTime() })
  const window = engine.usageWindow({ preset: '5h' })
  const input = (seq, time, text) => ({ seq, time, type: 'user/message', data: { content: [{ type: 'text', text }] } })
  engine.noteCorpusSession('inside', [input(1, window.span.from - 1, 'excluded earlier'),
    input(2, window.span.from, 'one two'),
    { seq: 3, time: window.span.from + 1, type: 'tool/call', data: { name: 'Read' } },
    { seq: 4, time: window.span.from + 2, type: 'tool/result', data: { name: 'Read', durationMs: 50 } },
    input(5, window.span.to, 'excluded later')], false)
  const result = engine.usageWindow({ preset: '5h' })
  expect(result.totals.userEst).toBe(2)
  expect(result.activitySessions).toBe(1)
  expect(result.tools).toEqual([{ name: 'Read', count: 1, durMs: 50 }])
})
