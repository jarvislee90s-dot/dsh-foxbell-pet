// DashboardPanel.tsx — v2.2 L3 大看板（spec R5：复刻 Codex++ 排版；R9 区间回看；Task 12，注册进 harness 布局归 Task 13）。
// 数据：默认视图全走 /state 快照（14日+24小时桶+models+tools）；30d/自定义走 /dashboard/range（60s 内存缓存）。
// 复刻要素：hero 大数字 / 五口径网格 / 蓝紫渐变趋势图(带 tooltip) / 模型分布进度条行 / 2×2 工具格 / 日期回看。
// 不复刻：价格（F04 存档）、推理单列（F03 存档）——spec §2.1。
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { appStore } from "./store";
import { apiGetRange, type RangeSummary, type RouteUsage, type TrendDay, type TrendHour } from "./api";
import { TrendChart, lastN } from "./TrendChart";
import { t } from "./i18n";
import { fmtPct, fmtTokens, shortModel } from "./format";
import { fmtDur } from "./boardrows";

// ---- 纯函数（test/client-logic.test.ts 直测）----

export type DashTab = "5h" | "7d" | "30d" | "custom";

/** 选项卡→数据窗口（custom 实际区间由 apiGetRange(from,to) 决定，此处仅兜底口径） */
export function viewWindow(tab: DashTab): { kind: "hours" | "days"; n: number } {
  if (tab === "5h") return { kind: "hours", n: 5 };
  if (tab === "7d") return { kind: "days", n: 7 };
  return { kind: "days", n: 30 };
}

/** 趋势点（hitPct 为 0-1 分数——宿主 hitRate 口径；小时桶无 hitPct，tooltip 省略该段） */
export interface DashPoint { label: string; value: number; key: string; hitPct?: number }

/** 5h 视图：最近 5 个「完整」整点桶（spec R3 整点锚定；排除进行中小时），跨午夜回绕；
 *  nowH 由调用方传入（通常 new Date().getHours()），纯函数不读时钟。缺桶/缺数组 0 值容错。 */
export function hourPoints(hours: TrendHour[] | null | undefined, nowH: number): DashPoint[] {
  const arr = Array.isArray(hours) ? hours : [];
  const idxs: number[] = [];
  for (let k = 5; k >= 1; k--) idxs.push((((nowH - k) % 24) + 24) % 24);
  return idxs.map((i) => {
    const b = arr[i] as TrendHour | undefined;
    return { label: `${String(i).padStart(2, "0")}:00`, value: b ? b.dayTotal : 0, key: b ? b.key : "" };
  });
}

/** 周命中率（weekIdx 0=本周 / 1=上周），返回 0-1 分数（供 fmtPct 直用）。
 *  周界裁定（Task 12）：周一为一周之始的日历周；锚点 = 快照内最新一天（数据驱动，不读时钟，可测）。
 *  聚合口径 = ΣcacheRead / ΣrequestTotal（非日均 hitPct 平均）；分母 0 记 0；
 *  上周若超出 14 日快照覆盖，只聚合快照内天数。 */
export function weekHit(
  trend: { days: { key: string; requestTotal: number; cacheRead: number }[] } | null | undefined,
  weekIdx: 0 | 1,
): number {
  const days = trend && Array.isArray(trend.days) ? trend.days : [];
  if (days.length === 0) return 0;
  const anchorKey = days.reduce((a, b) => (b.key > a.key ? b : a), days[0]).key; // ISO 键字典序=时间序
  const anchorMs = new Date(anchorKey + "T00:00:00").getTime();
  const dow = new Date(anchorMs).getDay(); // 0=Sun…6=Sat
  const weekStartMs = anchorMs - ((dow + 6) % 7) * 86400000; // 本周一 0 点
  const startMs = weekStartMs - weekIdx * 7 * 86400000;
  const endMs = weekIdx === 0 ? anchorMs : weekStartMs - 86400000; // 上周收于周日
  let req = 0, hit = 0;
  for (const d of days) {
    const ms = new Date(d.key + "T00:00:00").getTime();
    if (ms >= startMs && ms <= endMs) { req += d.requestTotal || 0; hit += d.cacheRead || 0; }
  }
  return req > 0 ? hit / req : 0;
}

