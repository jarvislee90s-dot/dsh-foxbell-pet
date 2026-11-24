// price-catalog.js — 无用户上下文的公开参考价 / CNY 汇率快照。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const USD_CATALOG_URL = 'https://models.dev/api.json'
export const FX_URL = 'https://open.er-api.com/v6/latest/USD'
export const NATIVE_TREE_URL = 'https://api.github.com/repos/anomalyco/models.dev/git/trees/dev?recursive=1'
export const NATIVE_RAW_BASE = 'https://raw.githubusercontent.com/anomalyco/models.dev/dev/'
export const PRICE_MAX_AGE_MS = 86_400_000
export const SOURCE_RETRY_MS = 300_000
export const MAX_NATIVE_FILES = 32
export const MAX_TOML_CONCURRENCY = 4

export const SIZE_LIMITS = Object.freeze({
  usd: 16 * 1024 * 1024,
  tree: 12 * 1024 * 1024,
  toml: 128 * 1024,
  fx: 256 * 1024,
})

const FIXED_URLS = new Set([USD_CATALOG_URL, FX_URL, NATIVE_TREE_URL])
const NATIVE_PROVIDERS = new Set(['zhipuai', 'moonshotai-cn', 'minimax-cn'])
const PUBLIC_RE = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/
let tmpCounter = 0

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function sourceError(error) {
  return String(error?.message || error || 'unknown error').slice(0, 300)
}

function publicPrice(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  if (typeof raw === 'number' && !Number.isFinite(raw)) return null
  const text = String(raw)
  if (text.length > 1024 || !Number.isFinite(Number(text))) return null
  const match = PUBLIC_RE.exec(text)
  if (!match) return null
  const whole = match[1]
  const fraction = match[2] || ''
  const exponent = Number(match[3] || 0)
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return null
  const digits = `${whole}${fraction}`
  const point = whole.length + exponent
  let normalized
  if (point <= 0) normalized = `0.${'0'.repeat(-point)}${digits}`
  else if (point >= digits.length) normalized = `${digits}${'0'.repeat(point - digits.length)}`
  else normalized = `${digits.slice(0, point)}.${digits.slice(point)}`
  let [left, right = ''] = normalized.split('.')
  left = left.replace(/^0+(?=\d)/, '')
  right = right.replace(/0+$/, '')
  if (right.length > 9 || !Number.isFinite(Number(`${left}${right ? `.${right}` : ''}`))) return null
  return right ? `${left}.${right}` : left
}

function cells(input, cacheRead, cacheWrite, output) {
  return {
    inputTokens: input,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: output,
  }
}

function hasPrice(prices) {
  return Object.values(prices).some(value => value !== null)
}

function normalizeEntries(raw) {
  if (!Array.isArray(raw)) throw new Error('price entries must be an array')
  const entries = raw.map(entry => {
    if (!entry || typeof entry !== 'object' || typeof entry.provider !== 'string' || typeof entry.model !== 'string') {
      throw new Error('invalid price entry')
    }
    const prices = cells(
      publicPrice(entry.prices?.inputTokens),
      publicPrice(entry.prices?.cacheReadTokens),
      publicPrice(entry.prices?.cacheWriteTokens),
      publicPrice(entry.prices?.outputTokens),
    )
    if (!hasPrice(prices)) throw new Error('price entry has no valid prices')
    return { provider: entry.provider, model: entry.model, prices }
  })
  entries.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model))
  const keys = new Set()
  for (const entry of entries) {
    const key = JSON.stringify([entry.provider, entry.model])
    if (keys.has(key)) throw new Error('duplicate price entry')
    keys.add(key)
  }
  return entries
}

export function parseUsdCatalog(json) {
  const root = typeof json === 'string' ? JSON.parse(json) : json
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('models.dev catalog must be an object')
  const entries = []
  for (const [provider, providerValue] of Object.entries(root)) {
    if (!providerValue || typeof providerValue !== 'object' || !providerValue.models) continue
    const models = Array.isArray(providerValue.models)
      ? providerValue.models.map(model => [model?.id, model])
      : Object.entries(providerValue.models)
    for (const [model, value] of models) {
      if (typeof model !== 'string' || !value || typeof value !== 'object' || !value.cost) continue
      const prices = cells(
        publicPrice(value.cost.input),
        publicPrice(value.cost.cache_read),
        publicPrice(value.cost.cache_write),
        publicPrice(value.cost.output),
      )
      if (hasPrice(prices)) entries.push({ provider, model, prices })
    }
  }
  return normalizeEntries(entries)
}

