import { useMemo, useRef } from "react";
import type { ReactElement } from "react";
import type { SpeedBucket, SpeedMetrics } from "./dashboard-contract";
import { speedSegments, stepBucketFocus } from "./speed-view";
import { t } from "./i18n";

export type SpeedSelection = { index: number; bucket: SpeedBucket };

const metricText = (metrics: SpeedMetrics): string => metrics.tps === null ? t("speed.noSamples") : `${metrics.tps.toFixed(1)} tok/s · n=${metrics.n}`;
const timeText = (ms: number): string => new Date(ms).toLocaleString();

export function SpeedChart({ buckets, shown, onHover, onPin, onReset }: {
  buckets: SpeedBucket[];
  shown: SpeedSelection | null;
  onHover: (selection: SpeedSelection | null) => void;
  onPin: (selection: SpeedSelection) => void;
  onReset: () => void;
}): ReactElement {
  const width = 640, height = 250;
  const margin = { left: 48, right: 18, top: 18, bottom: 38 };
  const innerW = width - margin.left - margin.right, innerH = height - margin.top - margin.bottom;
  const targets = useRef<(SVGCircleElement | null)[]>([]);
  const geometry = useMemo(() => {
    const start = buckets[0]?.from ?? 0;
    const end = buckets[buckets.length - 1]?.to ?? 1;
    const duration = Math.max(1, end - start);
    const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.metrics.tps ?? 0));
    const magnitude = 10 ** Math.floor(Math.log10(maxValue));
    const yMax = Math.ceil(maxValue / magnitude) * magnitude;
    const point = (bucket: SpeedBucket) => ({
      x: margin.left + (((bucket.from + bucket.to) / 2 - start) / duration) * innerW,
      y: margin.top + innerH * (1 - (bucket.metrics.tps ?? 0) / yMax),
    });
    return { start, end, yMax, point };
  }, [buckets, innerH, innerW, margin.left, margin.top]);
  const segments = speedSegments(buckets);
  const paths = segments.map((segment) => segment.map((bucket, index) => {
    const p = geometry.point(bucket);
    return `${index === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(" "));
  const yTicks = Array.from({ length: 5 }, (_, index) => geometry.yMax * index / 4);
  const xTickCount = Math.min(5, Math.max(1, buckets.length));
  const xTickIndexes = Array.from({ length: xTickCount }, (_, index) => Math.round(index * Math.max(0, buckets.length - 1) / Math.max(1, xTickCount - 1)));

  return <div className="dyn-pet-speed-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("speed.chartLabel")}>
      {yTicks.map((tick, index) => {
        const y = margin.top + innerH * (1 - index / 4);
        return <g key={tick}><line className="dyn-pet-speed-grid" x1={margin.left} x2={width - margin.right} y1={y} y2={y} /><text className="dyn-pet-speed-axis" x={margin.left - 7} y={y + 4} textAnchor="end">{tick.toLocaleString("en-US", { maximumFractionDigits: 1 })}</text></g>;
      })}
      <text className="dyn-pet-speed-axis" x={7} y={12}>tok/s</text>
      {xTickIndexes.map((bucketIndex) => {
        const bucket = buckets[bucketIndex];
        if (!bucket) return null;
        const x = geometry.point(bucket).x;
        return <text key={`${bucket.from}-${bucketIndex}`} className="dyn-pet-speed-axis" x={x} y={height - 10} textAnchor="middle">{new Date(bucket.to).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</text>;
      })}
      {paths.map((path, index) => <path key={index} className="dyn-pet-speed-line" d={path} fill="none" />)}
      {buckets.map((bucket, index) => {
        if (bucket.metrics.tps === null) return null;
        const p = geometry.point(bucket);
        return <circle key={`mark-${bucket.from}`} className="dyn-pet-speed-mark" cx={p.x} cy={p.y} r={4} />;
      })}
      {shown?.bucket ? <line className="dyn-pet-speed-crosshair" x1={geometry.point(shown.bucket).x} x2={geometry.point(shown.bucket).x} y1={margin.top} y2={margin.top + innerH} /> : null}
      {buckets.map((bucket, index) => {
        const p = geometry.point(bucket);
        const selection = { index, bucket };
        return <circle
          key={`hit-${bucket.from}`}
          ref={(node) => { targets.current[index] = node; }}
          cx={p.x} cy={p.y} r={16} fill="transparent"
          tabIndex={0} role="button"
          aria-label={`${timeText(bucket.from)} – ${timeText(bucket.to)} · ${metricText(bucket.metrics)}`}
          onPointerEnter={() => onHover(selection)}
          onPointerLeave={() => onHover(null)}
          onFocus={() => onHover(selection)}
          onBlur={() => onHover(null)}
          onClick={() => onPin(selection)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPin(selection); return; }
            if (event.key === "Escape") { event.preventDefault(); onReset(); return; }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? buckets.length - 1 : stepBucketFocus(index, event.key, buckets.length);
              targets.current[next]?.focus();
            }
          }}
        />;
      })}
    </svg>
    {shown ? <div className="dyn-pet-speed-tooltip" role="status">
      <strong>{shown.bucket.metrics.tps === null ? "—" : `${shown.bucket.metrics.tps.toFixed(2)} tok/s`}</strong>
      <span>{timeText(shown.bucket.from)} – {timeText(shown.bucket.to)}</span>
      <span>{t("speed.samples", { n: shown.bucket.metrics.n })}{shown.bucket.isPartial ? ` · ${t("speed.partial")}` : ""}</span>
      <span>{t("speed.ttft")}: {shown.bucket.metrics.ttftMs === null ? "—" : `${shown.bucket.metrics.ttftMs.toFixed(0)} ms (n=${shown.bucket.metrics.ttftN})`}</span>
      <span>{t("speed.modelTime")}: {shown.bucket.metrics.modelMs === null ? "—" : `${(shown.bucket.metrics.modelMs / 1000).toFixed(2)} s (n=${shown.bucket.metrics.modelN})`}</span>
      <span>{t("speed.toolTime")}: {shown.bucket.metrics.toolMs === null ? "—" : `${(shown.bucket.metrics.toolMs / 1000).toFixed(2)} s (n=${shown.bucket.metrics.toolN})`}</span>
    </div> : null}
    <details className="dyn-pet-speed-table"><summary>{t("speed.table")}</summary><table><thead><tr><th>{t("speed.bucket")}</th><th>tok/s</th><th>n</th><th>{t("speed.ttft")}</th><th>{t("speed.modelTime")}</th><th>{t("speed.toolTime")}</th></tr></thead><tbody>{buckets.map((bucket) => <tr key={`row-${bucket.from}`}><td>{timeText(bucket.from)} – {timeText(bucket.to)}</td><td>{bucket.metrics.tps?.toFixed(3) ?? "—"}</td><td>{bucket.metrics.n}</td><td>{bucket.metrics.ttftMs ?? "—"}</td><td>{bucket.metrics.modelMs ?? "—"}</td><td>{bucket.metrics.toolMs ?? "—"}</td></tr>)}</tbody></table></details>
  </div>;
}