/** 周命中率差文案：本周−上周，百分点（×100）一位小数 + "pt"；正 +/负 −/零 ± */
export function hitDeltaText(trend: { days: { key: string; requestTotal: number; cacheRead: number }[] } | null | undefined): string {
  const d = (weekHit(trend, 0) - weekHit(trend, 1)) * 100;
  return (d > 0 ? "+" : d < 0 ? "-" : "±") + Math.abs(d).toFixed(1) + "pt";
}

/** 工具聚合行（宿主 usage.tools / range.tools 同形：{name,count,durMs}） */
export interface ToolAgg { name: string; count: number; durMs: number }

/** 2×2 工具格指标：调用总数 / 平均耗时(totalDurMs/count，守零) / Top 工具次数 / Top 工具总耗时。
 *  Top = count 最大者（并列保序取首个，不依赖宿主排序约定）。 */
export function toolsMetrics(tools: ToolAgg[] | null | undefined): { calls: number; avgMs: number; topCount: number; topDurMs: number } {
  const list = Array.isArray(tools) ? tools : [];
  let calls = 0, dur = 0, top: ToolAgg | null = null;
  for (const x of list) {
    calls += x.count || 0;
    dur += x.durMs || 0;
    if (!top || (x.count || 0) > (top.count || 0)) top = x;
  }
  return { calls, avgMs: calls > 0 ? dur / calls : 0, topCount: top ? top.count || 0 : 0, topDurMs: top ? top.durMs || 0 : 0 };
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 31 天前端钳制决策（spec R9「超限前端截断提示」；宿主 400 之外的第二道闸）：
 *  区间含首尾超过 31 天（from < to-30d）→ from 收敛到 to-30d（恰 31 天）。
 *  clamped=true 时 effect 于同一 pass 以钳后 from 拉取（绝不发越界请求）并置常驻提示（至用户下次编辑日期）。 */
export function clampRangeFrom(from: string, to: string): { from: string; clamped: boolean } {
  const toMs = new Date(to + "T00:00:00").getTime();
  const maxFrom = dayKey(new Date(toMs - 30 * 86400000));
  return from < maxFrom ? { from: maxFrom, clamped: true } : { from, clamped: false };
}

// ---- 区间拉取（30d/自定义；60s 内存缓存，Map key `from:to`）----

const rangeCache = new Map<string, { at: number; data: RangeSummary }>();
async function fetchRange(from: string, to: string): Promise<RangeSummary> {
  const key = `${from}:${to}`;
  const c = rangeCache.get(key);
  if (c && Date.now() - c.at < 60000) return c.data;
  const data = await apiGetRange(from, to);
  rangeCache.set(key, { at: Date.now(), data });
  return data;
}

// ---- 同文件小组件 ----

type Hover = { x: number; y: number; text: string };

/** tooltip 文案：label · fmtTokens(value) · 命中率%（hitPct 在位时；小时桶视图无 hitPct 省略该段） */
function tooltipText(p: DashPoint): string {
  let s = `${p.label} · ${fmtTokens(p.value)}`;
  if (typeof p.hitPct === "number") s += ` · ${fmtPct(p.hitPct)}`;
  return s;
}

/** TooltipLayer：叠在 TrendChart 上的透明命中层（同 viewBox 缩放，圆心几何与 TrendChart
 *  padL6/padR6/padT8/padB16 逐式一致）+ 绝对定位气泡（x/y 以百分比定位，分辨率无关）。 */
function TooltipLayer(props: { points: DashPoint[]; width: number; height: number; hover: Hover | null; onHover: (h: Hover | null) => void }): ReactElement | null {
  const { points, width, height, hover, onHover } = props;
  if (!points || points.length < 2) return null;
  const padL = 6, padR = 6, padT = 8, padB = 16; // = TrendChart showLabels 版式
  const max = Math.max(1, ...points.map((p) => p.value));
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const pts = points.map((p, i) => ({
    x: padL + (innerW * i) / (points.length - 1),
    y: padT + innerH * (1 - p.value / max),
  }));
  return (
    <>
      <svg className="dyn-pet-dash-trendhit" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        {pts.map((pt, i) => (
          <circle
            key={i} cx={pt.x.toFixed(1)} cy={pt.y.toFixed(1)} r={14} fill="transparent" style={{ pointerEvents: "all" }}
            onPointerEnter={() => onHover({ x: (pt.x / width) * 100, y: (pt.y / height) * 100, text: tooltipText(points[i]) })}
            onPointerLeave={() => onHover(null)}
          />
        ))}
      </svg>
      {hover ? <div className="dyn-pet-dash-tooltip" style={{ left: `${hover.x}%`, top: `${hover.y}%` }}>{hover.text}</div> : null}
    </>
  );
}

/** 工具卡 2×2 指标格；数据源随视图切换（5h/7d→快照 usage.tools，30d/custom→range.tools），由父组件定夺 */
function ToolsGrid(props: { tools: ToolAgg[] }): ReactElement {
  if (props.tools.length === 0) return <div className="dyn-pet-dash-empty">{t("dash.noData")}</div>;
  const m = toolsMetrics(props.tools);
  const cells: [string, string][] = [
    [t("dash.g.toolCalls"), String(m.calls)],
    [t("dash.g.toolAvg"), fmtDur(m.avgMs)],
    [t("dash.g.toolTopCount"), String(m.topCount)],
    [t("dash.g.toolTopDur"), fmtDur(m.topDurMs)],
  ];
  return (
    <div className="dyn-pet-dash-tools">
      {cells.map(([k, v]) => (
        <div key={k} className="dyn-pet-dash-toolcell"><span>{k}</span><strong>{v}</strong></div>
      ))}
    </div>
  );
}

// ---- L3 大看板主体 ----

export function DashboardPanel(): ReactElement {
  const snap = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot);
  const [tab, setTab] = useState<DashTab>("7d");
  const [custom, setCustom] = useState({ from: dayKey(new Date(Date.now() - 6 * 86400000)), to: dayKey(new Date()) });
  const [range, setRange] = useState<RangeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [rangeHint, setRangeHint] = useState("");
  const [hover, setHover] = useState<Hover | null>(null);

  const dash = snap ? snap.dashboard : null;
  const trend = dash && dash.usage && dash.usage.trend ? dash.usage.trend : null;

  useEffect(() => {
    if (tab !== "30d" && tab !== "custom") return;
    let live = true; setBusy(true);
    // 31 天前端钳制（spec R9「超限前端截断提示」；宿主 400 之外的第二道闸）：
    // clampRangeFrom 先行裁定，同 pass 以钳后 from 拉取（绝不发越界请求）；
    // 提示常驻至用户下次编辑日期（两处 onChange 复位）——此处不设 else 清除（旧实现提示一帧即逝）。
    const to = tab === "custom" ? custom.to : dayKey(new Date());
    const rawFrom = tab === "30d" ? dayKey(new Date(Date.now() - 29 * 86400000)) : custom.from;
    const { from, clamped } = clampRangeFrom(rawFrom, to);
    if (clamped) { setCustom((c) => ({ ...c, from })); setRangeHint(t("dash.rangeClamp")); }
    fetchRange(from, to)
      .then((r) => { if (live) setRange(r); })
      .catch(() => { if (live) setRange(null); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [tab, custom.from, custom.to]);

  // —— 窗口数据（纯推导）——
  const points = useMemo<DashPoint[]>(() => {
    if (tab === "5h" && trend) return hourPoints(trend.hours, new Date().getHours());
    if (tab === "7d" && trend) return lastN(trend.days, 7);
    if (range) return range.days.map((d: TrendDay) => ({ label: `${Number(d.key.slice(5, 7))}/${Number(d.key.slice(8, 10))}`, value: d.dayTotal, key: d.key, hitPct: d.hitPct }));
    return [];
  }, [tab, trend, range]);

  // —— hero 与五口径（7d/30d/custom 用区间 totals；5h/7d 快照口径）——
  const hero = useMemo(() => points.reduce((s, p) => s + p.value, 0), [points]);
  const usage = dash ? dash.usage : null;
  const inRange = tab === "30d" || tab === "custom";
  const totals = inRange && range ? range.totals : null;

  const grid: [string, string][] = [
    [t("dash.g.userEst"), "~" + fmtTokens(totals ? totals.userEst : usage ? usage.userEst : 0) + t("dash.estimateSuffix") + " · " + t("dash.withSubagents")],
    [t("dash.g.output"), fmtTokens(totals ? totals.outputTokens : usage ? usage.day.outputTokens : 0)],
    [t("dash.g.requestTotal"), fmtTokens(totals ? totals.requestTotal : usage ? usage.requestTotal : 0)],
    [t("dash.g.cacheRead"), fmtTokens(totals ? totals.cacheRead : usage ? usage.day.cacheReadTokens : 0)],
    [t("dash.g.hitPct"), fmtPct(totals ? totals.hitPct : usage ? usage.cacheHitRate : 0)],
    [t("dash.g.requests"), String(totals ? totals.requestCount : trend && trend.days[13] ? trend.days[13].requestCount : 0)],
    [t("dash.g.asOf"), new Date().toLocaleTimeString()],
  ];
  const models: RouteUsage[] = inRange ? (range ? range.models : []) : (usage && usage.models) || [];
  const maxModel = Math.max(1, ...models.map((m) => m.requestTotal));
  const tools: ToolAgg[] = inRange ? (range ? range.tools : []) : (usage && usage.tools) || [];
  const inFlight = busy && (tab === "30d" || tab === "custom");

  return (
    <div className="dyn-pet-dash">
      <div className="dyn-pet-dash-head">
        <h2>{t("dash.panelTitle")}</h2>
        <div className="dyn-pet-dash-tabs">
          {(["5h", "7d", "30d", "custom"] as DashTab[]).map((x) => (
            <button key={x} className={"dyn-pet-dash-tab" + (tab === x ? " is-active" : "")} onClick={() => setTab(x)}>{t(`dash.tab.${x}`)}</button>
          ))}
          {tab === "custom" ? (
            <span className="dyn-pet-dash-dates">
              <input type="date" value={custom.from} max={custom.to} onChange={(e) => { setRangeHint(""); setCustom((c) => ({ ...c, from: e.target.value })); }} />
              <span>–</span>
              <input type="date" value={custom.to} min={custom.from} max={dayKey(new Date())} onChange={(e) => { setRangeHint(""); setCustom((c) => ({ ...c, to: e.target.value })); }} />
              {rangeHint ? <em className="dyn-pet-dash-rangehint">{rangeHint}</em> : null}
            </span>
          ) : null}
        </div>
      </div>

      <div className="dyn-pet-dash-hero">
        <div className="dyn-pet-dash-hero-label">{t("dash.heroTotal", { range: t(`dash.tab.${tab}`) })}</div>
        <div className="dyn-pet-dash-hero-num">{fmtTokens(hero)}</div>
        {!inRange && trend ? (
          <div className="dyn-pet-dash-weekhit">
            {t("dash.weekHit", { a: fmtPct(weekHit(trend, 0)), b: fmtPct(weekHit(trend, 1)), d: hitDeltaText(trend) })}
          </div>
        ) : null}
      </div>

      <div className="dyn-pet-dash-grid">
        {grid.map(([k, v]) => (
          <div key={k} className="dyn-pet-dash-cell"><span>{k}</span><strong>{v}</strong></div>
        ))}
      </div>

      <div className="dyn-pet-dash-card">
        <div className="dyn-pet-dash-card-head">
          <span>{t("dash.trendTitle")}</span>
          <span className="dyn-pet-dash-meta">
            {inFlight ? t("dash.loading") : t("dash.peak", { v: fmtTokens(Math.max(0, ...points.map((p) => p.value))) })}
          </span>
        </div>
        <div className="dyn-pet-dash-trendwrap">
          {points.length < 2 ? (
            <div className="dyn-pet-dash-empty">{t("dash.noData")}</div>
          ) : (
            <>
              <TrendChart points={points} width={560} height={120} showLabels idPrefix="dyn-pet-dash-trend" />
              <TooltipLayer points={points} width={560} height={120} hover={hover} onHover={setHover} />
            </>
          )}
        </div>
      </div>

      <div className="dyn-pet-dash-card">
        <div className="dyn-pet-dash-card-head"><span>{t("dash.models")}</span></div>
        {models.length === 0 ? <div className="dyn-pet-dash-empty">{t("dash.noData")}</div> : models.slice(0, 6).map((m) => (
          <div key={m.route} className="dyn-pet-dash-model">
            <span className="dyn-pet-dash-model-name" title={m.route}>{shortModel(m.model || m.route)}</span>
            <span className="dyn-pet-dash-model-val">{fmtTokens(m.requestTotal)}</span>
            <span className="dyn-pet-dash-model-bar"><i style={{ width: `${Math.max(4, (m.requestTotal / maxModel) * 100).toFixed(1)}%` }} /></span>
          </div>
        ))}
      </div>

      <div className="dyn-pet-dash-card">
        <div className="dyn-pet-dash-card-head"><span>{t("dash.tools")}</span></div>
        <ToolsGrid tools={tools} />
      </div>

      <div className="dyn-pet-dash-foot">{t("dash.caliberNote")}</div>
    </div>
  );
}
