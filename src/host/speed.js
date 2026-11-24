// DSH native current-session speed and settled-event history. This module is pure:
// callers provide loaded sessions, projection services, events, helpers, and time.

import { nextLocalBucket } from './local-clock.js'

const DAY_MS = 86_400_000
const RANGE_MS = { '15m': 15 * 60_000, '1h': 60 * 60_000, '5h': 5 * 60 * 60_000, '24h': DAY_MS }
const BUCKET_MS = { '15m': 60_000, '1h': 5 * 60_000, '5h': 10 * 60_000, '24h': 60 * 60_000 }

export const SPEED_RANGES = Object.freeze(Object.keys(RANGE_MS))
export const SPEED_BUCKET_MS = Object.freeze({ ...BUCKET_MS })

export function routeKey(route) {
  return JSON.stringify([
    route && typeof route.provider === 'string' ? route.provider : null,
    route && typeof route.model === 'string' ? route.model : null,
  ])
}

const emptySessionSpeed = (sessionId, status) => ({ sessionId, tps: null, status })
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const nonNegative = (value) => finite(value) && value >= 0
const eventSeq = (value) => Number.isSafeInteger(value) && value >= 0
const identity = (value) => Number.isSafeInteger(value) && value >= 0

/**
 * Read DSH's cumulative sessionStats projection for an already-loaded Session.
 * No query/readSession fallback is used here: an arbitrary id must never trigger a cold read.
 */
export function readSessionSpeed({ sessions, projections } = {}, sessionId) {
  const id = typeof sessionId === 'string' ? sessionId : String(sessionId ?? '')
  try {
    if (!sessions || typeof sessions.get !== 'function') return emptySessionSpeed(id, 'unsupported')
    if (!projections || typeof projections.snapshot !== 'function') return emptySessionSpeed(id, 'unsupported')
    const session = sessions.get(sessionId)
    if (!session) return emptySessionSpeed(id, 'empty')
    const snapshot = projections.snapshot(session, new Set(['sessionStats']))
    const stats = snapshot && snapshot.values && snapshot.values.sessionStats
    if (!stats || typeof stats !== 'object') return emptySessionSpeed(id, 'unsupported')
    if (!nonNegative(stats.decodeTokens) || !nonNegative(stats.decodeMs)) return emptySessionSpeed(id, 'unsupported')
    if (stats.decodeTokens <= 0 || stats.decodeMs <= 0) return emptySessionSpeed(id, 'empty')
    const tps = 1000 * stats.decodeTokens / stats.decodeMs
    if (!finite(tps) || tps <= 0) return emptySessionSpeed(id, 'unsupported')
    return { sessionId: id, tps, status: 'ready' }
  } catch {
    return emptySessionSpeed(id, 'unsupported')
  }
}

function routeOf(data) {
  const source = data && data.message && data.message.source
  if (!source || typeof source !== 'object') return null
  // New DSH envelopes explicitly identify model-originated messages. Missing kind is
  // tolerated for older hosts; an explicitly non-model source is never a speed sample.
  if (source.kind !== undefined && source.kind !== 'model') return null
  const provider = typeof source.provider === 'string' ? source.provider.trim() : ''
  const model = typeof source.model === 'string' ? source.model.trim() : ''
  return provider && model ? { provider, model } : null
}

function stepKey(turn, step) {
  return JSON.stringify([turn, step])
}

function callIdOf(data) {
  const value = data && data.message && data.message.source && data.message.source.callId
  return typeof value === 'string' && value.length > 0 ? value : null
}

