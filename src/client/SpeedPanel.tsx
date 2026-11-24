import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { apiGetSpeed, petErrMsg } from "./api";
import type { SpeedRange, SpeedSnapshot } from "./dashboard-contract";
import { SpeedChart, type SpeedSelection } from "./SpeedChart";
import { createSerialSpeedRequest, matchingSpeedSnapshot, speedSelectionAfterFilter, speedSeriesView } from "./speed-view";
import { useSessionSpeed } from "./session-speed";
import { t } from "./i18n";

export type UseSessions = (selector: (state: { current?: string }) => unknown) => unknown;

type Sort = "name" | "tps" | "sessions";

const cloneSelection = (selection: SpeedSelection): SpeedSelection => ({
  index: selection.index,
  bucket: { ...selection.bucket, metrics: { ...selection.bucket.metrics } },
});

export function SpeedPanel({ active, useSessions }: { active: boolean; useSessions: UseSessions }): ReactElement {
  const sessionId = useSessions((state) => state.current) as string | undefined;
  const currentSpeed = useSessionSpeed(sessionId ?? null, active);
  const [range, setRange] = useState<SpeedRange>("5h");
  const [snapshot, setSnapshot] = useState<SpeedSnapshot | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [sort, setSort] = useState<Sort>("tps");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [hover, setHover] = useState<SpeedSelection | null>(null);
  const [pinned, setPinned] = useState<SpeedSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const unsupported = useRef(false);

  useEffect(() => {
    const onVisibility = (): void => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => { setPinned(null); setHover(null); }, [range, selectedKey]);
  useEffect(() => {
    if (!active || !visible || unsupported.current) return;
    const runner = createSerialSpeedRequest(
      () => apiGetSpeed(range, selectedKey ?? undefined),
      (value) => {
        // The host owns fallback selection. Never pair one route's metrics with another's buckets.
        if (value.selectedKey !== selectedKey) setSelectedKey(value.selectedKey);
        setSnapshot(value);
        setError(null);
      },
      (reason) => {
        setError(reason);
        const status = (reason as { status?: number })?.status;
        if (status === 404 || status === 403) {
          unsupported.current = true;
          runner.dispose();
        }
      },
      setBusy,
    );
    void runner.run();
    const timer = setInterval(() => { if (!unsupported.current) void runner.run(); }, 5_000);
    return () => { runner.dispose(); clearInterval(timer); };
  }, [active, visible, range, selectedKey, retryNonce]);

  const series = useMemo(() => speedSeriesView(snapshot?.series ?? [], { search, provider, sort, dir }), [snapshot, search, provider, sort, dir]);
  useEffect(() => {
    const next = speedSelectionAfterFilter(selectedKey, series);
    if (next !== selectedKey) {
      setSnapshot(null);
      setSelectedKey(next);
    }
  }, [series, selectedKey]);
  const selectedSnapshot = matchingSpeedSnapshot(snapshot, selectedKey, series.length > 0);
  const selected = selectedSnapshot?.series.find((row) => row.key === selectedKey) ?? null;
  const providers = Array.from(new Set((snapshot?.series ?? []).map((row) => row.route.provider ?? "—"))).sort();
  const shown = selectedSnapshot ? pinned ?? hover : null;

  return <div className="dyn-pet-dash dyn-pet-speed">
    <div className="dyn-pet-dash-head"><h2>{t("speed.tab")}</h2><div className="dyn-pet-dash-tabs">{(["15m", "1h", "5h", "24h"] as SpeedRange[]).map((item) => <button key={item} className={"dyn-pet-dash-tab" + (range === item ? " is-active" : "")} onClick={() => { if (range !== item) { setSnapshot(null); setSelectedKey(null); setRange(item); } }}>{t(`speed.range.${item}`)}</button>)}</div></div>
    <div className="dyn-pet-speed-current"><span>{t("speed.current")}</span><strong>{currentSpeed === null ? "—" : `${currentSpeed.toFixed(2)} tok/s`}</strong><small>{sessionId ?? t("speed.noSession")} · {t("speed.currentNotice")}</small></div>
    <div className="dyn-pet-speed-filters">
      <input aria-label={t("speed.search")} placeholder={t("speed.search")} value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label={t("speed.provider")} value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">{t("speed.allProviders")}</option>{providers.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <select aria-label={t("speed.sort")} value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="name">{t("speed.sortName")}</option><option value="tps">{t("speed.sortSpeed")}</option><option value="sessions">{t("speed.sortSessions")}</option></select>
      <button className="dyn-pet-dash-actbtn" onClick={() => setDir((value) => value === "asc" ? "desc" : "asc")}>{dir === "asc" ? "↑" : "↓"}</button>
    </div>
    {error ? <div className="dyn-pet-dash-error" role="alert">{petErrMsg(error, t)} <button className="dyn-pet-dash-actbtn" onClick={() => { unsupported.current = false; setSelectedKey(null); setError(null); setRetryNonce((value) => value + 1); }}>{t("speed.retry")}</button></div> : null}
    <div className="dyn-pet-speed-layout">
      <aside className="dyn-pet-speed-series" aria-label={t("speed.combinations")}>
        {series.map((row) => <button key={row.key} className={"dyn-pet-speed-series-row" + (selectedKey === row.key ? " is-active" : "")} aria-pressed={selectedKey === row.key} onClick={() => { if (selectedKey !== row.key) { setSnapshot(null); setSelectedKey(row.key); } }}><span>{row.route.provider ?? "—"} / {row.route.model ?? "—"}</span><strong>{row.metrics.tps === null ? "—" : `${row.metrics.tps.toFixed(1)} tok/s`}</strong><small>{t("speed.sessionCount", { n: row.sessions })}</small></button>)}
        {!busy && !series.length ? <div className="dyn-pet-dash-empty">
          {snapshot?.series.length ? t("speed.noMatches") : t("speed.noData")}
          {search || provider ? <button className="dyn-pet-dash-actbtn" onClick={() => { setSearch(""); setProvider(""); }}>{t("speed.clearFilters")}</button> : null}
        </div> : null}
      </aside>
      <section className="dyn-pet-speed-detail">
        <div className="dyn-pet-dash-card-head"><span>{selected ? `${selected.route.provider ?? "—"} / ${selected.route.model ?? "—"}` : t("speed.noSelection")}</span>{pinned ? <button className="dyn-pet-dash-actbtn" onClick={() => setPinned(null)}>{t("speed.clearPin")}</button> : null}</div>
        <div className="dyn-pet-speed-metrics">
          <div><span>{t("speed.streamingTps")}</span><strong>{selected?.metrics.tps?.toFixed(2) ?? "—"}</strong><small>n={selected?.metrics.n ?? 0}</small></div>
          <div><span>{t("speed.ttft")}</span><strong>{selected?.metrics.ttftMs === null || !selected ? "—" : `${selected.metrics.ttftMs.toFixed(0)} ms`}</strong><small>n={selected?.metrics.ttftN ?? 0}</small></div>
          <div><span>{t("speed.modelTime")}</span><strong>{selected?.metrics.modelMs === null || !selected ? "—" : `${(selected.metrics.modelMs / 1000).toFixed(2)} s`}</strong><small>n={selected?.metrics.modelN ?? 0}</small></div>
          <div><span>{t("speed.toolTime")}</span><strong>{selected?.metrics.toolMs === null || !selected ? "—" : `${(selected.metrics.toolMs / 1000).toFixed(2)} s`}</strong><small>n={selected?.metrics.toolN ?? 0}</small></div>
        </div>
        {busy && !snapshot ? <div className="dyn-pet-dash-empty">{t("speed.loading")}</div> : null}
        {snapshot?.coverage === "loading" ? <div className="dyn-pet-dash-notice">{t("speed.historyLoading")}</div> : null}
        {snapshot?.coverage === "limited" ? <div className="dyn-pet-dash-notice">{t("speed.historyLimited")}</div> : null}
        {snapshot?.coverage === "unsupported" ? <div className="dyn-pet-dash-notice">{t("speed.unsupported")}</div> : null}
        {selectedSnapshot && selectedSnapshot.buckets.length ? <SpeedChart buckets={selectedSnapshot.buckets} shown={shown} onHover={setHover} onPin={(selection) => setPinned(cloneSelection(selection))} onReset={() => { setPinned(null); setHover(null); }} /> : null}
        {snapshot && !snapshot.series.length && !busy ? <div className="dyn-pet-dash-empty">{t("speed.emptyRange")}</div> : null}
      </section>
    </div>
  </div>;
}
