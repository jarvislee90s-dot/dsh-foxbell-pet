import type { UsagePreset, UsageWindow } from "./dashboard-contract";

/** Token-only projection shared by legacy text and image exports; cost/trend UI state is excluded. */
export function legacyUsageProjection(window: UsageWindow) {
  return {
    span: window.span,
    totals: window.totals,
    points: window.points,
    routes: window.routes,
    tools: window.tools,
  };
}

export function buildLegacyUsageText(
  title: string,
  overviewRows: [string, string][],
  projection: ReturnType<typeof legacyUsageProjection>,
  unknown: { models: string; route: string },
  formatTokens: (value: number) => string,
): string {
  return buildUsageText(title, overviewRows, unknown.models, projection.routes.map((row) => ({
    route: row.route.provider && row.route.model ? `${row.route.provider}/${row.route.model}` : unknown.route,
    requestTotal: row.totals.requestTotal,
  })), formatTokens);
}

export function buildUsageText(title: string, rows: [string, string][], modelsTitle: string,
  models: { route: string; requestTotal: number }[], formatTokens: (value: number) => string): string {
  return [title, ...rows.map(([label, value]) => `${label}: ${value}`), `${modelsTitle}:`,
    ...models.map((model) => `${model.route}  ${formatTokens(model.requestTotal)}`)].join("\n");
}

export function legacyRangeLabel(preset: UsagePreset, points: { key: string }[], label: string,
  custom?: { from: string; to: string }): string {
  if (preset === "custom" && custom) return `${custom.from} ~ ${custom.to}`;
  if (!points.length) return label;
  const first = points[0].key, last = points[points.length - 1].key;
  const md = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
  if (preset === "5h") {
    const start = `${md(first)} ${first.slice(11, 16)}`;
    const end = `${first.slice(0, 10) === last.slice(0, 10) ? "" : `${md(last)} `}${last.slice(11, 16)}`;
    return `${start}–${end}`;
  }
  return `${md(first)} – ${md(last)}（${label}）`;
}

/** 工具聚合行（宿主 usage.tools / range.tools 同形：{name,count,durMs}） */
export interface ToolAgg { name: string; count: number; durMs: number }

/** 2×2 工具格指标：调用总数 / 平均耗时(totalDurMs/count，守零) / Top 工具次数 / Top 工具总耗时。
 *  Top 次数 = count 最大者、Top 总耗时 = durMs 最大者（并列保序取首个，不依赖宿主排序约定）。
 *  v2.2.1 增 topName/topDurName 供导出 2×2 标注。 */
export function toolsMetrics(tools: ToolAgg[] | null | undefined): { calls: number; avgMs: number; topCount: number; topDurMs: number; topName: string; topDurName: string } {
  const list = Array.isArray(tools) ? tools : [];
  let calls = 0, dur = 0, top: ToolAgg | null = null, topDur: ToolAgg | null = null;
  for (const x of list) {
    calls += x.count || 0;
    dur += x.durMs || 0;
    if (!top || (x.count || 0) > (top.count || 0)) top = x;
    if (!topDur || (x.durMs || 0) > (topDur.durMs || 0)) topDur = x;
  }
  return { calls, avgMs: calls > 0 ? dur / calls : 0, topCount: top ? top.count || 0 : 0, topDurMs: topDur ? topDur.durMs || 0 : 0, topName: top ? top.name : "—", topDurName: topDur ? topDur.name : "—" };
}

