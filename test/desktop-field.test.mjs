import { describe, expect, it } from 'vitest'
import { foldUsageFacts } from '../src/host/usage-facts.js'
import { aggregateUsageWindow } from '../src/host/usage-window.js'
import { registerDashboardRoutes } from '../src/host/dashboard-routes.js'
import { createStateEngine } from '../src/host/state.js'
import { openRuleStore } from '../src/host/price-rules.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const now = new Date(2026, 10, 24, 12, 0).getTime()

// DSH omits cache buckets the provider did not report; the host token-meter totals them as 0.
const settlement = (seq, at, usage, provider = 'p', model = 'm') => ({
  type: 'assistant/message', seq, time: at,
  data: { turn: 1, step: seq, usage, message: { source: { kind: 'model', provider, model } }, stream: [] },
})

describe('usage buckets follow DSH token-meter semantics', () => {
  it('treats an omitted cache bucket as zero instead of unobserved', () => {
    const facts = foldUsageFacts([
      settlement(10, now - 1000, { inputTokens: 100, outputTokens: 40 }),
      settlement(11, now - 2000, { inputTokens: 20, outputTokens: 10, cacheReadTokens: 80 }),
    ])
    expect(facts.map((f) => f.tokens)).toEqual([
      { inputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 40 },
      { inputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 0, outputTokens: 10 },
    ])
    const window = aggregateUsageWindow({ facts, query: { preset: 'today' }, now, coverage: 'ready' })
    expect(window.totals.requestTotal).toBe(200)
    expect(window.totals.cacheRead).toBe(80)
    expect(window.totals.hitPct).toBeCloseTo(0.4)
    expect(window.unobservedBuckets ?? []).toEqual([])
  })

  it('emits no fact when the settlement carries no usage object at all', () => {
    expect(foldUsageFacts([settlement(12, now - 3000, null)])).toEqual([])
  })
})

describe('write routes trust the host admission instead of a second origin guess', () => {
  const routeFixture = () => {
    const handlers = new Map()
    const ctx = {
      get: () => ({ register: (route) => { handlers.set(route.path, route.handler); return () => handlers.delete(route.path) } }),
      effect: (fn) => fn(),
    }
    const engine = createStateEngine({ roots: () => [], getSession: () => undefined, getTitle: () => undefined, now: () => now })
    let role = 'owner'
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foxbell-desktop-'))
    const env = {
      webServer: ctx.get(),
      pricing: {
        rules: openRuleStore(path.join(dir, 'rules.json')),
        catalog: { get: () => ({ id: null, usd: [], native: [], fx: null, usdAt: null, nativeAt: null, fxAt: null, sources: {} }), refresh: async () => ({}) },
      },
      isActive: () => true,
      stateEngine: engine,
      verifyOwner: async (req) => role === 'owner' && req.headers.authorization === 'Bearer owner',
      sessions: {}, sessionProjections: {},
    }
    registerDashboardRoutes(ctx, env)
    return { handlers, engine, setRole: (value) => { role = value } }
  }

  const call = async (handler, { method = 'GET', path, headers = {}, body } = {}) => {
    const request = Object.assign(
      (async function* () { if (body !== undefined) yield Buffer.from(body) })(),
      { method, url: path, headers: { host: 'dsh-app://desktop', ...headers } },
    )
    let status = 200
    const chunks = []
    const response = { writeHead(code) { status = code }, end(chunk) { if (chunk) chunks.push(Buffer.from(chunk)) } }
    await handler(request, response)
    return { status, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }
  }

  it('rejects a present Origin that is not an http(s) authority', async () => {
    const { handlers } = routeFixture()
    const rules = handlers.get('/dyn-pet-foxbell/dashboard/price-rules')
    const result = await call(rules, {
      method: 'POST', path: '/dyn-pet-foxbell/dashboard/price-rules',
      headers: { origin: 'dsh-app://desktop', authorization: 'Bearer owner' },
      body: '{"expectedRevision":0,"rules":[]}',
    })
    expect(result.status).toBe(400)
    expect(result.body.code).toBe('origin-forbidden')
  })

  it('accepts an authenticated write that carries no Origin at all', async () => {
    const { handlers } = routeFixture()
    const rules = handlers.get('/dyn-pet-foxbell/dashboard/price-rules')
    const result = await call(rules, {
      method: 'POST', path: '/dyn-pet-foxbell/dashboard/price-rules',
      headers: { origin: undefined, authorization: 'Bearer owner' },
      body: '{"expectedRevision":0,"rules":[]}',
    })
    expect(result.status).toBe(200)
    expect(result.body.revision).toBe(1)
  })

  it('still rejects a cross-site http origin on a write', async () => {
    const { handlers } = routeFixture()
    const rules = handlers.get('/dyn-pet-foxbell/dashboard/price-rules')
    const result = await call(rules, {
      method: 'POST', path: '/dyn-pet-foxbell/dashboard/price-rules',
      headers: { origin: 'http://attacker.example', authorization: 'Bearer owner' },
      body: '{"expectedRevision":0,"rules":[]}',
    })
    expect(result.status).toBe(400)
    expect(result.body.code).toBe('origin-forbidden')
  })

  it('still rejects an unauthenticated write', async () => {
    const { handlers } = routeFixture()
    const rules = handlers.get('/dyn-pet-foxbell/dashboard/price-rules')
    const result = await call(rules, { method: 'POST', path: '/dyn-pet-foxbell/dashboard/price-rules', headers: { origin: 'dsh-app://desktop' }, body: '{"expectedRevision":0,"rules":[]}' })
    expect(result.status).toBe(403)
    expect(result.body.code).toBe('owner-required')
  })
})
