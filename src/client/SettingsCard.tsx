// SettingsCard.tsx — 设置卡（settings.plugin.item，key='foxbell-pet'）。
// 结构对齐官方 PluginCard：header 按钮 + chevron，默认折叠（useState(false)），
// 展开区才渲染控件；双分区「配置」+「宠物管理」。
// 读写与右键菜单同一个 cfgStore，双向同步（v1.3.0 语义不变）。
import React, { useEffect, useState } from "react";
import { CFG_ACTIONS, CFG_SCALES, type PetAction, type PetConfig, type PetScale } from "./config";
import { appStore, cfgStore } from "./store";
import { openDialog } from "./dialogs/host";
import { t } from "./i18n";

function Chevron({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      className={"dyn-pet-card-chevron" + (open ? " open" : "")}
      width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden
    >
      <path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsCard(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<PetConfig>(cfgStore.getSnapshot());
  useEffect(() => cfgStore.subscribe(() => setCfg(cfgStore.getSnapshot())), []);
  const [activeName, setActiveName] = useState<string>("");
  useEffect(
    () =>
      appStore.subscribe(() => {
        const rt = appStore.getRuntime();
        setActiveName(rt.name || rt.id);
      }),
    []
  );
  useEffect(() => {
    const rt = appStore.getRuntime();
    setActiveName(rt.name || rt.id);
  }, []);

  const toggle = (k: keyof PetConfig, v: unknown) => cfgStore.set({ [k]: v } as Partial<PetConfig>);
  const actionLabel = (a: PetAction) => t(`action.${a}`);
  const scaleLabel = (s: PetScale) => (s === 0.75 ? t("scale.small") : s === 1 ? t("scale.medium") : t("scale.large"));
  const title = t("settings.cardTitle");

  return (
    <li className={"dyn-pet-card" + (open ? " open" : "")}>
      <button
        type="button"
        className="dyn-pet-card-header"
        aria-expanded={open}
        aria-label={`${open ? t("settings.collapse") : t("settings.expand")}: ${title}`}
        onClick={() => setOpen(!open)}
      >
        <span className="dyn-pet-card-headtext">
          <span className="dyn-pet-card-name">{title}</span>
          <span className="dyn-pet-card-desc">{t("settings.cardDescription")}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="dyn-pet-card-body dyn-pet-settings">
          <div className="dyn-pet-settings-section">{t("settings.configSection")}</div>
          <label className="dyn-pet-settings-row">
            <span>{t("settings.muted")}</span>
            <input type="checkbox" checked={!cfg.muted} onChange={(e) => toggle("muted", !e.target.checked)} />
          </label>
          <label className="dyn-pet-settings-row">
            <span>{t("settings.talkative")}</span>
            <input type="checkbox" checked={cfg.talkative} onChange={(e) => toggle("talkative", e.target.checked)} />
          </label>
          <label className="dyn-pet-settings-row">
            <span>{t("settings.gravity")}</span>
            <input type="checkbox" checked={cfg.gravity} onChange={(e) => toggle("gravity", e.target.checked)} />
          </label>
          {(["dblAction", "approvalAction", "runningAction", "errorAction", "doneAction"] as const).map((k) => (
            <div key={k} className="dyn-pet-settings-row">
              <span>{t(`settings.${k}`)}</span>
              <select value={cfg[k]} onChange={(e) => toggle(k, e.target.value)}>
                {CFG_ACTIONS.map((a) => (
                  <option key={a} value={a}>{actionLabel(a)}</option>
                ))}
              </select>
            </div>
          ))}
          <div className="dyn-pet-settings-row">
            <span>{t("settings.scale")}</span>
            <span className="dyn-pet-scale-group">
              {CFG_SCALES.map((s) => (
                <button
                  key={s}
                  className={"dyn-pet-scale-btn" + (cfg.scale === s ? " on" : "")}
                  onClick={() => toggle("scale", s)}
                >
                  {scaleLabel(s)}
                </button>
              ))}
            </span>
          </div>

          <div className="dyn-pet-settings-section">{t("settings.petSection")}</div>
          <div className="dyn-pet-settings-row">
            <span>{t("settings.currentPet")}</span>
            <strong className="dyn-pet-current-pet">{activeName || cfg.activePetId}</strong>
          </div>
          <div className="dyn-pet-settings-row dyn-pet-settings-actions">
            <button className="dyn-pet-btn plain" onClick={() => openDialog("switch", {})}>{t("settings.switchPet")}</button>
            <button className="dyn-pet-btn plain" onClick={() => openDialog("import", {})}>{t("settings.importPet")}</button>
            <button className="dyn-pet-btn plain" onClick={() => openDialog("manage", {})}>{t("settings.managePet")}</button>
          </div>
          <div className="dyn-pet-settings-row">
            <a className="dyn-pet-petdex-link" href="https://petdex.dev" target="_blank" rel="noopener noreferrer">
              {t("settings.petdex")} ↗
            </a>
          </div>
        </div>
      ) : null}
    </li>
  );
}