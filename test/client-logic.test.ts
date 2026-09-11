// 客户端纯逻辑测试（TS 直测）：动画表/物理积分/语音选择/校验函数/色彩映射/配置兼容/i18n 完整性。
import { describe, expect, it } from "vitest";
import { ANIM, FRAME_H, FRAME_W, frameStyle, LOOK_FRAMES, SHEET_COLS } from "../src/client/animations";
import {
  clampPos, dragDirection, GRAVITY, DAMP, MIN_VX, pushSample, stepFall, throwVelocity,
  viewportBounds, SQUASH_TIMING,
} from "../src/client/physics";
import { pickIndex, subtitleMs, MIN_SPEECH_MS } from "../src/client/voices";
import {
  diffManifestVsScan, groupOfRel, isAudioCandidate, judgeVoiceTier, manifestVoiceCapOnDisk,
  nameFromRel, petNameProblem, petNameProblemKey, rowsFromSize, spriteVersionOf, voiceRowProblem,
  MAX_AUDIO_BYTES, MIN_DURATION_MS, MAX_DURATION_MS, type PetManifestView, type PetScan,
} from "../src/client/validation";
import { DOT_COLOR, lightOf, taskPoseOf, truncate } from "../src/client/statuscards";
import {
  CFG_DEFAULT, CFG_SCALES, NUM_KEYS, NUM_RANGE, sanitizeConfig, sanitizeValue, guardSignature, type PetConfig,
} from "../src/client/config";
import { dictKeys, t, setLang } from "../src/client/i18n";
import {
  DASH_BOOL_KEYS, DASH_NUM_ROWS, SETTINGS_ALL_KEYS,
  buildSavePatch, isBadNumValue, isDraftDirty, type DraftConfig,
} from "../src/client/settingsdraft";
import { fmtTokens } from "../src/client/format";
import { boardRows, fmtDur, fmtLongest } from "../src/client/boardrows";
import { KNOWN_RPC_CODES, PetError, isPetRpcError } from "../src/client/errors";
import { petErrMsg, type DashboardSummary, type ProjectCard } from "../src/client/api";
import { mergeUnchanged, POLL_INTERVAL_HIDDEN_MS, POLL_INTERVAL_MS } from "../src/client/store";
// 宿主 ESM 纯函数（allowJs:false 无声明；vitest 运行时直解）——用于客户端/宿主逐值恒等契约校验
// @ts-expect-error 宿主 JS 模块无类型声明
import { formatTokens as hostFormatTokens, PACE_LABELS as HOST_PACE_LABELS, summarize as hostSummarize } from "../src/host/dashboard.js";

describe("animations (MAM petAnimations 同表)", () => {
  it("frame table matches MAM exactly", () => {
    expect(ANIM.idle).toEqual({ row: 0, d: [280, 110, 110, 140, 140, 320] });
    expect(ANIM["run-right"]).toEqual({ row: 1, d: [120, 120, 120, 120, 120, 120, 120, 220] });
    expect(ANIM["run-left"].row).toBe(2);
    expect(ANIM.waving).toEqual({ row: 3, d: [140, 140, 140, 280] });
    expect(ANIM.jumping).toEqual({ row: 4, d: [140, 140, 140, 140, 280] });
    expect(ANIM.failed).toEqual({ row: 5, d: [140, 140, 140, 140, 140, 140, 140, 240] });
    expect(ANIM.waiting).toEqual({ row: 6, d: [150, 150, 150, 150, 150, 260] });
    expect(ANIM.running).toEqual({ row: 7, d: [120, 120, 120, 120, 120, 220] });
    expect(ANIM.review).toEqual({ row: 8, d: [150, 150, 150, 150, 150, 280] });
    expect(FRAME_W).toBe(192);
    expect(FRAME_H).toBe(208);
    expect(SHEET_COLS).toBe(8);
  });
  it("LOOK_FRAMES: 16 clockwise frames over rows 9→10, no -0", () => {
    expect(LOOK_FRAMES).toHaveLength(16);
    expect(LOOK_FRAMES[0]).toEqual({ x: 0, y: -9 * 208 });
    expect(Object.is(LOOK_FRAMES[0].x, -0)).toBe(false);
    expect(LOOK_FRAMES[7]).toEqual({ x: -7 * 192, y: -9 * 208 });
    expect(LOOK_FRAMES[8]).toEqual({ x: 0, y: -10 * 208 });
    expect(LOOK_FRAMES[15]).toEqual({ x: -7 * 192, y: -10 * 208 });
  });
  it("frameStyle scales sheet and clamps look frame", () => {
    const s = frameStyle("idle", 2, -1, 1, 11);
    expect(s.backgroundPosition).toBe(`${-2 * 192}px 0px`);
    expect(s.backgroundSize).toBe(`${192 * 8}px ${208 * 11}px`);
    const half = frameStyle("waving", 1, -1, 0.75, 9);
    expect(half.backgroundSize).toBe(`${144 * 8}px ${156 * 9}px`);
    const look = frameStyle("look", 0, 20, 1.25, 11); // 越界 clamp 到 15
    expect(look.backgroundPosition).toBe(`${LOOK_FRAMES[15].x * 1.25}px ${LOOK_FRAMES[15].y * 1.25}px`);
  });
});

