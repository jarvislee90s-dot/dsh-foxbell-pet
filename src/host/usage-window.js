// Pure local-calendar range resolution and UsageWindow aggregation.
import { routeKey } from './usage-facts.js'
import { floorLocalBucket, nextLocalBucket } from './local-clock.js'

const HOUR_MS = 60 * 60 * 1000
const BUCKETS = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens']
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
const validNow = (value) => typeof value === 'number' && Number.isFinite(value)

function invalid(message) {
  throw new RangeError(message)
}

function startOfDay(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function shiftDate(value, days) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

function parseDay(value, label) {
  if (typeof value !== 'string') invalid(`Usage ${label} date is required`)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) invalid(`Invalid usage ${label} date`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(2000, 0, 1, 0, 0, 0, 0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    invalid(`Invalid usage ${label} date`)
  }
  return date
}

// Calendar-day distance must not use local milliseconds (DST days are 23/25h).
function dayOrdinal(date) {
  const value = new Date(Date.UTC(2000, date.getMonth(), date.getDate()))
  value.setUTCFullYear(date.getFullYear())
  return Math.floor(value.getTime() / 86400000)
}

/** Resolve a UsageQuery to a half-open local-time span. */
export function resolveUsageSpan(query, now) {
  if (!validNow(now)) invalid('Invalid usage range clock')
  const preset = query?.preset
  if (preset === '5h') {
    const to = floorLocalBucket(now, HOUR_MS)
    return { from: to - 5 * HOUR_MS, to, grain: 'hour' }
  }

  if (preset === 'custom') {
    const fromDate = parseDay(query?.from, 'from')
    const toDate = parseDay(query?.to, 'to')
    const days = dayOrdinal(toDate) - dayOrdinal(fromDate) + 1
    if (days < 1) invalid('Usage from date must not be after to date')
    if (days > 31) invalid('Usage custom range is limited to 31 days')
    return { from: fromDate.getTime(), to: shiftDate(toDate, 1).getTime(), grain: 'day' }
  }

  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === 'today' ? 1 : 0
  if (!days) invalid('Invalid usage preset')
  const today = startOfDay(now)
  const from = preset === 'today' ? today : shiftDate(today, 1 - days)
  return {
    from: from.getTime(),
    to: shiftDate(today, 1).getTime(),
    grain: preset === 'today' ? 'hour' : 'day',
  }
}

function dateKey(value) {
  const date = new Date(value)
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function emptyBucket(from, to) {
  return {
    from, to, tokens: 0, requestTotal: 0, cacheRead: 0, cacheWrite: 0, uncachedInput: 0, outputTokens: 0,
    requestCount: 0,
    missing: new Set(),
  }
}

function point(bucket) {
  return {
    from: bucket.from,
    to: bucket.to,
    tokens: bucket.tokens,
    hitPct: bucket.missing.has('inputTokens') || bucket.missing.has('cacheReadTokens')
      ? null
      : bucket.requestTotal === 0 ? null : bucket.cacheRead / bucket.requestTotal,
  }
}

function totals(bucket, userEst) {
  const uncached = bucket.missing.has('inputTokens') ? null : bucket.uncachedInput
  return {
    requestTotal: bucket.requestTotal,
    cacheRead: bucket.missing.has('cacheReadTokens') ? null : bucket.cacheRead,
    cacheWrite: bucket.missing.has('cacheWriteTokens') ? null : bucket.cacheWrite,
    uncachedInput: uncached,
    outputTokens: bucket.missing.has('outputTokens') ? null : bucket.outputTokens,
    userEst,
    requestCount: bucket.requestCount,
    hitPct: bucket.requestTotal === 0 ? 0 : bucket.cacheRead / bucket.requestTotal,
  }
}

function addFact(target, fact) {
  target.requestCount += 1
  const tokens = fact?.tokens && typeof fact.tokens === 'object' ? fact.tokens : {}
  for (const bucket of BUCKETS) {
    const value = tokens[bucket]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      target.missing.add(bucket)
      continue
    }
    target.tokens += value
    if (bucket === 'cacheReadTokens') {
      target.cacheRead += value
      target.requestTotal += value
    } else if (bucket === 'inputTokens') {
      target.uncachedInput += value
      target.requestTotal += value
    } else if (bucket === 'cacheWriteTokens') {
      target.cacheWrite += value
    } else if (bucket === 'outputTokens') {
      target.outputTokens += value
    }
  }
}

function makeBuckets(span) {
  const buckets = []
  let cursor = span.from
  while (cursor < span.to) {
    let next
    if (span.grain === 'hour') {
      next = nextLocalBucket(cursor, HOUR_MS)
    } else {
      next = shiftDate(cursor, 1).getTime()
    }
    if (!Number.isFinite(next) || next <= cursor) invalid('Invalid usage bucket boundary')
    next = Math.min(next, span.to)
    buckets.push(emptyBucket(cursor, next))
    cursor = next
  }
  return buckets
}

function bucketIndex(buckets, at) {
  let low = 0
  let high = buckets.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const bucket = buckets[middle]
    if (at < bucket.from) high = middle - 1
    else if (at >= bucket.to) low = middle + 1
    else return middle
  }
  return -1
}