function numberAfter(line, marker) {
  const at = line.indexOf(marker)
  if (at < 0) return null
  const rest = line.slice(at + marker.length)
  const match = /^\s*(\d+(?:\.\d+)?)/.exec(rest)
  return match ? publicPrice(match[1]) : null
}

function numberBefore(line, marker) {
  const at = line.indexOf(marker)
  if (at < 0) return null
  const before = line.slice(0, at)
  const match = /(\d+(?:\.\d+)?)\s*$/.exec(before)
  return match ? publicPrice(match[1]) : null
}

// 只接受源文件中显式写明 CNY / 人民币符号的注释，绝不把无币种 TOML cost 当作 CNY。
export function parseNativeCny(text) {
  if (typeof text !== 'string') return null
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed.startsWith('#')) continue
    const line = trimmed.slice(1).trim().toLowerCase()

    const listMarker = 'list price: cny'
    const listAt = line.indexOf(listMarker)
    if (listAt >= 0) {
      const token = line.slice(listAt + listMarker.length).trim().split(/\s+/, 1)[0]
      const parts = token.split('/')
      if (parts.length === 3) {
        const rates = parts.map(publicPrice)
        if (rates.every(rate => rate !== null)) return cells(rates[0], rates[1], null, rates[2])
      }
    }

    if (line.startsWith('cny per 1m tokens')) {
      const parsed = cells(
        numberBefore(line, ' in'),
        numberBefore(line, ' cache read'),
        numberBefore(line, ' cache write'),
        numberBefore(line, ' out'),
      )
      if (hasPrice(parsed)) return parsed
    }

    if (line.includes('input ¥') && line.includes('output ¥')) {
      return cells(
        numberAfter(line, 'input ¥'),
        numberAfter(line, 'cache hit ¥'),
        numberAfter(line, 'cache write ¥'),
        numberAfter(line, 'output ¥'),
      )
    }
  }
  return null
}

function findEntry(entries, route) {
  if (!Array.isArray(entries) || !route || typeof route.provider !== 'string' || typeof route.model !== 'string') return null
  return entries.find(entry => entry.provider === route.provider && entry.model === route.model) || null
}

export function lookupPrice(catalog, route, currency = 'USD') {
  if (!catalog || (currency !== 'USD' && currency !== 'CNY')) return null
  const entry = findEntry(currency === 'CNY' ? catalog.native : catalog.usd, route)
  if (!entry) return null
  return {
    provider: entry.provider,
    model: entry.model,
    pricingProvider: entry.provider,
    pricingModel: entry.model,
    currency,
    prices: clone(entry.prices),
    source: currency === 'CNY' ? 'native-cny' : 'models.dev',
    sourceAt: currency === 'CNY' ? catalog.nativeAt ?? null : catalog.usdAt ?? null,
    snapshotId: catalog.id ?? null,
  }
}

function nativePath(raw) {
  if (typeof raw !== 'string') return null
  const parts = raw.split('/')
  if (parts.length !== 4 || parts[0] !== 'providers' || !NATIVE_PROVIDERS.has(parts[1]) || parts[2] !== 'models') return null
  const file = parts[3]
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.toml$/.test(file) || file.includes('..')) return null
  const model = file.slice(0, -5)
  if (!model) return null
  return { path: raw, provider: parts[1], model }
}

function assertPublicUrl(raw) {
  if (FIXED_URLS.has(raw)) return
  if (typeof raw === 'string' && raw.startsWith(NATIVE_RAW_BASE) && nativePath(raw.slice(NATIVE_RAW_BASE.length))) return
  throw new Error('public pricing URL rejected')
}

function freshAt(at, now) {
  return Number.isFinite(at) && now - at <= PRICE_MAX_AGE_MS
}

export function minimumUsableSourcesFresh(now, snapshot, maxAge = PRICE_MAX_AGE_MS) {
  return ['usdAt', 'nativeAt', 'fxAt'].every(key => Number.isFinite(snapshot?.[key]) && now - snapshot[key] <= maxAge)
}

