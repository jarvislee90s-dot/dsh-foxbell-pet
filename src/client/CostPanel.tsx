import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { apiGetCost, apiGetPriceRules, apiSavePriceRules, apiSyncPricing, petErrMsg } from "./api";
import type { CostRow, CostSnapshot, Currency, PriceRule, RuleSnapshot, UsageQuery, UsageSpan } from "./dashboard-contract";
import { routeKey } from "./dashboard-contract";
import { costSnapshotMatches, shouldAutoSyncCost } from "./dashboard-view";
import { PriceRulesDialog } from "./PriceRulesDialog";
import { t } from "./i18n";
import { fmtMoney, fmtTokens } from "./format";

export type CostRowGroup = { key: string; label: string; rows: CostRow[] };

export function visibleCostRows(rows: CostRow[], mode: "provider" | "model", expanded: boolean): CostRowGroup[] {
  const groups: CostRowGroup[] = [];
  if (mode === "model") {
    for (const row of rows) groups.push({ key: routeKey(row.route), label: `${row.route.provider ?? "—"} / ${row.route.model ?? "—"}`, rows: [row] });
  } else {
    const byProvider = new Map<string, CostRow[]>();
    for (const row of rows) {
      const provider = row.route.provider ?? "—";
      const list = byProvider.get(provider) ?? [];
      list.push(row);
      byProvider.set(provider, list);
    }
    for (const [label, groupRows] of byProvider) groups.push({ key: label, label, rows: groupRows });
  }
  if (expanded) return groups;
  let remaining = 5;
  return groups.map((group) => {
    const selected = group.rows.slice(0, remaining);
    remaining -= selected.length;
    return { ...group, rows: selected };
  }).filter((group) => group.rows.length > 0);
}

export function canExportCost(snapshot: { queryKey: string; csv: string | null } | null, currentQueryKey: string): boolean {
  return !!snapshot && snapshot.queryKey === currentQueryKey && typeof snapshot.csv === "string" && snapshot.csv.length > 0;
}

export function useCostView(active: boolean, query: UsageQuery, span: UsageSpan, usageRevision: number, onWindowConflict?: () => void, syncActive = true) {
  const [lastGood, setLastGood] = useState<{ key: string; snapshot: CostSnapshot } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const generation = useRef(0);
  const attemptedSync = useRef("");
  const syncActiveRef = useRef(syncActive);
  syncActiveRef.current = syncActive;
  const key = JSON.stringify([query, span.from, span.to, usageRevision]);
  const snapshot = lastGood?.key === key ? lastGood.snapshot : null;
  const snapshotKey = lastGood?.key ?? "";
  const currentKey = useRef(key);
  currentKey.current = active ? key : "";

  const reload = useCallback(() => setReloadNonce((value) => value + 1), []);
  useEffect(() => {
    if (!active) return;
    const id = ++generation.current;
    setError(null);
    setBusy(true);
    const current = () => generation.current === id && currentKey.current === key;
    const accept = (value: CostSnapshot): boolean => {
      if (costSnapshotMatches(value, span, usageRevision)) return true;
      onWindowConflict?.();
      return false;
    };
    const load = async (): Promise<void> => {
      try {
        const value = await apiGetCost(query, span, usageRevision);
        if (!current() || !accept(value)) return;
        setLastGood({ key, snapshot: value });
        if (shouldAutoSyncCost({ active, syncActive: syncActiveRef.current, snapshot: value, key, attemptedKey: attemptedSync.current })) {
          attemptedSync.current = key;
          await apiSyncPricing(false);
          if (!current() || !syncActiveRef.current) return;
          const refreshed = await apiGetCost(query, span, usageRevision);
          if (!current() || !accept(refreshed)) return;
          setLastGood({ key, snapshot: refreshed });
        }
      } catch (reason) {
        // A failed refresh must not discard a valid last-good cost response.
        if (current()) {
          if ((reason as { status?: number })?.status === 409) onWindowConflict?.();
          else setError(reason);
        }
      } finally {
        if (current()) setBusy(false);
      }
    };
    void load();
    return () => { generation.current += 1; };
  }, [active, key, reloadNonce]);

  useEffect(() => {
    if (!active) { generation.current += 1; attemptedSync.current = ""; }
  }, [active]);

  // Re-opening a folded card may retry a stale snapshot once. Folding itself does not
  // clear the snapshot or issue a usage/cost request.
  useEffect(() => {
    if (shouldAutoSyncCost({ active, syncActive, snapshot, key, attemptedKey: attemptedSync.current })) reload();
  }, [active, syncActive, snapshot, key, reload]);

  return { snapshot, snapshotKey, queryKey: key, busy, error, reload,
    isCurrent: () => currentKey.current === key,
  };
}