describe("physics (MAM usePetWindow 数值语义)", () => {
  it("constants match MAM", () => {
    expect(GRAVITY).toBe(1400);
    expect(DAMP).toBe(0.86);
    expect(MIN_VX).toBe(24);
    expect(SQUASH_TIMING).toMatchObject({ squashMs: 60, squashScaleY: 0.55, bounceMs: 240, settleMs: 260, hopAnimMs: 1500 });
    expect(SQUASH_TIMING.bounceEasing).toBe("cubic-bezier(.34,1.56,.64,1)");
  });
  it("sampling window keeps only last 150ms", () => {
    const samples: { t: number; x: number; y: number }[] = [];
    pushSample(samples, 0, 0, 0);
    pushSample(samples, 100, 10, 0);
    pushSample(samples, 200, 20, 0); // t=0 超出 150ms 窗
    expect(samples[0].t).toBe(100);
    expect(samples).toHaveLength(2);
  });
  it("throwVelocity = window delta / dt", () => {
    expect(throwVelocity([])).toBe(0);
    expect(throwVelocity([{ t: 0, x: 0, y: 0 }])).toBe(0);
    const v = throwVelocity([
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 50, y: 0 },
    ]);
    expect(v).toBe(500); // 50px / 0.1s
  });
  it("dragDirection thresholds: up<-8, |x|>6", () => {
    expect(dragDirection(0, -9)).toBe("jumping");
    expect(dragDirection(0, -8)).toBeNull();
    expect(dragDirection(-7, 0)).toBe("run-left");
    expect(dragDirection(7, 0)).toBe("run-right");
    expect(dragDirection(6, -6)).toBeNull();
    expect(dragDirection(0, -20)).toBe("jumping"); // 上拖优先
  });
  it("stepFall integrates gravity, damps vx, clamps to ground and rest", () => {
    const b = viewportBounds(1000, 800, 192, 208, 76);
    expect(b.groundY).toBe(800 - 76 - 208);
    let s = { x: 100, y: 0, vx: 100, vy: 0, landed: false, rest: false };
    const dt = 1 / 60;
    for (let i = 0; i < 600 && !s.rest; i++) s = stepFall(s, dt, b.groundY, b.minX, b.maxX);
    expect(s.rest).toBe(true);
    expect(s.y).toBe(b.groundY);
    expect(Math.abs(s.vx)).toBeLessThan(MIN_VX);
  });
  it("stepFall caps dt at 0.05 (tab-switch resilience)", () => {
    const s0 = { x: 0, y: 0, vx: 0, vy: 0, landed: false, rest: false };
    const s = stepFall(s0, 10, 10000, 0, 1000); // dt=10 → capped 0.05
    expect(s.vy).toBeCloseTo(GRAVITY * 0.05, 5);
  });
  it("x clamped into viewport during fall", () => {
    const s = stepFall({ x: 5, y: 0, vx: -5000, vy: 0, landed: false, rest: false }, 0.05, 10000, 0, 800);
    expect(s.x).toBe(0);
    expect(s.vx).toBe(0);
  });
  it("clampPos keeps pet inside work area", () => {
    const p = clampPos(-50, 99999, 192, 208, 1000, 800, 76);
    expect(p.x).toBe(0);
    expect(p.y).toBe(800 - 76 - 208);
    const p2 = clampPos(99999, -10, 192, 208, 1000, 800, 76);
    expect(p2.x).toBe(1000 - 192);
    expect(p2.y).toBe(0);
  });
});

describe("voices (组内随机不重复 / 字幕时长)", () => {
  it("pickIndex never repeats consecutively, handles edges", () => {
    expect(pickIndex(0, -1)).toBe(-1);
    expect(pickIndex(1, 5)).toBe(0);
    for (let i = 0; i < 50; i++) {
      const a = pickIndex(3, -1);
      const b = pickIndex(3, a);
      expect(b).not.toBe(a);
      expect([0, 1, 2]).toContain(b);
    }
  });
  it("subtitleMs = max(2500, dur+250)", () => {
    expect(MIN_SPEECH_MS).toBe(2500);
    expect(subtitleMs(1)).toBe(2500);
    expect(subtitleMs(3)).toBe(3250);
    expect(subtitleMs(NaN)).toBe(2500);
    expect(subtitleMs(-5)).toBe(2500);
  });
});

