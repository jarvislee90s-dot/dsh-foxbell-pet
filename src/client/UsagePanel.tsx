import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";
import { apiGetUsageWindow } from "./api";
import type { UsageQuery, UsageSpan, UsageWindow } from "./dashboard-contract";
import { routeKey } from "./dashboard-contract";
import { selectTrend, usageDistribution } from "./dashboard-view";
import { TrendChart } from "./TrendChart";
import { getLang, t } from "./i18n";
import { fmtPct, fmtTokens } from "./format";
import { fmtDur } from "./boardrows";
import { appStore, cfgStore } from "./store";
import { exportDashboardImage, loadSprite, maxAnimCols, resolvePoseRow } from "./exportimage";
import { fillQuote, pickQuote } from "./quotes";
import { buildLegacyUsageText, legacyRangeLabel, legacyUsageProjection, toolsMetrics } from "./usage-export";

export type CostChildProps = {
  query: UsageQuery;
  span: UsageSpan;
  usageRevision: number;
  onExportReady: (csv: string | null) => void;
  onWindowConflict: () => void;
};

type Props = {
  active: boolean;
  children?: (props: CostChildProps) => ReactNode;
  onUnsupported: () => void;
};

const dayKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const queryKey = (query: UsageQuery): string => JSON.stringify(query);

