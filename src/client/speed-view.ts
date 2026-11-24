// Pure view decisions for the historical speed list/chart. No React or DOM runtime required.

export interface SpeedRoute {
  provider: string | null;
  model: string | null;
}
export interface SpeedMetrics {
  tps: number | null;
  n: number;
  ttftMs: number | null;
  ttftN: number;
  modelMs: number | null;
  modelN: number;
  toolMs: number | null;
  toolN: number;
}
export interface SpeedBucket {
  from: number;
  to: number;
  isPartial: boolean;
  metrics: SpeedMetrics;
}
export interface SpeedSeries {
  key: string;
  route: SpeedRoute;
  sessions: number;
  metrics: SpeedMetrics;
}
export type SpeedSort = "name" | "speed" | "tps" | "sessions";
export type SpeedSortDirection = "asc" | "desc";
export interface SpeedSeriesViewOptions {
  search: string;
  provider?: string | null;
  sort: SpeedSort;
  dir: SpeedSortDirection;
}

function text(value: string | null): string {
  return value ?? "";
}
function routeName(row: SpeedSeries): string {
  return `${text(row.route.provider)}/${text(row.route.model)}`;
}
function compareText(a: string, b: string): number {
  const al = a.toLocaleLowerCase();
  const bl = b.toLocaleLowerCase();
  return (al < bl ? -1 : al > bl ? 1 : 0) || (a < b ? -1 : a > b ? 1 : 0);
}
function validNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Filter and stably sort combinations. Null speed remains last in either direction. */
export function speedSeriesView(series: SpeedSeries[], options: SpeedSeriesViewOptions): SpeedSeries[] {
  const search = options.search.trim().toLocaleLowerCase();
  const provider = options.provider;
  const direction = options.dir === "desc" ? -1 : 1;
  return (Array.isArray(series) ? series : []).filter((row) => {
    if (provider !== undefined && provider !== null && provider !== "" && row.route.provider !== provider) return false;
    const haystack = `${routeName(row)}\n${row.key}`.toLocaleLowerCase();
    return search === "" || haystack.includes(search);
  }).sort((a, b) => {
    let compared = 0;
    if (options.sort === "speed" || options.sort === "tps") {
      const av = validNumber(a.metrics.tps) ? a.metrics.tps : null;
      const bv = validNumber(b.metrics.tps) ? b.metrics.tps : null;
      if (av === null && bv !== null) return 1;
      if (av !== null && bv === null) return -1;
      if (av !== null && bv !== null) compared = (av - bv) * direction;
    } else if (options.sort === "sessions") {
      compared = (a.sessions - b.sessions) * direction;
    } else {
      compared = compareText(routeName(a), routeName(b)) * direction;
    }
    return compared || compareText(routeName(a), routeName(b)) || compareText(a.key, b.key);
  });
}

/** Consecutive measured buckets only: missing buckets split the line instead of becoming zero. */
export function speedSegments(buckets: SpeedBucket[]): SpeedBucket[][] {
  const segments: SpeedBucket[][] = [];
  let current: SpeedBucket[] = [];
  for (const bucket of Array.isArray(buckets) ? buckets : []) {
    if (validNumber(bucket?.metrics?.tps)) {
      current.push(bucket);
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

export function stepBucketFocus(index: number, key: string, length: number): number {
  if (!Number.isFinite(length) || length <= 0) return -1;
  const last = Math.floor(length) - 1;
  const current = Number.isFinite(index) ? Math.min(last, Math.max(0, Math.trunc(index))) : 0;
  if (key === "Home") return 0;
  if (key === "End") return last;
  if (key === "ArrowLeft") return Math.max(0, current - 1);
  if (key === "ArrowRight") return Math.min(last, current + 1);
  return current;
}

export interface SpeedPin {
  combinationKey: string;
  bucket: Readonly<SpeedBucket>;
}

/** Range and selected route together own a pin; changing either invalidates it. */
export function speedCombinationKey(range: string, selectedKey: string | null): string {
  return JSON.stringify([range, selectedKey]);
}

/** Pin an immutable snapshot, not a reference that a five-second refresh can mutate. */
export function pinSpeedBucket(bucket: SpeedBucket, combinationKey: string): SpeedPin | null {
  if (!bucket || !validNumber(bucket.metrics?.tps)) return null;
  const metrics = Object.freeze({ ...bucket.metrics });
  const snapshot = Object.freeze({
    from: bucket.from,
    to: bucket.to,
    isPartial: bucket.isPartial,
    metrics,
  });
  return Object.freeze({ combinationKey, bucket: snapshot });
}

export function acceptSpeedPin(pin: SpeedPin | null, combinationKey: string): SpeedPin | null {
  return pin && pin.combinationKey === combinationKey ? pin : null;
}

export function canShowSpeedPin(pin: SpeedPin | null, combinationKey: string): boolean {
  return acceptSpeedPin(pin, combinationKey) !== null;
}

/** Empty filter results keep the current key without triggering a replacement query. */
export function speedSelectionAfterFilter(selectedKey: string | null, series: SpeedSeries[]): string | null {
  if (!series.length) return selectedKey;
  if (selectedKey && series.some((row) => row.key === selectedKey)) return selectedKey;
  return series[0].key;
}

/** Suppress buckets/metrics when the host fallback and visible selection differ. */
export function matchingSpeedSnapshot<T extends { selectedKey: string | null }>(snapshot: T | null, selectedKey: string | null, hasVisibleMatch = true): T | null {
  return hasVisibleMatch && snapshot && snapshot.selectedKey === selectedKey ? snapshot : null;
}

/** Serialize visible history refreshes and invalidate late responses on ownership changes. */
export function createSerialSpeedRequest<T>(
  request: () => Promise<T>,
  onValue: (value: T) => void,
  onError: (error: unknown) => void,
  onBusy?: (busy: boolean) => void,
) {
  let active = true;
  let inFlight = false;
  let pending = false;
  let generation = 0;
  const run = async (): Promise<void> => {
    if (!active) return;
    if (inFlight) { pending = true; return; }
    inFlight = true;
    const id = ++generation;
    onBusy?.(true);
    try {
      do {
        pending = false;
        try {
          const value = await request();
          if (active && id === generation) onValue(value);
        } catch (error) {
          if (active && id === generation) onError(error);
        }
      } while (active && pending && id === generation);
    } finally {
      inFlight = false;
      if (id === generation) onBusy?.(false);
    }
  };
  return {
    run,
    dispose() {
      active = false;
      pending = false;
      generation += 1;
      onBusy?.(false);
    },
  };
}
