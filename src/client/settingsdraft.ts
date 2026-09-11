// settingsdraft.ts — 设置卡草稿层纯逻辑（v1.4.0 SettingsCard 移植，源锚点 git show 886b303:src/client.js L1130-1235）。
// 抽纯模块的原因：react 由宿主 bundle 注入（不在 devDependencies），vitest 无法解析 .tsx 导入——
// 按仓库惯例（boardrows/format/validation 同款）把可测逻辑抽成纯函数直测；交互行为由 Task 11 E2E 覆盖。
import { NUM_KEYS, sanitizeValue, type NumKey, type PetConfig } from "./config";

/** 数字行草稿值：e.target.value 是字符串（"" / 非法串 = 无效输入 → 红框 + 禁保存） */
export type NumDraft = number | string;
export type DraftConfig = Omit<PetConfig, NumKey> & Record<NumKey, NumDraft>;

/** v2.1 看板 4 开关（v1.4.0 boolRows2 顺序：节奏档位/用量统计/工作总结/TTS 朗读） */
export const DASH_BOOL_KEYS = ["paceEnabled", "usageEnabled", "summaryEnabled", "ttsEnabled"] as const;

/** v2.1 看板 8 数字行（v1.4.0 numRows 显示顺序；键集 = config.NUM_KEYS，钳制表见 config.NUM_RANGE） */
export const DASH_NUM_ROWS = [
  "dayLimitTokens", "milestoneUnit", "paceIntenseEvents", "paceLongrunMin",
  "paceLoafStartMin", "approvalFlickerMin", "summaryEntrySec", "boardTtlSec",
] as const;

/** 设置卡全部草稿键 = 3 基础开关 + 12 看板键 + 5 动作下拉 + 缩放（UI 分组顺序：看板组在基础开关后、动作下拉前） */
export const SETTINGS_ALL_KEYS = [
  "muted", "talkative", "gravity",
  ...DASH_BOOL_KEYS, ...DASH_NUM_ROWS,
  "dblAction", "approvalAction", "runningAction", "errorAction", "doneAction",
  "scale",
] as const satisfies readonly (keyof PetConfig)[];

/** v2.2 导出 3 键（Task 14 R8）：布尔（侧栏看板入口）+ 字符串（导出评语/导出姿态）——
 *  纯布尔/字符串键，不在 NUM_KEYS（无 Number 转换）；与 SETTINGS_ALL_KEYS 共用草稿/save 机制，
 *  单列的原因：既有 21 键键集契约测试不动（append-only），新键以增量清单并入迭代。 */
export const SETTINGS_V22_KEYS = [
  "dashboardSidebarEntry", "exportQuote", "exportPose",
] as const satisfies readonly (keyof PetConfig)[];

/** 草稿层实际迭代的全键集（v2.2 起 = 21 键 + 3 导出键；dirty 判定与 save patch 收集均遍历此表） */
export const ALL_DRAFT_KEYS: readonly (keyof PetConfig)[] = [...SETTINGS_ALL_KEYS, ...SETTINGS_V22_KEYS];

/** v1.4.0 isBadNum："" / null / 非有限数。Number("") = 0 是有限数，故空串必须先判 */
export const isBadNumValue = (v: unknown): boolean =>
  v === "" || v === null || !Number.isFinite(Number(v));

/** dirty：任一草稿键与提交值 String 口径不等（v1.4.0 同款——草稿 "12" vs 已存 12 视为相等） */
export const isDraftDirty = (draft: DraftConfig, cfg: PetConfig): boolean =>
  ALL_DRAFT_KEYS.some((k) => String(draft[k]) !== String(cfg[k]));

/**
 * 保存 diff：仅收集变更键成 patch。
 * 数字键 `Number(draft[k])` 先转——根因修复：e.target.value 是字符串，字符串写入
 * settings 会被宿主 z.number() 拒绝而静默丢配（v1.4.0 实证）；转换后经
 * sanitizeValue→clampNum 做 NUM_RANGE 钳制。其余键原值透传（cfgStore.set 内仍有 sanitize 兜底）。
 */
export function buildSavePatch(draft: DraftConfig, cfg: PetConfig): Partial<PetConfig> {
  const patch: Partial<PetConfig> = {};
  for (const k of ALL_DRAFT_KEYS) {
    if (String(draft[k]) === String(cfg[k])) continue;
    (patch as Record<string, unknown>)[k] = (NUM_KEYS as readonly string[]).includes(k)
      ? sanitizeValue(k as NumKey, Number(draft[k]))
      : draft[k];
  }
  return patch;
}