describe("validation (与宿主同规则)", () => {
  it("audio validity window: 1s < d < 20s, ≤10MB", () => {
    expect(MIN_DURATION_MS).toBe(1000);
    expect(MAX_DURATION_MS).toBe(20000);
    expect(MAX_AUDIO_BYTES).toBe(10 * 1024 * 1024);
    const row = (durationMs: number | null, sizeBytes = 100) => ({ group: "", name: "", file: "voice/general/a.m4a", sizeBytes, durationMs });
    expect(voiceRowProblem(row(null))).toBe("no-duration");
    expect(voiceRowProblem(row(1000))).toBe("too-short");
    expect(voiceRowProblem(row(1001))).toBeNull();
    expect(voiceRowProblem(row(20000))).toBe("too-long");
    expect(voiceRowProblem(row(19999))).toBeNull();
    expect(voiceRowProblem(row(5000, MAX_AUDIO_BYTES + 1))).toBe("too-big");
  });
  it("judgeVoiceTier: all-four-groups rule (全有或全无)", () => {
    const file = (g: string, ok = true) => ({ rel: `voice/${g}/x.m4a`, size: 10, durationMs: ok ? 3000 : null });
    expect(judgeVoiceTier([file("general"), file("approval"), file("done"), file("error")]).hasVoice).toBe(true);
    const missing = judgeVoiceTier([file("general"), file("approval"), file("done")]);
    expect(missing.hasVoice).toBe(false);
    expect(missing.coverage.error).toBe(0);
    // 非法时长不计入 coverage
    const invalid = judgeVoiceTier([file("general", false), file("approval"), file("done"), file("error")]);
    expect(invalid.hasVoice).toBe(false);
  });
  it("groupOfRel / nameFromRel / isAudioCandidate", () => {
    expect(groupOfRel("voice/done/a b.m4a")).toBe("done");
    expect(groupOfRel("voice/nope/a.m4a")).toBeNull();
    expect(groupOfRel("voice/general/sub/a.m4a")).toBeNull();
    expect(nameFromRel("voice/general/你好.m4a")).toBe("你好");
    expect(isAudioCandidate({ rel: "voice/general/a.m4a", exists: true, size: 1 })).toBe(true);
    expect(isAudioCandidate({ rel: "voice/general/a.txt", exists: true, size: 1 })).toBe(false);
    expect(isAudioCandidate({ rel: "voice/general/a.m4a", exists: false, size: 0 })).toBe(false);
  });
  it("rowsFromSize / spriteVersionOf", () => {
    expect(rowsFromSize(1536, 2288)).toBe(11);
    expect(rowsFromSize(1536, 1872)).toBe(9);
    expect(rowsFromSize(1536, 2000)).toBeNull();
    expect(rowsFromSize(1000, 2288)).toBeNull();
    expect(spriteVersionOf(9)).toBe(1);
    expect(spriteVersionOf(11)).toBe(2);
  });
  it("petNameProblem order: too-long > charset > reserved-device > reserved > duplicate", () => {
    expect(petNameProblem("")).toBe("empty");
    expect(petNameProblem("a".repeat(65))).toBe("too-long");
    expect(petNameProblem("../x")).toBe("charset");
    expect(petNameProblem("CON")).toBe("reserved-device");
    expect(petNameProblem("foxbell")).toBe("reserved");
    expect(petNameProblem("pet", { existingIds: ["Pet"] })).toBe("duplicate");
    expect(petNameProblem("pet", { existingIds: ["pet"], selfId: "pet" })).toBeNull();
    expect(petNameProblem("good_name-1")).toBeNull();
    expect(petNameProblemKey("duplicate")).toBe("import.nameDup");
  });
  it("diffManifestVsScan mirrors host guard algorithm", () => {
    const m: PetManifestView = {
      schemaVersion: 2, id: "p", displayName: "P", hasVoice: true, hasSubtitle: true, spriteVersionNumber: 2,
      spritesheetSizeBytes: 100,
      voices: [
        { group: "general", name: "a", file: "voice/general/a.m4a", sizeBytes: 10, durationMs: 3000 },
        { group: "done", name: "gone", file: "voice/done/gone.m4a", sizeBytes: 5, durationMs: 3000 },
      ],
    };
    const s: PetScan = {
      id: "p", dir: "/x",
      spritesheet: { rel: "spritesheet.webp", exists: true, size: 120 },
      voiceFiles: [
        { rel: "voice/general/a.m4a", exists: true, size: 10 },
        { rel: "voice/error/new.m4a", exists: true, size: 7 },
      ],
    };
    const kinds = diffManifestVsScan(m, s).map((i) => i.kind);
    expect(kinds).toContain("spritesheet-changed");
    expect(kinds).toContain("voice-missing");
    expect(kinds).toContain("voice-extra");
    expect(diffManifestVsScan(m, { ...s, spritesheet: { rel: "spritesheet.webp", exists: false, size: 0 } })[0].kind).toBe("spritesheet-missing");
  });
  it("manifestVoiceCapOnDisk conservative on any drift", () => {
    const m: PetManifestView = {
      schemaVersion: 2, id: "p", displayName: "P", hasVoice: true, hasSubtitle: true, spriteVersionNumber: 2, spritesheetSizeBytes: 1,
      voices: [{ group: "general", name: "a", file: "voice/general/a.m4a", sizeBytes: 10, durationMs: 3000 }],
    };
    const okScan: PetScan = { id: "p", dir: "", spritesheet: { rel: "", exists: true, size: 1 }, voiceFiles: [{ rel: "voice/general/a.m4a", exists: true, size: 10 }] };
    expect(manifestVoiceCapOnDisk(m, okScan)).toBe(true);
    const drift: PetScan = { ...okScan, voiceFiles: [{ rel: "voice/general/a.m4a", exists: true, size: 11 }] };
    expect(manifestVoiceCapOnDisk(m, drift)).toBe(false);
  });
});

describe("statuscards (MAM 色彩口径)", () => {
  const card = (status: "running" | "approval" | "error" | "done", unread = false): ProjectCard =>
    ({ id: "x", title: "T", lines: [], status, unread, age: "" });
  it("红=待审批 黄=运行 绿=完成未读 深红=错误", () => {
    expect(lightOf(card("approval"))).toBe("approval-red");
    expect(lightOf(card("running"))).toBe("running-yellow");
    expect(lightOf(card("done", true))).toBe("done-green");
    expect(lightOf(card("error"))).toBe("error-darkred");
    expect(DOT_COLOR["approval-red"]).toBe("#ef4444");
    expect(DOT_COLOR["running-yellow"]).toBe("#eab308");
    expect(DOT_COLOR["done-green"]).toBe("#22c55e");
    expect(DOT_COLOR["error-darkred"]).toBe("#7f1d1d"); // 深红，与待审批红明确区分
    expect(DOT_COLOR["error-darkred"]).not.toBe(DOT_COLOR["approval-red"]);
  });
  it("taskPose: waiting > running > null (全绿回落站立)", () => {
    expect(taskPoseOf([card("approval"), card("running")])).toBe("waiting");
    expect(taskPoseOf([card("running")])).toBe("running");
    expect(taskPoseOf([card("done", true)])).toBeNull();
    expect(taskPoseOf([])).toBeNull();
  });
  it("truncate token-aware with char fallback", () => {
    expect(truncate("短", 24)).toBe("短");
    const long = "u".repeat(60); // 无空格长串：字符兜底 48
    expect(truncate(long, 24).length).toBeLessThanOrEqual(49);
  });
});

