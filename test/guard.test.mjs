// 激活守卫测试：三场景（图集被删 / 语音变动 / 清单缺失）+ diff/修复计划/ignore 降级判定。
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPet, diffManifestVsScan, manifestVoiceCapOnDisk, repairPlan } from "../src/host/guard.js";
import { writeManifest } from "../src/host/manifest.js";
import { scanPet } from "../src/host/scan.js";

function setup(withManifest = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-guard-"));
  const pets = path.join(root, "pets");
  const dir = path.join(pets, "mypet");
  fs.mkdirSync(path.join(dir, "voice/general"), { recursive: true });
  fs.mkdirSync(path.join(dir, "voice/approval"), { recursive: true });
  fs.mkdirSync(path.join(dir, "voice/done"), { recursive: true });
  fs.mkdirSync(path.join(dir, "voice/error"), { recursive: true });
  fs.writeFileSync(path.join(dir, "spritesheet.webp"), "sheet-bytes"); // 11 bytes
  for (const g of ["general", "approval", "done", "error"]) {
    fs.writeFileSync(path.join(dir, `voice/${g}/v-${g}.m4a`), `${g}-audio`);
  }
  const voices = ["general", "approval", "done", "error"].map((g) => ({
    group: g,
    name: `v-${g}`,
    file: `voice/${g}/v-${g}.m4a`,
    sizeBytes: fs.statSync(path.join(dir, `voice/${g}/v-${g}.m4a`)).size,
    durationMs: 3000,
  }));
  const manifest = {
    schemaVersion: 2,
    id: "mypet",
    displayName: "My Pet",
    description: "",
    source: "folder",
    spriteVersionNumber: 2,
    spritesheetSizeBytes: 11,
    hasVoice: true,
    hasSubtitle: true,
    voices,
  };
  if (withManifest) writeManifest(dir, manifest, { backup: false });
  return { root, pets, dir, manifest };
}

describe("diffManifestVsScan", () => {
  it("clean pet → no issues", () => {
    const { pets, dir, manifest } = setup();
    const issues = diffManifestVsScan(manifest, scanPet(pets, "mypet"));
    expect(issues).toEqual([]);
    expect(dir).toBeTruthy();
  });
});

describe("checkPet 三场景（任务目标 4）", () => {
  it("场景 1：图集被删 → fatal spritesheet-missing", () => {
    const { pets, dir } = setup();
    fs.rmSync(path.join(dir, "spritesheet.webp"));
    const g = checkPet(pets, "mypet");
    expect(g.fatal).toBe(true);
    expect(g.issues.map((i) => i.kind)).toContain("spritesheet-missing");
    expect(g.plan).toBeUndefined(); // fatal 无修复计划（只能换回/隐藏）
  });

  it("场景 2：语音变动（大小改变）→ voice-changed + 可修复计划", () => {
    const { pets, dir } = setup();
    fs.writeFileSync(path.join(dir, "voice/general/v-general.m4a"), "much-longer-audio-bytes");
    const g = checkPet(pets, "mypet");
    expect(g.fatal).toBe(false);
    expect(g.issues.map((i) => i.kind)).toContain("voice-changed");
    expect(g.plan.canRepair).toBe(true);
    expect(g.plan.reprobes.map((r) => r.rel)).toContain("voice/general/v-general.m4a");
    expect(g.plan.keepVoices).toHaveLength(3); // 未变条目保留（信任缓存时长）
  });

  it("场景 2b：语音缺失/多余 → voice-missing / voice-extra", () => {
    const { pets, dir } = setup();
    fs.rmSync(path.join(dir, "voice/done/v-done.m4a"));
    fs.writeFileSync(path.join(dir, "voice/error/extra.m4a"), "extra");
    const g = checkPet(pets, "mypet");
    const kinds = g.issues.map((i) => i.kind);
    expect(kinds).toContain("voice-missing");
    expect(kinds).toContain("voice-extra");
    expect(g.issues.find((i) => i.kind === "voice-missing").detail).toBe("voice/done/v-done.m4a");
  });

  it("场景 3：清单缺失 → manifest-missing + 全量重建计划", () => {
    const { pets } = setup(false);
    const g = checkPet(pets, "mypet");
    expect(g.fatal).toBe(false);
    expect(g.issues.map((i) => i.kind)).toEqual(["manifest-missing"]);
    expect(g.plan.manifestMissing).toBe(true);
    expect(g.plan.keepVoices).toEqual([]);
    expect(g.plan.reprobes).toHaveLength(4); // 全部语音需重探
  });

  it("图集被改动（大小变化）→ spritesheet-changed with size detail", () => {
    const { pets, dir } = setup();
    fs.writeFileSync(path.join(dir, "spritesheet.webp"), "totally-different-sheet");
    const g = checkPet(pets, "mypet");
    const changed = g.issues.find((i) => i.kind === "spritesheet-changed");
    expect(changed).toBeTruthy();
    expect(changed.detail).toBe("11 → 23");
  });

  it("宠物目录整体缺失 → fatal pet-dir-missing", () => {
    const { pets, dir } = setup();
    fs.rmSync(dir, { recursive: true, force: true });
    const g = checkPet(pets, "mypet");
    expect(g.fatal).toBe(true);
    expect(g.issues[0].kind).toBe("pet-dir-missing");
  });

  it("escape id rejected before touching disk", () => {
    const { pets } = setup();
    expect(() => checkPet(pets, "../evil")).toThrow(/pet-name|PetError/);
  });
});