function normalizedRoute(route) {
  return {
    provider: typeof route?.provider === 'string' && route.provider ? route.provider : null,
    model: typeof route?.model === 'string' && route.model ? route.model : null,
  }
}

function readTools(rows) {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (!row || typeof row.name !== 'string' || !row.name) return []
    if (!Number.isFinite(row.count) || row.count < 0 || !Number.isFinite(row.durMs) || row.durMs < 0) return []
    return [{ name: row.name, count: row.count, durMs: row.durMs }]
  })
}

/**
 * Aggregate one frozen fact snapshot. `rangeSummary` is the existing daily
 * range projection (or a function receiving inclusive local date keys); it is
 * intentionally not consulted for 5h, where day-only activity would be false.
 * Span-exact callers may instead pass `userEst` and/or `tools` explicitly.
 *
 * @param {{
 *   facts?: unknown[], query?: object, now?: number, span?: {from:number,to:number,grain:'hour'|'day'},
 *   revision?: number, coverage?: 'ready'|'loading'|'limited',
 *   rangeSummary?: object|((from:string,to:string)=>object), range?: object,
 *   userEst?: number|null, tools?: {name:string,count:number,durMs:number}[]
 * }} input
 */
export function aggregateUsageWindow(input = {}) {
  const query = input.query || { preset: '7d' }
  const now = input.now === undefined ? Date.now() : input.now
  const span = input.span || resolveUsageSpan(query, now)
  if (!span || !validNow(span.from) || !validNow(span.to) || span.from >= span.to || !['hour', 'day'].includes(span.grain)) {
    invalid('Invalid usage span')
  }

  const globalBuckets = makeBuckets(span)
  const global = emptyBucket(span.from, span.to)
  const routes = new Map()
  const days = dayOrdinal(new Date(span.to - 1)) - dayOrdinal(new Date(span.from)) + 1
  const previousFrom = query.preset === '5h' ? span.from - (span.to - span.from) : shiftDate(span.from, -days).getTime()
  const previous = emptyBucket(previousFrom, span.from)
  for (const fact of Array.isArray(input.facts) ? input.facts : []) {
    if (!fact || !validNow(fact.at)) continue
    if (previousFrom <= fact.at && fact.at < span.from) addFact(previous, fact)
    if (fact.at < span.from || fact.at >= span.to) continue
    const route = normalizedRoute(fact.route)
    const key = routeKey(route)
    let row = routes.get(key)
    if (!row) {
      row = { route, key, total: emptyBucket(span.from, span.to), buckets: makeBuckets(span) }
      routes.set(key, row)
    }
    addFact(global, fact)
    addFact(row.total, fact)
    const index = bucketIndex(globalBuckets, fact.at)
    if (index >= 0) {
      addFact(globalBuckets[index], fact)
      addFact(row.buckets[index], fact)
    }
  }

  // Today is a complete local-day query even though its trend uses hour points.
  // The 5h query has no defensible day-only user estimate or tool aggregate.
  let dailyRange = query.preset === '5h' ? null : (input.range || null)
  if (query.preset !== '5h' && typeof input.rangeSummary === 'function') {
    dailyRange = input.rangeSummary(dateKey(span.from), dateKey(span.to - 1)) || null
  } else if (query.preset !== '5h' && input.rangeSummary && typeof input.rangeSummary === 'object') {
    dailyRange = input.rangeSummary
  }

  const userEst = hasOwn(input, 'userEst')
    ? (typeof input.userEst === 'number' && Number.isFinite(input.userEst) ? input.userEst : null)
    : (query.preset !== '5h' && Number.isFinite(dailyRange?.totals?.userEst) ? dailyRange.totals.userEst : null)
  const tools = hasOwn(input, 'tools') ? readTools(input.tools) : readTools(dailyRange?.tools)
  const routeRows = [...routes.values()].map((row) => ({
    route: row.route,
    totals: totals(row.total, null), // user activity is never apportioned to models
    unobservedBuckets: BUCKETS.filter((bucket) => row.total.missing.has(bucket)),
    points: row.buckets.map(point),
  })).sort((a, b) =>
    b.totals.requestTotal - a.totals.requestTotal ||
    b.totals.outputTokens - a.totals.outputTokens ||
    routeKey(a.route).localeCompare(routeKey(b.route)))

  return {
    span: { from: span.from, to: span.to, grain: span.grain },
    revision: Number.isFinite(input.revision) ? input.revision : 0,
    coverage: ['ready', 'loading', 'limited'].includes(input.coverage) ? input.coverage : 'ready',
    totals: totals(global, userEst),
    previousHitPct: previous.requestTotal > 0 && !previous.missing.has('inputTokens') && !previous.missing.has('cacheReadTokens')
      ? previous.cacheRead / previous.requestTotal
      : null,
    unobservedBuckets: BUCKETS.filter((bucket) => global.missing.has(bucket)),
    points: globalBuckets.map(point),
    routes: routeRows,
    tools,
  }
}