describe("config (旧配置兼容 + sanitize)", () => {
  it("v1 saved config (no scale/activePetId) loads with defaults, zero errors", () => {
    const v1Saved = { muted: true, talkative: false, doneAction: "waving", dblAction: "jumping", approvalAction: "review", errorAction: "running", gravity: false };
    const merged = { ...CFG_DEFAULT, ...v1Saved } as PetConfig;
    const sanitized = sanitizeConfig(merged);
    expect(sanitized.scale).toBe(1);
    expect(sanitized.activePetId).toBe("foxbell");
    expect(sanitized.muted).toBe(true);
    expect(sanitized.doneAction).toBe("waving");
    expect(sanitized.gravity).toBe(false);
  });
  it("CFG_DEFAULT matches host Config schema defaults", () => {
    expect(CFG_DEFAULT).toMatchObject({
      muted: false, talkative: true, doneAction: "jumping", dblAction: "waving",
      approvalAction: "waiting", errorAction: "failed", gravity: true, scale: 1, activePetId: "foxbell",
    });
  });
  it("sanitize rejects illegal scale/activePetId/action values", () => {
    expect(sanitizeValue("scale", 2)).toBe(1);
    expect(sanitizeValue("scale", 0.75)).toBe(0.75);
    expect(CFG_SCALES).toEqual([0.75, 1, 1.25]);
    expect(sanitizeValue("activePetId", "../evil")).toBe("foxbell");
    expect(sanitizeValue("activePetId", "")).toBe("foxbell");
    expect(sanitizeValue("activePetId", "my-pet_2")).toBe("my-pet_2");
    expect(sanitizeValue("doneAction", "flying")).toBe("jumping");
    expect(sanitizeValue("muted", 1)).toBe(true);
  });
  it("CFG_DEFAULT 含看板 12 键（键名/默认值逐字契约，对齐宿主 Config schema 与 v1.4.0）", () => {
    expect(CFG_DEFAULT).toMatchObject({
      paceEnabled: true, paceIntenseEvents: 12, paceLongrunMin: 3, paceLoafStartMin: 15,
      usageEnabled: true, dayLimitTokens: 0, milestoneUnit: 1000000, approvalFlickerMin: 5,
      summaryEnabled: true, summaryEntrySec: 15, boardTtlSec: 15, ttsEnabled: false,
    });
    expect(NUM_KEYS).toEqual([
      "paceIntenseEvents", "paceLongrunMin", "paceLoafStartMin", "dayLimitTokens",
      "milestoneUnit", "approvalFlickerMin", "summaryEntrySec", "boardTtlSec",
    ]);
    expect(NUM_RANGE).toEqual({
      paceIntenseEvents: [1, 1000], paceLongrunMin: [1, 120], paceLoafStartMin: [1, 240],
      dayLimitTokens: [0, 1e9], milestoneUnit: [0, 1e9], approvalFlickerMin: [0, 120],
      summaryEntrySec: [5, 60], boardTtlSec: [5, 120],
    });
  });
  it("看板数值键钳制：越界夹紧、非有限回退默认、Number 转换 + 四舍五入（v1.4.0 clampNum 语义）", () => {
    expect(sanitizeValue("paceIntenseEvents", 0)).toBe(1); // 下夹紧
    expect(sanitizeValue("paceIntenseEvents", 5000)).toBe(1000); // 上夹紧
    expect(sanitizeValue("paceIntenseEvents", "12")).toBe(12); // Number() 转换
    expect(sanitizeValue("paceIntenseEvents", Number.NaN)).toBe(12); // 非有限 → 默认
    expect(sanitizeValue("paceIntenseEvents", Infinity)).toBe(12);
    expect(sanitizeValue("paceIntenseEvents", 12.4)).toBe(12); // round
    expect(sanitizeValue("paceIntenseEvents", 12.5)).toBe(13);
    expect(sanitizeValue("paceLongrunMin", 0)).toBe(1);
    expect(sanitizeValue("paceLoafStartMin", 241)).toBe(240);
    expect(sanitizeValue("dayLimitTokens", -1)).toBe(0);
    expect(sanitizeValue("dayLimitTokens", 5e9)).toBe(1e9);
    expect(sanitizeValue("milestoneUnit", 1e12)).toBe(1e9);
    expect(sanitizeValue("approvalFlickerMin", 121)).toBe(120);
    expect(sanitizeValue("summaryEntrySec", 4)).toBe(5);
    expect(sanitizeValue("summaryEntrySec", 61)).toBe(60);
    expect(sanitizeValue("boardTtlSec", 1)).toBe(5);
    expect(sanitizeValue("boardTtlSec", 999)).toBe(120);
  });
  it("看板布尔键经布尔真值化（v2 直落风格，无 BOOL_KEYS 表）；12 键配置回环保真", () => {
    expect(sanitizeValue("paceEnabled", 1)).toBe(true);
    expect(sanitizeValue("ttsEnabled", 0)).toBe(false);
    expect(sanitizeValue("usageEnabled", "yes")).toBe(true);
    expect(sanitizeValue("summaryEnabled", undefined)).toBe(false);
    const edited = sanitizeConfig(
      { ...CFG_DEFAULT, paceIntenseEvents: 99999, ttsEnabled: true, dayLimitTokens: 123456 } as PetConfig,
    );
    const round2 = sanitizeConfig(JSON.parse(JSON.stringify(edited)) as PetConfig);
    expect(round2.paceIntenseEvents).toBe(1000); // 存档越界值被钳回
    expect(round2.ttsEnabled).toBe(true);
    expect(round2.dayLimitTokens).toBe(123456);
  });
  it("guardSignature stable under issue reordering", () => {
    const a = guardSignature("p", [{ kind: "voice-missing", detail: "x" }, { kind: "voice-extra", detail: "y" }]);
    const b = guardSignature("p", [{ kind: "voice-extra", detail: "y" }, { kind: "voice-missing", detail: "x" }]);
    expect(a).toBe(b);
    expect(guardSignature("p2", [{ kind: "voice-missing", detail: "x" }])).not.toBe(a);
  });
});

