// Pure normalization of DSH settlement events into numeric usage facts.
// Fork inheritance is deliberately handled by the caller before events arrive.

export const routeKey = ({ provider, model }) => JSON.stringify([provider, model])

const BUCKETS = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens']
const UNKNOWN_ROUTE = () => ({ provider: null, model: null })
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const validCounter = (value) => Number.isSafeInteger(value) && value >= 0

function routeSource(event) {
  const source = event?.data?.message?.source
  if (!isObject(source) || (source.kind !== undefined && source.kind !== 'model')) return UNKNOWN_ROUTE()
  const field = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
  return { provider: field(source.provider), model: field(source.model) }
}

// DSH token-meter treats an omitted cache bucket as zero: adapters omit a bucket
// the provider did not report, and the host sums the four-plus one as 0. A field
// that is present but not a safe non-negative integer stays unobserved (null).
function counters(usage) {
  if (!isObject(usage)) return null
  return Object.fromEntries(BUCKETS.map((bucket) => [
    bucket,
    usage[bucket] === undefined ? 0 : validCounter(usage[bucket]) ? usage[bucket] : null,
  ]))
}

function attemptKey(data) {
  if (data?.turn === undefined || data?.turn === null || data?.step === undefined || data?.step === null) return null
  return JSON.stringify([typeof data.turn, data.turn, typeof data.step, data.step])
}

function streamUsage(lastUsage, stream) {
  if (typeof lastUsage !== 'function' || !Array.isArray(stream)) return undefined
  try { return lastUsage(stream) } catch { return undefined }
}

/**
 * Fold one already-fork-trimmed session event list.
 *
 * A final assistant/message replaces an open assistant/attempt sample for the
 * same (turn, step). llm/retry-started closes only the matching open slot, so
 * usage from a failed attempt remains a separate fact. Attempt routes are
 * never inferred from a later successful response.
 *
 * @param {unknown[]} events
 * @param {{ lastUsage?: (stream: unknown) => unknown }} [options]
 */
export function foldUsageFacts(events, { lastUsage } = {}) {
  const facts = []
  const openSlots = new Map()
  const seen = new Set()
  const input = Array.isArray(events) ? events : []

  for (let eventIndex = 0; eventIndex < input.length; eventIndex += 1) {
    const event = input[eventIndex]
    if (!isObject(event) || !isObject(event.data)) continue
    const data = event.data
    // seq is native identity within this (already inheritance-trimmed) session.
    // Filter before updating slots: replaying a retry must not close a newer slot.
    const hasSeq = Number.isSafeInteger(event.seq) && event.seq >= 0
    if (hasSeq && seen.has(event.seq)) continue
    if (hasSeq) seen.add(event.seq)
    const key = attemptKey(data)

    if (event.type === 'llm/retry-started') {
      if (key !== null) openSlots.delete(key)
      continue
    }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue
    if (!Number.isFinite(event.time)) continue

    // Explicit settlement usage wins. Attempts never consume data.usage: only
    // the official assistant-stream tail is a trustworthy temporary sample.
    const usage = event.type === 'assistant/message' && isObject(data.usage)
      ? data.usage
      : streamUsage(lastUsage, data.stream)
    const tokens = counters(usage)
    if (tokens === null) continue

    const fact = {
      // Legacy folded fixtures may omit seq; real DSH events always carry it.
      seq: Number.isSafeInteger(event.seq) && event.seq >= 0 ? event.seq : eventIndex,
      at: event.time,
      route: routeSource(event),
      tokens,
    }
    const open = key === null ? undefined : openSlots.get(key)
    if (open) {
      facts[open.index] = fact
      openSlots.set(key, { index: open.index })
    } else {
      const index = facts.length
      facts.push(fact)
      if (key !== null) openSlots.set(key, { index })
    }
  }
  return facts
}
