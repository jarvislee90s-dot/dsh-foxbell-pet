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

/** v2.2.1 黑板重排：参数行拆为「标签-数值」结构（每项一行、含义自明），替代原 4 行长文堆叠。 */
export interface BoardKv { label: string; value: string }

/** 概览行（紧凑一条）：会话 / turn / 报错 */
export function boardOverviewLine(s: DashboardSummary): string {
  return t("dash.boardSessions") + " " + s.sessions
    + " · " + t("dash.boardTurns") + " " + s.turns
    + " · " + t("dash.boardErrors") + " " + s.errors;
}

/** token/工具/耗时 明细行（label 复用大看板五口径名词，含义与看板一致） */
export function boardRows(s: DashboardSummary): BoardKv[] {
  const tk = s.tokens;
  const pct = tk.requestTotal > 0 ? tk.hitPct.toFixed(1) : "0.0"; // 分母 0 → 与宿主 '0.0' 同口径
  const rows: BoardKv[] = [
    { label: t("dash.g.requestTotal"), value: fmtTokens(tk.requestTotal) },
    { label: t("dash.cacheHit"), value: fmtTokens(tk.cacheRead) + "（" + pct + "%）" },
    { label: t("dash.output"), value: fmtTokens(tk.output) },
    { label: t("dash.yourInput") + t("dash.estimateSuffix") + " · " + t("dash.withSubagents"), value: "~" + fmtTokens(tk.userEst) },
    { label: t("dash.boardToolsTop"), value: s.toolRows.length ? s.toolRows.map(toolEntry).join(" · ") : "—" },
    { label: t("dash.boardLongest"), value: fmtLongest(s.longest ? s.longest.ms : 0) },
  ];
  return rows;
}