describe("repairPlan 细节", () => {
  it("keepVoices trusts cached durations for unchanged entries only", () => {
    const { pets, dir, manifest } = setup();
    fs.writeFileSync(path.join(dir, "voice/approval/v-approval.m4a"), "changed!");
    const plan = repairPlan(manifest, scanPet(pets, "mypet"));
    expect(plan.keepVoices.map((v) => v.file).sort()).toEqual([
      "voice/done/v-done.m4a",
      "voice/error/v-error.m4a",
      "voice/general/v-general.m4a",
    ]);
    expect(plan.reprobes.map((r) => r.rel)).toEqual(["voice/approval/v-approval.m4a"]);
    expect(plan.reprobes[0].hadEntry).toBe(true);
  });
  it("new unregistered files are reprobed with hadEntry=false", () => {
    const { pets, dir, manifest } = setup();
    fs.writeFileSync(path.join(dir, "voice/general/new-one.mp3"), "new");
    const plan = repairPlan(manifest, scanPet(pets, "mypet"));
    const added = plan.reprobes.find((r) => r.rel === "voice/general/new-one.mp3");
    expect(added).toBeTruthy();
    expect(added.hadEntry).toBe(false);
    expect(plan.issues.map((i) => i.kind)).toContain("voice-extra");
  });
});

describe("manifestVoiceCapOnDisk (ignore 降级判定)", () => {
  it("all entries present with matching size → manifest.hasVoice trusted", () => {
    const { pets, manifest } = setup();
    expect(manifestVoiceCapOnDisk(manifest, scanPet(pets, "mypet"))).toBe(true);
  });
  it("any missing/changed entry → conservative false", () => {
    const { pets, dir, manifest } = setup();
    fs.rmSync(path.join(dir, "voice/done/v-done.m4a"));
    expect(manifestVoiceCapOnDisk(manifest, scanPet(pets, "mypet"))).toBe(false);
  });
  it("null manifest → false", () => {
    const { pets } = setup(false);
    expect(manifestVoiceCapOnDisk(null, scanPet(pets, "mypet"))).toBe(false);
  });
});

describe("checkPet symlink 目录（R2 安全自查）", () => {
  it("pets/<id> 为符号链接目录 → fatal pet-dir-missing（不跟随链接扫描店外内容）", () => {
    const { pets } = setup(false);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-guard-out-"));
    fs.writeFileSync(path.join(outside, "spritesheet.webp"), "outside-sheet");
    fs.symlinkSync(outside, path.join(pets, "slinked"), "dir");
    const g = checkPet(pets, "slinked");
    expect(g.fatal).toBe(true);
    expect(g.issues.map((i) => i.kind)).toContain("pet-dir-missing");
    expect(g.plan).toBeUndefined();
  });
});
