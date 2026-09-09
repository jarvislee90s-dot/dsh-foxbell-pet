// dialogs/VoiceGroupEditor.tsx — 语音分组编辑（导入向导与管理对话框共用，MAM 同名组件移植）。
// 四组各一节：添加音频（文件上传→宿主暂存/正式目录）、行内时长+问题徽标、移除；
// 底部汇总：四组齐全判定 / 缺少分组提示 / 语音总大小 / >30MB 警示。
import React, { useEffect, useMemo, useRef, useState } from "react";
import { GROUPS, judgeVoiceTier, MAX_AUDIO_BYTES, nameFromRel, voiceRowProblem, type VoiceRow } from "../validation";
import { apiPost, apiPostBytes, stagingVoiceUrl, type StagedVoiceFile } from "../api";
import { probeWithRetry } from "./probe";
import { t } from "../i18n";
import { Btn, InlineError, Spinner } from "./common";

export interface VoiceEditorTarget {
  /** staged：向导暂存区（sid）；installed：正式宠物目录（id） */
  mode: "staged" | "installed";
  sid?: string;
  id?: string;
}

const GROUP_LABEL: Record<string, string> = {
  general: "import.groupGeneral",
  approval: "import.groupApproval",
  done: "import.groupDone",
  error: "import.groupError",
};

function fmtSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function VoiceGroupEditor(props: {
  target: VoiceEditorTarget;
  rows: VoiceRow[];
  setRows(fn: (prev: VoiceRow[]) => VoiceRow[]): void;
  onError(msg: string): void;
  disabled?: boolean;
}): React.ReactElement {
  const { target, rows, setRows, onError } = props;
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [probing, setProbing] = useState<Set<string>>(new Set());
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const urlOf = (rel: string): string =>
    target.mode === "staged"
      ? stagingVoiceUrl(target.sid ?? "", rel)
      : `/dyn-pet-foxbell/pets/${encodeURIComponent(target.id ?? "")}/${rel.split("/").map(encodeURIComponent).join("/")}`;

  // 新行（durationMs=null）自动并行探测（换 target 自动重跑）
  useEffect(() => {
    const pending = rows.filter((r) => r.durationMs === null);
    if (pending.length === 0) return;
    let cancelled = false;
    setProbing(new Set(pending.map((r) => r.file)));
    void (async () => {
      const results = await Promise.all(
        pending.map(async (r) => [r.file, await probeWithRetry(urlOf(r.file))] as [string, number | null])
      );
      if (cancelled) return;
      setProbing(new Set());
      setRows((prev) =>
        prev.map((r) => {
          const hit = results.find(([f]) => f === r.file);
          return hit && r.durationMs === null ? { ...r, durationMs: hit[1] } : r;
        })
      );
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.filter((r) => r.durationMs === null).length, target.sid, target.id]);

  const summary = useMemo(
    () =>
      judgeVoiceTier(
        rows.map((r) => ({ rel: r.file, size: r.sizeBytes, durationMs: r.durationMs }))
      ),
    [rows]
  );
  const totalSize = rows.reduce((n, r) => n + r.sizeBytes, 0);
  const missing = GROUPS.filter((g) => summary.coverage[g] === 0);

  const onAdd = async (group: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusyGroup(group);
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_AUDIO_BYTES) {
          onError(t("import.problems.too-big") + `: ${f.name}`);
          continue;
        }
        let added: StagedVoiceFile;
        if (target.mode === "staged") {
          const q = `?sid=${encodeURIComponent(target.sid ?? "")}&group=${encodeURIComponent(group)}&name=${encodeURIComponent(f.name)}`;
          const r = await apiPostBytes<{ added: StagedVoiceFile }>(`/api/staging-voice-add${q}`, f);
          added = r.added;
        } else {
          const q = `?id=${encodeURIComponent(target.id ?? "")}&group=${encodeURIComponent(group)}&name=${encodeURIComponent(f.name)}`;
          const r = await apiPostBytes<{ added: StagedVoiceFile }>(`/api/voice-add${q}`, f);
          added = r.added;
        }
        const url = urlOf(added.file);
        setProbing((s) => new Set(s).add(added.file));
        const dur = await probeWithRetry(url);
        setProbing((s) => { const n = new Set(s); n.delete(added.file); return n; });
        setRows((prev) => [
          ...prev,
          { group: added.group, name: added.name || nameFromRel(added.file), file: added.file, sizeBytes: added.sizeBytes, durationMs: dur },
        ]);
      }
    } catch (e) {
      onError(String((e as { detail?: string }).detail ?? (e as Error).message ?? e));
    } finally {
      setBusyGroup(null);
      const inp = fileRefs.current[group];
      if (inp) inp.value = "";
    }
  };

  const onRemove = async (row: VoiceRow) => {
    try {
      if (target.mode === "staged") {
        await apiPost("/api/staging-voice-remove", { sid: target.sid ?? "", rel: row.file });
      } else {
        await apiPost("/api/voice-remove", { id: target.id ?? "", rel: row.file });
      }
      setRows((prev) => prev.filter((r) => r.file !== row.file));
    } catch (e) {
      onError(String((e as { detail?: string }).detail ?? (e as Error).message ?? e));
    }
  };

  const reprobe = async (row: VoiceRow) => {
    setProbing((s) => new Set(s).add(row.file));
    const dur = await probeWithRetry(urlOf(row.file));
    setProbing((s) => { const n = new Set(s); n.delete(row.file); return n; });
    setRows((prev) => prev.map((r) => (r.file === row.file ? { ...r, durationMs: dur } : r)));
  };

  return (
    <div className="dyn-pet-voice-editor">
      {GROUPS.map((g) => {
        const groupRows = rows.filter((r) => r.group === g);
        return (
          <div key={g} className="dyn-pet-voice-group">
            <div className="dyn-pet-voice-group-head">
              <span>{t(GROUP_LABEL[g])}</span>
              <Btn onClick={() => fileRefs.current[g]?.click()} disabled={props.disabled || busyGroup !== null}>
                {busyGroup === g ? <Spinner /> : t("import.addAudio")}
              </Btn>
              <input
                ref={(el) => { fileRefs.current[g] = el; }}
                type="file"
                accept=".m4a,.mp3,.wav,.ogg,.opus,.flac,.aac"
                multiple
                style={{ display: "none" }}
                onChange={(e) => { void onAdd(g, e.target.files); }}
              />
            </div>
            {groupRows.map((r) => {
              const problem = voiceRowProblem(r);
              const isProbing = probing.has(r.file);
              return (
                <div key={r.file} className="dyn-pet-voice-row">
                  <span className="dyn-pet-voice-name" title={r.file}>
                    {r.name}
                    {r.durationMs !== null ? ` (${(r.durationMs / 1000).toFixed(1)}s)` : isProbing ? ` (${t("import.probing")})` : ""}
                  </span>
                  {problem ? (
                    <button
                      className="dyn-pet-voice-badge"
                      title={problem === "no-duration" ? t("import.reprobeDuration") : undefined}
                      onClick={() => { if (problem === "no-duration") void reprobe(r); }}
                    >
                      {t(`import.problems.${problem}`)}
                    </button>
                  ) : null}
                  <Btn kind="plain" onClick={() => { void onRemove(r); }} disabled={props.disabled}>
                    {t("import.remove")}
                  </Btn>
                </div>
              );
            })}
          </div>
        );
      })}
      <div className={"dyn-pet-voice-summary" + (summary.hasVoice ? " ok" : "")}>
        {summary.hasVoice
          ? t("import.coverageOk")
          : t("import.coverageMissing", { groups: missing.map((g) => t(GROUP_LABEL[g])).join("、") })}
      </div>
      <div className="dyn-pet-voice-summary">
        {t("import.totalSize", { size: fmtSize(totalSize) })}
        {totalSize > 30 * 1024 * 1024 ? <span className="dyn-pet-warn"> · {t("import.tooLargeWarn")}</span> : null}
      </div>
    </div>
  );
}

export function rowsFromStaged(files: StagedVoiceFile[]): VoiceRow[] {
  return files.map((f) => ({ group: f.group, name: f.name, file: f.file, sizeBytes: f.sizeBytes, durationMs: null }));
}

export { InlineError };
