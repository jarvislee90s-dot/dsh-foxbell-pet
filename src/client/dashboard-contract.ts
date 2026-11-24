// Shared dashboard wire contracts. Absolute timestamps are Unix milliseconds;
// prices are decimal strings per million tokens. null means unmeasured, never zero.

// Tasks 1–2: usage facts, ranges, and aggregate windows.
export type Route = { provider: string | null; model: string | null };
export type Bucket = "inputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "outputTokens";
export type Counters = Record<Bucket, number | null>;
export type UsageFact = { seq: number; at: number; route: Route; tokens: Counters };
export type Coverage = "ready" | "loading" | "limited";
export type UsagePreset = "5h" | "today" | "7d" | "30d" | "custom";
export type UsageQuery = { preset: UsagePreset; from?: string; to?: string };
export type UsageSpan = { from: number; to: number; grain: "hour" | "day" }; // [from, to)
export type Currency = "USD" | "CNY";

export const routeKey = ({ provider, model }: Route): string => JSON.stringify([provider, model]);

export type UsageFactsSnapshot = { facts: UsageFact[]; coverage: Coverage; revision: number };
export type UsageTotals = {
  requestTotal: number;
  cacheRead: number | null;
  cacheWrite?: number | null;
  uncachedInput?: number | null;
  outputTokens: number | null;
  userEst: number | null;
  requestCount: number;
  hitPct: number;
};
export type UsagePoint = { from: number; to: number; tokens: number; hitPct: number | null };
export type UsageRouteRow = { route: Route; totals: UsageTotals; points: UsagePoint[]; unobservedBuckets?: Bucket[] };
export type UsageTool = { name: string; count: number; durMs: number };
export type UsageWindow = {
  span: UsageSpan;
  revision: number;
  coverage: Coverage;
  totals: UsageTotals;
  previousHitPct?: number | null;
  /** Buckets absent from at least one fact; totals are observed subtotals, not implicit zeroes. */
  unobservedBuckets?: Bucket[];
  points: UsagePoint[];
  routes: UsageRouteRow[];
  tools: UsageTool[];
  activitySessions?: number;
};
export type UsageDistributionRow = {
  /** JSON tuple identity; provider groups use [provider, null]. */
  key: string;
  route: Route;
  /** Display-ready raw identity; null fields are labelled Unknown. */
  label: string;
  /** Sum of all four observed token buckets in the group. */
  tokens: number;
  totals: UsageTotals;
  /** Actual provider/model rows represented by this distribution row. */
  routes: UsageRouteRow[];
};

// Task 3: fixed and weekday time-band manual prices.
export type PriceCells = Record<Bucket, string | null>;
export type PriceRule = { model: string; provider: string | null; currency: Currency } & (
  { kind: "fixed"; prices: PriceCells } |
  {
    kind: "time";
    zone: "local" | "asiaShanghai" | "utc";
    windows: { start: number; end: number }[];
    peak: PriceCells;
    offpeak: PriceCells;
  }
);
export type RuleSnapshot = { revision: number; rules: PriceRule[] };
export type PriceBand = "fixed" | "peak" | "offpeak" | "dailyFallback";

// Task 4: validated public price and FX snapshots. The host may persist a
// richer internal representation; these are the fields shared with readers.
export type CatalogPriceEntry = { provider: string; model: string; prices: PriceCells };
export type CatalogPrice = CatalogPriceEntry & {
  pricingProvider: string;
  pricingModel: string;
  currency: Currency;
  source: string;
  sourceAt: number | null;
  snapshotId: string | null;
};
export type CatalogSourceState = { attemptedAt: number | null; error: string | null };
export type FxSnapshot = { cnyPerUsd: number };
export type PriceCatalogSnapshot = {
  schemaVersion: 1;
  id: string | null;
  usd: CatalogPriceEntry[];
  native: CatalogPriceEntry[];
  usdAt: number | null;
  nativeAt: number | null;
  fxAt: number | null;
  fx: FxSnapshot | null;
  syncedAt: number | null;
  sources: Record<"usd" | "native" | "fx", CatalogSourceState>;
  cacheError: string | null;
};
export type CatalogSnapshot = PriceCatalogSnapshot;

// Task 5: one immutable cost snapshot and its fixed-USD CSV projection.
export type CostReading = {
  amount: string | null;
  status: "priced" | "partial" | "unpriced";
  pricedTokens: number;
  unpricedTokens: number | null;
  coverageRate: number | null;
};
export type CostDetail = {
  bucket: Bucket;
  tokens: number | null;
  unitPrice: string | null;
  amount: string | null;
  source: string | null;
  sourceAt: number | null;
  converted: boolean;
};
export type CostPricing = {
  pricingProvider: string | null;
  pricingModel: string | null;
  priceUpdatedAt: number | null;
  pricingBasis: "manual" | "catalog" | "mixed" | "none";
  priceRuleKind: "none" | "fixed" | "time";
  timePriceDailyFallback: boolean;
};
export type CostRow = CostPricing & {
  route: Route;
  normalizedModel: string | null;
  tokenUsage: number | null;
  hitPct: number | null;
  usd: CostReading;
  cny: CostReading;
  details: Record<Currency, CostDetail[]>;
  pricing?: Record<Currency, CostPricing>;
};
export type CostInputSlice =
  { at: number; daySpan?: never; route: Route; tokens: Counters } |
  { at: null; daySpan: { from: number; to: number }; route: Route; tokens: Counters };
export type CostSnapshot = {
  span: UsageSpan;
  revision: number;
  rulesRevision: number;
  pricingSnapshotId: string | null;
  coverage: Coverage;
  priceState: { stale: boolean; syncedAt: number | null; error: string | null };
  rows: CostRow[];
  csv: string;
};

// Task 7: the current session's native cumulative decode projection.
export type SessionSpeed = {
  sessionId: string;
  tps: number | null;
  status: "ready" | "empty" | "unsupported";
};

// Task 8: settled historical native streaming facts and weighted aggregates.
export type SpeedRange = "15m" | "1h" | "5h" | "24h";
export type SpeedFact = {
  sessionId: string;
  seq: number;
  route: Route;
  at: number;
  outputTokens: number | null;
  decodeMs: number | null;
  ttftMs: number | null;
  modelMs: number | null;
  toolMs: number | null;
};
export type SpeedMetrics = {
  tps: number | null;
  n: number;
  ttftMs: number | null;
  ttftN: number;
  modelMs: number | null;
  modelN: number;
  toolMs: number | null;
  toolN: number;
};
export type SpeedBucket = { from: number; to: number; isPartial: boolean; metrics: SpeedMetrics };
export type SpeedSnapshot = {
  from: number;
  to: number;
  coverage: Coverage | "unsupported";
  series: { key: string; route: Route; sessions: number; metrics: SpeedMetrics }[];
  selectedKey: string | null;
  buckets: SpeedBucket[];
};
