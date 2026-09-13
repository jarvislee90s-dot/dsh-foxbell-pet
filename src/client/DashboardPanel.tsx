// DashboardPanel.tsx — v2.2 L3 大看板（spec R5：复刻 Codex++ 排版；R9 区间回看；Task 12，注册进 harness 布局归 Task 13）。
// 数据：默认视图全走 /state 快照（14日+24小时桶+models+tools）；30d/自定义走 /dashboard/range（60s 内存缓存）。
// 复刻要素：hero 大数字 / 五口径网格 / 蓝紫渐变趋势图(带 tooltip) / 模型分布进度条行 / 2×2 工具格 / 日期回看。
// 不复刻：价格（F04 存档）、推理单列（F03 存档）——spec §2.1。
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { appStore, cfgStore } from "./store";
import { apiGetRange, type RangeSummary, type RouteUsage, type TrendDay, type TrendHour } from "./api";
import { TrendChart, lastN } from "./TrendChart";
import { t, getLang } from "./i18n";
import { fmtInt, fmtPct, fmtTokens } from "./format";
import { fmtDur } from "./boardrows";
import { exportDashboardImage, loadSprite, maxAnimCols, resolvePoseRow } from "./exportimage";
import { pickQuote, fillQuote, type QuoteVars } from "./quotes";

// ---- 纯函数（test/client-logic.test.ts 直测）----

export type DashTab = "5h" | "7d" | "30d" | "custom";

/** v2.2.1：自定义评语草稿的 localStorage 键（面板切走不丢；非宿主配置键） */
const EXPORT_QUOTE_DRAFT_KEY = "dyn-foxbell-pet:export-quote";

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

/** 池化命中率：ΣcacheRead / ΣrequestTotal（分母 0 记 0）——与宿主 hitRate 口径一致。 */
function pooledHit(items: { requestTotal: number; cacheRead: number }[]): number {
  let req = 0, hit = 0;
  for (const x of items) { req += x.requestTotal || 0; hit += x.cacheRead || 0; }
  return req > 0 ? hit / req : 0;
}

