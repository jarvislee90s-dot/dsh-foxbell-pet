import { afterEach, describe, expect, it, vi } from "vitest";
import { openDashboardEntry, openMiniBarDetail } from "../src/client/dashboard-entries";
import { PANEL_ID, setPanelSwitcher } from "../src/client/store";

afterEach(() => setPanelSwitcher(null));

describe("legacy dashboard entry chains", () => {
  it("right-click and blackboard both close first and select the same foxbell-dashboard panel", () => {
    const calls: string[] = [];
    setPanelSwitcher((id) => calls.push(`panel:${id}`));
    expect(openDashboardEntry(() => calls.push("close:menu"))).toBe(true);
    expect(openDashboardEntry(() => calls.push("close:board"))).toBe(true);
    expect(calls).toEqual(["close:menu", `panel:${PANEL_ID}`, "close:board", `panel:${PANEL_ID}`]);
    expect(PANEL_ID).toBe("foxbell-dashboard");
  });

  it("mini-bar detail still opens the blackboard first; its subsequent entry uses that same panel", () => {
    const calls: string[] = [];
    setPanelSwitcher((id) => calls.push(`panel:${id}`));
    openMiniBarDetail(() => calls.push("board:manual"));
    expect(calls).toEqual(["board:manual"]);
    openDashboardEntry(() => calls.push("close:board"));
    expect(calls).toEqual(["board:manual", "close:board", `panel:${PANEL_ID}`]);
  });

  it("old hosts without layout keep the harmless false result", () => {
    const close = vi.fn();
    expect(openDashboardEntry(close)).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });
});
