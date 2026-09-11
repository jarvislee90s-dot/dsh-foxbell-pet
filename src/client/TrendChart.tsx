// TrendChart.tsx — v2.2 共用趋势图（spec R5 复刻 Codex++ 形态：三横网格线+蓝紫渐变折线/面积+数据点）。
// 基础版无交互（Board sparkline 行）；Interactive 版带 hover tooltip（L3 大看板专用，Task 12 内联实现，不预建）。
import type { ReactElement } from "react";

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
  if (!smooth || pts.length < 3) return "M " + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ");
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const mx = (p0.x + p1.x) / 2;
    d += ` C ${mx.toFixed(1)} ${p0.y.toFixed(1)} ${mx.toFixed(1)} ${p1.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

export function TrendChart(props: { points: { label: string; value: number }[]; width: number; height: number; showLabels?: boolean }): ReactElement | null {
  const { points, width, height } = props;
  if (!points || points.length < 2) return null;
  const padL = 6, padR = 6, padT = 8, padB = props.showLabels ? 16 : 6;
  const max = Math.max(1, ...points.map((p) => p.value));
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const pts = points.map((p, i) => ({
    x: padL + (innerW * i) / (points.length - 1),
    y: padT + innerH * (1 - p.value / max),
  }));
  const line = pathOf(pts, true);
  const baseline = (padT + innerH).toFixed(1);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${baseline} L ${pts[0].x.toFixed(1)} ${baseline} Z`;
  const gid = "dyn-pet-trend-g";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} role="img">
      <defs>
        <linearGradient id={`${gid}-l`} x1="0" y1="0" x2={width} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={LINE_GRAD[0]} /><stop offset="1" stopColor={LINE_GRAD[1]} />
        </linearGradient>
        <linearGradient id={`${gid}-a`} x1="0" y1={padT} x2="0" y2={padT + innerH} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={LINE_GRAD[0]} stopOpacity="0.22" /><stop offset="1" stopColor={LINE_GRAD[1]} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <path key={f} d={`M ${padL} ${(padT + innerH * f).toFixed(1)} H ${width - padR}`} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
      ))}
      <path d={area} fill={`url(#${gid}-a)`} />
      <path d={line} fill="none" stroke={`url(#${gid}-l)`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={i === pts.length - 1 ? 3.6 : 2.6} fill="var(--dsw-bg, #fff)" stroke={`url(#${gid}-l)`} strokeWidth="1.6" />
      ))}
      {props.showLabels ? points.map((p, i) => (
        <text key={i} x={pts[i].x.toFixed(1)} y={height - 3} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="9" fill="currentColor" opacity="0.6">{p.label}</text>
      )) : null}
    </svg>
  );
}