describe("settingsDraft（设置卡草稿层，Task 9；v1.4.0 886b303 L1130-1235 移植）", () => {
  // 键集契约：3 基础开关 + 4 看板开关 + 8 看板数字 + 5 动作下拉 + 缩放 = 21 键，无重复
  it("SETTINGS_ALL_KEYS = 21 键全覆盖且无重复；DASH_NUM_ROWS 键集 = NUM_KEYS", () => {
    expect(SETTINGS_ALL_KEYS).toHaveLength(21);
    expect(new Set(SETTINGS_ALL_KEYS).size).toBe(21);
    expect([...SETTINGS_ALL_KEYS]).toEqual([
      "muted", "talkative", "gravity",
      "paceEnabled", "usageEnabled", "summaryEnabled", "ttsEnabled",
      "dayLimitTokens", "milestoneUnit", "paceIntenseEvents", "paceLongrunMin",
      "paceLoafStartMin", "approvalFlickerMin", "summaryEntrySec", "boardTtlSec",
      "dblAction", "approvalAction", "runningAction", "errorAction", "doneAction",
      "scale",
    ]);
    expect(DASH_BOOL_KEYS).toHaveLength(4);
    expect(DASH_NUM_ROWS).toHaveLength(8);
    for (const k of DASH_NUM_ROWS) expect(NUM_KEYS).toContain(k); // 显示顺序独立于钳制表，键集必须一致
  });
  it("isBadNumValue：空串/非法串/null 为无效（Number('')=0 是有限数，空串必须先判）", () => {
    expect(isBadNumValue("")).toBe(true);
    expect(isBadNumValue("abc")).toBe(true);
    expect(isBadNumValue(null)).toBe(true);
    expect(isBadNumValue(undefined)).toBe(true); // Number(undefined)=NaN 兜底
    expect(isBadNumValue("12")).toBe(false);
    expect(isBadNumValue("0")).toBe(false); // 0=关 是合法值
    expect(isBadNumValue(0)).toBe(false);
    expect(isBadNumValue(12.5)).toBe(false);
  });
  it("buildSavePatch 根因修复：数字草稿（字符串）提交为 Number，不再被 z.number() 静默丢配", () => {
    const draft = { ...CFG_DEFAULT, boardTtlSec: "30", dayLimitTokens: "5000" } as DraftConfig;
    const patch = buildSavePatch(draft, CFG_DEFAULT);
    expect(patch.boardTtlSec).toBe(30);
    expect(patch.dayLimitTokens).toBe(5000);
    expect(typeof patch.boardTtlSec).toBe("number"); // v1.4.0 根因：字符串直写被宿主 schema 拒绝
    expect(Object.keys(patch).sort()).toEqual(["boardTtlSec", "dayLimitTokens"]); // 仅变更键入 patch
  });
  it("buildSavePatch：NUM_RANGE 钳制 + 非数字键透传；布尔/动作/缩放走原值", () => {
    const draft = {
      ...CFG_DEFAULT,
      paceIntenseEvents: "99999", // 越界 → 钳到 1000
      summaryEntrySec: "3", // 下越界 → 钳到 5
      talkative: false,
      muted: true,
      gravity: false,
      doneAction: "review",
      scale: 1.25,
    } as DraftConfig;
    const patch = buildSavePatch(draft, CFG_DEFAULT);
    expect(patch.paceIntenseEvents).toBe(1000);
    expect(patch.summaryEntrySec).toBe(5);
    expect(patch.talkative).toBe(false);
    expect(patch.muted).toBe(true);
    expect(patch.doneAction).toBe("review");
    expect(patch.scale).toBe(1.25);
  });
  it("isDraftDirty：String 口径比对——草稿 '12' vs 已存 12 不算脏；真实差异才算", () => {
    expect(isDraftDirty({ ...CFG_DEFAULT }, CFG_DEFAULT)).toBe(false);
    expect(isDraftDirty({ ...CFG_DEFAULT, paceLongrunMin: "3" } as DraftConfig, CFG_DEFAULT)).toBe(false);
    expect(isDraftDirty({ ...CFG_DEFAULT, paceLongrunMin: "4" } as DraftConfig, CFG_DEFAULT)).toBe(true);
    expect(isDraftDirty({ ...CFG_DEFAULT, ttsEnabled: true } as DraftConfig, CFG_DEFAULT)).toBe(true);
    expect(isDraftDirty({ ...CFG_DEFAULT, scale: 0.75 } as DraftConfig, CFG_DEFAULT)).toBe(true);
  });
});

describe("configStore × settings scope（写后回读 + 冲突重试）", () => {
  it("scope.set 冲突吞写后，verifyWrite 用真实 describe + HTTP 直写兜底", async () => {
    const { createConfigStore } = await import("../src/client/config");
    // 假 scope：set 永不落盘（模拟 fiber dispose 后静默 resolve），fetch 需 mock
    let user: Record<string, unknown> = {};
    const writes: string[] = [];
    const origFetch = globalThis.fetch;
    // 模拟宿主：settings/update 落盘（成功），settings/describe 返回当前落盘值
    let onDisk: Record<string, unknown> = {};
    globalThis.fetch = ((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}"));
      if (url.includes("settings/update")) {
        const patch = body.payload?.args?.patch ?? {};
        onDisk = { ...onDisk, ...patch };
        return Promise.resolve(new Response(JSON.stringify({ result: { ok: true } })));
      }
      if (url.includes("settings/describe")) {
        return Promise.resolve(new Response(JSON.stringify({
          result: { value: { namespaces: [{ ns: "foxbell-pet", user: { ...onDisk } }] } },
        })));
      }
      return origFetch(input as RequestInfo, init);
    }) as typeof fetch;
    const scope = {
      getSnapshot: () => ({ status: "ready", value: { ...user }, user: { ...user } }),
      subscribe: () => () => {},
      set: (_field: string, value: unknown) => {
        writes.push(String(value));
        return Promise.resolve(); // 静默 resolve，模拟死 scope
      },
    };
    const store = createConfigStore();
    const detach = store.attachScope(scope as never);
    store.set({ activePetId: "conan" });
    // scope 静默 → verifyWrite 真实 describe 不符 → HTTP 直写落盘
    await new Promise((r) => setTimeout(r, 1500));
    expect(onDisk.activePetId, "HTTP 直写应最终落盘").toBe("conan");
    globalThis.fetch = origFetch;
    detach();
  });
  it("scope user 层按写入值收敛时 pending 清除、快照取 scope 值", async () => {
    const { createConfigStore } = await import("../src/client/config");
    let user: Record<string, unknown> = {};
    const scope = {
      getSnapshot: () => ({ status: "ready", value: { ...user }, user: { ...user } }),
      subscribe: () => () => {},
      set: (_field: string, value: unknown) => {
        user = { ...user, activePetId: value };
        return Promise.resolve();
      },
    };
    const store = createConfigStore();
    const detach = store.attachScope(scope as never);
    store.set({ activePetId: "conan" });
    await new Promise((r) => setTimeout(r, 900));
    expect(store.getSnapshot().activePetId).toBe("conan");
    detach();
  });
});

