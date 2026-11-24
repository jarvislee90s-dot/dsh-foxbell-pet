import { describe, expect, it } from "vitest";
import { canExportCost } from "../src/client/CostPanel";
import { costSnapshotMatches, reconcileDashboardFallback, shouldAutoSyncCost } from "../src/client/dashboard-view";
import { matchingSpeedSnapshot, speedSelectionAfterFilter, type SpeedSeries } from "../src/client/speed-view";

describe("targeted host capability recovery", () => {
  it("keeps legacy on a missing host, enters on late readiness, and recovers after a later outage", () => {
    let state = { legacy: true, hadCapability: false };
    state = reconcileDashboardFallback(state, false);
    expect(state).toEqual({ legacy: true, hadCapability: false });
    state = reconcileDashboardFallback(state, true);
    expect(state).toEqual({ legacy: false, hadCapability: true });
    state = reconcileDashboardFallback(state, false);
    expect(state).toEqual({ legacy: true, hadCapability: true });
    state = reconcileDashboardFallback(state, true);
    expect(state).toEqual({ legacy: false, hadCapability: true });
  });
});

describe("targeted range and cost-fold production decisions", () => {
  const span = { from: 1000, to: 2000, grain: "hour" as const };
  const snapshot = { pricingSnapshotId: null, priceState: { stale: true, syncedAt: null, error: null } };
  it("keeps a valid same-range CSV while folded, pauses sync, and invalidates it only for a new window", () => {
    const frozen = { queryKey: "today:1000:2000:4", csv: "header\r\n" };
    expect(shouldAutoSyncCost({ active: true, syncActive: false, snapshot, key: frozen.queryKey, attemptedKey: "" })).toBe(false);
    expect(canExportCost(frozen, frozen.queryKey)).toBe(true);
    expect(shouldAutoSyncCost({ active: true, syncActive: true, snapshot, key: frozen.queryKey, attemptedKey: "" })).toBe(true);
    expect(canExportCost(frozen, "7d:0:1:4")).toBe(false);
  });

  it("keeps the same preset key and rejects only stale span/revision responses", () => {
    const current = { queryKey: JSON.stringify({ preset: "today" }), csv: "current" };
    const reselected = JSON.stringify({ preset: "today" });
    expect(reselected).toBe(current.queryKey);
    expect(canExportCost(current, reselected)).toBe(true);
    expect(costSnapshotMatches({ span, revision: 4 }, span, 4)).toBe(true);
    expect(costSnapshotMatches({ span: { ...span, from: 0 }, revision: 4 }, span, 4)).toBe(false);
    expect(costSnapshotMatches({ span, revision: 3 }, span, 4)).toBe(false);
  });
});

describe("targeted speed filter recovery", () => {
  const rows: SpeedSeries[] = [
    { key: "a", route: { provider: "p", model: "a" }, sessions: 1, metrics: { tps: 10, n: 1, ttftMs: null, ttftN: 0, modelMs: null, modelN: 0, toolMs: null, toolN: 0 } },
  ];
  const snapshot = { selectedKey: "a", buckets: [] };
  it("keeps the selection stable with no matches, hides stale details, and restores without reselection", () => {
    expect(speedSelectionAfterFilter("a", [])).toBe("a");
    expect(matchingSpeedSnapshot(snapshot, "a", false)).toBeNull();
    expect(speedSelectionAfterFilter("a", rows)).toBe("a");
    expect(matchingSpeedSnapshot(snapshot, "a", true)).toBe(snapshot);
  });
});
