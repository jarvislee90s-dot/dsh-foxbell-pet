// dialogs/ManageDialog.tsx — 管理对话框（MAM PetManageDialog.tsx 移植）。
// 列表 → 面板：改名（id 同步 manifest 与目录）、编辑显示名/描述、按组增删语音、字幕开关、
// 安全删除（二次确认后移入 ~/.dsh/foxbell-pet/.trash/，不物理删除）、查看目录路径。
// 编辑当前激活宠物：闪切保护（暂切 foxbell，保存后切回；对话框关闭也切回）。
import React, { useEffect, useMemo, useState } from "react";
import { apiPost, petErrMsg, type PetSummary } from "../api";
import { petNameProblem, petNameProblemKey, rowsFromSize, spriteVersionOf, nameFromRel, type PetManifestView, type VoiceRow } from "../validation";
import { probeSheetSize, probeWithRetry } from "./probe";
import { VoiceGroupEditor } from "./VoiceGroupEditor";
import { Btn, InlineError, InlineOk, Modal, Spinner } from "./common";
import { t } from "../i18n";
import { appStore, cfgStore, fetchManifest } from "../store";
import { clearFlashSwitched, loadFlashSwitched, saveFlashSwitched } from "../config";

export function ManageDialog(props: { onClose(): void }): React.ReactElement {
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [selected, setSelected] = useState<PetSummary | null>(null);
  const [manifest, setManifest] = useState<PetManifestView | null>(null);
  const [petDir, setPetDir] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  // 面板编辑态
  const [renameTo, setRenameTo] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [subtitle, setSubtitle] = useState(true);
  const [voiceRows, setVoiceRowsState] = useState<VoiceRow[]>([]);
  const setVoiceRows = (fn: (prev: VoiceRow[]) => VoiceRow[]) => setVoiceRowsState(fn);

  const reload = async () => {
    try {
      const snap = appStore.getSnapshot();
      const list = snap?.pets ?? [];
      setPets(list.filter((p) => !p.builtin));
    } catch (e) { setError(petErrMsg(e, t)); }
  };
  useEffect(() => { void reload(); }, []);

  const existingIds = useMemo(() => ["foxbell", ...pets.map((p) => p.id)], [pets]);

  /** 闪切保护：编辑激活中宠物前暂切 foxbell，记录原 id（MAM ensureNotActive） */
  const ensureNotActive = () => {
    const activeId = cfgStore.getSnapshot().activePetId;
    if (selected && activeId === selected.id) {
      saveFlashSwitched(selected.id);
      cfgStore.set({ activePetId: "foxbell" });
      appStore.refresh();
      setOk(t("manage.activeSwitchNotice"));
    }
  };
  /** 保存/关闭出口：切回被闪切的原宠物（仅回指针；能力缓存由下一轮快照收敛） */
  const restoreFlashSwitched = (renameMap?: { from: string; to: string }) => {
    const flashed = loadFlashSwitched();
    if (!flashed) return;
    clearFlashSwitched();
    const target = renameMap && renameMap.from === flashed ? renameMap.to : flashed;
    cfgStore.set({ activePetId: target });
    appStore.refresh();
  };

  const openPanel = async (p: PetSummary) => {
    setSelected(p);
    setError(null); setOk(null); setConfirmDelete(false); setCopied(false);
    setRenameTo("");
    setDisplayName(p.displayName);
    setDescription(p.description ?? "");
    try {
      const scan = await apiPost<{ id: string; dir: string; voiceFiles: { rel: string; exists: boolean; size: number }[] }>("/api/scan", { id: p.id });
      setPetDir(scan.dir);
      const m = await fetchManifest(p.id);
      setManifest(m);
      setSubtitle(m ? m.hasSubtitle : true);
      // 行 = manifest voices（信任缓存时长）+ 磁盘上未登记的额外文件（durationMs=null 待探测）
      const rows: VoiceRow[] = (m ? m.voices : []).map((v) => ({
        group: v.group, name: v.name, file: v.file, sizeBytes: v.sizeBytes, durationMs: v.durationMs,
      }));
      const known = new Set(rows.map((r) => r.file));
      for (const f of scan.voiceFiles) {
        if (known.has(f.rel)) continue;
        if (!/\.(m4a|mp3|wav|ogg|opus|flac|aac)$/i.test(f.rel)) continue;
        rows.push({ group: f.rel.split("/")[1], name: nameFromRel(f.rel), file: f.rel, sizeBytes: f.size, durationMs: null });
      }
      setVoiceRowsState(rows);
    } catch (e) { setError(petErrMsg(e, t)); }
  };

  const doRename = async () => {
    if (!selected || busy) return;
    const target = renameTo.trim();
    if (target.length === 0 || target === selected.id) return;
    const problem = petNameProblem(target, { existingIds, selfId: selected.id });
    if (problem) { setError(t(petNameProblemKey(problem))); return; }
    setBusy(true); setError(null);
    const wasActive = cfgStore.getSnapshot().activePetId === selected.id || !!loadFlashSwitched();
    try {
      ensureNotActive();
      await apiPost("/api/rename", { oldId: selected.id, newId: target });
      setOk(t("manage.renamedToast", { name: target }));
      const renamed: PetSummary = { ...selected, id: target, displayName: displayName || selected.displayName };
      if (wasActive) restoreFlashSwitched({ from: selected.id, to: target });
      else clearFlashSwitched();
      setSelected(renamed);
      setRenameTo("");
      await reload();
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
      if (wasActive) restoreFlashSwitched();
    } finally { setBusy(false); }
  };

  const doSave = async () => {
    if (!selected || busy) return;
    setBusy(true); setError(null);
    const wasActive = cfgStore.getSnapshot().activePetId === selected.id || !!loadFlashSwitched();
    try {
      ensureNotActive();
      const scan = await apiPost<{ spritesheet: { exists: boolean; size: number }; voiceFiles: { rel: string; exists: boolean; size: number }[] }>("/api/scan", { id: selected.id });
      // rows 判定：manifest 记录可信（大小一致且版本已知）则直取，否则图集探测（探测失败不得猜 9）
      let rows: 9 | 11;
      const trusted = manifest && manifest.spriteVersionNumber !== 0 && manifest.spritesheetSizeBytes === scan.spritesheet.size;
      if (trusted && manifest) {
        rows = manifest.spriteVersionNumber === 2 ? 11 : 9;
      } else {
        const url = `/dyn-pet-foxbell/pets/${encodeURIComponent(selected.id)}/spritesheet.webp`;
        const size = await probeSheetSize(url);
        const r = rowsFromSize(size.w, size.h);
        if (!r) throw new Error(t("import.sheetInvalid"));
        rows = r;
      }
      // 未探测行补探测（新增/变动文件）
      const probed = await Promise.all(
        voiceRows.map(async (r) => {
          if (r.durationMs !== null) return r;
          const url = `/dyn-pet-foxbell/pets/${encodeURIComponent(selected.id)}/${r.file.split("/").map(encodeURIComponent).join("/")}`;
          return { ...r, durationMs: await probeWithRetry(url) };
        })
      );
      const valid = probed.filter((r) => r.durationMs !== null && r.durationMs > 1000 && r.durationMs < 20000 && r.sizeBytes <= 10 * 1024 * 1024);
      const hasVoice = valid.length > 0 && ["general", "approval", "done", "error"].every((g) => valid.some((r) => r.group === g));
      const next: PetManifestView = {
        id: selected.id,
        displayName: displayName.trim() || selected.id,
        description: description.trim(),
        source: manifest?.source ?? "folder",
        spriteVersionNumber: spriteVersionOf(rows),
        spritesheetSizeBytes: scan.spritesheet.size,
        hasVoice,
        hasSubtitle: hasVoice && subtitle,
        voices: valid.map((r) => ({
          group: r.group, name: r.name || nameFromRel(r.file), file: r.file, sizeBytes: r.sizeBytes, durationMs: r.durationMs ?? 0,
        })),
      };
      await apiPost("/api/manifest-update", { id: selected.id, manifest: next, backup: true });
      setManifest(next);
      setOk(t("manage.savedToast"));
      if (wasActive) restoreFlashSwitched();
      else clearFlashSwitched();
      await reload();
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
      if (wasActive) restoreFlashSwitched();
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!selected || busy) return;
    setBusy(true); setError(null);
    try {
      ensureNotActive();
      await apiPost("/api/delete", { id: selected.id });
      clearFlashSwitched(); // 宠物已删，闪切标记失去意义
      setOk(t("manage.deletedToast", { name: selected.displayName || selected.id }));
      setSelected(null);
      setConfirmDelete(false);
      await reload();
      appStore.refresh();
    } catch (e) {
      setError(petErrMsg(e, t));
      restoreFlashSwitched();
    } finally { setBusy(false); }
  };

  const copyDir = async () => {
    try {
      await navigator.clipboard.writeText(petDir);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard 不可用：路径已可见，手动复制 */ }
  };

  const closeAll = () => {
    restoreFlashSwitched(); // 不点保存直接关也自动切回原宠物
    props.onClose();
  };

  const renameProblem = renameTo.trim().length === 0
    ? null
    : petNameProblem(renameTo.trim(), { existingIds, selfId: selected?.id });

  return (
    <Modal title={t("manage.title")} onClose={closeAll} wide>
      <InlineError msg={error} />
      <InlineOk msg={ok} />
      {!selected ? (
        <div className="dyn-pet-manage-list">
          <div className="dyn-pet-hint">{t("manage.pick")}</div>
          <div className="dyn-pet-hint">{t("manage.builtinHint")}</div>
          {pets.length === 0 ? <div className="dyn-pet-hint">—</div> : null}
          {pets.map((p) => (
            <div key={p.id} className="dyn-pet-codex-row" onClick={() => { void openPanel(p); }}>
              <span>{p.displayName || p.id}</span>
              <span className="dyn-pet-hint">{p.id}</span>
              <span className="dyn-pet-badge">{p.spriteVersionNumber > 0 ? `v${p.spriteVersionNumber}` : "v?"}</span>
              {p.hasVoice ? <span title={t("menu.sound")}>🔊</span> : null}
              {p.hasSubtitle ? <span title={t("menu.subtitle")}>💬</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="dyn-pet-manage-panel">
          <div className="dyn-pet-field">
            <span>{t("manage.dirLabel")}</span>
            <code className="dyn-pet-dirpath">{petDir}</code>
            <Btn onClick={() => { void copyDir(); }}>{copied ? t("manage.copied") : t("manage.copy")}</Btn>
          </div>
          <div className="dyn-pet-field">
            <span>{t("import.displayName")}</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="dyn-pet-field">
            <span>{t("import.description")}</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="dyn-pet-field">
            <span>{t("manage.rename")}</span>
            <input value={renameTo} placeholder={selected.id} onChange={(e) => setRenameTo(e.target.value)} />
            <Btn onClick={() => { void doRename(); }} disabled={busy || renameTo.trim().length === 0 || renameProblem !== null}>
              {t("manage.renameBtn")}
            </Btn>
          </div>
          {renameProblem ? <div className="dyn-pet-bad">{t(petNameProblemKey(renameProblem))}</div> : null}
          <VoiceGroupEditor
            target={{ mode: "installed", id: selected.id }}
            rows={voiceRows}
            setRows={setVoiceRows}
            onError={setError}
            disabled={busy}
          />
          <label className="dyn-pet-checkline">
            <input type="checkbox" checked={subtitle} onChange={(e) => setSubtitle(e.target.checked)} />
            <span>{t("manage.subtitle")}</span>
          </label>
          <div className="dyn-pet-manage-actions">
            <Btn kind="primary" onClick={() => { void doSave(); }} disabled={busy}>
              {busy ? <Spinner /> : t("manage.save")}
            </Btn>
            <Btn onClick={() => { setSelected(null); setConfirmDelete(false); }}>{t("menu.back")}</Btn>
            {!confirmDelete ? (
              <Btn kind="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>{t("manage.delete")}</Btn>
            ) : (
              <span className="dyn-pet-delete-confirm">
                <span className="dyn-pet-bad">{t("manage.deleteConfirm")}</span>
                <Btn kind="danger" onClick={() => { void doDelete(); }} disabled={busy}>{t("manage.delete")}</Btn>
                <Btn onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</Btn>
              </span>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
