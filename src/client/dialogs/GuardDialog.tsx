// dialogs/GuardDialog.tsx — 激活守卫修复对话（MAM PetStartupGuard.tsx 移植）。
// 触发：插件激活（快照 guard 非空且未忽略）与每次切换（activate 返回 mismatch/invalid-sheet）。
// 选项：更新清单（自动备份）/ 换回 foxbell / 忽略并继续 / 隐藏宠物。
// fatal（图集缺失/目录缺失）无「更新清单」。宠物本体运行中不弹（Pet.tsx busyRef 闸门）。
import React, { useState } from "react";
import { apiPost, petErrMsg, petSheetUrl, type ActivateResult, type GuardIssue } from "../api";
import { nameFromRel, rowsFromSize, spriteVersionOf, type PetManifestView, type PetScan } from "../validation";
import { probeSheetSize, probeWithRetry } from "./probe";
import { Btn, InlineError, InlineOk, Modal, Spinner } from "./common";
import { t } from "../i18n";
import { appStore, cfgStore, fetchManifest, petStore } from "../store";
import { guardSignature, saveGuardIgnored } from "../config";
import type { GuardDialogProps } from "./host";

export function GuardDialog(props: GuardDialogProps & { onClose(): void }): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fatal = !!props.fatal || props.issues.some((i) => i.fatal) || props.issues.some((i) => i.kind === "spritesheet-missing" || i.kind === "pet-dir-missing");
  const canRepair = !fatal && props.plan?.canRepair !== false;

  const choose = (choice: "update" | "ignore" | "foxbell" | "hide") => {
    props.onResolved?.(choice);
    props.onClose();
  };

  const doUpdate = async () => {
    setBusy(true); setError(null);
    try {
      const id = props.targetId;
      const scan = await apiPost<PetScan>("/api/scan", { id });
      if (!scan.spritesheet.exists) throw new Error(t("switch.invalidSheet"));
      let rows: 9 | 11 | null = null;
      try {
        const size = await probeSheetSize(petSheetUrl(id));
        rows = rowsFromSize(size.w, size.h);
      } catch { rows = null; }
      const old = await fetchManifest(id);
      if (!rows) {
        const recorded = old?.spriteVersionNumber ?? 0;
        if (recorded === 1 || recorded === 2) rows = recorded === 2 ? 11 : 9;
        else rows = props.plan?.manifestMissing ? 9 : null; // 直投未激活且探测失败：MAM doUpdate 兜底 9
      }
      if (!rows) throw new Error(t("import.sheetInvalid"));
      const keep = props.plan
        ? props.plan.keepVoices
        : (old?.voices ?? []).filter((v) => scan.voiceFiles.some((f) => f.rel === v.file && f.size === v.sizeBytes));
      const reprobeRels = props.plan
        ? props.plan.reprobes.map((r) => r.rel)
        : scan.voiceFiles
            .filter((f) => /\.(m4a|mp3|wav|ogg|opus|flac|aac)$/i.test(f.rel))
            .map((f) => f.rel)
            .filter((rel) => !keep.some((v) => v.file === rel));
      const probed = await Promise.all(
        reprobeRels.map(async (rel) => {
          const url = `/dyn-pet-foxbell/pets/${encodeURIComponent(id)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
          const size = scan.voiceFiles.find((f) => f.rel === rel)?.size ?? 0;
          return { rel, size, durationMs: await probeWithRetry(url) };
        })
      );
      const validNew = probed.filter((p) => p.durationMs !== null && p.durationMs > 1000 && p.durationMs < 20000 && p.size <= 10 * 1024 * 1024);
      const voices = [
        ...keep,
        ...validNew.map((p) => ({
          group: p.rel.split("/")[1], name: nameFromRel(p.rel), file: p.rel, sizeBytes: p.size, durationMs: p.durationMs as number,
        })),
      ];
      const hasVoice = ["general", "approval", "done", "error"].every((g) =>
        voices.some((v) => v.group === g && v.durationMs > 1000 && v.durationMs < 20000 && v.sizeBytes <= 10 * 1024 * 1024));
      const manifestMissing = !old;
      const next: PetManifestView = {
        id,
        displayName: old?.displayName || id,
        description: old?.description ?? "",
        source: old?.source ?? "folder",
        spriteVersionNumber: spriteVersionOf(rows),
        spritesheetSizeBytes: scan.spritesheet.size,
        hasVoice,
        hasSubtitle: hasVoice && (manifestMissing ? true : (old?.hasSubtitle ?? false)),
        voices,
      };
      await apiPost("/api/manifest-update", { id, manifest: next, backup: !manifestMissing });
      setOk(t("startup.updated"));
      saveGuardIgnored(""); // 已修复：清除忽略签名
      appStore.refresh();
      props.onResolved?.("update");
      props.onClose();
    } catch (e) {
      // 失败不静默：错误内联展示，弹窗保持，可重试（MAM doUpdate 同款）
      setError(petErrMsg(e, t));
    } finally { setBusy(false); }
  };

  const doFoxbell = () => {
    cfgStore.set({ activePetId: "foxbell" });
    appStore.refresh();
    setOk(t("startup.switched"));
    choose("foxbell");
  };

  const doIgnore = () => {
    saveGuardIgnored(guardSignature(props.targetId, props.issues as GuardIssue[]));
    choose("ignore");
  };

  const doHide = () => {
    petStore.set(false);
    choose("hide");
  };

  return (
    <Modal title={t("startup.title")} onClose={props.onClose}>
      <InlineError msg={error} />
      <InlineOk msg={ok} />
      {fatal ? (
        <div className="dyn-pet-guard-fatal">
          {t("startup.fatal", { msg: props.issues.map((i) => t(`issue.${i.kind}`) + (i.detail ? `：${i.detail}` : "")).join("；") })}
        </div>
      ) : (
        <div>
          <div>{t("startup.issuesTitle")}</div>
          <ul className="dyn-pet-issue-list">
            {props.issues.map((i, k) => (
              <li key={k}>{t(`issue.${i.kind}`)}{i.detail ? `：${i.detail}` : ""}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="dyn-pet-guard-actions">
        {canRepair ? (
          <Btn kind="primary" onClick={() => { void doUpdate(); }} disabled={busy}>
            {busy ? <Spinner /> : t("startup.update")}
          </Btn>
        ) : null}
        <Btn onClick={doFoxbell} disabled={busy}>{t("startup.foxbell")}</Btn>
        {!fatal ? <Btn onClick={doIgnore} disabled={busy}>{t("startup.ignore")}</Btn> : null}
        <Btn kind="danger" onClick={doHide} disabled={busy}>{t("startup.hidePet")}</Btn>
      </div>
    </Modal>
  );
}

void ({} as ActivateResult);