describe("i18n 字典完整性", () => {
  it("zh/en key sets identical", () => {
    const zh = new Set(dictKeys("zh"));
    const en = new Set(dictKeys("en"));
    for (const k of zh) expect(en.has(k), `en missing ${k}`).toBe(true);
    for (const k of en) expect(zh.has(k), `zh missing ${k}`).toBe(true);
  });
  it("every KNOWN_RPC_CODE + local err code has zh & en entries", () => {
    const zh = new Set(dictKeys("zh"));
    for (const c of KNOWN_RPC_CODES) expect(zh.has(`rpc.${c}`), `rpc.${c}`).toBe(true);
    for (const c of ["sheet-missing", "sheet-bad-size", "sheet-load-fail", "sheet-timeout", "audio-timeout", "audio-bad-duration", "audio-load-fail", "scan-fail"]) {
      expect(zh.has(`err.${c}`), `err.${c}`).toBe(true);
    }
    for (const k of ["spritesheet-missing", "spritesheet-changed", "voice-missing", "voice-changed", "voice-extra", "manifest-missing"]) {
      expect(zh.has(`issue.${k}`), `issue.${k}`).toBe(true);
    }
  });
  it("t() interpolates {param} and falls back to key", () => {
    setLang("zh");
    expect(t("rpc.pet-exists", { name: "abc" })).toBe("宠物已存在：abc");
    expect(t("rpc.pet-name-too-long", { max: 64 })).toContain("64");
    expect(t("no.such.key")).toBe("no.such.key");
    setLang("en");
    expect(t("rpc.pet-exists", { name: "abc" })).toBe("Pet already exists: abc");
    setLang("zh");
  });
  it("dash.* 效率看板键 zh/en 成对、60 键在位、五口径名词逐字（行为不变量）", () => {
    const expectedDash = [
      "dash.today", "dash.requestInput", "dash.hit", "dash.cacheHit", "dash.output",
      "dash.yourInput", "dash.estimateSuffix", "dash.withSubagents", "dash.sessionReq",
      "dash.summaryTitle", "dash.farewellTitle", "dash.summaryEntry", "dash.menuUsage",
      "dash.menuSummary", "dash.menuSessions", "dash.unsaved", "dash.saved",
      "dash.invalidNums", "dash.save", "dash.discard", "dash.caliberNote", "dash.noActive",
      // Task 6 迷你条：表盘档位（tier→label 客户端查表）+ 状态计数短词 + 本会话行「请求」
      "dash.tier.intense", "dash.tier.active", "dash.tier.longrun", "dash.tier.idle",
      "dash.tier.loaf1", "dash.tier.loaf2", "dash.tier.loaf3", "dash.tier.loaf4",
      "dash.countApproval", "dash.countRunning", "dash.countDone", "dash.request",
      // Task 7 小黑板：行拼装名词/耗时单位/会话一览空态
      "dash.boardSessions", "dash.boardTurns", "dash.boardErrors", "dash.boardTodayToken",
      "dash.boardHitPct", "dash.boardToolsTop", "dash.boardLongest", "dash.boardToolDur",
      "dash.toolTotal", "dash.durMin", "dash.durSec", "dash.durMs", "dash.noSessions",
      // Task 8 标题闪烁：页外召集文本（spec 6.3；document.title 每秒轮换）
      "dash.flickerTitle",
      // Task 9 设置卡 12 键标签（草稿行）
      "dash.cfg.paceEnabled", "dash.cfg.usageEnabled", "dash.cfg.summaryEnabled", "dash.cfg.ttsEnabled",
      "dash.cfg.dayLimitTokens", "dash.cfg.milestoneUnit", "dash.cfg.paceIntenseEvents",
      "dash.cfg.paceLongrunMin", "dash.cfg.paceLoafStartMin", "dash.cfg.approvalFlickerMin",
      "dash.cfg.summaryEntrySec", "dash.cfg.boardTtlSec",
    ];
    expect(expectedDash).toHaveLength(60); // 标题计数防再次失真（原 47 系陈旧值）
    const zhDash = dictKeys("zh").filter((k) => k.startsWith("dash.")).sort();
    expect(zhDash).toEqual([...expectedDash].sort());
    const en = new Set(dictKeys("en"));
    for (const k of expectedDash) expect(en.has(k), `en missing ${k}`).toBe(true);
    setLang("zh");
    expect(t("dash.requestInput")).toBe("请求输入");
    expect(t("dash.cacheHit")).toBe("缓存命中");
    expect(t("dash.hit")).toBe("命中");
    expect(t("dash.output")).toBe("产出");
    expect(t("dash.yourInput")).toBe("你的输入");
    expect(t("dash.estimateSuffix")).toBe("(估)");
    expect(t("dash.withSubagents")).toBe("含子代理");
    expect(t("dash.invalidNums", { n: 2 })).toBe("2 个数值无效");
    expect(t("dash.noActive")).toBe("暂无进行中会话");
    expect(t("dash.countApproval")).toBe("等审批");
    expect(t("dash.countRunning")).toBe("运行");
    expect(t("dash.countDone")).toBe("完成");
    expect(t("dash.request")).toBe("请求");
    expect(t("dash.unsaved")).toBe("有未保存更改");
    expect(t("dash.saved")).toBe("已保存 ✓");
    expect(t("dash.cfg.paceEnabled")).toBe("节奏档位");
    expect(t("dash.cfg.dayLimitTokens")).toBe("日 token 阈值(0=关)");
    expect(t("dash.cfg.approvalFlickerMin")).toBe("审批闪烁(分,0=关)");
    setLang("en");
    expect(t("dash.requestInput")).toBe("Request input");
    expect(t("dash.withSubagents")).toBe("incl. subagents");
    expect(t("dash.invalidNums", { n: 2 })).toBe("2 invalid value(s)");
    expect(t("dash.tier.intense")).toBe("Intense");
    expect(t("dash.tier.loaf4")).toBe("Loafing·Dried fish");
    expect(t("dash.cfg.ttsEnabled")).toBe("TTS speech");
    expect(t("dash.cfg.boardTtlSec")).toBe("Board stay (sec)");
    setLang("zh");
  });
  it("dash.tier.* zh 与宿主 PACE_LABELS 逐字节一致（表盘标签按 tier 客户端查表，宿主 label 仅兜底）", () => {
    setLang("zh");
    for (const tier of Object.keys(HOST_PACE_LABELS)) {
      expect(t(`dash.tier.${tier}`), `tier ${tier}`).toBe(HOST_PACE_LABELS[tier as keyof typeof HOST_PACE_LABELS]);
    }
    setLang("en");
    expect(t("dash.tier.idle")).toBe("Idle");
    expect(t("dash.tier.active")).toBe("Active");
    expect(t("dash.tier.longrun")).toBe("Long task");
    setLang("zh");
  });
});