function emptySnapshot() {
  const sources = {}
  for (const key of ['usd', 'native', 'fx']) sources[key] = { attemptedAt: null, error: null }
  return {
    schemaVersion: 1,
    id: null,
    usd: [],
    native: [],
    usdAt: null,
    nativeAt: null,
    fxAt: null,
    fx: null,
    syncedAt: null,
    sources,
    cacheError: null,
  }
}

function validTime(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function loadSnapshot(file) {
  const empty = emptySnapshot()
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!raw || typeof raw !== 'object') throw new Error('catalog snapshot must be an object')
    empty.usd = normalizeEntries(raw.usd)
    empty.native = normalizeEntries(raw.native)
    for (const key of ['usdAt', 'nativeAt', 'fxAt', 'syncedAt']) empty[key] = validTime(raw[key])
    if (raw.fx !== null && raw.fx !== undefined) {
      const rate = publicPrice(raw.fx?.cnyPerUsd)
      if (rate === null || Number(rate) <= 0) throw new Error('invalid cached CNY FX')
      empty.fx = { cnyPerUsd: Number(rate) }
    }
    for (const key of ['usd', 'native', 'fx']) {
      empty.sources[key] = {
        attemptedAt: validTime(raw.sources?.[key]?.attemptedAt),
        error: typeof raw.sources?.[key]?.error === 'string' ? raw.sources[key].error : null,
      }
    }
    empty.id = snapshotId(empty)
    return empty
  } catch (error) {
    if (error?.code !== 'ENOENT') empty.cacheError = `catalog cache ignored: ${sourceError(error)}`
    return empty
  }
}