type Props = {
  active: boolean;
  query: UsageQuery;
  span: UsageSpan;
  usageRevision: number;
  onExportReady: (csv: string | null) => void;
  onWindowConflict?: () => void;
};

export function CostPanel({ active, query, span, usageRevision, onExportReady, onWindowConflict }: Props): ReactElement {
  const [costOpen, setCostOpen] = useState(true);
  const view = useCostView(active, query, span, usageRevision, onWindowConflict, costOpen);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [mode, setMode] = useState<"provider" | "model">("provider");
  const [expanded, setExpanded] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [ruleSnapshot, setRuleSnapshot] = useState<RuleSnapshot | null>(null);
  const [editingRoute, setEditingRoute] = useState<CostRow["route"] | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const closeRules = useCallback(() => setEditing(false), []);
  const [syncing, setSyncing] = useState(false);
  const [localError, setLocalError] = useState<unknown>(null);

  useEffect(() => {
    onExportReady(active && canExportCost(view.snapshot ? { queryKey: view.snapshotKey, csv: view.snapshot.csv } : null, view.queryKey) ? view.snapshot!.csv : null);
    return () => onExportReady(null);
  }, [active, view.snapshot, view.snapshotKey, view.queryKey, onExportReady]);

  const groups = useMemo(() => visibleCostRows(view.snapshot?.rows ?? [], mode, expanded), [view.snapshot, mode, expanded]);
  const openRules = async (route?: CostRow["route"]): Promise<void> => {
    try {
      const latest = await apiGetPriceRules();
      const issue = (latest as RuleSnapshot & { error?: { code: string; detail: string } }).error;
      if (issue) throw { code: issue.code, detail: issue.detail, params: {} };
      setRuleSnapshot(latest); setEditingRoute(route); setEditing(true); setLocalError(null);
    } catch (reason) { setLocalError(reason); }
  };
  const saveRules = async (expectedRevision: number, rules: PriceRule[]): Promise<RuleSnapshot> => {
    const saved = await apiSavePriceRules(expectedRevision, rules);
    setRuleSnapshot(saved);
    if (view.isCurrent()) view.reload();
    return saved;
  };
  const manualSync = async (): Promise<void> => {
    setSyncing(true); setLocalError(null);
    try {
      await apiSyncPricing(true);
      if (view.isCurrent()) view.reload();
    } catch (reason) {
      if (view.isCurrent()) setLocalError(reason);
    } finally { setSyncing(false); }
  };

  return (
    <section className="dyn-pet-dash-card dyn-pet-cost">
      <div className="dyn-pet-dash-card-head"><button className="dyn-pet-dash-collapse" aria-expanded={costOpen} onClick={() => setCostOpen((value) => !value)}><span>{t("cost.title")}</span><span>{costOpen ? "−" : "+"}</span></button><div className="dyn-pet-dash-actions">
        <button className="dyn-pet-dash-actbtn" onClick={() => setCurrency(currency === "USD" ? "CNY" : "USD")}>{currency}</button>
        <button className="dyn-pet-dash-actbtn" onClick={() => void openRules()}>{t("cost.manage")}</button>
        <button className="dyn-pet-dash-actbtn" disabled={syncing} onClick={() => void manualSync()}>{syncing ? t("cost.syncing") : t("cost.sync")}</button>
      </div></div>
      {costOpen ? <>
      <p className="dyn-pet-dash-notice">{t("cost.disclaimer")}</p>
      {view.snapshot?.priceState.error ? <p className="dyn-pet-dash-notice">{t("cost.lastGood", { date: view.snapshot.priceState.syncedAt ? new Date(view.snapshot.priceState.syncedAt).toLocaleString() : "—" })}</p> : null}
      {view.busy ? <div className="dyn-pet-dash-empty">{t("dash.loading")}</div> : null}
      {view.error || localError ? <div className="dyn-pet-dash-error" role="alert">{petErrMsg(view.error ?? localError, t)}</div> : null}
      {view.snapshot ? <>
        <div className="dyn-pet-dash-actions">
          <button className={"dyn-pet-dash-actbtn" + (mode === "provider" ? " is-active" : "")} onClick={() => setMode("provider")}>{t("cost.byProvider")}</button>
          <button className={"dyn-pet-dash-actbtn" + (mode === "model" ? " is-active" : "")} onClick={() => setMode("model")}>{t("cost.byModel")}</button>
        </div>
        <div className="dyn-pet-cost-head"><span>{t("cost.route")}</span><span>{t("cost.estimate")}</span><span>{t("cost.tokens")}</span><span>{t("cost.hit")}</span><span>{t("cost.details")}</span></div>
        {groups.map((group) => <div className="dyn-pet-cost-group" key={group.key}>
          {mode === "provider" ? <div className="dyn-pet-cost-provider">{group.label}</div> : null}
          {group.rows.map((row) => {
            const key = routeKey(row.route);
            const reading = currency === "USD" ? row.usd : row.cny;
            const pricing = row.pricing?.[currency] ?? row;
            const open = openRows.has(key);
            return <div key={key}>
              <div className="dyn-pet-cost-row">
                <span title={`${row.route.provider ?? "—"}/${row.route.model ?? "—"}`}>{mode === "model" ? `${row.route.provider ?? t("dash2.unknown")} / ${row.route.model ?? t("dash2.unknown")}` : row.route.model ?? t("dash2.unknown")}</span>
                <strong>{reading.amount === null ? "—" : `${currency === "USD" ? "$" : "¥"}${fmtMoney(reading.amount)}`}<small>{t(`cost.status.${reading.status}`)}</small></strong>
                <span>{row.tokenUsage === null ? "—" : fmtTokens(row.tokenUsage)}</span>
                <span>{row.hitPct === null ? "—" : `${(row.hitPct * 100).toFixed(1)}%`}</span>
                <button className="dyn-pet-dash-actbtn" aria-expanded={open} onClick={() => setOpenRows((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; })}>{open ? "−" : "+"}</button>
              </div>
              {open ? <div className="dyn-pet-cost-detail">
                <div>{t("cost.coverage")}: {reading.coverageRate === null ? "—" : `${(reading.coverageRate * 100).toFixed(1)}%`} · {t("cost.pricedTokens")}: {reading.pricedTokens} · {t("cost.unpricedTokens")}: {reading.unpricedTokens ?? "—"}</div>
                <div>{t("cost.basis")}: {t(`cost.basis.${pricing.pricingBasis}`)} · {t("cost.rule")}: {t(`cost.rule.${pricing.priceRuleKind}`)} · {pricing.timePriceDailyFallback ? t("cost.dailyFallback") : ""}</div>
                <button className="dyn-pet-dash-actbtn" onClick={() => void openRules(row.route)}>{t("cost.manage")}</button>
                {row.details[currency].map((detail) => <div className="dyn-pet-cost-detail-row" key={detail.bucket}><span>{t(`cost.bucket.${detail.bucket}`)}</span><span>{detail.tokens ?? "—"}</span><span>{detail.unitPrice === null ? "—" : `${detail.unitPrice} / 1M`}</span><span>{detail.amount === null ? "—" : fmtMoney(detail.amount)}</span><small>{[detail.source, detail.converted ? t("cost.converted") : null, detail.sourceAt == null ? null : new Date(detail.sourceAt).toLocaleDateString()].filter(Boolean).join(" · ")}</small></div>)}
              </div> : null}
            </div>;
          })}
        </div>)}
        {view.snapshot.rows.length > 5 ? <button className="dyn-pet-dash-actbtn" onClick={() => setExpanded((value) => !value)}>{expanded ? t("cost.showLess") : t("cost.showAll", { count: view.snapshot.rows.length })}</button> : null}
      </> : null}
      </> : null}
      {editing && ruleSnapshot ? <PriceRulesDialog initial={ruleSnapshot} route={editingRoute} onSave={saveRules} onClose={closeRules} /> : null}
    </section>
  );
}


