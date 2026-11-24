import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { petErrMsg } from "./api";
import type { Bucket, PriceCells, PriceRule, Route, RuleSnapshot } from "./dashboard-contract";
import { Btn, InlineError, Modal } from "./dialogs/common";
import { t } from "./i18n";

const BUCKETS: Bucket[] = ["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"];
const emptyCells = (): PriceCells => ({ inputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function attemptSavePriceDraft(
  draft: PriceRule[],
  revision: number,
  save: (expectedRevision: number, rules: PriceRule[]) => Promise<RuleSnapshot>,
): Promise<{ ok: true; snapshot: RuleSnapshot } | { ok: false; error: unknown; draft: PriceRule[]; revision: number }> {
  try { return { ok: true, snapshot: await save(revision, draft) }; }
  catch (error) { return { ok: false, error, draft, revision }; }
}

function blankRule(route?: Route): PriceRule {
  return { kind: "fixed", model: route?.model ?? "", provider: route?.provider ?? null, currency: "USD", prices: emptyCells() };
}

function Cells({ value, onChange, labelledBy }: { value: PriceCells; onChange: (next: PriceCells) => void; labelledBy: string }) {
  return <div className="dyn-pet-price-cells" role="group" aria-labelledby={labelledBy}>{BUCKETS.map((bucket) => <label key={bucket}><span>{t(`cost.bucket.${bucket}`)}</span><input inputMode="decimal" value={value[bucket] ?? ""} placeholder="—" onChange={(event) => onChange({ ...value, [bucket]: event.target.value === "" ? null : event.target.value })} /></label>)}</div>;
}

export function PriceRulesDialog({ initial, route, onSave, onClose }: {
  initial: RuleSnapshot;
  route?: Route;
  onSave: (expectedRevision: number, rules: PriceRule[]) => Promise<RuleSnapshot>;
  onClose: () => void;
}): ReactElement {
  const [rules, setRules] = useState<PriceRule[]>(() => {
    const draft = clone(initial.rules);
    if (route && !draft.some((rule) => rule.model === route.model && rule.provider === route.provider)) draft.push(blankRule(route));
    return draft.length ? draft : [blankRule(route)];
  });
  const revision = initial.revision;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = (): HTMLElement[] => Array.from(host.current?.querySelectorAll<HTMLElement>('button,input,select,[tabindex="0"]') ?? []).filter((node) => !node.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);

  const update = (index: number, next: PriceRule): void => setRules((old) => old.map((rule, i) => i === index ? next : rule));
  const save = async (): Promise<void> => {
    setBusy(true); setError(null);
    try {
      const result = await attemptSavePriceDraft(rules, revision, onSave);
      if (result.ok) { onClose(); return; }
      const reason = result.error;
      setError(reason);
      // Keep the original revision with the draft; adopting a newer revision would
      // let the next click overwrite rules saved in another tab without review.
    } finally { setBusy(false); }
  };

  return <div ref={host} className="dyn-pet-price-dialog-focus">
    <Modal title={t("cost.manage")} wide onClose={onClose} footer={<><Btn onClick={onClose} disabled={busy}>{t("common.cancel")}</Btn><Btn kind="primary" onClick={() => void save()} disabled={busy}>{busy ? t("cost.saving") : t("cost.save")}</Btn></>}>
      <p>{t("cost.ruleHelp")}</p>
      <InlineError msg={error ? petErrMsg(error, t) : null} />
      {rules.map((rule, index) => <fieldset className="dyn-pet-price-rule" key={index}>
        <legend>{t("cost.ruleN", { n: index + 1 })}</legend>
        <div className="dyn-pet-price-rule-grid">
          <label>{t("cost.model")}<input value={rule.model} onChange={(event) => update(index, { ...rule, model: event.target.value })} /></label>
          <label>{t("cost.providerOptional")}<input value={rule.provider ?? ""} onChange={(event) => update(index, { ...rule, provider: event.target.value || null })} /></label>
          <label>{t("cost.currency")}<select value={rule.currency} onChange={(event) => update(index, { ...rule, currency: event.target.value as "USD" | "CNY" })}><option>USD</option><option>CNY</option></select></label>
          <label>{t("cost.kind")}<select value={rule.kind} onChange={(event) => {
            if (event.target.value === "fixed") update(index, { kind: "fixed", model: rule.model, provider: rule.provider, currency: rule.currency, prices: rule.kind === "fixed" ? rule.prices : rule.offpeak });
            else update(index, { kind: "time", model: rule.model, provider: rule.provider, currency: rule.currency, zone: "local", windows: [{ start: 9, end: 18 }], peak: rule.kind === "fixed" ? rule.prices : rule.peak, offpeak: rule.kind === "time" ? rule.offpeak : emptyCells() });
          }}><option value="fixed">{t("cost.fixed")}</option><option value="time">{t("cost.time")}</option></select></label>
        </div>
        {rule.kind === "fixed" ? <><span id={`price-fixed-${index}`}>{t("cost.fixedPrices")}</span><Cells labelledBy={`price-fixed-${index}`} value={rule.prices} onChange={(prices) => update(index, { ...rule, prices })} /></> : <>
          <label>{t("cost.zone")}<select value={rule.zone} onChange={(event) => update(index, { ...rule, zone: event.target.value as "local" | "asiaShanghai" | "utc" })}><option value="local">{t("cost.zone.local")}</option><option value="asiaShanghai">{t("cost.zone.asiaShanghai")}</option><option value="utc">UTC</option></select></label>
          <div className="dyn-pet-price-windows"><span>{t("cost.windows")}</span>{rule.windows.map((window, wi) => <span key={wi}><input aria-label={t("cost.windowStart")} type="number" min={0} max={23} value={window.start} onChange={(event) => update(index, { ...rule, windows: rule.windows.map((item, i) => i === wi ? { ...item, start: Number(event.target.value) } : item) })} />–<input aria-label={t("cost.windowEnd")} type="number" min={0} max={24} value={window.end} onChange={(event) => update(index, { ...rule, windows: rule.windows.map((item, i) => i === wi ? { ...item, end: Number(event.target.value) } : item) })} /><Btn onClick={() => update(index, { ...rule, windows: rule.windows.filter((_, i) => i !== wi) })}>−</Btn></span>)}<Btn onClick={() => update(index, { ...rule, windows: [...rule.windows, { start: 18, end: 23 }] })}>+</Btn></div>
          <span id={`price-peak-${index}`}>{t("cost.peakPrices")}</span><Cells labelledBy={`price-peak-${index}`} value={rule.peak} onChange={(peak) => update(index, { ...rule, peak })} />
          <span id={`price-offpeak-${index}`}>{t("cost.offpeakPrices")}</span><Cells labelledBy={`price-offpeak-${index}`} value={rule.offpeak} onChange={(offpeak) => update(index, { ...rule, offpeak })} />
        </>}
        <Btn kind="danger" onClick={() => setRules((old) => old.filter((_, i) => i !== index))}>{t("cost.removeRule")}</Btn>
      </fieldset>)}
      <Btn onClick={() => setRules((old) => [...old, blankRule(route)])}>{t("cost.addRule")}</Btn>
      <p className="dyn-pet-dash-notice">{t("cost.saveSummary", { revision })}</p>
    </Modal>
  </div>;
}
