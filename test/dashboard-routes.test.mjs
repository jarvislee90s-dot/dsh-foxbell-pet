import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { registerDashboardRoutes } from '../src/host/dashboard-routes.js'
import { hostOwnerVerifier } from '../src/host/host-auth.js'
import { createStateEngine } from '../src/host/state.js'
import { openRuleStore } from '../src/host/price-rules.js'
import { routeKey } from '../src/host/usage-facts.js'
import { loggedStep } from './fixtures/dsh-stats.mjs'

const NOW = new Date(2026, 10, 22, 12, 20).getTime()
const firstTokenTime = (stream) => stream.find((record) => record.chunk?.type === 'text-delta')?.time
const lastUsage = (stream) => [...stream].reverse().find((record) => record.chunk?.type === 'usage')?.chunk.usage

function harness() {
  const handlers = new Map()
  const disposers = []
  const ctx = {
    get: (name) => name === 'webServer' ? { register(route) { handlers.set(route.path, route.handler); return () => handlers.delete(route.path) } } : undefined,
    effect(fn) { disposers.push(fn()) },
  }
  const engine = createStateEngine({ roots: () => [], getSession: () => undefined, getTitle: () => undefined, now: () => NOW, firstTokenTime, lastUsage })
  engine.noteCorpusSession('s1', loggedStep({ at: NOW - 1000, seq: 100, provider: 'p/a', model: 'same', input: 30, output: 20 }), false)
  engine.noteCorpusSession('s2', loggedStep({ at: NOW - 2000, seq: 200, provider: 'q', model: 'same', input: 10, output: 50 }), false)
  engine.noteCoverage('ready')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foxbell-dashboard-routes-'))
  const catalogSnapshot = { id: null, usd: [], native: [], fx: { cnyPerUsd: null }, usdAt: null, nativeAt: null, fxAt: null, sources: {} }
  const catalog = { get: () => catalogSnapshot, refresh: vi.fn(async () => catalogSnapshot), dispose: vi.fn() }
  let role = 'anonymous'
  const projectionStats = { decodeTokens: 1000, decodeMs: 8000 }
  const sessions = { get: vi.fn((id) => id === 'loaded' ? { id } : undefined) }
  const env = {
    stateEngine: engine,
    pricing: { rules: openRuleStore(path.join(root, 'pricing', 'rules.json')), catalog },
    sessions,
    sessionProjections: { snapshot: (_session, keys) => ({ values: keys.has('sessionStats') ? { sessionStats: projectionStats } : {} }) },
    // Contract fixture only: the host adapter's decision is varied out-of-band. No request
    // header, Origin, localhost, or client identity is treated as proof by plugin code.
    verifyOwner: async () => role === 'owner',
  }
  const registered = registerDashboardRoutes(ctx, env)
  if (!registered) throw new Error('dashboard route fixture did not register')
  const dispatch = async (method, suffix, { body, headers = {} } = {}) => {
    const handler = handlers.get(`/dyn-pet-foxbell/dashboard/${suffix.split('?')[0]}`)
    if (!handler) return { status: 404, body: null }
    const req = Object.assign(Readable.from(body === undefined ? [] : typeof body === 'string' ? [Buffer.from(body)] : body), {
      method, url: `/dyn-pet-foxbell/dashboard/${suffix}`, headers: {
        host: 'localhost:3080',
        ...(method === 'POST' ? { origin: 'http://localhost:3080' } : {}),
        ...headers,
      },
    })
    let status = 200
    const chunks = []
    const res = {
      writeHead(code) { status = code },
      end(chunk) { if (chunk) chunks.push(Buffer.from(chunk)) },
    }
    await handler(req, res)
    return { status, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }
  }
  return { ctx, engine, handlers, disposers, dispatch, env, catalog, sessions, projectionStats, setRole: (value) => { role = value } }
}