function firstTokenOf(helper, stream) {
  if (typeof helper !== 'function' || !Array.isArray(stream)) return null
  try {
    const value = helper(stream)
    return finite(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Fold one session's cropped events into numeric settled-response facts.
 *
 * A retry/attempt makes earlier first-token records inadmissible. The final message stream
 * must independently prove a first token after that discontinuity and inside the original
 * start-to-settlement window (DSH retries do not emit another step/start). Missing output
 * never erases an independently valid TTFT, model, or tool measurement.
 */
export function foldSpeedFacts(events, { sessionId, now, firstTokenTime } = {}) {
  const sid = typeof sessionId === 'string' ? sessionId : String(sessionId ?? '')
  const hasNow = finite(now)
  const steps = new Map()
  const messages = []
  const seen = new Set()

  for (let order = 0; order < (Array.isArray(events) ? events.length : 0); order += 1) {
    const event = events[order]
    if (!event || typeof event !== 'object' || !eventSeq(event.seq) || seen.has(event.seq)) continue
    seen.add(event.seq)
    const data = event.data
    if (!data || typeof data !== 'object' || !finite(event.time)) continue
    if (!identity(data.turn) || !identity(data.step)) continue
    const key = stepKey(data.turn, data.step)

    if (event.type === 'step/start') {
      const state = steps.get(key) || { calls: new Map(), discontinuity: null, latestMessage: null, closed: false }
      state.start = { time: event.time, order }
      state.latestMessage = null
      state.closed = false
      steps.set(key, state)
      continue
    }

    const state = steps.get(key)
    if (event.type === 'assistant/attempt' || event.type === 'llm/retry-started') {
      if (state) state.discontinuity = { time: event.time, order }
      continue
    }

    if (event.type === 'assistant/message') {
      const next = state || { calls: new Map(), discontinuity: null, latestMessage: null, closed: false }
      if (!state) steps.set(key, next)
      if (data.interrupted === true) {
        next.latestMessage = null
        next.discontinuity = { time: event.time, order }
        continue
      }
      const route = routeOf(data)
      if (!route) {
        next.latestMessage = null
        continue
      }
      const start = next.start
      const reliableStart = !!start && start.order < order && start.time <= event.time
      const first = reliableStart ? firstTokenOf(firstTokenTime, data.stream) : null
      const boundary = next.discontinuity
      const afterDiscontinuity = !boundary || (boundary.order < order && first > boundary.time)
      const alignedFirst = first !== null && start.time <= first && first < event.time && afterDiscontinuity ? first : null
      // A settled success can prove its decode interval without proving when that attempt started.
      const ownStart = reliableStart && (!boundary || (start.order > boundary.order && start.time >= boundary.time))
      const usage = data.usage && typeof data.usage === 'object' ? data.usage : null
      const record = {
        sessionId: sid,
        seq: event.seq,
        route,
        at: event.time,
        outputTokens: usage && nonNegative(usage.outputTokens) ? usage.outputTokens : null,
        decodeMs: alignedFirst !== null && alignedFirst < event.time ? event.time - alignedFirst : null,
        ttftMs: ownStart && alignedFirst !== null ? alignedFirst - start.time : null,
        modelMs: ownStart ? event.time - start.time : null,
        toolTotal: 0,
        toolCount: 0,
        order,
      }
      messages.push(record)
      next.latestMessage = record
      continue
    }

    if (!state) continue
    if (event.type === 'step/end') {
      state.closed = true
      continue
    }
    if (state.closed) continue

    if (event.type === 'tool/call') {
      const callId = typeof data.callId === 'string' && data.callId.length > 0 ? data.callId : null
      if (!callId || state.calls.has(callId)) continue
      const target = state.latestMessage && state.latestMessage.at <= event.time ? state.latestMessage : null
      state.calls.set(callId, { at: event.time, target, settled: false })
      continue
    }

    if (event.type === 'tool/result') {
      const callId = callIdOf(data)
      if (!callId) continue
      const call = state.calls.get(callId)
      if (!call || call.settled) continue
      call.settled = true
      if (!call.target || event.time < call.at || (hasNow && event.time > now)) continue
      call.target.toolTotal += event.time - call.at
      call.target.toolCount += 1
    }
  }

  const cutoff = hasNow ? now - DAY_MS : -Infinity
  const upper = hasNow ? now : Infinity
  return messages
    .filter((record) => record.at > cutoff && record.at <= upper)
    .map((record) => ({
      sessionId: record.sessionId,
      seq: record.seq,
      route: { ...record.route },
      at: record.at,
      outputTokens: record.outputTokens,
      decodeMs: record.decodeMs,
      ttftMs: record.ttftMs,
      modelMs: record.modelMs,
      toolMs: record.toolCount > 0 ? record.toolTotal : null,
    }))
}

function accumulator() {
  return {
    output: 0, decode: 0, n: 0, sessions: new Set(),
    ttft: 0, ttftN: 0, model: 0, modelN: 0, tool: 0, toolN: 0,
  }
}

function addFact(acc, fact) {
  if (finite(fact.outputTokens) && fact.outputTokens > 0 && finite(fact.decodeMs) && fact.decodeMs > 0) {
    acc.output += fact.outputTokens
    acc.decode += fact.decodeMs
    acc.n += 1
    acc.sessions.add(fact.sessionId)
  }
  if (nonNegative(fact.ttftMs)) { acc.ttft += fact.ttftMs; acc.ttftN += 1 }
  if (nonNegative(fact.modelMs)) { acc.model += fact.modelMs; acc.modelN += 1 }
  if (nonNegative(fact.toolMs)) { acc.tool += fact.toolMs; acc.toolN += 1 }
}

function metricsOf(acc) {
  return {
    tps: acc.n > 0 && acc.decode > 0 ? 1000 * acc.output / acc.decode : null,
    n: acc.n,
    ttftMs: acc.ttftN > 0 ? acc.ttft / acc.ttftN : null,
    ttftN: acc.ttftN,
    modelMs: acc.modelN > 0 ? acc.model : null,
    modelN: acc.modelN,
    toolMs: acc.toolN > 0 ? acc.tool : null,
    toolN: acc.toolN,
  }
}

function compareRoutes(a, b) {
  const ar = a.route || {}
  const br = b.route || {}
  const ap = typeof ar.provider === 'string' ? ar.provider : ''
  const bp = typeof br.provider === 'string' ? br.provider : ''
  const am = typeof ar.model === 'string' ? ar.model : ''
  const bm = typeof br.model === 'string' ? br.model : ''
  return (ap < bp ? -1 : ap > bp ? 1 : 0) || (am < bm ? -1 : am > bm ? 1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

/** Aggregate a recent, fixed range. No cross-route total speed is synthesized. */
export function querySpeed(facts, { range, selectedKey } = {}, now, coverage) {
  if (!Object.hasOwn(RANGE_MS, range)) throw new RangeError(`Unsupported speed range: ${String(range)}`)
  if (!finite(now)) throw new TypeError('querySpeed requires a finite now timestamp')
  const duration = RANGE_MS[range]
  const width = BUCKET_MS[range]
  const from = now - duration
  const to = now
  const groups = new Map()
  const seen = new Set()

  for (const fact of Array.isArray(facts) ? facts : []) {
    if (!fact || !finite(fact.at) || fact.at <= from || fact.at > to || !eventSeq(fact.seq)) continue
    const sid = typeof fact.sessionId === 'string' ? fact.sessionId : String(fact.sessionId ?? '')
    const identityKey = JSON.stringify([sid, fact.seq])
    if (seen.has(identityKey)) continue
    seen.add(identityKey)
    const route = {
      provider: fact.route && typeof fact.route.provider === 'string' ? fact.route.provider : null,
      model: fact.route && typeof fact.route.model === 'string' ? fact.route.model : null,
    }
    const key = routeKey(route)
    let group = groups.get(key)
    if (!group) {
      group = { key, route, acc: accumulator(), facts: [] }
      groups.set(key, group)
    }
    addFact(group.acc, { ...fact, sessionId: sid })
    group.facts.push(fact)
  }

  const series = [...groups.values()].map((group) => ({
    key: group.key,
    route: group.route,
    sessions: group.acc.sessions.size,
    metrics: metricsOf(group.acc),
  })).sort(compareRoutes)

  const selected = series.some((row) => row.key === selectedKey)
    ? selectedKey
    : (series[0] ? series[0].key : null)
  const group = selected === null ? null : groups.get(selected)
  const buckets = []
  let edge = from
  while (edge < to) {
    const next = nextLocalBucket(edge, width)
    const bucketFrom = edge
    const bucketTo = Math.min(to, next)
    if (bucketFrom < bucketTo) {
      const acc = accumulator()
      if (group) {
        for (const fact of group.facts) {
          if (fact.at > bucketFrom && fact.at <= bucketTo) addFact(acc, fact)
        }
      }
      buckets.push({
        from: bucketFrom,
        to: bucketTo,
        isPartial: bucketTo - bucketFrom !== width,
        metrics: metricsOf(acc),
      })
    }
    edge = next
  }

  return { from, to, coverage, series, selectedKey: selected, buckets }
}
