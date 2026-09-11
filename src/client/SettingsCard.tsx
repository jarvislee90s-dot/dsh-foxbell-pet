// SettingsCard.tsx — 设置卡（settings.plugin.item，key='foxbell-pet'）。
// 结构对齐官方 PluginCard：header 按钮 + chevron，默认折叠（useState(false)），
// 展开区才渲染控件；双分区「配置」+「宠物管理」。
// v2.1 草稿化（v1.4.0 SettingsCard 移植，源锚点 git show 886b303:src/client.js L1130-1235）：
// 全部控件（3 基础开关 + 12 看板键 + 5 动作下拉 + 缩放）只写 draft，不直写 cfgStore；
// 「保存」一次性 diff 提交 cfgStore.set(patch)，数字键先转 Number（根因修复：字符串写入
// 会被宿主 z.number() 拒绝而静默丢配）+ NUM_RANGE 钳制；头部状态字收起态可见；
// 外部变更（右键菜单/宠物管理写同键）仅无未保存修改时 rebase draft。
import React, { useEffect, useRef, useState } from "react";
import { CFG_ACTIONS, CFG_SCALES, type PetAction, type PetConfig, type PetScale } from "./config";
import { POSE_KEYS } from "./animations";
import { appStore, cfgStore } from "./store";
import { openDialog } from "./dialogs/host";
import { t } from "./i18n";
import {
  DASH_BOOL_KEYS, DASH_NUM_ROWS,
  buildSavePatch, isBadNumValue, isDraftDirty, type DraftConfig,
} from "./settingsdraft";

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
  const [draft, setDraft] = useState<DraftConfig>(cfgStore.getSnapshot());
  const [savedFlash, setSavedFlash] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => cfgStore.subscribe(() => {
    const next = cfgStore.getSnapshot();
    setCfg(next);
    if (!dirtyRef.current) setDraft(next); // 外部变更（右键菜单/宠物管理）仅在无未保存修改时跟随
  }), []);
  useEffect(() => {
    if (!savedFlash) return;
    const timer = setTimeout(() => setSavedFlash(false), 1600);
    return () => clearTimeout(timer);
  }, [savedFlash]);
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

  const setDraftKey = (k: keyof PetConfig, v: unknown) => {
    dirtyRef.current = true;
    setDraft((d) => ({ ...d, [k]: v }) as DraftConfig);
  };
  const badCount = DASH_NUM_ROWS.filter((k) => isBadNumValue(draft[k])).length;
  const dirty = isDraftDirty(draft, cfg);
  const save = () => {
    if (!dirty || badCount > 0) return;
    const patch = buildSavePatch(draft, cfg);
    cfgStore.set(patch);
    dirtyRef.current = false;
    const next = cfgStore.getSnapshot(); // set() 同步 emit 且 pending 合并：快照已含钳制后提交值
    setCfg(next);
    setDraft(next); // 提交后草稿对齐已存值（清除 "12.4" 这类编辑残差，重开卡不再误报未保存）
    setSavedFlash(true);
    setOpen(false); // 保存成功自动收起（宿主 PluginCard 同款行为）
  };
  const discard = () => { dirtyRef.current = false; setDraft(cfgStore.getSnapshot()); };
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
        {badCount > 0 ? (
          <span className="dyn-pet-settings-dirty">{t("dash.invalidNums", { n: badCount })}</span>
        ) : dirty ? (
          <span className="dyn-pet-settings-dirty">{t("dash.unsaved")}</span>
        ) : savedFlash ? (
          <span className="dyn-pet-settings-saved">{t("dash.saved")}</span>
        ) : null}
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="dyn-pet-card-body dyn-pet-settings">
          <div className="dyn-pet-settings-section">{t("settings.configSection")}</div>
          <label className="dyn-pet-settings-row">
            <span>{t("settings.muted")}</span>
            <input type="checkbox" checked={!draft.muted} onChange={(e) => setDraftKey("muted", !e.target.checked)} />
          </label>
          <label className="dyn-pet-settings-row">
            <span>{t("settings.talkative")}</span>
            <input type="checkbox" checked={draft.talkative} onChange={(e) => setDraftKey("talkative", e.target.checked)} />
          </label>
          <label className="dyn-pet-settings-row">
            <span>{t("settings.gravity")}</span>
            <input type="checkbox" checked={draft.gravity} onChange={(e) => setDraftKey("gravity", e.target.checked)} />
          </label>
          {/* v2.1 看板 12 键（v1.4.0 boolRows2 + numRows）：配置区内、动作下拉之前 */}
          {DASH_BOOL_KEYS.map((k) => (
            <label key={k} className="dyn-pet-settings-row">
              <span>{t(`dash.cfg.${k}`)}</span>
              <input type="checkbox" checked={!!draft[k]} onChange={(e) => setDraftKey(k, e.target.checked)} />
            </label>
          ))}
          {DASH_NUM_ROWS.map((k) => (
            <label key={k} className={"dyn-pet-settings-row" + (isBadNumValue(draft[k]) ? " bad" : "")}>
              <span>{t(`dash.cfg.${k}`)}</span>
              <input type="number" value={draft[k]} onChange={(e) => setDraftKey(k, e.target.value)} />
            </label>
          ))}
          {/* 纯 token 口径说明：静态提示行，不可交互 */}
          <div className="dyn-pet-settings-note">{t("dash.caliberNote")}</div>
          {/* v2.2 导出 3 键（Task 14 R8）：布尔→复选 / 字符串→文本域 / 枚举→下拉（random + ANIM 键） */}
          <label className="dyn-pet-settings-row">
            <span>{t("dash.cfg.dashboardSidebarEntry")}</span>
            <input type="checkbox" checked={draft.dashboardSidebarEntry} onChange={(e) => setDraftKey("dashboardSidebarEntry", e.target.checked)} />
          </label>
          <label className="dyn-pet-settings-row">
            <span>{t("dash.cfg.exportQuote")}</span>
            <textarea
              className="dyn-pet-settings-quote"
              rows={2}
              maxLength={2000}
              placeholder={t("dash.cfg.exportQuote")}
              value={draft.exportQuote}
              onChange={(e) => setDraftKey("exportQuote", e.target.value)}
            />
          </label>
          <div className="dyn-pet-settings-row">
            <span>{t("dash.cfg.exportPose")}</span>
            <select value={draft.exportPose} onChange={(e) => setDraftKey("exportPose", e.target.value)}>
              {POSE_KEYS.map((p) => (
                <option key={p} value={p}>{p === "random" ? t("dash.pose.random") : t(`dash.pose.${p}`)}</option>
              ))}
            </select>
          </div>
          {(["dblAction", "approvalAction", "runningAction", "errorAction", "doneAction"] as const).map((k) => (
            <div key={k} className="dyn-pet-settings-row">
              <span>{t(`settings.${k}`)}</span>
              <select value={draft[k]} onChange={(e) => setDraftKey(k, e.target.value)}>
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
                  className={"dyn-pet-scale-btn" + (draft.scale === s ? " on" : "")}
                  onClick={() => setDraftKey("scale", s)}
                >
                  {scaleLabel(s)}
                </button>
              ))}
            </span>
          </div>
          <div className="dyn-pet-settings-savebar">
            <button className="dyn-pet-settings-discard" onClick={discard}>{t("dash.discard")}</button>
            <button
              className="dyn-pet-settings-save"
              disabled={!dirty || badCount > 0}
              onClick={save}
            >
              {t("dash.save")}
            </button>
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
