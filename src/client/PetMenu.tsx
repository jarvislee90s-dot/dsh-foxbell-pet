// PetMenu.tsx — 右键菜单（MAM PetMenu.tsx 结构基准 + 本插件四场景动作绑定与切换宠物子菜单）。
// 主页：🔊出声 / 💬语音字幕 / 🧲物理坠落（无语音/无字幕宠物对应行禁用带提示）
//       ─ 📏大小（三档缩放）─ 🖱️双击 / 🔴红灯 / 🟥深红灯 / 🟢绿灯 四场景动作绑定（实时预览）
//       ─ 🔁切换宠物（当前项打勾，点击即热切换）─ 🦊隐藏桌宠 ─ ℹ️关于
import React, { useEffect } from "react";
import { CFG_ACTIONS, CFG_SCALES, type PetAction, type PetConfig, type PetScale } from "./config";
import { cfgStore } from "./store";
import type { PetAnimKey } from "./animations";
import type { PetSummary } from "./api";
import { t } from "./i18n";
import { openDialog } from "./dialogs/host";

export type MenuPage = null | "Size" | "Dbl" | "Approval" | "Error" | "Done" | "SwitchPet" | "About";

const ACTION_PAGE: Record<"Dbl" | "Approval" | "Error" | "Done", keyof PetConfig> = {
  Dbl: "dblAction",
  Approval: "approvalAction",
  Error: "errorAction",
  Done: "doneAction",
};

export const PLUGIN_VERSION = "v2.0.0"; // validate 校验与 package.json 一致

