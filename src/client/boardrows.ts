// boardrows.ts — 小黑板行拼装纯函数（Board.tsx 的无 JSX 逻辑层，node 环境可直测）。
// Task 7：宿主 summary 自本任务起增发结构化字段（tokens/toolRows/longest，RAW 数值，
// src/host/dashboard.js summarizeStructured）；黑板行由客户端 t() + fmtTokens 双语拼装——
// zh 拼装与宿主 summarize 的 zh 字符串逐字节一致（test/state-dashboard.test.mjs 同源断言 +
// test/client-logic.test.ts 客户端侧断言双侧钉住），en 走同构英文。
// 耗时格式化 = 宿主 formatDur / summarize longestText 的镜像（分钟 / 秒 / 毫秒三档）。
import { fmtTokens } from "./format";
import { t } from "./i18n";
import type { DashboardSummary, SummaryToolRow } from "./api";

/** 耗时三档（宿主 formatDur 镜像：分钟 / 秒 / 毫秒；工具 Top3 耗时段用） */
export function fmtDur(ms: number): string {
  if (ms >= 60000) return (ms / 60000).toFixed(1) + " " + t("dash.durMin");
  if (ms >= 1000) return (ms / 1000).toFixed(1) + " " + t("dash.durSec");
  return String(Math.round(ms)) + " " + t("dash.durMs");
}

/** 最长单 turn（宿主 summarize longestText 镜像：≥60s 一位小数分钟，否则整秒——0ms 落「0 秒」桶） */
export function fmtLongest(ms: number): string {
  if (ms >= 60000) return (ms / 60000).toFixed(1) + " " + t("dash.durMin");
  return String(Math.round(ms / 1000)) + " " + t("dash.durSec");
}

/** 单工具条目：`Name×N` + 耗时段（ms>0 时 `（共 X）`；与宿主 summarize toolsText 同构） */
function toolEntry(r: SummaryToolRow): string {
  const base = r.name + "×" + r.count;
  if (!(r.ms > 0)) return base;
  return base + t("dash.boardToolDur", { inner: t("dash.toolTotal") + " " + fmtDur(r.ms) });
}

/** token 行正文：请求输入 X（缓存命中 Y · Z%）· 产出 W · 你的输入 ~V(估) · 含子代理（五口径名词序） */
export function boardTokensLine(s: DashboardSummary): string {
  const tk = s.tokens;
  const pct = tk.requestTotal > 0 ? tk.hitPct.toFixed(1) : "0.0"; // 分母 0 → 与宿主 '0.0' 同口径
  return t("dash.requestInput") + " " + fmtTokens(tk.requestTotal)
    + t("dash.boardHitPct", { inner: t("dash.cacheHit") + " " + fmtTokens(tk.cacheRead) + " · " + pct + "%" })
    + " " + t("dash.output") + " " + fmtTokens(tk.output)
    + " · " + t("dash.yourInput") + " ~" + fmtTokens(tk.userEst) + t("dash.estimateSuffix")
    + " · " + t("dash.withSubagents");
}

/** 黑板四行（源 Board L980-984 行序原样：会话/turn/报错 → 今日 token → 工具 Top3 → 最长单 turn） */
export function boardRows(s: DashboardSummary): string[] {
  return [
    t("dash.boardSessions") + " " + s.sessions
      + " · " + t("dash.boardTurns") + " " + s.turns
      + " · " + t("dash.boardErrors") + " " + s.errors,
    t("dash.boardTodayToken") + " " + boardTokensLine(s),
    t("dash.boardToolsTop") + " " + (s.toolRows.length ? s.toolRows.map(toolEntry).join(" · ") : "—"),
    t("dash.boardLongest") + " " + fmtLongest(s.longest ? s.longest.ms : 0), // null → 「0 秒」桶（与 zh longestText 同口径）
  ];
}