it('does not persist pricing after its route scope was unmounted while reading the request', async () => {
  const h = harness()
  h.setRole('owner')
  let active = true, markReading, finishBody
  h.env.isActive = () => active
  const reading = new Promise((resolve) => { markReading = resolve })
  const resume = new Promise((resolve) => { finishBody = resolve })
  const request = h.dispatch('POST', 'price-rules', { body: (async function* () {
    markReading()
    await resume
    yield Buffer.from(JSON.stringify({ expectedRevision: 0, rules: [] }))
  })() })
  await reading
  active = false
  finishBody()
  expect((await request).body.code).toBe('capability-unavailable')
  expect(h.env.pricing.rules.get().revision).toBe(0)
})


describe('additive dashboard owner gate and host contracts', () => {
  let h
  beforeEach(() => { h = harness() })

  it('does not register any additive route without a host owner verifier', async () => {
    const handlers = new Map()
    const ctx = { get: () => ({ register: (route) => handlers.set(route.path, route.handler) }), effect: (fn) => fn() }
    expect(registerDashboardRoutes(ctx, {})).toBe(false)
    expect(handlers.size).toBe(0)
    expect(hostOwnerVerifier({})).toBeNull()
    expect(hostOwnerVerifier({ authorizeOwner: async () => true })).toBeNull()
    const admitted = hostOwnerVerifier({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) })
    const rejected = hostOwnerVerifier({ admit: () => ({ rejection: 401 }) })
    const nonOwner = hostOwnerVerifier({ admit: () => ({ peer: { principal: { kind: 'guest' } } }) })
    expect(await admitted({})).toBe(true)
    expect(await rejected({})).toBe(false)
    expect(await nonOwner({})).toBe(false)
  })

  it('rejects anonymous and guest before querying state; owner reads same-model providers independently', async () => {
    const spy = vi.spyOn(h.engine, 'usageWindow')
    expect((await h.dispatch('GET', 'usage?preset=today')).status).toBe(403)
    h.setRole('guest')
    expect((await h.dispatch('GET', 'usage?preset=today')).status).toBe(403)
    expect(spy).not.toHaveBeenCalled()
    h.setRole('owner')
    const response = await h.dispatch('GET', 'usage?preset=today')
    expect(response.status).toBe(200)
    expect(response.body.routes.map((row) => row.route.provider).sort()).toEqual(['p/a', 'q'])
    expect(response.body.totals.outputTokens).toBe(70)
    expect((await h.dispatch('GET', 'usage?preset=custom&from=2026-02-30&to=2026-03-02')).status).toBe(400)
  })

  it('freezes cost span, includes unpriced rows in USD CSV, and never refreshes on GET cost', async () => {
    h.setRole('owner')
    const usage = await h.dispatch('GET', 'usage?preset=today')
    const { span } = usage.body
    const conflict = await h.dispatch('GET', `cost?preset=today&spanFrom=${span.from}&spanTo=${span.to + 1}`)
    expect(conflict.status).toBe(409)
    const cost = await h.dispatch('GET', `cost?preset=today&spanFrom=${span.from}&spanTo=${span.to}`)
    expect(cost.status).toBe(200)
    expect(cost.body.rows).toHaveLength(2)
    expect(cost.body.rows.every((row) => row.usd.amount === null)).toBe(true)
    expect(cost.body.csv).toContain('source_id,observed_provider,model_id')
    expect(cost.body.csv).toContain('p/a')
    expect(h.catalog.refresh).not.toHaveBeenCalled()
  })

  it('enforces rule revisions, POST-only writes, same-origin checks, and the 64 KiB cap', async () => {
    h.setRole('owner')
    expect((await h.dispatch('GET', 'price-rules')).body).toMatchObject({ revision: 0, rules: [] })
    const rule = { kind: 'fixed', model: 'same', provider: null, currency: 'USD', prices: { inputTokens: '0', outputTokens: '2', cacheReadTokens: null, cacheWriteTokens: null } }
    const saved = await h.dispatch('POST', 'price-rules', { body: JSON.stringify({ expectedRevision: 0, rules: [rule] }) })
    expect(saved.status).toBe(200)
    expect(saved.body.revision).toBe(1)
    expect(saved.body.rules[0].prices.inputTokens).toBe('0')
    expect((await h.dispatch('POST', 'price-rules', { body: JSON.stringify({ expectedRevision: 0, rules: [rule] }) })).status).toBe(409)
    const cross = await h.dispatch('POST', 'price-rules', { body: JSON.stringify({ expectedRevision: 1, rules: [rule] }), headers: { origin: 'https://evil.example' } })
    expect(cross.status).toBe(400)
    expect(cross.body.code).toBe('origin-forbidden')
    // An opaque origin or a different http(s) authority is a cross-origin write.
    // (Same authority under the other scheme is allowed: the transport may be plain HTTP
    // behind an HTTPS proxy, matching the host's own comparison.)
    for (const origin of ['null', 'https://other.example']) {
      const rejected = await h.dispatch('POST', 'price-rules', { body: JSON.stringify({ expectedRevision: 1, rules: [rule] }), headers: { origin } })
      expect(rejected.status).toBe(400)
      expect(rejected.body.code).toBe('origin-forbidden')
    }
    // An absent Origin is the normal non-browser case (desktop carrier); admission already
    // applied the Host fence, so the write proceeds under the verified owner identity.
    const noOrigin = await h.dispatch('POST', 'price-rules', { body: JSON.stringify({ expectedRevision: 1, rules: [rule] }) })
    expect(noOrigin.status).toBe(200)
    expect(noOrigin.body.revision).toBe(2)
    expect((await h.dispatch('PUT', 'price-rules', { body: '{}' })).status).toBe(400)
    expect((await h.dispatch('POST', 'price-rules', { body: `{"expectedRevision":2,"rules":[],"pad":"${'x'.repeat(70 * 1024)}"}` })).status).toBe(400)
    expect((await h.env.pricing.rules.get()).revision).toBe(2)
  })

  it('requires explicit boolean force for public pricing sync', async () => {
    h.setRole('owner')
    expect((await h.dispatch('POST', 'pricing-sync', { body: '{}' })).status).toBe(400)
    const response = await h.dispatch('POST', 'pricing-sync', { body: '{"force":true}' })
    expect(response.status).toBe(200)
    expect(h.catalog.refresh).toHaveBeenCalledWith({ force: true })
  })

  it('reads only loaded-session native projections: 1000 tokens / 8000ms = 125 tok/s', async () => {
    h.setRole('owner')
    const ready = await h.dispatch('GET', 'session-speed?sessionId=loaded')
    expect(ready.body).toEqual({ sessionId: 'loaded', tps: 125, status: 'ready' })
    expect((await h.dispatch('GET', 'session-speed?sessionId=cold-unknown')).body).toMatchObject({ tps: null, status: 'empty' })
    expect(h.sessions.get).toHaveBeenCalledWith('cold-unknown')
    h.projectionStats.decodeMs = 0
    expect((await h.dispatch('GET', 'session-speed?sessionId=loaded')).body).toMatchObject({ tps: null, status: 'empty' })
  })

  it('serves cached native history with JSON tuple route identity and no cold reads', async () => {
    h.setRole('owner')
    const key = routeKey({ provider: 'p/a', model: 'same' })
    const response = await h.dispatch('GET', `speed?range=15m&selectedKey=${encodeURIComponent(key)}`)
    expect(response.status).toBe(200)
    expect(response.body.selectedKey).toBe(key)
    expect(response.body.series[0].metrics.tps).toBe(10)
    expect(h.sessions.get).not.toHaveBeenCalled()
    expect((await h.dispatch('GET', 'speed?range=7d')).status).toBe(400)
  })
})
