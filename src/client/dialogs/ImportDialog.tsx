// dialogs/ImportDialog.tsx — 统一导入配置向导（MAM PetImportDialog.tsx 移植）。
// 三步：source（四来源：codex / 本地文件夹 / zip 包 / petdex 在线）→ config（id 实时校验、
// 显示名/描述、字幕开关、语音分组编辑并行时长探测、图集探测）→ done（立即激活 / 完成）。
// WebUI 差异：本地文件夹与 zip 由浏览器文件选择器上传（zip 走宿主安全解压；文件夹上传
// spritesheet.webp + voice/**，宿主按同管线暂存）；petdex 列表/下载均由宿主半代理。
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPostBytes, stagingSheetUrl, type CodexPetInfo, type PetdexHit, type PetSummary, type StagedPet } from "../api";
import { petNameProblem, petNameProblemKey, rowsFromSize, spriteVersionOf, judgeVoiceTier, nameFromRel, type VoiceRow } from "../validation";
import { probeSheetSize, probeWithRetry } from "./probe";
import { VoiceGroupEditor, rowsFromStaged } from "./VoiceGroupEditor";
import { Btn, InlineError, InlineOk, Modal, Spinner } from "./common";
import { t } from "../i18n";
import { petErrMsg } from "../api";
import { appStore, cfgStore } from "../store";

type Step = "source" | "config" | "done";
type Tab = "codex" | "local" | "petdex";

