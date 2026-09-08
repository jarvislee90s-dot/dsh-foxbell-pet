// SettingsCard.tsx — 设置卡（settings.plugin.item，key='foxbell-pet'）。
// v2 单卡双分区：「配置」区（现有配置项 + 三档缩放 0.75/1/1.25）与
// 「宠物管理」区（当前宠物、切换/导入/管理按钮、Petdex 入口）。不新增第二张设置卡。
// 读写与右键菜单同一个 cfgStore，双向同步（v1.3.0 语义不变）。
import React, { useEffect, useState } from "react";
import { CFG_ACTIONS, CFG_SCALES, type PetAction, type PetConfig, type PetScale } from "./config";
import { appStore, cfgStore } from "./store";
import { openDialog } from "./dialogs/host";
import { t } from "./i18n";

export function SettingsCard(): React.ReactElement {
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

  return (
    <div className="dyn-pet-settings">
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
      {(["dblAction", "approvalAction", "errorAction", "doneAction"] as const).map((k) => (
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
  );
}