export function PetMenu(props: {
  page: MenuPage;
  setPage(p: MenuPage): void;
  cfg: PetConfig;
  scale: number;
  voiceCapable: boolean;
  subtitleCapable: boolean;
  activePetId: string;
  pets: PetSummary[];
  onClose(): void;
  onPreview(action: PetAnimKey | null): void;
  onHide(): void;
  onSwitchPet(id: string): void;
}): React.ReactElement {
  const { page, setPage, cfg, onPreview, onClose } = props;

  // 动作子页实时预览（MAM B4）：进入/切选项都触发；返回主菜单/关闭即停
  useEffect(() => {
    if (page && page in ACTION_PAGE) onPreview(cfg[ACTION_PAGE[page as keyof typeof ACTION_PAGE]] as PetAnimKey);
    else if (page === null) onPreview(null);
  }, [page, cfg, onPreview]);

  const actionLabel = (a: PetAction) => t(`action.${a}`);
  const scaleLabel = (s: PetScale) =>
    s === 0.75 ? t("scale.small") : s === 1 ? t("scale.medium") : t("scale.large");

  const Toggle = (p: { label: string; on: boolean; disabled?: boolean; title?: string; onChange(v: boolean): void }) => (
    <div
      className={"dyn-pet-menu-row" + (p.disabled ? " disabled" : "")}
      title={p.disabled ? p.title : undefined}
      onClick={() => { if (!p.disabled) p.onChange(!p.on); }}
    >
      <span>{p.label}</span>
      <button
        className={"dyn-pet-menu-btn" + (p.on && !p.disabled ? " on" : "")}
        onClick={(e) => { e.stopPropagation(); if (!p.disabled) p.onChange(!p.on); }}
      >
        {p.on && !p.disabled ? t("menu.on") : t("menu.off")}
      </button>
    </div>
  );

  const Sub = (p: { label: string; value: string; onOpen(): void }) => (
    <div className="dyn-pet-menu-sub" onClick={p.onOpen}>
      <span>{p.label}</span>
      <span className="dyn-pet-menu-val">{p.value}</span>
    </div>
  );

  let body: React.ReactNode;
  if (page === "About") {
    body = (
      <div className="dyn-pet-menu-item" onClick={onClose}>
        {`dsh-foxbell-pet ${PLUGIN_VERSION}`}
      </div>
    );
  } else if (page === "Size") {
    body = (
      <>
        <div className="dyn-pet-menu-item" onClick={() => setPage(null)}>{t("menu.back")}</div>
        {CFG_SCALES.map((s) => (
          <div
            key={s}
            className={"dyn-pet-menu-item" + (cfg.scale === s ? " sel" : "")}
            onClick={() => { cfgStore.set({ scale: s }); setPage(null); }}
          >
            {scaleLabel(s)}
          </div>
        ))}
      </>
    );
  } else if (page === "SwitchPet") {
    body = (
      <>
        <div className="dyn-pet-menu-item" onClick={() => setPage(null)}>{t("menu.back")}</div>
        {props.pets.map((p) => (
          <div
            key={p.id}
            className={"dyn-pet-menu-item" + (p.id === props.activePetId ? " sel" : "")}
            onClick={() => { if (p.id !== props.activePetId) props.onSwitchPet(p.id); else onClose(); }}
          >
            {(p.id === props.activePetId ? "✓ " : "") + (p.displayName || p.id)}
          </div>
        ))}
        <div className="dyn-pet-menu-divider" />
        <div className="dyn-pet-menu-item" onClick={() => { onClose(); openDialog("switch", {}); }}>
          {t("switch.title")}…
        </div>
      </>
    );
  } else if (page && page in ACTION_PAGE) {
    const field = ACTION_PAGE[page as keyof typeof ACTION_PAGE];
    body = (
      <>
        <div className="dyn-pet-menu-item" onClick={() => setPage(null)}>{t("menu.back")}</div>
        {CFG_ACTIONS.map((a) => (
          <div
            key={a}
            className={"dyn-pet-menu-item" + (cfg[field] === a ? " sel" : "")}
            onClick={() => { cfgStore.set({ [field]: a } as Partial<PetConfig>); setPage(null); }}
          >
            {actionLabel(a)}
          </div>
        ))}
      </>
    );
  } else {
    body = (
      <>
        <Toggle
          label={t("menu.sound")}
          on={!cfg.muted}
          disabled={!props.voiceCapable}
          title={!props.voiceCapable ? t("menu.soundNoCap") : undefined}
          onChange={(v) => cfgStore.set({ muted: !v })}
        />
        <Toggle
          label={t("menu.subtitle")}
          on={cfg.talkative}
          disabled={!props.subtitleCapable}
          title={!props.subtitleCapable ? t("menu.subtitleNoCap") : undefined}
          onChange={(v) => cfgStore.set({ talkative: v })}
        />
        <Toggle label={t("menu.physics")} on={cfg.gravity} onChange={(v) => cfgStore.set({ gravity: v })} />
        <div className="dyn-pet-menu-divider" />
        <Sub label={t("menu.size")} value={scaleLabel(cfg.scale)} onOpen={() => setPage("Size")} />
        <Sub label={t("menu.dblAction")} value={actionLabel(cfg.dblAction)} onOpen={() => setPage("Dbl")} />
        <Sub label={t("menu.approvalAction")} value={actionLabel(cfg.approvalAction)} onOpen={() => setPage("Approval")} />
        <Sub label={t("menu.errorAction")} value={actionLabel(cfg.errorAction)} onOpen={() => setPage("Error")} />
        <Sub label={t("menu.doneAction")} value={actionLabel(cfg.doneAction)} onOpen={() => setPage("Done")} />
        <div className="dyn-pet-menu-divider" />
        <Sub
          label={t("menu.switchPet")}
          value={props.pets.find((p) => p.id === props.activePetId)?.displayName ?? props.activePetId}
          onOpen={() => setPage("SwitchPet")}
        />
        <div className="dyn-pet-menu-item" onClick={props.onHide}>{t("menu.hide")}</div>
        <div className="dyn-pet-menu-item" onClick={() => setPage("About")}>{t("menu.about")}</div>
      </>
    );
  }

  return (
    <div className="dyn-pet-menu" data-testid="pet-menu" style={{ fontSize: Math.round(13 * props.scale) }}>
      {body}
    </div>
  );
}
