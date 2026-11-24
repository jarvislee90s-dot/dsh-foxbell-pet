import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FX_URL,
  NATIVE_RAW_BASE,
  NATIVE_TREE_URL,
  SIZE_LIMITS,
  USD_CATALOG_URL,
  lookupPrice,
  openPriceCatalog,
  parseNativeCny,
  parseUsdCatalog,
} from '../src/host/price-catalog.js'
import {
  FIXTURE_MODEL,
  FIXTURE_NATIVE_PATH,
  FIXTURE_PROVIDER,
  FX_FIXTURE,
  NATIVE_CNY_FIXTURE,
  NATIVE_TREE_FIXTURE,
  USD_CATALOG_FIXTURE,
} from './fixtures/pricing-catalog.mjs'

const roots = []
const catalogs = []
afterEach(() => {
  for (const catalog of catalogs.splice(0)) catalog.dispose()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function fixtureRoutes() {
  return {
    [USD_CATALOG_URL]: { body: USD_CATALOG_FIXTURE },
    [NATIVE_TREE_URL]: { body: NATIVE_TREE_FIXTURE },
    [`${NATIVE_RAW_BASE}${FIXTURE_NATIVE_PATH}`]: { body: NATIVE_CNY_FIXTURE },
    [FX_URL]: { body: FX_FIXTURE },
  }
}

function mockFetch(routes) {
  const calls = []
  const impl = async (url, options) => {
    calls.push({ url, options })
    const route = typeof routes[url] === 'function' ? await routes[url]() : routes[url]
    if (!route) throw new Error(`unexpected synthetic URL ${url}`)
    if (route.throw) throw route.throw
    const body = Buffer.isBuffer(route.body)
      ? route.body
      : Buffer.from(typeof route.body === 'string' ? route.body : JSON.stringify(route.body ?? ''))
    return {
      ok: route.ok ?? ((route.status ?? 200) >= 200 && (route.status ?? 200) < 300),
      status: route.status ?? 200,
      url: route.responseUrl === undefined ? url : route.responseUrl,
      headers: new Map(Object.entries({ 'content-length': String(body.length), ...(route.headers || {}) })),
      body: null,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    }
  }
  impl.calls = calls
  return impl
}

function tempDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foxbell-catalog-'))
  roots.push(root)
  return root
}

function open(options) {
  const catalog = openPriceCatalog(options)
  catalogs.push(catalog)
  return catalog
}

describe('public price parsers and exact lookup', () => {
  it('normalizes the four USD buckets without combining cache with input', () => {
    const entries = parseUsdCatalog(USD_CATALOG_FIXTURE)
    const entry = entries.find(item => item.provider === FIXTURE_PROVIDER && item.model === FIXTURE_MODEL)
    expect(entry.prices).toEqual({ inputTokens: '2', cacheReadTokens: '0.25', cacheWriteTokens: '0.5', outputTokens: '8' })
  })

  it('parses only explicitly marked CNY comment formats', () => {
    expect(parseNativeCny(NATIVE_CNY_FIXTURE)).toEqual({
      inputTokens: '14', cacheReadTokens: '1.4', cacheWriteTokens: '2.8', outputTokens: '28',
    })
    expect(parseNativeCny('# List price: CNY 8/2/28 (input/cache read/output per MTok)')).toEqual({
      inputTokens: '8', cacheReadTokens: '2', cacheWriteTokens: null, outputTokens: '28',
    })
    expect(parseNativeCny('# input ¥20.00, cache hit ¥2.00, cache write ¥20.00 (5m) / ¥40.00 (1h), output ¥100.00')).toEqual({
      inputTokens: '20', cacheReadTokens: '2', cacheWriteTokens: '20', outputTokens: '100',
    })
    expect(parseNativeCny('[cost.text.input]\nprice = 1.5')).toBeNull()
  })

  it('never guesses a provider from a bare known model', () => {
    const catalog = { usd: parseUsdCatalog(USD_CATALOG_FIXTURE), native: [], usdAt: 10, nativeAt: null }
    expect(lookupPrice(catalog, { provider: FIXTURE_PROVIDER, model: FIXTURE_MODEL }).prices.inputTokens).toBe('2')
    expect(lookupPrice(catalog, { provider: 'unknown', model: FIXTURE_MODEL })).toBeNull()
    expect(lookupPrice(catalog, { provider: null, model: FIXTURE_MODEL })).toBeNull()
  })
})

describe('openPriceCatalog', () => {
  it('single-flights concurrent refresh, caches validated sources, and sends no private data', async () => {
    const dir = tempDir()
    const fetchImpl = mockFetch(fixtureRoutes())
    let now = 1_800_000_000_000
    const catalog = open({ dir, fetchImpl, now: () => now })
    await Promise.all([catalog.refresh({ force: false }), catalog.refresh({ force: true })])
    expect(fetchImpl.calls.filter(call => call.url === USD_CATALOG_URL)).toHaveLength(1)
    expect(fetchImpl.calls.filter(call => call.url === NATIVE_TREE_URL)).toHaveLength(1)
    expect(catalog.get().fx?.cnyPerUsd).toBe(7.13)
    expect(catalog.get().native[0].prices.inputTokens).toBe('14')
    expect(catalog.get().id).toMatch(/^[a-f0-9]{64}$/)
    expect(fs.existsSync(path.join(dir, 'catalog.json'))).toBe(true)

    const privateMarkers = ['fake-user-session', '/private/path', 'secret-token', 'route-inventory']
    for (const call of fetchImpl.calls) {
      const sent = `${call.url} ${JSON.stringify(call.options)}`
      for (const marker of privateMarkers) expect(sent).not.toContain(marker)
      expect(call.options).toMatchObject({ method: 'GET', redirect: 'error', credentials: 'omit' })
      expect(call.options.body).toBeUndefined()
      expect(call.options.headers.authorization).toBeUndefined()
    }

    const calls = fetchImpl.calls.length
    now += 60_000
    await catalog.refresh({ force: false })
    expect(fetchImpl.calls).toHaveLength(calls)
    await catalog.refresh({ force: true })
    expect(fetchImpl.calls.filter(call => call.url === USD_CATALOG_URL)).toHaveLength(2)

    const reloaded = open({ dir, fetchImpl: mockFetch({}), now: () => now })
    expect(reloaded.get().id).toBe(catalog.get().id)
    expect(reloaded.get().usd).toEqual(catalog.get().usd)
  })

  it('keeps last-good values on isolated failure and backs off automatic retries per source', async () => {
    const dir = tempDir()
    let routes = fixtureRoutes()
    const fetchImpl = mockFetch(routes)
    // The mock routes object is replaced by mutating its entries below.
    let now = 1_800_000_000_000
    const catalog = open({ dir, fetchImpl, now: () => now })
    await catalog.refresh()
    const initial = catalog.get()

    now += 86_500_000
    routes[FX_URL] = { throw: new Error('synthetic FX outage') }
    await catalog.refresh({ force: true })
    expect(catalog.get().fx).toEqual(initial.fx)
    expect(catalog.get().fxAt).toBe(initial.fxAt)
    expect(catalog.get().usdAt).toBe(now)
    expect(catalog.get().sources.fx.error).toContain('synthetic FX outage')
    expect(catalog.get().errors.fx).toContain('synthetic FX outage')
    expect(catalog.get().usdAt).not.toBe(initial.usdAt)

    const afterFailure = fetchImpl.calls.length
    await catalog.refresh({ force: false })
    expect(fetchImpl.calls).toHaveLength(afterFailure)
    routes[FX_URL] = { body: FX_FIXTURE }
    now += 300_000
    await catalog.refresh({ force: false })
    expect(fetchImpl.calls.slice(afterFailure).map(call => call.url)).toEqual([FX_URL])
    expect(catalog.get().sources.fx.error).toBeNull()
  })

  it('rejects redirect-shaped responses and enforces response limits without following URLs', async () => {
    const dir = tempDir()
    const routes = fixtureRoutes()
    routes[USD_CATALOG_URL] = { status: 302, body: '', headers: { location: 'https://evil.invalid/steal' } }
    routes[FX_URL] = { body: '{}', headers: { 'content-length': String(SIZE_LIMITS.fx + 1) } }
    const fetchImpl = mockFetch(routes)
    const catalog = open({ dir, fetchImpl, now: () => 1_800_000_000_000 })
    await catalog.refresh({ force: true })
    expect(catalog.get().usd).toEqual([])
    expect(catalog.get().fx).toBeNull()
    expect(catalog.get().sources.usd.error).toContain('302')
    expect(catalog.get().sources.fx.error).toContain('exceeds')
    expect(fetchImpl.calls.some(call => call.url.includes('evil.invalid'))).toBe(false)
    expect(fetchImpl.calls.filter(call => call.url.startsWith(NATIVE_RAW_BASE)).map(call => call.url)).toEqual([
      `${NATIVE_RAW_BASE}${FIXTURE_NATIVE_PATH}`,
    ])
  })

  it('caps native candidates at 32 and TOML concurrency at four', async () => {
    const dir = tempDir()
    const routes = fixtureRoutes()
    routes[NATIVE_TREE_URL] = {
      body: {
        tree: Array.from({ length: 40 }, (_, index) => ({
          path: `providers/zhipuai/models/synthetic-${String(index).padStart(2, '0')}.toml`, type: 'blob',
        })),
      },
    }
    for (let index = 0; index < 40; index++) {
      const name = `synthetic-${String(index).padStart(2, '0')}`
      routes[`${NATIVE_RAW_BASE}providers/zhipuai/models/${name}.toml`] = { body: NATIVE_CNY_FIXTURE }
    }
    const base = mockFetch(routes)
    let active = 0
    let maximum = 0
    const fetchImpl = async (url, options) => {
      if (!url.startsWith(NATIVE_RAW_BASE)) return base(url, options)
      active++
      maximum = Math.max(maximum, active)
      await new Promise(resolve => setTimeout(resolve, 2))
      active--
      return base(url, options)
    }
    const catalog = open({ dir, fetchImpl, now: () => 1_800_000_000_000 })
    await catalog.refresh()
    expect(maximum).toBeLessThanOrEqual(4)
    expect(base.calls.filter(call => call.url.startsWith(NATIVE_RAW_BASE))).toHaveLength(32)
    expect(catalog.get().native).toHaveLength(32)
  })

  it('aborts in-flight requests on dispose and does not write the cache afterward', async () => {
    const dir = tempDir()
    const signals = []
    const fetchImpl = (url, options) => {
      signals.push(options.signal)
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true })
      })
    }
    const catalog = open({ dir, fetchImpl, now: () => 1_800_000_000_000 })
    const pending = catalog.refresh({ force: true })
    catalog.dispose()
    await pending
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every(signal => signal.aborted)).toBe(true)
    expect(fs.existsSync(path.join(dir, 'catalog.json'))).toBe(false)
    await catalog.refresh({ force: true })
    expect(signals).toHaveLength(3)
  })
})
