import { describe, expect, it } from "vitest";
import {
  acceptSpeedPin,
  canShowSpeedPin,
  createSerialSpeedRequest,
  matchingSpeedSnapshot,
  pinSpeedBucket,
  speedCombinationKey,
  speedSegments,
  speedSeriesView,
  stepBucketFocus,
  type SpeedBucket,
  type SpeedSeries,
} from "../src/client/speed-view";

const metrics = (tps: number | null, n = tps === null ? 0 : 1) => ({
  tps, n, ttftMs: null, ttftN: 0, modelMs: null, modelN: 0, toolMs: null, toolN: 0,
});
const bucket = (minute: number, tps: number | null): SpeedBucket => ({
  from: minute * 60_000,
  to: (minute + 1) * 60_000,
  isPartial: false,
  metrics: metrics(tps),
});
const series = (key: string, provider: string | null, model: string | null, tps: number | null, sessions: number): SpeedSeries => ({
  key, route: { provider, model }, sessions, metrics: metrics(tps),
});

describe("speedSegments", () => {
  it("breaks the measured line at every missing-sample bucket", () => {
    expect(speedSegments([bucket(1, 120), bucket(2, null), bucket(3, 80)]).map((part) => part.length)).toEqual([1, 1]);
    expect(speedSegments([bucket(1, 120), bucket(2, 80)]).map((part) => part.length)).toEqual([2]);
    expect(speedSegments([bucket(1, null)])).toEqual([]);
  });
});

describe("speedSeriesView", () => {
  const rows = [
    series("p/a", "p", "Alpha", 120, 2),
    series("p/b", "p", "beta", null, 3),
    series("q/a", "q", "Alpha", 80, 1),
  ];

  it("filters by provider and case-insensitive route text without mutating input", () => {
    const before = [...rows];
    expect(speedSeriesView(rows, { search: "ALPHA", provider: "p", sort: "name", dir: "asc" }).map((row) => row.key)).toEqual(["p/a"]);
    expect(speedSeriesView(rows, { search: "q/a", sort: "name", dir: "asc" }).map((row) => row.key)).toEqual(["q/a"]);
    expect(rows).toEqual(before);
  });

  it("keeps null speed last in both directions and sorts sessions numerically", () => {
    expect(speedSeriesView(rows, { search: "", sort: "speed", dir: "desc" }).map((row) => row.key)).toEqual(["p/a", "q/a", "p/b"]);
    expect(speedSeriesView(rows, { search: "", sort: "speed", dir: "asc" }).map((row) => row.key)).toEqual(["q/a", "p/a", "p/b"]);
    expect(speedSeriesView(rows, { search: "", sort: "tps", dir: "desc" }).map((row) => row.key)).toEqual(["p/a", "q/a", "p/b"]);
    expect(speedSeriesView(rows, { search: "", sort: "sessions", dir: "desc" }).map((row) => row.key)).toEqual(["p/b", "p/a", "q/a"]);
  });
});

describe("serial history requests", () => {
  it("never pairs a snapshot with a different visible route selection", () => {
    const snapshot = { selectedKey: "route-a", buckets: [bucket(1, 80)] };
    expect(matchingSpeedSnapshot(snapshot, "route-a")).toBe(snapshot);
    expect(matchingSpeedSnapshot(snapshot, "route-b")).toBeNull();
  });

  it("coalesces overlapping polls, prevents out-of-order overwrite, and invalidates late responses", async () => {
    const deferred = <T>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => { resolve = res; });
      return { promise, resolve };
    };
    const requests: Array<ReturnType<typeof deferred<string>>> = [];
    const values: string[] = [];
    const runner = createSerialSpeedRequest(
      () => { const next = deferred<string>(); requests.push(next); return next.promise; },
      (value) => values.push(value),
      () => {},
    );
    const running = runner.run();
    void runner.run();
    void runner.run();
    expect(requests).toHaveLength(1);
    requests[0].resolve("older");
    await Promise.resolve();
    await Promise.resolve();
    expect(requests).toHaveLength(2); // queued latest poll starts only after the previous one settles
    requests[1].resolve("newer");
    await running;
    expect(values).toEqual(["older", "newer"]);

    const late = deferred<string>();
    const lateRunner = createSerialSpeedRequest(() => late.promise, (value) => values.push(value), () => {});
    const lateRunning = lateRunner.run();
    lateRunner.dispose();
    late.resolve("must-not-appear");
    await lateRunning;
    expect(values).toEqual(["older", "newer"]);
  });
});

describe("bucket keyboard focus and immutable pin", () => {
  it("clamps arrows and supports Home/End and empty charts", () => {
    expect(stepBucketFocus(0, "ArrowLeft", 3)).toBe(0);
    expect(stepBucketFocus(0, "ArrowRight", 3)).toBe(1);
    expect(stepBucketFocus(2, "ArrowRight", 3)).toBe(2);
    expect(stepBucketFocus(1, "Home", 3)).toBe(0);
    expect(stepBucketFocus(1, "End", 3)).toBe(2);
    expect(stepBucketFocus(0, "ArrowRight", 0)).toBe(-1);
  });

  it("pins a detached snapshot and invalidates it for a different range/selection", () => {
    const live = bucket(1, 120);
    const currentKey = speedCombinationKey("5h", "p/a");
    const pin = pinSpeedBucket(live, currentKey)!;
    live.metrics.tps = 999;
    live.from = 0;
    expect(pin.bucket.metrics.tps).toBe(120);
    expect(pin.bucket.from).toBe(60_000);
    expect(Object.isFrozen(pin.bucket)).toBe(true);
    expect(Object.isFrozen(pin.bucket.metrics)).toBe(true);
    expect(acceptSpeedPin(pin, currentKey)).toBe(pin);
    expect(canShowSpeedPin(pin, currentKey)).toBe(true);
    expect(acceptSpeedPin(pin, speedCombinationKey("15m", "p/a"))).toBeNull();
    expect(acceptSpeedPin(pin, speedCombinationKey("5h", "q/a"))).toBeNull();
    expect(pinSpeedBucket(bucket(2, null), currentKey)).toBeNull();
  });
});
