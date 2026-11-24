// New dashboard APIs are registered only behind a host-owned owner verifier.
// DSH rc.5 HTTP resources do not authenticate peers; Origin/localhost/client identity fields
// are deliberately not accepted as substitutes. Without a verifier these routes do not exist.
import { PetError } from './errors.js'
import { estimateCosts } from './cost.js'
import { serializeCostCsv } from './cost-csv.js'
import { readSessionSpeed } from './speed.js'
import { validateRules } from './price-rules.js'

const MAX_RULES_BODY = 64 * 1024
const ROUTE_PREFIX = '/dyn-pet-foxbell'

function send(res, body, status = 200) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(text)),
    'cache-control': 'no-store',
  })
  res.end(text)
}

function fail(res, error) {
  const e = error instanceof PetError ? error : error instanceof RangeError
    ? new PetError('bad-request', error.message)
    : new PetError('internal', 'Dashboard request failed')
  send(res, { code: e.code, params: e.params || {}, detail: e.detail }, e.status)
}

// connection.admit already applied the Host fence, the cross-site header fence and an
// Origin/host equality check, so identity and browser provenance are settled before this
// handler runs. This re-asserts the same rule on our own write path (defence in depth for
// a route registered on a raw webServer): an absent Origin is the normal non-browser case
// and is allowed, while any present Origin must be an http(s) authority equal to Host.
function sameOrigin(req) {
  const headers = req.headers || {}
  const origin = headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  const host = headers.host
  if (typeof host !== 'string' || host === '') return false
  let url
  try { url = new URL(origin) } catch { return false }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return url.host === host
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_RULES_BODY) throw new PetError('bad-request', 'JSON body exceeds 64 KiB').with('limit', String(MAX_RULES_BODY))
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
    throw new PetError('bad-request', 'Request body is not valid JSON')
  }
}

function queryOf(req) {
  const u = new URL(req.url || '/', 'http://invalid.local')
  const preset = u.searchParams.get('preset') || '7d'
  const query = { preset }
  if (u.searchParams.has('from')) query.from = u.searchParams.get('from') || ''
  if (u.searchParams.has('to')) query.to = u.searchParams.get('to') || ''
  return { u, query }
}

function requireStore(env) {
  if (!env.pricing || !env.pricing.rules || !env.pricing.catalog) {
    throw new PetError('capability-unavailable', 'Pricing stores are unavailable on this host')
  }
  return env.pricing
}

/**
 * env.verifyOwner is an async/sync capability supplied by the host adapter. Only the boolean
 * true is accepted. Tests may inject a verifier to exercise route semantics; that is not proof
 * that a real DSH profile authenticates anyone.
 */
export function registerDashboardRoutes(ctx, env) {
  if (!env || typeof env.verifyOwner !== 'function') return false
  const webServer = env.webServer ?? ctx.get('webServer')
  if (!webServer || typeof webServer.register !== 'function') return false
  const reg = (route) => ctx.effect(() => webServer.register(route))
  const route = (suffix, methods, handler) => reg({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/dashboard/${suffix}`,
    async handler(req, res) {
      try {
        if (!methods.includes(req.method || 'GET')) throw new PetError('bad-request', 'HTTP method is not allowed')
        // Authentication is a host decision, before parsing input or reading any new state.
        const verified = await env.verifyOwner(req)
        if (verified !== true) throw new PetError('owner-required', 'Host-verified owner access is required')
        if (req.method === 'POST' && !sameOrigin(req)) throw new PetError('origin-forbidden', 'Cross-origin request rejected')
        send(res, await handler(req))
      } catch (error) { fail(res, error) }
    },
  })

  route('usage', ['GET'], async (req) => {
    if (!env.stateEngine || typeof env.stateEngine.usageWindow !== 'function') {
      throw new PetError('capability-unavailable', 'Shared usage facts are unavailable')
    }
    return env.stateEngine.usageWindow(queryOf(req).query)
  })

  route('cost', ['GET'], async (req) => {
    const { rules, catalog } = requireStore(env)
    const { u, query } = queryOf(req)
    const spanFrom = Number(u.searchParams.get('spanFrom'))
    const spanTo = Number(u.searchParams.get('spanTo'))
    if (!u.searchParams.has('spanFrom') || !u.searchParams.has('spanTo') || !Number.isSafeInteger(spanFrom) || !Number.isSafeInteger(spanTo)) {
      throw new PetError('bad-request', 'spanFrom/spanTo must be Unix milliseconds')
    }
    const usage = env.stateEngine.usageWindow(query)
    if (usage.span.from !== spanFrom || usage.span.to !== spanTo
      || (u.searchParams.has('usageRevision') && String(usage.revision) !== u.searchParams.get('usageRevision'))) {
      throw new PetError('revision-conflict', 'Usage window moved; query usage again before cost')
    }
    const ruleSnapshot = rules.get()
    const snapshot = estimateCosts({
      slices: env.stateEngine.usageFacts().facts,
      span: usage.span,
      catalog: catalog.get(),
      rules: ruleSnapshot.rules,
      rulesRevision: ruleSnapshot.revision,
      revision: usage.revision,
      coverage: usage.coverage,
    })
    return { ...snapshot, csv: serializeCostCsv(snapshot) }
  })

  const requireActiveMount = () => {
    if (env.isActive?.() === false) throw new PetError('capability-unavailable', 'Dashboard service has been unmounted')
  }
  route('price-rules', ['GET', 'POST'], async (req) => {
    const { rules } = requireStore(env)
    if (req.method === 'GET') return rules.get()
    const body = await readJson(req)
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
      throw new PetError('bad-request', 'expectedRevision must be a non-negative integer')
    }
    const checked = validateRules(body.rules)
    requireActiveMount()
    return rules.save(body.expectedRevision, checked)
  })

  route('pricing-sync', ['POST'], async (req) => {
    const { catalog } = requireStore(env)
    const body = await readJson(req)
    if (typeof body.force !== 'boolean') throw new PetError('bad-request', 'force must be boolean')
    requireActiveMount()
    const snapshot = await catalog.refresh({ force: body.force })
    return {
      pricingSnapshotId: snapshot.id || null,
      usdAt: snapshot.usdAt || null,
      nativeAt: snapshot.nativeAt || null,
      fxAt: snapshot.fxAt || null,
      errors: Object.fromEntries(Object.entries(snapshot.sources || {}).map(([source, state]) => [source, state?.error || null])),
    }
  })

  route('session-speed', ['GET'], async (req) => {
    const { u } = queryOf(req)
    const sessionId = u.searchParams.get('sessionId') || ''
    if (!sessionId || sessionId.length > 256) throw new PetError('bad-request', 'A bounded sessionId is required')
    return readSessionSpeed({ sessions: env.sessions, projections: env.sessionProjections }, sessionId)
  })

  route('speed', ['GET'], async (req) => {
    if (!env.stateEngine || typeof env.stateEngine.speedWindow !== 'function') {
      throw new PetError('capability-unavailable', 'Native speed facts are unavailable')
    }
    const { u } = queryOf(req)
    const range = u.searchParams.get('range') || '5h'
    const selectedKey = u.searchParams.get('selectedKey')
    return env.stateEngine.speedWindow(range, selectedKey || undefined)
  })

  return true
}
