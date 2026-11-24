import { openDashboardPanel } from "./store";

/** Shared right-click/blackboard entry: close the old surface, then select the one main panel. */
export function openDashboardEntry(close: () => void): boolean {
  close();
  return openDashboardPanel();
}

/** MiniBar deliberately retains its original L1 → blackboard chain, never jumps directly to L3. */
export function openMiniBarDetail(openBoard: (mode: "manual") => void): void {
  openBoard("manual");
}
