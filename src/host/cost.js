// cost.js — 同一用量 / 规则 / 价目快照上的纯定点 API 等效估价。
import { PRICE_BUCKETS, priceBand, resolveRule } from './price-rules.js'
import { lookupPrice } from './price-catalog.js'

const NANO = 1_000_000_000n
const MILLION = 1_000_000n
const DECIMAL_RE = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function maxTime(values) {
  const valid = values.filter(Number.isFinite)
  return valid.length ? Math.max(...valid) : null
}

function routeKey(route) {
  return JSON.stringify([route.provider, route.model])
}

function normalizeRoute(route) {
  return {
    provider: typeof route?.provider === 'string' && route.provider.length ? route.provider : null,
    model: typeof route?.model === 'string' && route.model.length ? route.model : null,
  }
}

function compareText(a, b) {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

function tokenValue(raw) {
  if (raw === null || raw === undefined) return null
  if (!Number.isSafeInteger(raw) || raw < 0) throw new TypeError(`invalid token count: ${String(raw)}`)
  return BigInt(raw)
}

function safeNumber(value) {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new RangeError('aggregated token count exceeds safe integer range')
  return number
}

function decimalNano(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  if (typeof raw === 'number' && !Number.isFinite(raw)) return null
  const text = String(raw)
  if (text.length > 1024 || !Number.isFinite(Number(text))) return null
  const match = DECIMAL_RE.exec(text)
  if (!match) return null
  const whole = match[1]
  const fraction = match[2] || ''
  const exponent = Number(match[3] || 0)
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return null
  const digits = `${whole}${fraction}`
  const point = whole.length + exponent
  let left
  let right
  if (point <= 0) {
    left = '0'
    right = `${'0'.repeat(-point)}${digits}`
  } else if (point >= digits.length) {
    left = `${digits}${'0'.repeat(point - digits.length)}`
    right = ''
  } else {
    left = digits.slice(0, point)
    right = digits.slice(point)
  }
  left = left.replace(/^0+(?=\d)/, '') || '0'
  right = right.padEnd(9, '0')
  if (right.length > 9 && /[1-9]/.test(right.slice(9))) return null
  right = right.slice(0, 9)
  return BigInt(left) * NANO + BigInt(right || '0')
}

function decimalText(raw) {
  const nano = decimalNano(raw)
  if (nano === null) return null
  return formatScaled(nano)
}

function formatScaled(scaled) {
  const whole = scaled / NANO
  const fraction = (scaled % NANO).toString().padStart(9, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

function roundedRatio(numerator, denominator) {
  if (denominator <= 0n) throw new RangeError('fixed-point denominator must be positive')
  return (numerator * NANO + denominator / 2n) / denominator
}

function emptyBucket() {
  return { tokens: 0n, missing: false }
}

function addToken(bucket, value) {
  if (value === null) bucket.missing = true
  else bucket.tokens += value
}

function catalogSnapshot(catalog) {
  if (catalog && typeof catalog.get === 'function') return catalog.get()
  return catalog && typeof catalog === 'object' ? catalog : null
}

function fxRate(snapshot) {
  const nano = decimalNano(snapshot?.fx?.cnyPerUsd)
  return nano !== null && nano > 0n ? nano : null
}

function selectedManualCells(rule, slice, state) {
  if (!rule) return null
  if (rule.kind === 'fixed') return rule.prices
  if (rule.kind !== 'time') return null
  const band = priceBand(rule, slice.at)
  if (band === 'dailyFallback') state.dailyFallback = true
  if (band === 'peak') return rule.peak
  return rule.offpeak
}

function catalogChoice(snapshot, route, bucket, currency, fxNano) {
  const native = lookupPrice(snapshot, route, currency)
  const nativePrice = native?.prices?.[bucket]
  if (nativePrice !== null && nativePrice !== undefined) {
    return { price: nativePrice, source: 'catalog', sourceAt: native.sourceAt, converted: false, entry: native }
  }
  if (!fxNano) return null
  const otherCurrency = currency === 'USD' ? 'CNY' : 'USD'
  const other = lookupPrice(snapshot, route, otherCurrency)
  const otherPrice = other?.prices?.[bucket]
  if (otherPrice === null || otherPrice === undefined) return null
  return {
    price: otherPrice,
    source: 'catalog',
    sourceAt: maxTime([other.sourceAt, snapshot.fxAt]),
    converted: true,
    entry: other,
  }
}

function resolvePrice({ snapshot, route, bucket, currency, rule, cells, fxNano }) {
  const manualPrice = cells?.[bucket]
  if (manualPrice !== null && manualPrice !== undefined) {
    if (rule.currency === currency) {
      return { price: manualPrice, source: 'manual', sourceAt: null, converted: false, entry: null }
    }
    // 已填写的手动价在缺 FX 时必须保持未计价，不能偷换为目录价。
    if (!fxNano) return null
    return {
      price: manualPrice,
      source: 'manual',
      sourceAt: snapshot?.fxAt ?? null,
      converted: true,
      entry: null,
    }
  }
  return catalogChoice(snapshot, route, bucket, currency, fxNano)
}

function readingDetails(row, currency, context) {
  const { snapshot, rule, fxNano } = context
  const rateForCommonDenominator = currency === 'USD' && fxNano ? fxNano : NANO
  const denominator = MILLION * NANO * rateForCommonDenominator
  const details = []
  const sources = new Set()
  let totalNumerator = 0n
  let pricedTokens = 0n
  let unpricedTokens = 0n
  let unknownTokens = false
  let hasPriced = false
  let priceUpdatedAt = null
  let pricingProvider = null
  let pricingModel = null

  for (const bucket of PRICE_BUCKETS) {
    let numerator = 0n
    let bucketPricedTokens = 0n
    let bucketUnpricedTokens = 0n
    let bucketHasPriced = false
    let converted = false
    let sourceAt = null
    const bucketSources = new Set()

    for (const item of row.slices) {
      const state = { dailyFallback: false }
      const cells = selectedManualCells(rule, item, state)
      if (state.dailyFallback) context.dailyFallback = true
      const tokens = tokenValue(item.tokens?.[bucket])
      if (tokens === null) {
        unknownTokens = true
        continue
      }
      const selected = resolvePrice({
        snapshot, route: row.route, bucket, currency, rule, cells, fxNano,
      })
      if (!selected) {
        bucketUnpricedTokens += tokens
        continue
      }
      const unitPriceNano = decimalNano(selected.price)
      if (unitPriceNano === null) {
        bucketUnpricedTokens += tokens
        continue
      }
      let factor
      if (!selected.converted) factor = currency === 'USD' ? rateForCommonDenominator : NANO
      else factor = currency === 'USD' ? NANO : fxNano
      numerator += tokens * unitPriceNano * factor
      bucketPricedTokens += tokens
      bucketHasPriced = true
      hasPriced = true
      converted ||= selected.converted
      bucketSources.add(selected.source)
      sources.add(selected.source)
      if (Number.isFinite(selected.sourceAt)) sourceAt = Math.max(sourceAt ?? 0, selected.sourceAt)
      if (selected.entry) {
        pricingProvider = selected.entry.pricingProvider
        pricingModel = selected.entry.pricingModel
      }
    }

    const aggregate = row.buckets[bucket]
    const knownTokens = aggregate.tokens
    if (aggregate.missing) unknownTokens = true
    totalNumerator += numerator
    pricedTokens += bucketPricedTokens
    unpricedTokens += bucketUnpricedTokens
    if (sourceAt !== null) priceUpdatedAt = Math.max(priceUpdatedAt ?? 0, sourceAt)
    const source = bucketSources.size === 0 ? null : bucketSources.size === 1 ? [...bucketSources][0] : 'mixed'
    details.push({
      bucket,
      tokens: aggregate.missing ? null : safeNumber(knownTokens),
      unitPrice: bucketHasPriced && bucketPricedTokens > 0n
        ? formatScaled(roundedRatio(numerator * MILLION, denominator * bucketPricedTokens))
        : null,
      amount: bucketHasPriced ? formatScaled(roundedRatio(numerator, denominator)) : null,
      source,
      sourceAt,
      converted,
    })
  }

  const comparable = pricedTokens + unpricedTokens
  if (!unknownTokens) safeNumber(comparable)
  const reading = {
    amount: hasPriced ? formatScaled(roundedRatio(totalNumerator, denominator)) : null,
    status: hasPriced ? unknownTokens || unpricedTokens > 0n ? 'partial' : 'priced' : 'unpriced',
    pricedTokens: safeNumber(pricedTokens),
    unpricedTokens: unknownTokens ? null : safeNumber(unpricedTokens),
    coverageRate: unknownTokens || comparable === 0n ? null : Number(pricedTokens) / Number(comparable),
  }
  return {
    reading,
    details,
    sources,
    priceUpdatedAt,
    pricingProvider,
    pricingModel,
  }
}

function pricingError(snapshot) {
  const errors = []
  for (const key of ['usd', 'native', 'fx']) {
    const error = snapshot?.sources?.[key]?.error ?? snapshot?.errors?.[key]
    if (error) errors.push(`${key}: ${error}`)
  }
  if (snapshot?.cacheError) errors.push(snapshot.cacheError)
  return errors.length ? errors.join('; ') : null
}

function selectSlices(slices, span) {
  const timed = []
  const daily = []
  for (const raw of Array.isArray(slices) ? slices : []) {
    const route = normalizeRoute(raw?.route)
    if (raw?.at === null) {
      const day = raw.daySpan
      if (day && Number.isFinite(day.from) && Number.isFinite(day.to) && day.from < day.to
        && span.from <= day.from && day.to <= span.to) {
        daily.push({ at: null, daySpan: { from: day.from, to: day.to }, route, tokens: raw.tokens })
      }
    } else if (Number.isFinite(raw?.at) && span.from <= raw.at && raw.at < span.to) {
      timed.push({ at: raw.at, route, tokens: raw.tokens })
    }
  }
  const accepted = [...timed]
  for (const day of daily) {
    const hasDetail = timed.some(item => routeKey(item.route) === routeKey(day.route)
      && day.daySpan.from <= item.at && item.at < day.daySpan.to)
    if (!hasDetail) accepted.push(day)
  }
  return accepted
}

export function estimateCosts({ slices, span, catalog, rules, revision, coverage, rulesRevision: explicitRulesRevision }) {
  if (!span || !Number.isFinite(span.from) || !Number.isFinite(span.to) || span.from >= span.to) {
    throw new TypeError('invalid cost span')
  }
  const snapshot = catalogSnapshot(catalog)
  const ruleSnapshot = Array.isArray(rules) ? { rules, revision: 0 } : rules || { rules: [], revision: 0 }
  const ruleList = Array.isArray(ruleSnapshot.rules) ? ruleSnapshot.rules : []
  const usageRevision = typeof revision === 'object' ? revision.usage ?? 0 : revision ?? 0
  const rulesRevision = explicitRulesRevision ?? (typeof revision === 'object' && revision.rules !== undefined
    ? revision.rules
    : ruleSnapshot.revision ?? 0)
  const selected = selectSlices(slices, span)
  const grouped = new Map()
  for (const item of selected) {
    const key = routeKey(item.route)
    if (!grouped.has(key)) {
      const buckets = {}
      for (const bucket of PRICE_BUCKETS) buckets[bucket] = emptyBucket()
      grouped.set(key, { route: item.route, slices: [], buckets })
    }
    const row = grouped.get(key)
    row.slices.push(item)
    for (const bucket of PRICE_BUCKETS) addToken(row.buckets[bucket], tokenValue(item.tokens?.[bucket]))
  }

  const fxNano = fxRate(snapshot)
  const rows = []
  for (const row of grouped.values()) {
    const normalizedModel = typeof row.route.model === 'string' ? row.route.model.trim() || null : null
    const rule = normalizedModel === null ? null : resolveRule(ruleList, row.route, normalizedModel)
    const usdContext = { snapshot, rule, fxNano, dailyFallback: false }
    const cnyContext = { ...usdContext }
    const usd = readingDetails(row, 'USD', usdContext)
    const cny = readingDetails(row, 'CNY', cnyContext)
    const metadata = (reading, context) => ({
      pricingProvider: reading.pricingProvider,
      pricingModel: reading.pricingModel,
      priceUpdatedAt: reading.priceUpdatedAt,
      pricingBasis: reading.sources.size === 0 ? 'none' : reading.sources.size === 1 ? [...reading.sources][0] : 'mixed',
      priceRuleKind: rule?.kind || 'none',
      timePriceDailyFallback: context.dailyFallback,
    })
    const pricing = { USD: metadata(usd, usdContext), CNY: metadata(cny, cnyContext) }
    const tokenMissing = PRICE_BUCKETS.some(bucket => row.buckets[bucket].missing)
    const tokenUsage = tokenMissing ? null : safeNumber(PRICE_BUCKETS.reduce((sum, bucket) => sum + row.buckets[bucket].tokens, 0n))
    const hitKnown = !row.buckets.inputTokens.missing && !row.buckets.cacheReadTokens.missing
    const requestTotal = row.buckets.inputTokens.tokens + row.buckets.cacheReadTokens.tokens
    const hitPct = hitKnown ? requestTotal === 0n ? 0 : Number(row.buckets.cacheReadTokens.tokens) / Number(requestTotal) : null
    rows.push({
      route: clone(row.route),
      normalizedModel,
      tokenUsage,
      hitPct,
      usd: usd.reading,
      cny: cny.reading,
      details: { USD: usd.details, CNY: cny.details },
      // Top-level fields describe the USD export for existing consumers.
      ...pricing.USD,
      pricing,
    })
  }
  rows.sort((a, b) => compareText(a.route.provider, b.route.provider) || compareText(a.route.model, b.route.model))
  return {
    span: { from: span.from, to: span.to, grain: span.grain },
    revision: usageRevision,
    rulesRevision,
    pricingSnapshotId: snapshot?.id ?? null,
    coverage,
    priceState: {
      stale: snapshot?.stale === true,
      syncedAt: snapshot?.syncedAt ?? maxTime([snapshot?.usdAt, snapshot?.nativeAt, snapshot?.fxAt]),
      error: pricingError(snapshot),
    },
    rows,
  }
}

// 供契约测试与调用方诊断定点边界；估价结果本身只含 JSON 安全值。
export const fixedPoint = Object.freeze({ decimalNano, decimalText, formatScaled })