export function UsagePanel({ active, children, onUnsupported }: Props): ReactElement {
  const cfg = useSyncExternalStore(cfgStore.subscribe, cfgStore.getSnapshot);
  const [query, setQuery] = useState<UsageQuery>({ preset: "7d" });
  const [custom, setCustom] = useState(() => ({ from: dayKey(new Date(Date.now() - 6 * 86_400_000)), to: dayKey(new Date()) }));
  const [loaded, setLoaded] = useState<{ key: string; window: UsageWindow } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [trendRoute, setTrendRoute] = useState<string | null>(null);
  const [trendHover, setTrendHover] = useState<number | null>(null);
  const [trendMode, setTrendMode] = useState<"all" | "provider" | "model">("all");
  const [trendProviderKey, setTrendProviderKey] = useState("");
  const [distributionMode, setDistributionMode] = useState<"provider" | "model">("provider");
  const [distributionOpen, setDistributionOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(false);
  const [priced, setPriced] = useState<{ key: string; csv: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState(() => {
    try { return localStorage.getItem("dyn-foxbell-pet:export-quote") ?? ""; } catch { return ""; }
  });
  const request = useRef(0);
  const effectiveQuery = query.preset === "custom" ? { ...query, from: custom.from, to: custom.to } : query;
  const effectiveKey = queryKey(effectiveQuery);
  const window = loaded?.key === effectiveKey ? loaded.window : null;
  const currentKey = useRef(effectiveKey);
  currentKey.current = active ? effectiveKey : "";
  const usageStamp = useSyncExternalStore(appStore.subscribe, () => {
    const diag = appStore.getSnapshot()?.diag;
    const edge = query.preset === "5h" ? diag?.usageHour : query.preset === "custom" ? "" : diag?.usageDay;
    return `${diag?.usageRevision ?? ""}:${edge ?? ""}`;
  });
  const retryKey = JSON.stringify([effectiveKey, usageStamp]);
  const lastConflict = useRef("");
  const retryUsage = () => {
    lastConflict.current = "";
    setRefreshNonce((value) => value + 1);
  };
  const onWindowConflict = useCallback(() => {
    if (lastConflict.current === retryKey) {
      setError(t("dash2.queryFailed"));
      return;
    }
    lastConflict.current = retryKey;
    setRefreshNonce((value) => value + 1);
  }, [retryKey]);

  useEffect(() => {
    if (!active) return;
    const id = ++request.current;
    setBusy(true);
    setError("");

    apiGetUsageWindow(effectiveQuery).then((value) => {
      if (request.current !== id || currentKey.current !== effectiveKey) return;
      setLoaded({ key: effectiveKey, window: value });
    }).catch((reason: unknown) => {
      if (request.current !== id || currentKey.current !== effectiveKey) return;
      const status = (reason as { status?: number })?.status;
      const code = (reason as { code?: string })?.code;
      if (status === 404 || status === 403 || code === "capability-unavailable" || code === "owner-required") {
        onUnsupported();
        return;
      }
      setError(t("dash2.queryFailed"));
    }).finally(() => {
      if (request.current === id) setBusy(false);
    });
    return () => { request.current += 1; };
    // effectiveKey captures the complete frozen request; object identity is intentionally irrelevant.
  }, [active, effectiveKey, onUnsupported, refreshNonce, usageStamp]);

  const costKey = window ? JSON.stringify([effectiveKey, window.span.from, window.span.to, window.revision]) : "";
  const costCsv = priced?.key === costKey ? priced.csv : null;
  const onCostExport = useCallback((csv: string | null) => {
    if (csv !== null) setPriced({ key: costKey, csv });
    else setPriced((old) => old?.key === costKey ? null : old);
  }, [costKey]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const points = useMemo(() => {
    const provider = trendProviderKey ? JSON.parse(trendProviderKey) as string | null : undefined;
    const selected = selectTrend(window, trendMode === "model" && trendRoute ? { route: trendRoute }
      : trendMode === "provider" && trendProviderKey ? { provider } : {});
    return selected.map((point) => {
      const date = new Date(point.from);
      const label = window?.span.grain === "hour"
        ? `${String(date.getMonth() + 1)}/${String(date.getDate())} ${String(date.getHours()).padStart(2, "0")}:00`
        : `${date.getMonth() + 1}/${date.getDate()}`;
      return { label, value: point.tokens, key: String(point.from), hitPct: point.hitPct ?? undefined };
    });
  }, [window, trendRoute, trendMode, trendProviderKey]);
  const distribution = useMemo(() => usageDistribution(window, distributionMode), [window, distributionMode]);
  const trendProviders = useMemo(() => {
    const providers = new Map<string, string | null>();
    for (const row of window?.routes ?? []) providers.set(JSON.stringify(row.route.provider), row.route.provider);
    return [...providers].map(([key, value]) => ({ key, value }));
  }, [window]);
  useEffect(() => {
    if (!window?.routes.length) return;
    if (trendMode === "provider" && !trendProviders.some((item) => item.key === trendProviderKey)) setTrendProviderKey(trendProviders[0]?.key ?? "");
    if (trendMode === "model" && !window.routes.some((row) => routeKey(row.route) === trendRoute)) setTrendRoute(routeKey(window.routes[0].route));
  }, [window, trendMode, trendProviders, trendProviderKey, trendRoute]);
  // Trend filtering is local: hero, totals, distribution, cost and both legacy exports stay global.
  const totalTokens = window?.points.reduce((sum, point) => sum + point.tokens, 0) ?? 0;
  const missing = new Set(window?.unobservedBuckets ?? []);
  const requestMissing = missing.has("inputTokens") || missing.has("cacheReadTokens");
  const overviewRows: [string, string][] = window ? [
    [t("dash.g.uncachedInput"), window.totals.uncachedInput == null ? "—" : fmtTokens(window.totals.uncachedInput)],
    [t("dash.g.cacheRead"), window.totals.cacheRead == null ? "—" : fmtTokens(window.totals.cacheRead)],
    [t("dash.g.cacheWrite"), window.totals.cacheWrite == null ? "—" : fmtTokens(window.totals.cacheWrite)],
    [t("dash.g.output"), window.totals.outputTokens == null ? "—" : fmtTokens(window.totals.outputTokens)],
    [t("dash.g.requestTotal"), requestMissing ? "—" : fmtTokens(window.totals.requestTotal)],
    [t("dash.g.hitPct"), requestMissing ? "—" : fmtPct(window.totals.hitPct)],
    [t("dash.g.requests"), String(window.totals.requestCount)],
    [t("dash.g.asOf"), new Date().toLocaleTimeString()],
  ] : [];
  const activity = toolsMetrics(window?.tools);
  const hitCompare = window && !requestMissing && window.totals.requestTotal > 0 ? (() => {
    const current = window.totals.hitPct;
    const previous = window.previousHitPct;
    if (previous === null || previous === undefined) return t("dash.hitCur", { a: fmtPct(current) });
    const raw = (current - previous) * 100;
    const delta = `${raw > 0 ? "+" : raw < 0 ? "-" : "±"}${Math.abs(raw).toFixed(1)}pt`;
    return t("dash.hitCompare", { a: fmtPct(current), b: fmtPct(previous), d: delta });
  })() : "";

  const exportRange = (preset: UsageQuery["preset"]) => t(preset === "today" ? "dash2.range.today" : `dash.tab.${preset}`);
  const copyText = async (): Promise<void> => {
    if (!window) return;
    const text = buildLegacyUsageText(
      `${t("dash.panelTitle")} · ${exportRange(effectiveQuery.preset)}`,
      overviewRows,
      legacyUsageProjection(window),
      { models: t("dash.models"), route: t("dash2.unknown") },
      fmtTokens,
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("copy rejected");
        setCopied(true);
      } catch { setError(t("dash2.copyFailed")); }
    }
  };

  const exportImage = async (customQuote?: string): Promise<void> => {
    if (!window) return;
    const exportUsage = legacyUsageProjection(window);
    const runtime = appStore.getRuntime();
    const sprite = await loadSprite(runtime.spriteUrl);
    const previousPoint = exportUsage.points[exportUsage.points.length - 2];
    const latestPoint = exportUsage.points[exportUsage.points.length - 1];
    const trendUp = !previousPoint || !latestPoint ? null
      : previousPoint.tokens < latestPoint.tokens ? true : previousPoint.tokens > latestPoint.tokens ? false : null;
    const pace = appStore.getSnapshot()?.dashboard?.pace?.tier ?? "";
    const toolStats = toolsMetrics(exportUsage.tools);
    const vars = {
      range: exportRange(effectiveQuery.preset), tokens: fmtTokens(totalTokens), hit: fmtPct(exportUsage.totals.hitPct),
      models: String(exportUsage.routes.length), tool: exportUsage.tools[0]?.name ?? "",
    };
    const quote = customQuote?.trim() ? fillQuote(customQuote.trim(), vars)
      : pickQuote({ total: totalTokens, hitPct: exportUsage.totals.hitPct, trendUp, multiModel: exportUsage.routes.length > 1, loaf: pace.startsWith("loaf"), tool: vars.tool }, getLang(), undefined, vars);
    const exportPoints = exportUsage.points.map((point) => {
      const d = new Date(point.from);
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return { key: `${dayKey(d)}T${time}`, label: exportUsage.span.grain === "hour" ? time : `${d.getMonth() + 1}/${d.getDate()}`, value: point.tokens };
    });
    const rangeLabel = legacyRangeLabel(effectiveQuery.preset, exportPoints, vars.range, custom);
    const maxModel = Math.max(1, ...exportUsage.routes.map((row) => row.totals.requestTotal));
    const blob = await exportDashboardImage({
      rangeLabel,
      hero: `${missing.size ? "~" : ""}${totalTokens.toLocaleString("en-US")}`,
      heroSub: `${t("dash.g.asOf")} ${new Date().toLocaleTimeString()}`,
      metrics: overviewRows.slice(0, 6),
      trendTitle: t("dash.trendTitle"),
      peakLabel: t("dash.peak", { v: fmtTokens(Math.max(0, ...exportUsage.points.map((point) => point.tokens))) }),
      points: exportPoints,
      models: exportUsage.routes.map((row) => ({ name: row.route.provider && row.route.model ? `${row.route.provider}/${row.route.model}` : t("dash2.unknown"), val: fmtTokens(row.totals.requestTotal), share: row.totals.requestTotal / maxModel })),
      tools2x2: [
        [t("dash.g.toolCalls"), String(toolStats.calls)],
        [t("dash.g.toolAvg"), fmtDur(toolStats.avgMs)],
        [t("dash.g.toolTopCount"), `${toolStats.topName} ${toolStats.topCount}`],
        [t("dash.g.toolTopDur"), `${toolStats.topDurName} ${fmtDur(toolStats.topDurMs)}`],
      ],
      quote,
      poseRow: resolvePoseRow(cfg.exportPose),
      sprite,
      frameW: sprite ? sprite.naturalWidth / maxAnimCols() : 0,
      frameH: sprite ? sprite.naturalHeight / runtime.rows : 0,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `foxbell-dashboard-${effectiveQuery.preset}.png`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const downloadCostCsv = (): void => {
    if (!costCsv) return;
    const url = URL.createObjectURL(new Blob([costCsv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `foxbell-api-equivalent-cost-usd-${effectiveQuery.preset}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="dyn-pet-dash" aria-busy={busy}>
      <div className="dyn-pet-dash-head">
        <div className="dyn-pet-dash-tabs" aria-label={t("dash2.usageTab")}>
          {(["5h", "today", "7d", "30d", "custom"] as const).map((preset) => (
            <button key={preset} className={"dyn-pet-dash-tab" + (query.preset === preset ? " is-active" : "")} onClick={() => { if (preset !== query.preset) setQuery(preset === "custom" ? { preset, ...custom } : { preset }); }}>{t(`dash2.range.${preset}`)}</button>
          ))}
          {query.preset === "custom" ? <span className="dyn-pet-dash-dates">
            <input aria-label={t("dash2.from")} type="date" value={custom.from} max={custom.to} onChange={(event) => { const from = event.target.value; setCustom((old) => ({ ...old, from })); setQuery({ preset: "custom", from, to: custom.to }); }} />
            <span>–</span>
            <input aria-label={t("dash2.to")} type="date" value={custom.to} min={custom.from} max={dayKey(new Date())} onChange={(event) => { const to = event.target.value; setCustom((old) => ({ ...old, to })); setQuery({ preset: "custom", from: custom.from, to }); }} />
          </span> : null}
        </div>
        <div className="dyn-pet-dash-actions">
          <button className="dyn-pet-dash-actbtn" disabled={!window} onClick={() => void copyText()}>{copied ? t("dash.export.copied") : t("dash.export.copyText")}</button>
          <button className="dyn-pet-dash-actbtn" disabled={!window} onClick={() => void exportImage()}>{t("dash.export.exportImage")}</button>
          <button className={"dyn-pet-dash-actbtn" + (quoteOpen ? " is-active" : "")} disabled={!window} onClick={() => setQuoteOpen((value) => !value)}>{t("dash.export.exportCustom")}</button>
          <button className="dyn-pet-dash-actbtn" disabled={!costCsv} onClick={downloadCostCsv}>{t("dash2.costCsv")}</button>
        </div>
      </div>
      {quoteOpen ? <div className="dyn-pet-dash-quotebar"><input type="text" value={quoteDraft} placeholder={t("dash.export.quotePlaceholder")} onChange={(event) => { const value = event.target.value; setQuoteDraft(value); try { localStorage.setItem("dyn-foxbell-pet:export-quote", value); } catch { /* ignore */ } }} /><button className="dyn-pet-dash-actbtn" onClick={() => void exportImage(quoteDraft)}>{t("dash.export.export")}</button></div> : null}
      <p className="dyn-pet-dash-notice">{t("dash2.estimateNotice")}</p>
      {error ? <div className="dyn-pet-dash-error" role="alert">{error} <button className="dyn-pet-dash-actbtn" onClick={retryUsage}>{t("speed.retry")}</button></div> : null}
      {busy ? <div className="dyn-pet-dash-empty">{t("dash.loading")}</div> : null}
      {window ? <>
        {window.coverage !== "ready" ? <div className="dyn-pet-dash-notice">{t(`dash2.coverage.${window.coverage}`)}</div> : null}
        {missing.size ? <div className="dyn-pet-dash-notice">{t("dash2.unobserved", { buckets: [...missing].map((bucket) => t(`cost.bucket.${bucket}`)).join(", ") })}</div> : null}
        <section className="dyn-pet-dash-hero" aria-label={t("dash2.overview")}>
          <div className="dyn-pet-dash-hero-label">{t("dash.heroTotal", { range: t(`dash2.range.${effectiveQuery.preset}`) })}</div>
          <div className="dyn-pet-dash-hero-num">{missing.size ? "~" : ""}{fmtTokens(totalTokens)}</div>
          {hitCompare ? <div className="dyn-pet-dash-weekhit">{hitCompare}</div> : null}
        </section>
        <div className="dyn-pet-dash-rows">
          {overviewRows.map(([label, value]) => <div key={label} className="dyn-pet-dash-row"><span>{label}</span><strong>{value}</strong></div>)}
        </div>
        <section className="dyn-pet-dash-card">
          <div className="dyn-pet-dash-card-head"><span>{t("dash.trendTitle")}</span><div className="dyn-pet-dash-actions">{(["all", "provider", "model"] as const).map((mode) => <button key={mode} className={"dyn-pet-dash-actbtn" + (trendMode === mode ? " is-active" : "")} onClick={() => setTrendMode(mode)}>{t(mode === "all" ? "dash2.allRoutes" : mode === "provider" ? "dash2.byProvider" : "dash2.byModel")}</button>)}</div></div>
          {trendMode === "provider" ? <select aria-label={t("dash2.trendFilter")} value={trendProviderKey} onChange={(event) => setTrendProviderKey(event.target.value)}>{trendProviders.map((item) => <option key={item.key} value={item.key}>{item.value ?? t("dash2.unknown")}</option>)}</select> : null}
          {trendMode === "model" ? <select aria-label={t("dash2.trendFilter")} value={trendRoute ?? ""} onChange={(event) => setTrendRoute(event.target.value || null)}>{window.routes.map((row) => { const key = routeKey(row.route); return <option key={key} value={key}>{row.route.provider ?? t("dash2.unknown")} / {row.route.model ?? t("dash2.unknown")}</option>; })}</select> : null}
          {points.length ? <div className="dyn-pet-dash-trendwrap">
            <TrendChart points={points} width={560} height={168} showLabels idPrefix="dyn-pet-usage-v2"
              hover={trendHover} onPoint={setTrendHover} ariaLabel={t("dash.trendTitle")} />
            {trendHover !== null && points[trendHover] ? <div className="dyn-pet-dash-tooltip" style={{ left: "50%", top: "0%" }}>
              {points[trendHover].label} · {t("dash2.tokens")} {fmtTokens(points[trendHover].value)}
              {points[trendHover].hitPct === undefined ? null : ` · ${t("dash.g.hitPct")} ${fmtPct(points[trendHover].hitPct)}`}
            </div> : null}
          </div> : <div className="dyn-pet-dash-empty">{t("dash.noData")}</div>}
        </section>
        <section className="dyn-pet-dash-card">
          <button className="dyn-pet-dash-card-head dyn-pet-dash-collapse" aria-expanded={distributionOpen} onClick={() => setDistributionOpen((value) => !value)}><span>{t("dash2.distribution")}</span><span>{distributionOpen ? "−" : "+"}</span></button>
          {distributionOpen ? <>
            <div className="dyn-pet-dash-actions"><button className={"dyn-pet-dash-actbtn" + (distributionMode === "provider" ? " is-active" : "")} onClick={() => setDistributionMode("provider")}>{t("dash2.byProvider")}</button><button className={"dyn-pet-dash-actbtn" + (distributionMode === "model" ? " is-active" : "")} onClick={() => setDistributionMode("model")}>{t("dash2.byModel")}</button></div>
            {distribution.length ? distribution.map((row) => <div className="dyn-pet-dash-model" key={row.key}><span className="dyn-pet-dash-model-name" title={row.label}>{row.label}</span><span className="dyn-pet-dash-model-val">{fmtTokens(row.totals.requestTotal)}</span><span className="dyn-pet-dash-model-bar"><i style={{ width: `${Math.max(2, row.totals.requestTotal / Math.max(1, distribution[0].totals.requestTotal) * 100)}%` }} /></span></div>) : <div className="dyn-pet-dash-empty">{t("dash.noData")}</div>}
          </> : null}
        </section>
        {children?.({ query: effectiveQuery, span: window.span, usageRevision: window.revision, onExportReady: onCostExport, onWindowConflict })}
        <section className="dyn-pet-dash-card">
          <button className="dyn-pet-dash-card-head dyn-pet-dash-collapse" aria-expanded={activityOpen} onClick={() => setActivityOpen((value) => !value)}><span>{t("dash2.workActivity")}</span><span>{activityOpen ? "−" : "+"}</span></button>
          {activityOpen ? <div className="dyn-pet-dash-tools">
            {[
              [t("dash2.activitySessions"), window.activitySessions ?? "—"],
              [t("dash.g.toolCalls"), activity.calls],
              [t("dash.g.toolAvg"), activity.calls ? fmtDur(activity.avgMs) : "—"],
              [t("dash.g.toolTopCount"), `${activity.topName} ${activity.topCount}`],
              [t("dash.g.toolTopDur"), `${activity.topDurName} ${fmtDur(activity.topDurMs)}`],
            ].map(([label, value]) => <div className="dyn-pet-dash-toolcell" key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div> : null}
        </section>
      </> : null}
      <div className="dyn-pet-dash-foot">{t("dash.caliber")}</div>
    </div>
  );
}