/** 命中率对比文案：当前窗口 a vs 上一等长周期 b（null=上一周期无数据 → 只显示当前值），走 i18n。 */
export function hitCompareText(a: number, b: number | null): string {
  if (b === null) return t("dash.hitCur", { a: fmtPct(a) });
  const d = (a - b) * 100;
  const delta = (d > 0 ? "+" : d < 0 ? "-" : "±") + Math.abs(d).toFixed(1) + "pt";
  return t("dash.hitCompare", { a: fmtPct(a), b: fmtPct(b), d: delta });
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

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 31 天前端钳制决策（spec R9「超限前端截断提示」；宿主 400 之外的第二道闸）：
 *  区间含首尾超过 31 天（from < to-30d）→ from 收敛到 to-30d（恰 31 天）。
 *  clamped=true 时 effect 于同一 pass 以钳后 from 拉取（绝不发越界请求）并置常驻提示（至用户下次编辑日期）。 */
export function clampRangeFrom(from: string, to: string): { from: string; clamped: boolean } {
  const toMs = new Date(to + "T00:00:00").getTime();
  const maxFrom = dayKey(new Date(toMs - 30 * 86400000));
  return from < maxFrom ? { from: maxFrom, clamped: true } : { from, clamped: false };
}

/** 趋势方向（Task 14 R8 评语聚合输入）：末两日 dayTotal 升 → true / 降 → false / 相等或不足两日 → null。
 *  纯函数不读时钟；入参为当前视图的日桶序列（快照 trend.days 或 range.days）。 */
export function trendDirection(days: { dayTotal: number }[] | null | undefined): boolean | null {
  const arr = Array.isArray(days) ? days : [];
  if (arr.length < 2) return null;
  const a = arr[arr.length - 2].dayTotal;
  const b = arr[arr.length - 1].dayTotal;
  return a < b ? true : a > b ? false : null;
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
  const cfg = useSyncExternalStore(cfgStore.subscribe, cfgStore.getSnapshot);
  const [tab, setTab] = useState<DashTab>("7d");
  const [custom, setCustom] = useState({ from: dayKey(new Date(Date.now() - 6 * 86400000)), to: dayKey(new Date()) });
  const [range, setRange] = useState<RangeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [rangeHint, setRangeHint] = useState("");
  const [hover, setHover] = useState<Hover | null>(null);
  const [copiedFlash, setCopiedFlash] = useState(false);
  // v2.2.1：自定义评语内联（设置卡「导出评语」迁移至此）；草稿存 localStorage，面板切走不丢
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState<string>(() => {
    try { return localStorage.getItem(EXPORT_QUOTE_DRAFT_KEY) ?? ""; } catch { return ""; }
  });
  const [prevHit, setPrevHit] = useState<number | null>(null); // 上一等长区间命中率（30d/custom）
  const setQuoteDraftPersisted = (v: string): void => {
    setQuoteDraft(v);
    try { localStorage.setItem(EXPORT_QUOTE_DRAFT_KEY, v); } catch { /* ignore */ }
  };

  const dash = snap ? snap.dashboard : null;
  const trend = dash && dash.usage && dash.usage.trend ? dash.usage.trend : null;

  useEffect(() => {
    if (tab !== "7d" && tab !== "30d" && tab !== "custom") return;
    let live = true; setBusy(true);
    // 31 天前端钳制（spec R9「超限前端截断提示」；宿主 400 之外的第二道闸）：
    // clampRangeFrom 先行裁定，同 pass 以钳后 from 拉取（绝不发越界请求）；
    // 提示常驻至用户下次编辑日期（两处 onChange 复位）——此处不设 else 清除（旧实现提示一帧即逝）。
    // review Important#2：7d 也走区间拉取——spec R3「模型分布/工具区随视图联动」，7d 网格/模型/工具
    // 不得停留在当日口径（趋势图/hero 仍吃快照即时渲染，区间到达后口径行无缝升级；60s 缓存二次即瞬）。
    const to = tab === "custom" ? custom.to : dayKey(new Date());
    const rawFrom = tab === "30d" ? dayKey(new Date(Date.now() - 29 * 86400000)) : tab === "7d" ? dayKey(new Date(Date.now() - 6 * 86400000)) : custom.from;
    const { from, clamped } = clampRangeFrom(rawFrom, to);
    if (clamped) { setCustom((c) => ({ ...c, from })); setRangeHint(t("dash.rangeClamp")); }
    setPrevHit(null);
    fetchRange(from, to)
      .then((r) => {
        if (!live) return;
        setRange(r);
        // 上一等长区间命中率（30d/custom；fetchRange 自带 60s 缓存）
        const spanDays = Math.round((new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / 86400000) + 1;
        const prevTo = dayKey(new Date(new Date(from + "T00:00:00").getTime() - 86400000));
        const prevFrom = dayKey(new Date(new Date(prevTo + "T00:00:00").getTime() - (spanDays - 1) * 86400000));
        return fetchRange(prevFrom, prevTo)
          .then((pr) => { if (live) setPrevHit(pr.totals.requestTotal > 0 ? pr.totals.hitPct : null); })
          .catch(() => { if (live) setPrevHit(null); });
      })
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

  // —— hero 与五口径（7d/30d/custom 区间 totals；5h 快照口径；区间未达时暂回落当日，到达即升级）——
  const hero = useMemo(() => points.reduce((s, p) => s + p.value, 0), [points]);
  const usage = dash ? dash.usage : null;
  const inRange = tab === "7d" || tab === "30d" || tab === "custom";
  const totals = inRange && range ? range.totals : null;

  // —— 命中率对比（周期随选项卡，v2.2.1 用户裁定）：当前窗口 Σcache/Σreq vs 上一等长周期 ——
  // 5h=今日小时桶内前 5 完整整点 vs 其前 5 整点（跨昨日的凌晨时段不显示对比）；
  // 7d=快照末 7 日 vs 前 7 日；30d/自定义=区间 totals vs 前移一个等长区间（fetchRange，60s 缓存）。
  const hitCompare = (() => {
    if (tab === "5h") {
      if (!trend || !trend.hours) return "";
      const nowH = new Date().getHours();
      if (nowH < 10) return ""; // 前 5 整点跨昨日：快照只有今日桶，不显示对比
      const cur = trend.hours.filter((h) => {
        const hh = Number(h.key.slice(11, 13));
        return hh >= nowH - 5 && hh < nowH;
      });
      const prev = trend.hours.filter((h) => {
        const hh = Number(h.key.slice(11, 13));
        return hh >= nowH - 10 && hh < nowH - 5;
      });
      const prevReq = prev.reduce((s2, h) => s2 + h.requestTotal, 0);
      return hitCompareText(pooledHit(cur.map((h) => ({ requestTotal: h.requestTotal, cacheRead: h.cacheRead }))), prevReq > 0 ? pooledHit(prev.map((h) => ({ requestTotal: h.requestTotal, cacheRead: h.cacheRead }))) : null);
    }
    if (tab === "7d" && trend && trend.days.length >= 14) {
      const cur = pooledHit(trend.days.slice(7));
      const prev = pooledHit(trend.days.slice(0, 7));
      return hitCompareText(cur, prev);
    }
    if ((tab === "30d" || tab === "custom") && range && range.totals.requestTotal > 0) {
      return hitCompareText(range.totals.hitPct, prevHit);
    }
    return "";
  })();

  const grid: [string, string][] = [
    [t("dash.g.userEst"), "~" + fmtInt(totals ? totals.userEst : usage ? usage.userEst : 0) + t("dash.estimateSuffix") + " · " + t("dash.withSubagents")],
    [t("dash.g.output"), fmtInt(totals ? totals.outputTokens : usage ? usage.day.outputTokens : 0)],
    [t("dash.g.requestTotal"), fmtInt(totals ? totals.requestTotal : usage ? usage.requestTotal : 0)],
    [t("dash.g.cacheRead"), fmtInt(totals ? totals.cacheRead : usage ? usage.day.cacheReadTokens : 0)],
    [t("dash.g.hitPct"), fmtPct(totals ? totals.hitPct : usage ? usage.cacheHitRate : 0)],
    [t("dash.g.requests"), String(totals ? totals.requestCount : trend && trend.days[13] ? trend.days[13].requestCount : 0)],
    [t("dash.g.asOf"), new Date().toLocaleTimeString()],
  ];
  const models: RouteUsage[] = inRange ? (range ? range.models : []) : (usage && usage.models) || [];
  const maxModel = Math.max(1, ...models.map((m) => m.requestTotal));
  const tools: ToolAgg[] = inRange ? (range ? range.tools : []) : (usage && usage.tools) || [];
  const inFlight = busy && inRange;

  // ---- v2.2 R8 导出（Task 14）：复制文本 / 导出图片 ----

  // 评语聚合输入（当前视图数据推导）：hero 合计 / 窗口命中率（快照 cacheHitRate vs 区间 totals.hitPct）/
  // 趋势末两日 dayTotal 升降（相等或不足两日 → null）/ 多模型 / 摸鱼（快照 pace 档位 loaf1..4；pace 关闭 = false）
  const hitRate = totals ? totals.hitPct : usage ? usage.cacheHitRate : 0;
  const exportTrendDays = inRange ? (range ? range.days : []) : trend ? trend.days : [];
  const trendUp: boolean | null = trendDirection(exportTrendDays);
  const loaf = dash && dash.pace ? dash.pace.tier.startsWith("loaf") : false;
  const quoteVars: QuoteVars = {
    range: t(`dash.tab.${tab}`),
    tokens: fmtTokens(hero),
    hit: fmtPct(hitRate),
    models: String(models.length),
    tool: tools[0] ? tools[0].name : "",
  };
  const buildQuote = (customQuote?: string): string =>
    pickQuote({ total: hero, hitPct: hitRate, trendUp, multiModel: models.length > 1, loaf, tool: quoteVars.tool }, getLang(), customQuote, quoteVars);

  // 复制文本：grid + models 多行纯文本；clipboard API 优先，失败回退 execCommand，再失败静默（toast-less，ManageDialog 同款）
  const onCopyText = async (): Promise<void> => {
    const lines = [
      `${t("dash.panelTitle")} · ${t(`dash.tab.${tab}`)}`,
      ...grid.map(([k, v]) => `${k}: ${v}`),
      `${t("dash.models")}:`,
      ...models.map((m) => `${m.model || m.route}  ${fmtTokens(m.requestTotal)}`),
    ];
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch { /* 剪贴板不可用：静默 */ }
    }
    setCopiedFlash(true);
  };

  // 导出图片（v2.2.1 竖版卡）：sprite 从 runtime.spriteUrl 现场加载（失败 → null，无立绘继续导出）；
  // customQuote 非空 → 按自定义评语模板填充（占位符 {range}/{tokens}/{hitPct}/{models}），否则走评语池。
  // 模型名导出全名（v2.2.1：不再 shortModel 截断）。
  // 导出/展示用具体时间范围（v2.2.1）：5h=某日 HH:00–HH:00；7d/30d=首末日期；custom=from ~ to
  const rangeLabel = (() => {
    if (tab === "custom") return `${custom.from} ~ ${custom.to}`;
    if (points.length === 0) return t(`dash.tab.${tab}`);
    const first = points[0].key, last = points[points.length - 1].key;
    const md = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
    if (tab === "5h") {
      const h1 = first.slice(11, 13), h2 = last.slice(11, 13);
      return `${md(first)} ${h1}:00–${h2}:00`;
    }
    return `${md(first)} – ${md(last)}（${t(`dash.tab.${tab}`)}）`;
  })();
  const onExportImage = async (customQuote?: string): Promise<void> => {
    const rt = appStore.getRuntime();
    const sprite = await loadSprite(rt.spriteUrl);
    const frameCols = maxAnimCols();
    const blob = await exportDashboardImage({
      rangeLabel,
      hero: hero.toLocaleString("en-US"),
      heroSub: `${t("dash.g.asOf")} ${new Date().toLocaleTimeString()}`,
      metrics: grid.slice(0, 6),
      trendTitle: t("dash.trendTitle"),
      peakLabel: t("dash.peak", { v: fmtTokens(Math.max(0, ...points.map((p) => p.value))) }),
      points: points.map((p) => ({ label: p.label, value: p.value })),
      models: models.map((m) => ({ name: m.model || m.route, val: fmtTokens(m.requestTotal), share: maxModel > 0 ? m.requestTotal / maxModel : 0 })),
      tools2x2: (() => {
        const m = toolsMetrics(tools);
        return [
          [t("dash.g.toolCalls"), String(m.calls)],
          [t("dash.g.toolAvg"), fmtDur(m.avgMs)],
          [t("dash.g.toolTopCount"), `${m.topName} ${m.topCount}`],
          [t("dash.g.toolTopDur"), `${m.topDurName} ${fmtDur(m.topDurMs)}`],
        ] as [string, string][];
      })(),
      quote: customQuote && customQuote.trim() ? fillQuote(customQuote.trim(), quoteVars) : buildQuote(),
      poseRow: resolvePoseRow(cfg.exportPose),
      sprite,
      frameW: sprite ? sprite.naturalWidth / frameCols : 0,
      frameH: sprite ? sprite.naturalHeight / rt.rows : 0,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `foxbell-dashboard-${tab}.png`;
    a.click();
    // Safari：同步 revoke 会中断未开始的下载——延后到下一轮宏任务再释放
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  useEffect(() => {
    if (!copiedFlash) return;
    const timer = setTimeout(() => setCopiedFlash(false), 1600);
    return () => clearTimeout(timer);
  }, [copiedFlash]);

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
        {/* v2.2 R8 导出 + v2.2.1 自定义评语内联：复制文本 / 导出图片 / 按自定义评语导出 */}
        <div className="dyn-pet-dash-actions">
          <button className="dyn-pet-dash-actbtn" onClick={() => void onCopyText()}>{copiedFlash ? t("dash.export.copied") : t("dash.export.copyText")}</button>
          <button className="dyn-pet-dash-actbtn" onClick={() => void onExportImage()}>{t("dash.export.exportImage")}</button>
          <button className={"dyn-pet-dash-actbtn" + (quoteOpen ? " is-active" : "")} onClick={() => setQuoteOpen((o) => !o)}>{t("dash.export.exportCustom")}</button>
        </div>
      </div>
      {quoteOpen ? (
        <div className="dyn-pet-dash-quotebar">
          <input
            type="text"
            value={quoteDraft}
            placeholder={t("dash.export.quotePlaceholder")}
            onChange={(e) => setQuoteDraftPersisted(e.target.value)}
          />
          <button className="dyn-pet-dash-actbtn" onClick={() => void onExportImage(quoteDraft)}>{t("dash.export.export")}</button>
        </div>
      ) : null}

      <div className="dyn-pet-dash-hero">
        <div className="dyn-pet-dash-hero-label">{t("dash.heroTotal", { range: t(`dash.tab.${tab}`) })}</div>
        <div className="dyn-pet-dash-hero-num">{fmtInt(hero)}</div>
        {hitCompare ? (
          <div className="dyn-pet-dash-weekhit">{hitCompare}</div>
        ) : null}
      </div>

      <div className="dyn-pet-dash-rows">
        {grid.map(([k, v]) => (
          <div key={k} className="dyn-pet-dash-row"><span>{k}</span><strong>{v}</strong></div>
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
            <span className="dyn-pet-dash-model-name" title={m.route}>{m.model || m.route}</span>
            <span className="dyn-pet-dash-model-val">{fmtTokens(m.requestTotal)}</span>
            <span className="dyn-pet-dash-model-bar"><i style={{ width: `${Math.max(4, (m.requestTotal / maxModel) * 100).toFixed(1)}%` }} /></span>
          </div>
        ))}
      </div>

      <div className="dyn-pet-dash-card">
        <div className="dyn-pet-dash-card-head"><span>{t("dash.tools")}</span></div>
        <ToolsGrid tools={tools} />
      </div>

      <div className="dyn-pet-dash-foot">{t("dash.caliber")}</div>
    </div>
  );
}