export function ImportDialog(props: { onClose(): void }): React.ReactElement {
  const [step, setStep] = useState<Step>("source");
  const [tab, setTab] = useState<Tab>("codex");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // source 步状态
  const [codexPets, setCodexPets] = useState<CodexPetInfo[] | null>(null);
  const [selectedCodex, setSelectedCodex] = useState<string | null>(null);
  const [petdexQuery, setPetdexQuery] = useState("");
  const [petdexHits, setPetdexHits] = useState<PetdexHit[] | null>(null);
  const [selectedPetdex, setSelectedPetdex] = useState<PetdexHit | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // config 步状态
  const [staged, setStaged] = useState<StagedPet | null>(null);
  const [existingIds, setExistingIds] = useState<string[]>(["foxbell"]);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [subtitle, setSubtitle] = useState(true);
  const [voiceRows, setVoiceRowsState] = useState<VoiceRow[]>([]);
  const [sheetRows, setSheetRows] = useState<9 | 11 | null>(null);
  const [sheetProbeState, setSheetProbeState] = useState<"pending" | "ok" | "invalid">("pending");
  const probeGen = useRef(0);
  const [importedId, setImportedId] = useState<string | null>(null);

  const setVoiceRows = (fn: (prev: VoiceRow[]) => VoiceRow[]) => setVoiceRowsState(fn);

  // 打开时拉重名预检底表
  useEffect(() => {
    void (async () => {
      try {
        const snap = appStore.getSnapshot();
        const pets: PetSummary[] = snap?.pets ?? (await apiGet<{ pets: PetSummary[] }>("/pets")).pets;
        setExistingIds(["foxbell", ...pets.map((p) => p.id)]);
      } catch { /* 预检失败不阻塞（服务端为权威） */ }
    })();
  }, []);

  // codex 列表按需刷新
  useEffect(() => {
    if (step !== "source" || tab !== "codex") return;
    void (async () => {
      try {
        setCodexPets((await apiPost<{ pets: CodexPetInfo[] }>("/api/codex-list")).pets);
      } catch (e) {
        setError(petErrMsg(e, t));
      }
    })();
  }, [step, tab]);

  const nameProblem = name.length === 0 ? "empty" : petNameProblem(name, { existingIds });
  const nameOk = nameProblem === null;
  const tier = judgeVoiceTier(voiceRows.map((r) => ({ rel: r.file, size: r.sizeBytes, durationMs: r.durationMs })));

  const sourceOverride = useRef<"folder" | "zip" | null>(null);
  const enterConfig = (s: StagedPet) => {
    setStaged(s);
    setName(s.suggestedName);
    setDisplayName(s.suggestedDisplayName || s.suggestedName);
    setDescription("");
    setSubtitle(true);
    setVoiceRowsState(rowsFromStaged(s.voiceFiles));
    setSheetRows(null);
    setSheetProbeState("pending");
    setStep("config");
    setError(null);
    // 图集探测（代数守护：防旧探测后到覆盖新暂存）
    const gen = ++probeGen.current;
    void (async () => {
      try {
        const { w, h } = await probeSheetSize(stagingSheetUrl(s.stagingId));
        if (gen !== probeGen.current) return;
        const rows = rowsFromSize(w, h);
        if (rows) { setSheetRows(rows); setSheetProbeState("ok"); }
        else setSheetProbeState("invalid");
      } catch {
        if (gen !== probeGen.current) return;
        // 探测失败：若来源透传了版本（codex/petdex pet.json），按其兜底
        if (s.spriteVersionNumber === 1 || s.spriteVersionNumber === 2) {
          setSheetRows(s.spriteVersionNumber === 1 ? 9 : 11);
          setSheetProbeState("ok");
        } else {
          setSheetProbeState("invalid");
        }
      }
    })();
  };

  const stageError = (e: unknown) => setError(t("import.errorStage", { msg: petErrMsg(e, t) }));

  // ---- 四来源暂存 ----
  const stageCodex = async () => {
    if (!selectedCodex) return;
    setBusy(true); setError(null);
    sourceOverride.current = null;
    try { enterConfig(await apiPost<StagedPet>("/api/import-codex", { id: selectedCodex })); }
    catch (e) { stageError(e); }
    finally { setBusy(false); }
  };
  const stageZip = async (file: File) => {
    setBusy(true); setError(null);
    sourceOverride.current = "zip";
    try { enterConfig(await apiPostBytes<StagedPet>("/api/import-zip", file)); }
    catch (e) { stageError(e); }
    finally { setBusy(false); }
  };
  /** 浏览器文件夹上传：webkitdirectory 选择 → 过滤 spritesheet.webp + voice/** 逐文件上传到宿主临时暂存 */
  const stageFolderUpload = async (files: FileList) => {
    setBusy(true); setError(null);
    sourceOverride.current = "folder";
    try {
      const list = Array.from(files);
      const basePrefix = (() => {
        // webkitRelativePath 形如 <root>/…；spritesheet 可能在根或一层子目录
        const sheet = list.find((f) => f.name === "spritesheet.webp");
        if (!sheet) return null;
        const rel = (sheet as File & { webkitRelativePath?: string }).webkitRelativePath ?? sheet.name;
        return rel.slice(0, rel.length - "spritesheet.webp".length);
      })();
      if (basePrefix === null) { setError(t("rpc.sheet-not-found")); setBusy(false); return; }
      // 先建暂存（借道 zip 管线的空壳不可行——用 codex-list 同款 POST 建暂存：
      // 宿主 /api/import-folder-upload 不在路由族内，这里用「逐文件 POST staging-voice-add + 图集专用口」。
      // 图集上传走 import-zip 的兄弟口不存在 → 采用打包 zip 上传路径：浏览器侧把选中文件
      // 逐一 POST 给 /api/import-folder-files（JSON manifest + base64），由宿主落暂存。
      const payload = {
        files: list
          .map((f) => ({ f, rel: ((f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name).slice(basePrefix.length) }))
          .filter(({ rel }) => rel === "spritesheet.webp" || (rel.startsWith("voice/") && /\.(m4a|mp3|wav|ogg|opus|flac|aac)$/i.test(rel)))
          .slice(0, 200),
      };
      if (payload.files.length === 0 || !payload.files.some(({ rel }) => rel === "spritesheet.webp")) {
        setError(t("rpc.sheet-not-found")); setBusy(false); return;
      }
      const encoded = await Promise.all(
        payload.files.map(async ({ f, rel }) => ({ rel, name: f.name, size: f.size, data: await fileToBase64(f) }))
      );
      enterConfig(await apiPost<StagedPet>("/api/import-folder-files", { files: encoded }));
    } catch (e) { stageError(e); }
    finally { setBusy(false); }
  };
  const stagePetdex = async () => {
    const target = selectedPetdex ? selectedPetdex.slug : petdexQuery.trim();
    if (!target) return;
    setBusy(true); setError(null);
    sourceOverride.current = null;
    try {
      enterConfig(await apiPost<StagedPet>("/api/import-petdex", { url: selectedPetdex ? `https://petdex.dev/pets/${selectedPetdex.slug}` : target, slug: selectedPetdex ? selectedPetdex.slug : undefined }));
    } catch (e) { stageError(e); }
    finally { setBusy(false); }
  };
  const searchPetdex = async () => {
    setBusy(true); setError(null);
    try {
      setPetdexHits((await apiPost<{ pets: PetdexHit[] }>("/api/petdex-search", { q: petdexQuery.trim() })).pets);
    } catch (e) { setError(petErrMsg(e, t)); }
    finally { setBusy(false); }
  };

  const execute = async () => {
    if (!staged || !nameOk || !sheetRows || busy) return;
    setBusy(true); setError(null);
    try {
      // 探测失败的行 durationMs=null → 按 0 落清单并整行剔除（MAM execute 同款：valid = 无 problem 行）
      const valid = voiceRows.filter((r) => r.durationMs !== null && r.durationMs > 1000 && r.durationMs < 20000 && r.sizeBytes <= 10 * 1024 * 1024);
      const hasVoice = tier.hasVoice;
      const manifest = {
        schemaVersion: 2,
        id: name,
        displayName: displayName.trim() || name,
        description: description.trim(),
        source: tab === "codex" ? "codex" : tab === "petdex" ? "petdex" : (sourceOverride.current ?? "folder"),
        spriteVersionNumber: spriteVersionOf(sheetRows),
        spritesheetSizeBytes: staged.spritesheetSize,
        hasVoice,
        hasSubtitle: hasVoice && subtitle,
        voices: valid.map((r) => ({
          group: r.group,
          name: r.name || nameFromRel(r.file),
          file: r.file,
          sizeBytes: r.sizeBytes,
          durationMs: r.durationMs ?? 0,
        })),
      };
      const sum = await apiPost<PetSummary>("/api/import-finalize", { stagingId: staged.stagingId, name, manifest });
      setImportedId(sum.id);
      setStep("done");
      appStore.refresh();
    } catch (e) {
      setError(t("import.errorFinalize", { msg: petErrMsg(e, t) }));
    } finally {
      setBusy(false);
    }
  };

  const cancelAll = () => {
    if (staged) void apiPost("/api/import-cancel", { stagingId: staged.stagingId }).catch(() => {});
    props.onClose();
  };

  const activateNow = async () => {
    if (!importedId) return;
    setBusy(true);
    try {
      const r = await apiPost<{ status: string }>("/api/activate", { id: importedId });
      if (r.status === "activated") {
        cfgStore.set({ activePetId: importedId });
        appStore.refresh();
        setOk(t("switch.activated", { name: importedId }));
      }
    } catch (e) { setError(petErrMsg(e, t)); }
    finally { setBusy(false); }
  };

  const sheetPreviewStyle = useMemo(() => {
    if (!staged) return undefined;
    const half = { width: 96, height: 104 };
    return {
      ...half,
      backgroundImage: `url('${stagingSheetUrl(staged.stagingId)}')`,
      backgroundSize: sheetRows === 9 ? "768px 936px" : "768px 1144px",
      backgroundPosition: "0 0",
    } as React.CSSProperties;
  }, [staged, sheetRows]);

  return (
    <Modal
      title={step === "source" ? t("import.title") : step === "config" ? t("import.configTitle") : t("import.doneTitle")}
      onClose={cancelAll}
      wide
      footer={
        step === "config" ? (
          <>
            <Btn onClick={cancelAll}>{t("import.cancelImport")}</Btn>
            <Btn kind="primary" onClick={() => { void execute(); }} disabled={!nameOk || !sheetRows || busy}>
              {busy ? <Spinner /> : t("import.execute")}
            </Btn>
          </>
        ) : step === "done" ? (
          <>
            <Btn onClick={props.onClose}>{t("import.finish")}</Btn>
            <Btn kind="primary" onClick={() => { void activateNow(); }} disabled={busy || !importedId}>
              {t("import.activateNow")}
            </Btn>
          </>
        ) : undefined
      }
    >
      <InlineError msg={error} />
      <InlineOk msg={ok} />
      {step === "done" ? (
        <div className="dyn-pet-import-done">{importedId ? t("import.doneId", { id: importedId }) : ""}</div>
      ) : step === "config" && staged ? (
        <div className="dyn-pet-import-config">
          <div className="dyn-pet-import-preview">
            <div className="dyn-pet-sheet-thumb" style={sheetPreviewStyle} />
            {sheetProbeState === "pending" ? <span className="dyn-pet-hint">{t("import.sheetProbing")}</span> : null}
            {sheetProbeState === "ok" && sheetRows ? <span className="dyn-pet-badge">{sheetRows === 9 ? "v1" : "v2"}</span> : null}
            {sheetProbeState === "invalid" ? <span className="dyn-pet-bad">{t("import.sheetInvalid")}</span> : null}
          </div>
          <div className="dyn-pet-import-fields">
            <label className="dyn-pet-field">
              <span title={t("import.nameHint")}>{t("import.name")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={staged.suggestedName} />
            </label>
            {nameProblem && name.length > 0 ? (
              <div className="dyn-pet-bad" data-testid="import-name-problem">{t(petNameProblemKey(nameProblem))}</div>
            ) : null}
            <label className="dyn-pet-field">
              <span>{t("import.displayName")}</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label className="dyn-pet-field">
              <span>{t("import.description")}</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
          <VoiceGroupEditor
            target={{ mode: "staged", sid: staged.stagingId }}
            rows={voiceRows}
            setRows={setVoiceRows}
            onError={setError}
            disabled={busy}
          />
          <label className="dyn-pet-checkline">
            <input
              type="checkbox"
              checked={subtitle && tier.hasVoice}
              disabled={voiceRows.length === 0}
              onChange={(e) => setSubtitle(e.target.checked)}
            />
            <span>{t("import.subtitle")}</span>
          </label>
        </div>
      ) : (
        <div className="dyn-pet-import-source">
          <div className="dyn-pet-tabs">
            <button className={tab === "codex" ? "on" : ""} onClick={() => setTab("codex")}>{t("import.tabCodex")}</button>
            <button className={tab === "local" ? "on" : ""} onClick={() => setTab("local")}>{t("import.tabLocal")}</button>
            <button className={tab === "petdex" ? "on" : ""} onClick={() => setTab("petdex")}>{t("import.tabPetdex")}</button>
          </div>
          {tab === "codex" ? (
            <div className="dyn-pet-codex-list">
              {codexPets === null ? <Spinner /> : codexPets.length === 0 ? <div className="dyn-pet-hint">{t("import.codexEmpty")}</div> : null}
              {codexPets?.map((p) => (
                <div
                  key={p.id}
                  className={"dyn-pet-codex-row" + (selectedCodex === p.id ? " sel" : "")}
                  onClick={() => { if (!p.imported) setSelectedCodex(p.id); }}
                >
                  <span>{p.id}</span>
                  {p.displayName ? <span className="dyn-pet-hint">{p.displayName}</span> : null}
                  {p.spriteVersionNumber > 0 ? <span className="dyn-pet-badge">v{p.spriteVersionNumber}</span> : null}
                  {p.imported ? <span className="dyn-pet-hint">{t("import.codexImported")}</span> : null}
                </div>
              ))}
              <Btn kind="primary" onClick={() => { void stageCodex(); }} disabled={!selectedCodex || busy}>
                {busy ? <Spinner /> : t("import.stage")}
              </Btn>
            </div>
          ) : null}
          {tab === "local" ? (
            <div className="dyn-pet-local">
              <Btn onClick={() => folderInputRef.current?.click()} disabled={busy}>
                {t("import.pickFolder")}
              </Btn>
              <input
                ref={folderInputRef}
                type="file"
                multiple
                // @ts-expect-error 非标准属性：目录选择
                webkitdirectory=""
                directory=""
                style={{ display: "none" }}
                onChange={(e) => { if (e.target.files) void stageFolderUpload(e.target.files); e.target.value = ""; }}
              />
              <Btn onClick={() => zipInputRef.current?.click()} disabled={busy}>
                {busy ? <Spinner /> : t("import.pickZip")}
              </Btn>
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void stageZip(f); e.target.value = ""; }}
              />
              <div className="dyn-pet-hint">{t("import.folderHint")}</div>
            </div>
          ) : null}
          {tab === "petdex" ? (
            <div className="dyn-pet-petdex">
              <div className="dyn-pet-hint">{t("import.petdexHint")}</div>
              <div className="dyn-pet-petdex-row">
                <input
                  value={petdexQuery}
                  placeholder={t("import.petdexPlaceholder")}
                  onChange={(e) => setPetdexQuery(e.target.value)}
                />
                <Btn onClick={() => { void searchPetdex(); }} disabled={busy || petdexQuery.trim().length === 0}>
                  {t("import.petdexSearch")}
                </Btn>
                <Btn onClick={() => window.open("https://petdex.dev", "_blank", "noopener")}>{t("import.petdexBrowse")}</Btn>
              </div>
              {petdexHits !== null && petdexHits.length === 0 ? <div className="dyn-pet-hint">—</div> : null}
              <div className="dyn-pet-petdex-list">
                {petdexHits?.map((h) => (
                  <div
                    key={h.slug}
                    className={"dyn-pet-codex-row" + (selectedPetdex?.slug === h.slug ? " sel" : "")}
                    onClick={() => { if (h.hasZip) setSelectedPetdex(h); }}
                  >
                    <span>{h.slug}</span>
                    {h.displayName ? <span className="dyn-pet-hint">{h.displayName}</span> : null}
                    {h.spriteVersionNumber > 0 ? <span className="dyn-pet-badge">v{h.spriteVersionNumber}</span> : null}
                    {!h.hasZip ? <span className="dyn-pet-hint">{t("import.petdexNoZip")}</span> : null}
                  </div>
                ))}
              </div>
              <Btn
                kind="primary"
                onClick={() => { void stagePetdex(); }}
                disabled={busy || (!selectedPetdex && !/^https?:\/\/|^[\w-]+$/.test(petdexQuery.trim()))}
              >
                {busy ? <Spinner /> : t("import.petdexDownload")}
              </Btn>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

async function fileToBase64(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
