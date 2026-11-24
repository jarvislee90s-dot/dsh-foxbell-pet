import { describe, expect, it } from "vitest";
import { routeKey, type Route, type UsagePoint, type UsageRouteRow, type UsageWindow } from "../src/client/dashboard-contract";
import { selectTrend, usageDistribution } from "../src/client/dashboard-view";
import { buildLegacyUsageText, legacyUsageProjection } from "../src/client/usage-export";

const points = (a: number, b: number, hitA: number | null = null, hitB: number | null = null): UsagePoint[] => [
  { from: 0, to: 1, tokens: a, hitPct: hitA },
  { from: 1, to: 2, tokens: b, hitPct: hitB },
];

function row(route: Route, tokenValues: [number, number], requestTotal: number, cacheRead: number, outputTokens: number): UsageRouteRow {
  return {
    route,
    totals: {
      requestTotal,
      cacheRead,
      outputTokens,
      userEst: null,
      requestCount: 1,
      hitPct: requestTotal === 0 ? 0 : cacheRead / requestTotal,
    },
    points: points(...tokenValues, requestTotal === 0 ? null : cacheRead / requestTotal, null),
  };
}

function fixture(): UsageWindow {
  const routes = [
    row({ provider: "p", model: "same" }, [10, 20], 100, 50, 6),
    row({ provider: "q", model: "same" }, [30, 40], 200, 50, 8),
    row({ provider: "p", model: "other" }, [5, 15], 50, 0, 4),
    row({ provider: null, model: null }, [7, 9], 0, 0, 7),
  ];
  return {
    span: { from: 0, to: 2, grain: "hour" },
    revision: 3,
    coverage: "ready",
    totals: { requestTotal: 350, cacheRead: 100, outputTokens: 25, userEst: 12, requestCount: 4, hitPct: 100 / 350 },
    points: points(52, 84, 100 / 350, null),
    routes,
    tools: [],
  };
}

describe("selectTrend", () => {
  it("returns overview points without a selection and exact tuple route points with one", () => {
    const window = fixture();
    expect(selectTrend(window)).toBe(window.points);
    expect(selectTrend(window, { route: { provider: "q", model: "same" } })).toBe(window.routes[1].points);
    expect(selectTrend(window, { route: routeKey({ provider: "q", model: "same" }) })).toBe(window.routes[1].points);
    expect(selectTrend(window, { route: { provider: "p/a", model: "same" } })).toEqual([]);
  });

  it("combines a provider's model tokens without changing the frozen window", () => {
    const window = fixture();
    const before = JSON.stringify(window);
    expect(selectTrend(window, { provider: "p" })).toEqual([
      { from: 0, to: 1, tokens: 15, hitPct: null },
      { from: 1, to: 2, tokens: 35, hitPct: null },
    ]);
    expect(JSON.stringify(window)).toBe(before);
    expect(selectTrend(window, { provider: "absent" })).toEqual([]);
  });
});

describe("legacy Token-only exports", () => {
  it("keeps one global projection and no money after changing only the trend selection", () => {
    const window = fixture();
    const projection = legacyUsageProjection(window);
    const before = JSON.stringify(projection);
    expect(selectTrend(window, { provider: "q" })).toEqual([{ from: 0, to: 1, tokens: 30, hitPct: 0.25 }, { from: 1, to: 2, tokens: 40, hitPct: null }]);
    expect(JSON.stringify(projection)).toBe(before);
    expect(projection.points.map((point) => point.tokens)).toEqual([52, 84]);
    expect(Object.keys(projection)).toEqual(["span", "totals", "points", "routes", "tools"]);
    const text = buildLegacyUsageText("Token usage · Today", [["Output", "25"], ["Hit rate", "28.6%"]], projection, { models: "Models", route: "Unknown" }, String);
    expect(text).toContain("q/same  200");
    expect(text).toContain("Unknown  0");
    expect(text).toContain("Output: 25");
    expect(text).not.toMatch(/estimated_usd|API-equivalent|USD|CNY|[$¥€]/);
  });
});

describe("usageDistribution", () => {
  it("keeps same-named models on separate providers and retains unknown", () => {
    const rows = usageDistribution(fixture(), "model");
    expect(rows).toHaveLength(4);
    const same = rows.filter((entry) => entry.route.model === "same");
    expect(same.map((entry) => entry.route.provider).sort()).toEqual(["p", "q"]);
    expect(routeKey(same[0].route)).not.toBe(routeKey(same[1].route));
    expect(rows.some((entry) => entry.route.provider === null)).toBe(true);
    expect(rows.every((entry) => entry.routes.length === 1)).toBe(true);
  });

  it("groups by provider with weighted global hit ratios and all four-bucket point tokens", () => {
    const window = fixture();
    const before = JSON.stringify(window);
    const rows = usageDistribution(window, "provider");
    expect(rows.map((entry) => entry.route.provider)).toEqual(["q", "p", null]);
    const p = rows.find((entry) => entry.route.provider === "p")!;
    expect(p.key).toBe('["p",null]');
    expect(p.label).toBe("p");
    expect(rows.find((entry) => entry.route.provider === null)?.label).toBe("Unknown");
    expect(p.tokens).toBe(50);
    expect(p.totals).toMatchObject({ requestTotal: 150, cacheRead: 50, outputTokens: 10, userEst: null, requestCount: 2, hitPct: 50 / 150 });
    expect(p.routes).toHaveLength(2);
    expect(window.totals.userEst).toBe(12);
    expect(JSON.stringify(window)).toBe(before);
  });

  it("rejects unknown grouping modes instead of guessing", () => {
    expect(() => usageDistribution(fixture(), "route" as never)).toThrow(/mode/);
  });
});
