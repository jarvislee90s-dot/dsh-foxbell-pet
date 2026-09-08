// dialogs/SwitchDialog.tsx — 切换对话框（MAM PetSwitchDialog.tsx 移植）。
// 卡片式列表（内置 foxbell 恒第一张 + 全部外部宠物）→ 点击即激活（宿主校验完整性）→
// 素材不一致时内嵌 mismatch 面板三选（更新清单 / 忽略降级 / 取消）→ 激活即时生效
// （精灵/语音/清单热替换由 store 轮询收敛，无需刷新页面）。
import React, { useEffect, useMemo, useState } from "react";
import { apiPost, petErrMsg, petSheetUrl, type ActivateResult, type PetSummary } from "../api";
import { manifestVoiceCapOnDisk, type PetManifestView, type PetScan, spriteVersionOf, rowsFromSize, nameFromRel } from "../validation";
import { probeSheetSize, probeWithRetry } from "./probe";
import { Btn, InlineError, InlineOk, Modal, Spinner } from "./common";
import { t } from "../i18n";
import { appStore, cfgStore, fetchManifest } from "../store";
import { saveGuardIgnored, guardSignature } from "../config";

export function SwitchDialog(props: { onClose(): void }): React.ReactElement {
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [activeId, setActiveId] = useState<string>(cfgStore.getSnapshot().activePetId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<{ id: string; result: ActivateResult } | null>(null);
  const [localCaps, setLocalCaps] = useState<Record<string, { hasVoice: boolean; hasSubtitle: boolean }>>({});

  useEffect(() => {
    const snap = appStore.getSnapshot();
    if (snap?.pets) setPets(snap.pets);
    const un = appStore.subscribe(() => {
      const s = appStore.getSnapshot();
      if (s?.pets) setPets(s.pets);
    });
    return un;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => cfgStore.subscribe(() => setActiveId(cfgStore.getSnapshot().activePetId)), []);

  const sorted = useMemo(() => {
    const builtin = pets.filter((p) => p.builtin);
    const external = pets.filter((p) => !p.builtin);
    return [...builtin, ...external];
  }, [pets]);

  /** 「更新清单」：按宿主 plan（keep + reprobes）重建 manifest 并写回（自动备份），随后重新激活 */
  const doUpdateManifest = async (id: string, result: ActivateResult): Promise<void> => {
    setBusyId(id); setError(null);
    try {
      const plan = result.plan;
      const scan = await apiPost<PetScan>("/api/scan", { id });
      if (!scan.spritesheet.exists) throw new Error(t("switch.invalidSheet"));
      // rows：探测优先（MAM FIX-4），失败按 manifest 记录兜底
      let rows: 9 | 11 | null = null;
      try {
        const size = await probeSheetSize(petSheetUrl(id));
        rows = rowsFromSize(size.w, size.h);
      } catch { rows = null; }
      const old = (result.manifest as PetManifestView | undefined) ?? (await fetchManifest(id));
      if (!rows) {
        const recorded = old?.spriteVersionNumber ?? 0;
        if (recorded === 1 || recorded === 2) rows = recorded === 2 ? 11 : 9;
      }
      if (!rows) throw new Error(t("import.sheetInvalid"));
      const keep = plan ? plan.keepVoices : (old?.voices ?? []).filter((v) =>
        scan.voiceFiles.some((f) => f.rel === v.file && f.size === v.sizeBytes));
      const reprobeRels = plan
        ? plan.reprobes.map((r) => r.rel)
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
          group: p.rel.split("/")[1],
          name: nameFromRel(p.rel),
          file: p.rel,
          sizeBytes: p.size,
          durationMs: p.durationMs as number,
        })),
      ];
      const hasVoice = ["general", "approval", "done", "error"].every((g) =>
        voices.some((v) => v.group === g && v.durationMs > 1000 && v.durationMs < 20000 && v.sizeBytes <= 10 * 1024 * 1024));
      const next: PetManifestView = {
        id,
        displayName: old?.displayName || id,
        description: old?.description ?? "",
        source: old?.source ?? "folder",
        spriteVersionNumber: spriteVersionOf(rows),
        spritesheetSizeBytes: scan.spritesheet.size,
        hasVoice,
        // 修复不擅自开字幕（MAM repairManifest：hasSubtitle = hasVoice && old.hasSubtitle）
        hasSubtitle: hasVoice && (old?.hasSubtitle ?? true),
        voices,
      };
      await apiPost("/api/manifest-update", { id, manifest: next, backup: !plan?.manifestMissing });
      setOk(t("switch.updated"));
      // 更新后重新激活（应无差异）
      await activate(id, true);
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
    } finally { setBusyId(null); }
  };

  const activate = async (id: string, afterUpdate = false): Promise<void> => {
    setBusyId(id); setError(null);
    try {
      const r = await apiPost<ActivateResult>("/api/activate", { id });
      if (r.status === "activated") {
        cfgStore.set({ activePetId: id });
        setActiveId(id);
        setMismatch(null);
        if (!afterUpdate) setOk(t("switch.activated", { name: pets.find((p) => p.id === id)?.displayName || id }));
        if (r.voiceCap !== undefined) {
          setLocalCaps((m) => ({ ...m, [id]: { hasVoice: r.voiceCap as boolean, hasSubtitle: r.voiceCap as boolean } }));
        }
        appStore.refresh();
        return;
      }
      if (r.status === "mismatch") { setMismatch({ id, result: r }); return; }
      setError(t("switch.invalidSheet"));
    } catch (e) {
      setError(petErrMsg(e, t));
    } finally { setBusyId(null); }
  };

  const ignoreMismatch = async (): Promise<void> => {
    if (!mismatch) return;
    const { id, result } = mismatch;
    // 忽略：按磁盘现状运行（不重写 manifest）。voiceCap 按磁盘可信度收敛并记忆签名（下次校验仍会提示）
    try {
      const scan = await apiPost<PetScan>("/api/scan", { id });
      const m = (result.manifest as PetManifestView | null) ?? (await fetchManifest(id));
      const cap = m ? manifestVoiceCapOnDisk(m, scan) : false;
      setLocalCaps((prev) => ({ ...prev, [id]: { hasVoice: cap, hasSubtitle: cap && (m?.hasSubtitle ?? false) } }));
      if (m && result.issues) saveGuardIgnored(guardSignature(id, result.issues));
      cfgStore.set({ activePetId: id });
      setActiveId(id);
      setMismatch(null);
      setOk(t("switch.ignoredDiff"));
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
    }
  };

  return (
    <Modal title={t("switch.title")} onClose={props.onClose} wide>
      <InlineError msg={error} />
      <InlineOk msg={ok} />
      {mismatch ? (
        <div className="dyn-pet-mismatch">
          <div className="dyn-pet-mismatch-title">{t("switch.mismatchTitle")}（{mismatch.id}）</div>
          <ul className="dyn-pet-issue-list">
            {(mismatch.result.issues ?? []).map((i, k) => (
              <li key={k}>{t(`issue.${i.kind}`, {} as Record<string, string>)}{i.detail ? `：${i.detail}` : ""}</li>
            ))}
          </ul>
          <div className="dyn-pet-mismatch-actions">
            <Btn kind="primary" onClick={() => { void doUpdateManifest(mismatch.id, mismatch.result); }} disabled={busyId !== null || mismatch.result.plan?.canRepair === false}>
              {t("switch.mismatchUpdate")}
            </Btn>
            <Btn onClick={() => { void ignoreMismatch(); }} disabled={busyId !== null}>{t("switch.mismatchIgnore")}</Btn>
            <Btn onClick={() => setMismatch(null)}>{t("switch.mismatchCancel")}</Btn>
          </div>
        </div>
      ) : (
        <div className="dyn-pet-switch-grid">
          {sorted.map((p) => {
            const cap = localCaps[p.id];
            const hasVoice = cap ? cap.hasVoice : p.hasVoice;
            const hasSubtitle = cap ? cap.hasSubtitle : p.hasSubtitle;
            return (
              <div
                key={p.id}
                className={"dyn-pet-switch-card" + (p.id === activeId ? " active" : "")}
                onClick={() => { if (p.id !== activeId && busyId === null) void activate(p.id); }}
              >
                <div
                  className="dyn-pet-switch-thumb"
                  style={{
                    backgroundImage: `url('${petSheetUrl(p.id, p.builtin ? "builtin" : undefined)}')`,
                    backgroundSize: p.spriteVersionNumber === 1 ? "384px 468px" : "384px 572px",
                    backgroundPosition: "0 0",
                  }}
                />
                <div className="dyn-pet-switch-name">
                  {p.displayName || p.id}
                  {p.id === activeId ? <span className="dyn-pet-badge">{t("switch.current")}</span> : null}
                  {p.builtin ? <span className="dyn-pet-badge">{t("switch.builtin")}</span> : null}
                </div>
                <div className="dyn-pet-switch-meta">
                  <span className="dyn-pet-badge" title={p.spriteVersionNumber === 0 ? t("switch.pendingFirstCheck") : undefined}>
                    {p.spriteVersionNumber > 0 ? `v${p.spriteVersionNumber}` : "v?"}
                  </span>
                  <span style={{ opacity: hasVoice ? 1 : 0.4 }} title={hasVoice ? undefined : t("menu.soundNoCap")}>🔊</span>
                  <span style={{ opacity: hasSubtitle ? 1 : 0.4 }} title={hasSubtitle ? undefined : t("menu.subtitleNoCap")}>💬</span>
                  {busyId === p.id ? <Spinner /> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
