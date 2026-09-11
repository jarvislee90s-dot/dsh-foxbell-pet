// statuscards.ts — 状态卡片色彩语义（v2 切换为 MAM 口径，用户可见变化）：
//   红 = 待审批（approval）、黄 = 运行中（running）、绿 = 完成且未读（done）
//   本插件特有的错误/断联态（error）= 深红 + 错误标识（⚠），与「待审批」明确区分。
// 宿主 /state 的 status 字段语义不变（running/approval/error/done），仅客户端渲染口径变化。
// 卡片点击跳会话 + 已读行为不变；排序 error > approval > running > done（宿主管）。
import type { DashboardSnapshot, ProjectCard } from "./api";

export type LightKind = "approval-red" | "running-yellow" | "done-green" | "error-darkred";

export function lightOf(p: ProjectCard): LightKind {
  switch (p.status) {
    case "approval":
      return "approval-red";
    case "running":
      return "running-yellow";
    case "done":
      return "done-green";
    case "error":
    default:
      return "error-darkred";
  }
}

/** MAM 灯点色：waiting #ef4444 / running #eab308 / done #22c55e；error 深红 #7f1d1d（本插件扩展） */
export const DOT_COLOR: Record<LightKind, string> = {
  "approval-red": "#ef4444",
  "running-yellow": "#eab308",
  "done-green": "#22c55e",
  "error-darkred": "#7f1d1d",
};
export const DOT_HALO: Record<LightKind, string> = {
  "approval-red": "rgba(239,68,68,.25)",
  "running-yellow": "rgba(234,179,8,.25)",
  "done-green": "rgba(34,197,94,.25)",
  "error-darkred": "rgba(127,29,29,.3)",
};

/** 任务姿态（MAM 口径）：待审批(waiting) > 运行中(running)；全绿/无卡回落 idle。
 *  本插件保留 error 差分触发的瞬时动作（errorAction），不作为持续任务态（与 MAM 一致：
 *  MAM v1 无 error 持续姿态）。 */
export function taskPoseOf(cards: ProjectCard[]): "waiting" | "running" | null {
  const anyApproval = cards.some((c) => c.status === "approval");
  if (anyApproval) return "waiting";
  const anyRunning = cards.some((c) => c.status === "running");
  if (anyRunning) return "running";
  return null;
}

/** 词元感知截断（与宿主同款；卡片行文本宿主已截断，此处为客户端兜底） */
export function truncate(s: string, maxTokens = 24): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  const maxChars = maxTokens * 2;
  const estimate = (x: string) => {
    let n = 0;
    let inWord = false;
    for (const ch of x) {
      if (/[一-鿿]/.test(ch)) { n += 1; inWord = false; }
      else if (/\s/.test(ch)) inWord = false;
      else if (!inWord) { n += 1; inWord = true; }
    }
    return n;
  };
  if (!t || (estimate(t) <= maxTokens && t.length <= maxChars)) return t;
  let n = 0;
  let inWord = false;
  let cut = Math.min(t.length, maxChars);
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (/[一-鿿]/.test(ch)) { n += 1; inWord = false; }
    else if (/\s/.test(ch)) inWord = false;
    else if (!inWord) { n += 1; inWord = true; }
    if (n >= maxTokens || i + 1 >= maxChars) { cut = i + 1; break; }
  }
  return t.slice(0, cut).trim() + "…";
}

/** v2.2 迷你条状态计数（Task10 R10 follow-up）：宿主全量计数 dash.usage.counts 优先（宿主引擎从
 *  projects Map 并入，与 list() 同口径），仅当 counts 在位且三键均为数字时采用；否则回退本地
 *  cards 按 status 计数（原 MiniBar.tsx 内联计数逻辑函数化，error 卡不计）。放本模块而非
 *  MiniBar.tsx：vitest node 环境 react 为 external 不可装，.tsx 无法被测试导入（纯函数须 react-free）。 */
export function countsFromDash(dash: DashboardSnapshot | null, cards: ProjectCard[] | null): Record<string, number> {
  const counts: Record<string, number> = { approval: 0, running: 0, done: 0 };
  for (const p of cards || []) { if (counts[p.status] !== undefined) counts[p.status] += 1 }
  const c = dash && dash.usage ? dash.usage.counts : undefined;
  if (c && typeof c.approval === "number" && typeof c.running === "number" && typeof c.done === "number") {
    return { approval: c.approval, running: c.running, done: c.done };
  }
  return counts;
}