describe("fmtTokens（万/亿 格式化，formatTokens 客户端移植）", () => {
  it("小数值：四舍五入取整；0/负数/非有限安全归 0", () => {
    expect(fmtTokens(0)).toBe("0");
    expect(fmtTokens(0.4)).toBe("0");
    expect(fmtTokens(999)).toBe("999");
    expect(fmtTokens(1234)).toBe("1234");
    expect(fmtTokens(9999)).toBe("9999"); // 9999 边界：不进万
    expect(fmtTokens(-1)).toBe("0");
    expect(fmtTokens(-99999)).toBe("0");
    expect(fmtTokens(Number.NaN)).toBe("0");
    expect(fmtTokens(Number.POSITIVE_INFINITY)).toBe("0");
  });
  it("万档：一位小数，尾零 .0 剥除", () => {
    expect(fmtTokens(10000)).toBe("1万"); // 1.0 → 1万（剥 .0）
    expect(fmtTokens(12345)).toBe("1.2万");
    expect(fmtTokens(15000)).toBe("1.5万");
    expect(fmtTokens(100000)).toBe("10万");
    expect(fmtTokens(115000)).toBe("11.5万");
    expect(fmtTokens(99999999)).toBe("10000万"); // 万档上界：分支在舍入前判定，不进亿（与宿主逐值恒等）
  });
  it("亿档：两位小数，尾零连同小数点剥除（.20→.2、.00→整）", () => {
    expect(fmtTokens(100000000)).toBe("1亿"); // 1.00 → 1亿
    expect(fmtTokens(105000000)).toBe("1.05亿"); // 中位零保留
    expect(fmtTokens(120000000)).toBe("1.2亿"); // 1.20 → 1.2亿
    expect(fmtTokens(123456789)).toBe("1.23亿");
    expect(fmtTokens(9999999999)).toBe("100亿"); // 99.999…→toFixed(2)=100.00→剥零
  });
  it("与宿主 formatTokens 逐值恒等（契约：同一 token 数两端渲染同一字符串）", () => {
    const corpus = [
      0, 1, 7, 999, 1500, 9999, 10000, 10001, 12345, 50000, 99999, 100000, 105000, 115000,
      999999, 1000000, 1234567, 9994999, 9995000, 9999999, 50000000, 99999999, 100000000,
      100050000, 120000000, 123456789, 999999999, 3.7e9, 1e11, 1e12,
    ];
    for (const n of corpus) expect(fmtTokens(n), `n=${n}`).toBe(hostFormatTokens(n));
  });
});

describe("boardRows（小黑板行拼装，Task 7）", () => {
  // 与 test/state-dashboard.test.mjs「summary 结构化增量」同一组输入：结构化字段拼装 ↔ 宿主 zh 字符串双向钉住
  const perSession = [{ turns: 4, errors: 1, toolCalls: { Bash: 1 }, toolDurMs: { Bash: 5000 }, longestTurnMs: 120000 }];
  const dayUsage = { inputTokens: 1600, outputTokens: 1050, cacheReadTokens: 4000, cacheWriteTokens: 200 };
  const host = hostSummarize(perSession, dayUsage, 10) as {
    sessions: number; turns: number; errors: number; tokensText: string; toolsText: string; longestText: string;
  };
  const summary: DashboardSummary = {
    sessions: 1,
    turns: 4,
    errors: 1,
    tokensText: host.tokensText,
    toolsText: host.toolsText,
    longestText: host.longestText,
    tokens: { requestTotal: 5600, cacheRead: 4000, hitPct: (4000 / 5600) * 100, output: 1050, userEst: 10 },
    toolRows: [{ name: "Bash", count: 1, ms: 5000 }],
    longest: { ms: 120000 },
  };

  it("zh 拼装与宿主 summarize zh 字符串逐字节一致（黑板四行序同源）", () => {
    setLang("zh");
    const rows = boardRows(summary);
    expect(rows[0]).toBe("会话 1 · turn 4 · 报错 1");
    expect(rows[1]).toBe("今日 token " + host.tokensText);
    expect(rows[2]).toBe("工具 Top3 " + host.toolsText);
    expect(rows[3]).toBe("最长单 turn " + host.longestText);
    expect(rows[1]).toBe("今日 token 请求输入 5600（缓存命中 4000 · 71.4%）· 产出 1050 · 你的输入 ~10(估) · 含子代理");
    expect(rows[2]).toBe("工具 Top3 Bash×1（共 5.0 秒）");
    expect(rows[3]).toBe("最长单 turn 2.0 分钟");
  });
  it("en 拼装走同构英文（t() + fmtTokens，结构不变）", () => {
    setLang("en");
    const rows = boardRows(summary);
    expect(rows[0]).toBe("Sessions 1 · turns 4 · errors 1");
    expect(rows[1]).toBe("Today's tokens Request input 5600 (Cache hit 4000 · 71.4%) · Output 1050 · Your input ~10(est.) · incl. subagents");
    expect(rows[2]).toBe("Top 3 tools Bash×1 (total 5.0 s)");
    expect(rows[3]).toBe("Longest turn 2.0 min");
    setLang("zh");
  });
  it("耗时三档镜像宿主 formatDur；longest null → 「0 秒」桶；工具空 → —", () => {
    setLang("zh");
    expect(fmtDur(500)).toBe("500 毫秒");
    expect(fmtDur(2500)).toBe("2.5 秒");
    expect(fmtDur(90000)).toBe("1.5 分钟");
    expect(fmtLongest(45000)).toBe("45 秒");
    expect(fmtLongest(0)).toBe("0 秒");
    const empty: DashboardSummary = { ...summary, toolRows: [], longest: null };
    const rows = boardRows(empty);
    expect(rows[2]).toBe("工具 Top3 —");
    expect(rows[3]).toBe("最长单 turn 0 秒");
    setLang("en");
    expect(fmtDur(2500)).toBe("2.5 s");
    expect(fmtLongest(90000)).toBe("1.5 min");
    setLang("zh");
  });
  it("多工具条目按宿主 toolsText 同构 join（×N 与耗时段并存）", () => {
    setLang("zh");
    const multi: DashboardSummary = { ...summary, toolRows: [
      { name: "Read", count: 5, ms: 4000 },
      { name: "Bash", count: 3, ms: 60000 },
      { name: "Grep", count: 2, ms: 0 },
    ] };
    expect(boardRows(multi)[2]).toBe("工具 Top3 Read×5（共 4.0 秒） · Bash×3（共 1.0 分钟） · Grep×2");
    setLang("zh");
  });
});

