import { describe, expect, it } from "vitest";
import { canExportCost, visibleCostRows } from "../src/client/CostPanel";
import { attemptSavePriceDraft } from "../src/client/PriceRulesDialog";
import type { CostRow, PriceRule } from "../src/client/dashboard-contract";
import { costSnapshotMatches } from "../src/client/dashboard-view";

const row = (index: number): CostRow => ({
  route: { provider: index % 2 ? "p/a" : "p", model: `m${index}` },
  normalizedModel: `m${index}`,
  tokenUsage: 100,
  hitPct: 0,
  usd: { amount: index === 0 ? "0" : null, status: index === 0 ? "priced" : "unpriced", pricedTokens: index === 0 ? 100 : 0, unpricedTokens: index === 0 ? 0 : 100, coverageRate: index === 0 ? 1 : 0 },
  cny: { amount: null, status: "unpriced", pricedTokens: 0, unpricedTokens: 100, coverageRate: 0 },
  details: { USD: [], CNY: [] },
  pricingProvider: null, pricingModel: null, priceUpdatedAt: null,
  pricingBasis: "none", priceRuleKind: "none", timePriceDailyFallback: false,
});

describe("cost view projections", () => {
  it("Top 5 is presentation-only and does not mutate the full snapshot rows", () => {
    const rows = Array.from({ length: 6 }, (_, index) => row(index));
    expect(visibleCostRows(rows, "model", false).flatMap((group) => group.rows)).toHaveLength(5);
    expect(visibleCostRows(rows, "model", true).flatMap((group) => group.rows)).toHaveLength(6);
    expect(rows).toHaveLength(6);
    expect(rows[0].usd.amount).toBe("0"); // explicit zero remains distinct from missing
    expect(rows[1].usd.amount).toBeNull();
  });

  it("invalidates an old CSV as soon as the frozen query/span/revision key changes", () => {
    expect(canExportCost({ queryKey: "today", csv: "a" }, "7d")).toBe(false);
    expect(canExportCost({ queryKey: "today", csv: "a" }, "today")).toBe(true);
    expect(canExportCost({ queryKey: "today", csv: null }, "today")).toBe(false);
  });

  it("rejects a cost response from another day, hour boundary, or usage revision", () => {
    const span = { from: 1000, to: 2000, grain: "hour" as const };
    expect(costSnapshotMatches({ span, revision: 4 }, span, 4)).toBe(true);
    expect(costSnapshotMatches({ span: { ...span, to: 3000 }, revision: 4 }, span, 4)).toBe(false);
    expect(costSnapshotMatches({ span, revision: 5 }, span, 4)).toBe(false);
  });

  it("returns the exact draft on a failed save instead of destroying user input", async () => {
    const draft: PriceRule[] = [{ kind: "fixed", model: "m", provider: null, currency: "USD", prices: { inputTokens: "0.123456789", cacheReadTokens: null, cacheWriteTokens: null, outputTokens: "0" } }];
    const result = await attemptSavePriceDraft(draft, 3, async () => { throw Object.assign(new Error("conflict"), { status: 409 }); });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.draft).toBe(draft);
      const savedDraft = result.draft[0];
      expect(savedDraft.kind).toBe("fixed");
      if (savedDraft.kind === "fixed") expect(savedDraft.prices.inputTokens).toBe("0.123456789");
      expect(result.revision).toBe(3);
    }
  });
});
