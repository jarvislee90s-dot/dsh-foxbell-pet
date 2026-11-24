// TrendChart.tsx — v2.2 共用趋势图（spec R5 复刻 Codex++ 形态：三横网格线+蓝紫渐变折线/面积+数据点）。
// 基础版无交互（Board sparkline 行）；hover tooltip 由 L3 大看板（Task 12 DashboardPanel.TooltipLayer）外叠实现。
// idPrefix（Task 12 评审裁定）：渐变 id 曾为静态 `dyn-pet-trend-g`——document 级 url(#id) 在两图同挂时
// 全部解析到首个实例。可选 idPrefix 逐实例去重（默认值保持 Board 用法逐字节不变）；几何零改动。
import type { ReactElement } from "react";
import { fmtTokens } from "./format";

const LINE_GRAD = ["#3BA7FF", "#8D6BFF"];

export function lastN(days: { key: string; dayTotal: number; hitPct?: number }[], n: number): { label: string; value: number; key: string; hitPct?: number }[] {
  const src = Array.isArray(days) ? days : [];
  const tail = src.slice(Math.max(0, src.length - n));
  const out = tail.map((d) => {
    const [, m, day] = d.key.split("-");
    return { key: d.key, label: `${Number(m)}/${Number(day)}`, value: d.dayTotal || 0, hitPct: d.hitPct };
  });
  while (out.length < n) out.unshift({ key: "", label: "", value: 0, hitPct: undefined }); // hitPct 显式缺省（返回类型形状；tsc TS2741）
  return out;
}

function pathOf(pts: { x: number; y: number }[], smooth: boolean): string {
  if (pts.length === 0) return "";
  const f = (n: number) => n.toFixed(1);
  if (!smooth || pts.length < 3) return "M " + pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(" L ");
  // Catmull-Rom → 三次贝塞尔（v2.2.1：原中点直角贝塞尔呈平台阶梯，与 Codex++ 平滑曲线差距大）
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** Pretty axis ticks: 0 plus evenly stepped rounded values up to at least `max`. */
export function axisTicks(max: number, count = 3): number[] {
  const n = Math.max(2, Math.floor(count));
  const top = Number.isFinite(max) && max > 0 ? max : 1;
  const rough = top / (n - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return Array.from({ length: n }, (_, i) => step * i);
}

export function TrendChart(props: { points: { label: string; value: number }[]; width: number; height: number; showLabels?: boolean; idPrefix?: string; showAxis?: boolean; hover?: number | null; onPoint?: (index: number) => void; ariaLabel?: string }): ReactElement | null {
  const { points, width, height } = props;
  if (!points || points.length < 2) return null;
  const axis = axisTicks(Math.max(...points.map((p) => p.value)), 3);
  const max = axis[axis.length - 1];
  const ticks = axisTicks(max, axis.length);
  const axisLabels = ticks.map((v) => fmtTokens(v));
  const gutter = props.showAxis === false ? 0 : Math.max(28, ...axisLabels.map((s) => s.length * 6.2));
  const padL = 6 + gutter, padR = 8, padT = 10, padB = props.showLabels ? 18 : 6;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const pts = points.map((p, i) => ({
    x: padL + (innerW * i) / (points.length - 1),
    y: padT + innerH * (1 - p.value / max),
  }));
  const line = pathOf(pts, true);
  const baseline = (padT + innerH).toFixed(1);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${baseline} L ${pts[0].x.toFixed(1)} ${baseline} Z`;
  const gid = props.idPrefix ?? "dyn-pet-trend-g";
  const hover = props.hover;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
      aria-label={props.ariaLabel}>
      <defs>
        <linearGradient id={`${gid}-l`} x1="0" y1="0" x2={width} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={LINE_GRAD[0]} /><stop offset="1" stopColor={LINE_GRAD[1]} />
        </linearGradient>
        <linearGradient id={`${gid}-a`} x1="0" y1={padT} x2="0" y2={padT + innerH} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={LINE_GRAD[0]} stopOpacity="0.22" /><stop offset="1" stopColor={LINE_GRAD[1]} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((tick, i) => {
        const y = padT + innerH * (1 - tick / max);
        return (
          <g key={tick}>
            <path d={`M ${padL} ${y.toFixed(1)} H ${width - padR}`} fill="none" stroke="currentColor" strokeOpacity={i === 0 ? "0.18" : "0.1"} strokeWidth="1" />
            {props.showAxis === false ? null : (
              <text x={padL - 6} y={(y + 3.5).toFixed(1)} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.55">{axisLabels[i]}</text>
            )}
          </g>
        );
      })}
      <path d={area} fill={`url(#${gid}-a)`} />
      <path d={line} fill="none" stroke={`url(#${gid}-l)`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={hover === i ? 4.2 : i === pts.length - 1 ? 3.6 : 2.6}
          fill="var(--dsw-bg, #fff)" stroke={`url(#${gid}-l)`} strokeWidth={hover === i ? 2.4 : 1.6}
          tabIndex={props.onPoint === undefined ? undefined : 0}
          role={props.onPoint === undefined ? undefined : "button"}
          aria-label={props.onPoint === undefined ? undefined : `${points[i].label} ${fmtTokens(points[i].value)}`}
          style={props.onPoint === undefined ? undefined : { cursor: "pointer", outline: "none" }}
          onPointerEnter={props.onPoint === undefined ? undefined : () => props.onPoint!(i)}
          onFocus={props.onPoint === undefined ? undefined : () => props.onPoint!(i)}
          onClick={props.onPoint === undefined ? undefined : () => props.onPoint!(i)}
        />
      ))}
      {props.showLabels ? points.map((p, i) => ({ p, i })).filter(({ p, i }) => {
        const n = points.length;
        if (n <= 14) return true;
        const stride = Math.ceil(n / 12);
        if (i === 0 || i === n - 1) return true;
        if (p.label.endsWith("月")) return true;
        return i % stride === 0;
      }).map(({ p, i }) => (
        <text key={i} x={pts[i].x.toFixed(1)} y={height - 4} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="11" fill="currentColor" opacity="0.6">{p.label}</text>
      )) : null}
    </svg>
  );
}