describe("petErrMsg 分流 (MAM 同款)", () => {
  it("PetError → err.<code> with params", () => {
    expect(petErrMsg(new PetError("sheet-bad-size", { w: 100, h: 200 }), t)).toContain("100");
  });
  it("rpc-shaped error → rpc.<code>", () => {
    expect(petErrMsg({ code: "pet-not-found", params: { id: "x" }, detail: "" }, t)).toBe("宠物不存在：x");
  });
  it("plain Error message passthrough; junk → scan-fail", () => {
    expect(petErrMsg(new Error("raw failure"), t)).toBe("raw failure");
    expect(petErrMsg(42, t)).toBe(t("err.scan-fail"));
  });
  it("isPetRpcError excludes PetError instances", () => {
    expect(isPetRpcError(new PetError("scan-fail"))).toBe(false);
    expect(isPetRpcError({ code: "internal" })).toBe(true);
    expect(isPetRpcError(null)).toBe(false);
  });
});

describe("旧配置迁移完整回环（R2 边界自查 3e）", () => {
  it("v1 存量 → 加载补默认 → 序列化保存 → 再加载：旧字段零破坏、新字段默认在位", () => {
    // 1) v1.3.0 时代存档（仅 7 字段）
    const v1Saved = { muted: true, talkative: false, doneAction: "review", dblAction: "jumping", approvalAction: "running", errorAction: "waving", gravity: false };
    // 2) 加载路径：合并默认 + sanitize
    const loaded = sanitizeConfig({ ...CFG_DEFAULT, ...v1Saved } as PetConfig);
    expect(loaded.scale).toBe(1);
    expect(loaded.activePetId).toBe("foxbell");
    // 3) 保存路径：序列化 → 存储 → 反序列化 → 再 sanitize（模拟第二轮启动）
    const serialized = JSON.stringify(loaded);
    const reloaded = sanitizeConfig(JSON.parse(serialized) as PetConfig);
    // 4) 旧字段逐项保真（值与 v1 存档一致，未被默认值覆盖）
    for (const k of Object.keys(v1Saved) as (keyof typeof v1Saved)[]) {
      expect(reloaded[k], `field ${k}`).toBe(v1Saved[k]);
    }
    // 5) 新字段在第二轮仍为默认值（幂等）
    expect(reloaded.scale).toBe(1);
    expect(reloaded.activePetId).toBe("foxbell");
    // 6) 用户在 v2 改过新字段后，回环同样保真
    const edited = sanitizeConfig({ ...reloaded, scale: 1.25, activePetId: "my-pet" } as PetConfig);
    const round2 = sanitizeConfig(JSON.parse(JSON.stringify(edited)) as PetConfig);
    expect(round2.scale).toBe(1.25);
    expect(round2.activePetId).toBe("my-pet");
    expect(round2.muted).toBe(true); // 旧字段仍未被扰动
  });
  it("损坏存档（非对象/夹带非法值）→ sanitize 收敛到安全默认，不抛错", () => {
    expect(sanitizeConfig(JSON.parse("null") as unknown as PetConfig)).toMatchObject(CFG_DEFAULT);
    const junk = sanitizeConfig({ muted: "yes", scale: 3, activePetId: "../x", doneAction: "flying" } as unknown as PetConfig);
    expect(junk.muted).toBe(true); // 真值化
    expect(junk.scale).toBe(1);
    expect(junk.activePetId).toBe("foxbell");
    expect(junk.doneAction).toBe("jumping");
  });
});

describe("v2.2 P3 unchanged merge", () => {
  it("merges ages into current snapshot and keeps rest", () => {
    const snap = { seq: 5, rev: "R1", projects: [{ id: "a", age: "1s" }, { id: "b", age: "2s" }] } as any;
    const out = mergeUnchanged(snap, { rev: "R1", unchanged: true, ages: ["9s", "8s"], seq: 5 });
    expect(out.projects[0].age).toBe("9s");
    expect(out.projects[1].age).toBe("8s");
    expect(out.rev).toBe("R1");
  });
  it("ages 短于 projects 时缺位回落原 age；seq/rev 随响应刷新，其余字段原样保留", () => {
    const snap = {
      seq: 5, rev: "R1", runningSessions: 2, dashboard: { tier: "active" },
      projects: [{ id: "a", age: "1s" }, { id: "b", age: "2s" }, { id: "c", age: "3s" }],
    } as any;
    const out = mergeUnchanged(snap, { rev: "R2", unchanged: true, ages: ["7s"], seq: 6 });
    expect(out.projects[0].age).toBe("7s");
    expect(out.projects[1].age).toBe("2s"); // ages 缺位 → 原值兜底
    expect(out.projects[2].age).toBe("3s");
    expect(out.seq).toBe(6);
    expect(out.rev).toBe("R2");
    expect(out.runningSessions).toBe(2); // 非 ages 字段沿用旧快照
    expect(out.dashboard).toEqual({ tier: "active" });
  });
  it("轮询间隔常量：可见 1.5s / 不可见 5s（P4 降频）", () => {
    expect(POLL_INTERVAL_MS).toBe(1500);
    expect(POLL_INTERVAL_HIDDEN_MS).toBe(5000);
  });
});