function snapshotId(snapshot) {
  if (!snapshot.usd.length && !snapshot.native.length && !snapshot.fx) return null
  const canonical = JSON.stringify({
    usd: snapshot.usd,
    native: snapshot.native,
    fx: snapshot.fx ? publicPrice(snapshot.fx.cnyPerUsd) : null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

function persistSnapshot(file, snapshot) {
  const dir = path.dirname(file)
  const tmp = path.join(dir, `.catalog-${process.pid}-${tmpCounter++}.tmp`)
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(tmp, file)
  } catch (error) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
    throw error
  }
}

async function readCapped(response, cap) {
  const length = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(length) && length > cap) throw new Error(`response exceeds ${cap} bytes`)
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > cap) throw new Error(`response exceeds ${cap} bytes`)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const bytes = Buffer.from(value)
    total += bytes.length
    if (total > cap) {
      try { await reader.cancel() } catch { /* best effort */ }
      throw new Error(`response exceeds ${cap} bytes`)
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

async function mapLimit(items, limit, fn) {
  const result = new Array(items.length)
  let cursor = 0
  async function worker() {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      result[index] = await fn(items[index])
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  const settled = await Promise.allSettled(workers)
  const failed = settled.find(item => item.status === 'rejected')
  if (failed) throw failed.reason
  return result
}

export function openPriceCatalog({ dir, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required')
  const file = path.join(dir, 'catalog.json')
  let snapshot = loadSnapshot(file)
  let inFlight = null
  let disposed = false
  let roundController = null
  let roundTimer = null
  const controllers = new Set()

  function get() {
    const value = clone(snapshot)
    value.errors = Object.fromEntries(['usd', 'native', 'fx'].map(key => [key, value.sources[key].error]))
    value.stale = !minimumUsableSourcesFresh(now(), value)
    return value
  }

  async function request(url, { cap, timeoutMs, accept }) {
    assertPublicUrl(url)
    if (disposed) throw new Error('pricing catalog disposed')
    const controller = new AbortController()
    controllers.add(controller)
    const abort = () => controller.abort()
    roundController?.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, timeoutMs)
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { accept },
        signal: controller.signal,
      })
      if (!response || response.status >= 300 && response.status < 400 || !response.ok) {
        throw new Error(`public pricing HTTP ${response?.status ?? 'invalid response'}`)
      }
      if (response.url && new URL(response.url).href !== new URL(url).href) throw new Error('public pricing redirect rejected')
      return await readCapped(response, cap)
    } finally {
      clearTimeout(timer)
      roundController?.signal.removeEventListener('abort', abort)
      controllers.delete(controller)
    }
  }

  async function loadUsd() {
    const bytes = await request(USD_CATALOG_URL, {
      cap: SIZE_LIMITS.usd, timeoutMs: 35_000, accept: 'application/json',
    })
    const entries = parseUsdCatalog(bytes.toString('utf8'))
    if (!entries.length) throw new Error('models.dev catalog has no validated prices')
    return entries
  }

  async function loadFx() {
    const bytes = await request(FX_URL, { cap: SIZE_LIMITS.fx, timeoutMs: 15_000, accept: 'application/json' })
    const json = JSON.parse(bytes.toString('utf8'))
    const rate = publicPrice(json?.rates?.CNY)
    if (rate === null || Number(rate) <= 0) throw new Error('FX response has no positive CNY rate')
    return { cnyPerUsd: Number(rate) }
  }

  async function loadNative() {
    const treeBytes = await request(NATIVE_TREE_URL, {
      cap: SIZE_LIMITS.tree, timeoutMs: 35_000, accept: 'application/vnd.github+json',
    })
    const tree = JSON.parse(treeBytes.toString('utf8'))
    if (!Array.isArray(tree?.tree) || tree.truncated === true) throw new Error('native price tree is invalid or truncated')
    const candidates = tree.tree
      .filter(item => !item.type || item.type === 'blob')
      .map(item => nativePath(item.path))
      .filter(Boolean)
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, MAX_NATIVE_FILES)
    const parsed = await mapLimit(candidates, MAX_TOML_CONCURRENCY, async candidate => {
      const bytes = await request(`${NATIVE_RAW_BASE}${candidate.path}`, {
        cap: SIZE_LIMITS.toml, timeoutMs: 8_000, accept: 'text/plain',
      })
      const prices = parseNativeCny(bytes.toString('utf8'))
      return prices ? { provider: candidate.provider, model: candidate.model, prices } : null
    })
    return normalizeEntries(parsed.filter(Boolean))
  }

  async function perform(force, due) {
    const started = now()
    const next = clone(snapshot)
    next.cacheError = null
    for (const key of due) next.sources[key] = { attemptedAt: started, error: null }
    roundController = new AbortController()
    roundTimer = setTimeout(() => roundController?.abort(), 60_000)
    const loaders = { usd: loadUsd, native: loadNative, fx: loadFx }
    await Promise.all(due.map(async key => {
      try {
        const value = await loaders[key]()
        if (key === 'fx') {
          next.fx = value
          next.fxAt = now()
        } else {
          next[key] = value
          next[`${key}At`] = now()
        }
        next.sources[key].error = null
      } catch (error) {
        next.sources[key].error = sourceError(error)
      }
    }))
    clearTimeout(roundTimer)
    roundTimer = null
    roundController = null
    const syncedTimes = [next.usdAt, next.nativeAt, next.fxAt].filter(Number.isFinite)
    next.syncedAt = syncedTimes.length ? Math.max(...syncedTimes) : null
    next.id = snapshotId(next)
    if (!disposed) {
      try {
        persistSnapshot(file, next)
      } catch (error) {
        next.cacheError = `catalog cache write failed: ${sourceError(error)}`
      }
      snapshot = next
    }
    return get()
  }

  function refresh({ force = false } = {}) {
    if (disposed) return Promise.resolve(get())
    if (inFlight) return inFlight
    const at = now()
    const due = ['usd', 'native', 'fx'].filter(key => {
      if (force) return true
      const successAt = snapshot[`${key}At`]
      if (freshAt(successAt, at)) return false
      const attempt = snapshot.sources[key]
      return !(attempt?.error && Number.isFinite(attempt.attemptedAt) && at - attempt.attemptedAt < SOURCE_RETRY_MS)
    })
    if (!due.length) return Promise.resolve(get())
    inFlight = perform(force, due).finally(() => { inFlight = null })
    return inFlight
  }

  function dispose() {
    if (disposed) return
    disposed = true
    if (roundTimer) clearTimeout(roundTimer)
    roundController?.abort()
    for (const controller of controllers) controller.abort()
    controllers.clear()
  }

  return { get, refresh, dispose }
}
