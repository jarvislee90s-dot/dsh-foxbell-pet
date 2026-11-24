import {
  routeKey,
  type CostSnapshot,
  type Route,
  type UsageDistributionRow,
  type UsagePoint,
  type UsageRouteRow,
  type UsageSpan,
  type UsageTotals,
  type UsageWindow,
} from "./dashboard-contract";

export type TrendSelection = { provider?: string | null; route?: Route | string };
export type UsageDistributionMode = "provider" | "model";

export type DashboardFallbackState = { legacy: boolean; hadCapability: boolean };

/** Recover from a delayed host capability without polling an unsupported old host forever. */
export function reconcileDashboardFallback(state: DashboardFallbackState, capability: boolean): DashboardFallbackState {
  if (capability) return { legacy: false, hadCapability: true };
  return { legacy: state.hadCapability ? true : state.legacy, hadCapability: state.hadCapability };
}

/** Cost folding controls automatic sync only; it does not invalidate the frozen CSV snapshot. */
export function shouldAutoSyncCost({ active, syncActive, snapshot, key, attemptedKey }: {
  active: boolean;
  syncActive: boolean;
  snapshot: Pick<CostSnapshot, "pricingSnapshotId" | "priceState"> | null;
  key: string;
  attemptedKey: string;
}): boolean {
  return active && syncActive && !!snapshot && (!snapshot.pricingSnapshotId || snapshot.priceState.stale) && attemptedKey !== key;
}

/** A cost response is valid only beside the exact usage window/revision that requested it. */
export function costSnapshotMatches(snapshot: Pick<CostSnapshot, "span" | "revision">, span: UsageSpan, usageRevision: number): boolean {
  return snapshot.revision === usageRevision && snapshot.span.from === span.from && snapshot.span.to === span.to;
}

/**
 * Select only the trend projection. Overview totals, routes, tools, and any
 * export snapshot remain untouched. Exact route selection uses tuple identity;
 * provider selection combines all of that provider's model rows.
 *
 * UsagePoint intentionally has no request-token denominator. Consequently a
 * multi-model provider trend can sum tokens but cannot derive an exact hit
 * ratio from child percentages; those aggregate points carry hitPct=null.
 */
export function selectTrend(window: UsageWindow | null, selection: TrendSelection = {}): UsagePoint[] {
  if (!window) return [];
  if (selection.route) {
    const key = typeof selection.route === "string" ? selection.route : routeKey(selection.route);
    return window.routes.find((row) => routeKey(row.route) === key)?.points ?? [];
  }
  if (selection.provider === undefined) return window.points;

  const rows = window.routes.filter((row) => row.route.provider === selection.provider);
  if (rows.length === 0) return [];
  if (rows.length === 1) return rows[0].points;
  return window.points.map((base, index) => ({
    from: base.from,
    to: base.to,
    tokens: rows.reduce((sum, row) => sum + (row.points[index]?.tokens ?? 0), 0),
    hitPct: null,
  }));
}

function sumBucket(rows: UsageRouteRow[], read: (totals: UsageTotals) => number | null | undefined): number | null {
  let sum = 0;
  for (const row of rows) {
    const value = read(row.totals);
    if (value === null || value === undefined) return null;
    sum += value;
  }
  return sum;
}

function groupTotals(rows: UsageRouteRow[]): UsageTotals {
  const requestTotal = rows.reduce((sum, row) => sum + row.totals.requestTotal, 0);
  const cacheRead = sumBucket(rows, (t) => t.cacheRead);
  return {
    requestTotal,
    cacheRead,
    cacheWrite: sumBucket(rows, (t) => t.cacheWrite),
    uncachedInput: sumBucket(rows, (t) => t.uncachedInput),
    outputTokens: sumBucket(rows, (t) => t.outputTokens),
    userEst: null,
    requestCount: rows.reduce((sum, row) => sum + row.totals.requestCount, 0),
    hitPct: cacheRead === null || requestTotal === 0 ? 0 : cacheRead / requestTotal,
  };
}

/** Build deterministic provider or full provider/model distribution rows. */
export function usageDistribution(
  window: UsageWindow | null,
  mode: UsageDistributionMode,
): UsageDistributionRow[] {
  if (mode !== "provider" && mode !== "model") throw new RangeError("Invalid usage distribution mode");
  const groups = new Map<string, { route: Route; routes: UsageRouteRow[] }>();
  for (const row of window?.routes ?? []) {
    const route = mode === "provider"
      ? { provider: row.route.provider, model: null }
      : { provider: row.route.provider, model: row.route.model };
    const key = routeKey(route);
    const group = groups.get(key);
    if (group) group.routes.push(row);
    else groups.set(key, { route, routes: [row] });
  }
  return [...groups].map(([key, group]) => ({
    key,
    route: group.route,
    label: mode === "provider"
      ? (group.route.provider ?? "Unknown")
      : `${group.route.provider ?? "Unknown"} / ${group.route.model ?? "Unknown"}`,
    tokens: group.routes.reduce((sum, row) =>
      sum + row.points.reduce((pointSum, point) => pointSum + point.tokens, 0), 0),
    totals: groupTotals(group.routes),
    routes: group.routes,
  })).sort((a, b) =>
    b.tokens - a.tokens ||
    b.totals.requestTotal - a.totals.requestTotal ||
    a.key.localeCompare(b.key));
}
