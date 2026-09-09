// 导入暂存管线测试（真实临时目录实操，不 mock 文件系统）：
// folder/zip/codex 暂存 → 音频增删（去重/拒绝）→ finalize 原子落地 → cancel/sweep 清理 → rename/delete。
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cancelImport, copyAudioInto, finalizeImport, listStagedVoice, locateSheet, removeAudio,
  stageFromCodex, stageFromFolder, stageFromZip, uid, uniqueDest, writeAudioInto, stagingDirOf,
} from "../src/host/staging.js";
import { deletePet, listPets, renamePet, scanPet, sweepStaging, validatePetName } from "../src/host/scan.js";
import { writeManifest, loadManifest } from "../src/host/manifest.js";
import { buildZip } from "./helpers/zipwriter.mjs";

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-store-"));
  const pets = path.join(root, "pets");
  const staging = path.join(pets, ".import-staging");
  const trash = path.join(root, ".trash");
  fs.mkdirSync(staging, { recursive: true });
  fs.mkdirSync(trash, { recursive: true });
  return { root, pets, staging, trash };
}

function mkSourcePet(root, id, opts = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, "voice/general"), { recursive: true });
  fs.writeFileSync(path.join(dir, "spritesheet.webp"), opts.sheet ?? "sheet-bytes");
  fs.writeFileSync(path.join(dir, "voice/general/休息一下吧.m4a"), "a");
  if (opts.petJson) fs.writeFileSync(path.join(dir, "pet.json"), opts.petJson);
  return dir;
}

const manifestFor = (name, sheetSize, voices = []) => ({
  schemaVersion: 2,
  id: name,
  displayName: `${name} display`,
  description: "",
  source: "folder",
  spriteVersionNumber: 2,
  spritesheetSizeBytes: sheetSize,
  hasVoice: false,
  hasSubtitle: false,
  voices,
});

describe("uid", () => {
  it("is unique and has pid segment (3 parts)", () => {
    const a = uid();
    const b = uid();
    expect(a).not.toBe(b);
    expect(a.split("-")).toHaveLength(3);
    expect(a.split("-")[1]).toBe(String(process.pid));
  });
});

describe("stageFromFolder", () => {
  it("copies sheet + voice tree, suggests name, reads pet.json meta", () => {
    const { pets, staging, root } = layout();
    const src = mkSourcePet(root, "src-pet", { petJson: JSON.stringify({ displayName: "星黛", spriteVersionNumber: 2 }) });
    const s = stageFromFolder(pets, staging, src);
    expect(s.suggestedName).toBe("src-pet");
    expect(s.suggestedDisplayName).toBe("星黛");
    expect(s.spriteVersionNumber).toBe(2);
    expect(s.spritesheetSize).toBe("sheet-bytes".length);
    expect(s.voiceFiles).toHaveLength(1);
    expect(s.voiceFiles[0]).toMatchObject({ group: "general", name: "休息一下吧", file: "voice/general/休息一下吧.m4a" });
    expect(fs.existsSync(path.join(staging, s.stagingId, "spritesheet.webp"))).toBe(true);
  });
  it("locates sheet one level deep and uses that dir name", () => {
    const { pets, staging, root } = layout();
    const wrapper = path.join(root, "wrapper");
    mkSourcePet(wrapper, "inner-pet");
    const s = stageFromFolder(pets, staging, wrapper);
    expect(s.suggestedName).toBe("inner-pet");
  });
  it("locateSheet prefers root over subdir", () => {
    const { root } = layout();
    const src = path.join(root, "both");
    fs.mkdirSync(path.join(src, "sub"), { recursive: true });
    fs.writeFileSync(path.join(src, "spritesheet.webp"), "root");
    fs.writeFileSync(path.join(src, "sub/spritesheet.webp"), "sub");
    expect(locateSheet(src)).toBe(path.join(src, "spritesheet.webp"));
  });
  it("missing sheet → sheet-not-found and no staging leftover", () => {
    const { pets, staging, root } = layout();
    const empty = path.join(root, "empty");
    fs.mkdirSync(empty);
    expect(() => stageFromFolder(pets, staging, empty)).toThrowError(/sheet-not-found|PetError/);
    expect(fs.readdirSync(staging)).toHaveLength(0);
  });
  it("non-folder source → source-not-folder", () => {
    const { pets, staging, root } = layout();
    expect(() => stageFromFolder(pets, staging, path.join(root, "nope"))).toThrow(/source-not-folder|PetError/);
  });
  it("excludes nested/non-group voice and skips symlinks", () => {
    const { pets, staging, root } = layout();
    const src = mkSourcePet(root, "src2");
    fs.mkdirSync(path.join(src, "voice/general/sub"), { recursive: true });
    fs.writeFileSync(path.join(src, "voice/general/sub/deep.mp3"), "d");
    fs.mkdirSync(path.join(src, "voice/backup"), { recursive: true });
    fs.writeFileSync(path.join(src, "voice/backup/x.m4a"), "x");
    try {
      fs.symlinkSync(path.join(root, "elsewhere.m4a"), path.join(src, "voice/general/link.m4a"));
    } catch { /* 平台无 symlink 权限时跳过该断言 */ }
    const s = stageFromFolder(pets, staging, src);
    expect(s.voiceFiles.map((v) => v.file)).toEqual(["voice/general/休息一下吧.m4a"]);
    expect(fs.existsSync(path.join(staging, s.stagingId, "voice/general/sub"))).toBe(false);
    expect(fs.existsSync(path.join(staging, s.stagingId, "voice/backup"))).toBe(false);
  });
});

describe("stageFromZip", () => {
  it("unwraps one-level wrapper dir", async () => {
    const { pets, staging, root } = layout();
    const zp = path.join(root, "p.zip");
    fs.writeFileSync(zp, buildZip([
      { name: "inner/spritesheet.webp", data: "sheet" },
      { name: "inner/pet.json", data: "{}" },
    ]));
    const s = await stageFromZip(pets, staging, zp);
    expect(s.suggestedName).toBe("inner");
    expect(s.spritesheetSize).toBe(5);
    // extract 中间目录用完即删
    expect(fs.readdirSync(staging).filter((n) => n.startsWith("extract-"))).toHaveLength(0);
  });
  it("missing sheet in zip → error, extract cleaned", async () => {
    const { pets, staging, root } = layout();
    const zp = path.join(root, "nosheet.zip");
    fs.writeFileSync(zp, buildZip([{ name: "a/readme.txt", data: "x" }]));
    await expect(stageFromZip(pets, staging, zp)).rejects.toThrow(/sheet-not-found|PetError/);
    expect(fs.readdirSync(staging).filter((n) => n.startsWith("extract-"))).toHaveLength(0);
  });
});

describe("stageFromCodex", () => {
  it("stages from codex dir and rejects escape ids", () => {
    const { pets, staging, root } = layout();
    const codex = path.join(root, "codex-pets");
    mkSourcePet(codex, "alpha");
    const s = stageFromCodex(pets, staging, codex, "alpha");
    expect(s.suggestedName).toBe("alpha");
    expect(() => stageFromCodex(pets, staging, codex, "../pets")).toThrow(/pet-name|PetError/);
    expect(() => stageFromCodex(pets, staging, codex, "nope")).toThrow(/pet-not-found|PetError/);
  });
});

describe("staging id guard", () => {
  it("rejects traversal staging ids", () => {
    const { staging } = layout();
    for (const bad of ["../x", "a/b", "a\\b", ""]) {
      expect(() => stagingDirOf(staging, bad)).toThrow(/staging-id-invalid|PetError/);
    }
    expect(() => stagingDirOf(staging, "missing-id")).toThrow(/staging-not-found|PetError/);
  });
});

describe("audio add/remove (暂存与正式目录)", () => {
  it("copyAudioInto dedups same-name with -2/-3 sequence", () => {
    const { root } = layout();
    const destVoice = path.join(root, "dest", "voice");
    const srcA = path.join(root, "hi.mp3");
    fs.writeFileSync(srcA, "mp3-bytes");
    const names = [];
    for (let i = 0; i < 3; i++) names.push(copyAudioInto(destVoice, srcA, "general").file);
    expect(names).toEqual(["voice/general/hi.mp3", "voice/general/hi-2.mp3", "voice/general/hi-3.mp3"]);
    for (const f of ["hi.mp3", "hi-2.mp3", "hi-3.mp3"]) {
      expect(fs.readFileSync(path.join(destVoice, "general", f), "utf8")).toBe("mp3-bytes");
    }
  });
  it("dedup skips occupied sequence numbers", () => {
    const { root } = layout();
    const destVoice = path.join(root, "d2", "voice");
    const srcA = path.join(root, "greet-2.mp3");
    const srcB = path.join(root, "greet.mp3");
    fs.writeFileSync(srcA, "a");
    fs.writeFileSync(srcB, "b");
    expect(copyAudioInto(destVoice, srcA, "general").file).toBe("voice/general/greet-2.mp3");
    expect(copyAudioInto(destVoice, srcB, "general").file).toBe("voice/general/greet.mp3");
    expect(copyAudioInto(destVoice, srcB, "general").file).toBe("voice/general/greet-3.mp3");
  });
  it("uniqueDest never overwrites", () => {
    const { root } = layout();
    const g = path.join(root, "g");
    fs.mkdirSync(g);
    fs.writeFileSync(path.join(g, "x.mp3"), "1");
    expect(path.basename(uniqueDest(g, "x.mp3"))).toBe("x-2.mp3");
  });
  it("rejects invalid group / missing file / bad format", () => {
    const { root } = layout();
    const destVoice = path.join(root, "d3", "voice");
    const txt = path.join(root, "a.txt");
    fs.writeFileSync(txt, "x");
    expect(() => copyAudioInto(destVoice, txt, "general")).toThrow(/audio-format-unsupported|PetError/);
    const mp3 = path.join(root, "a.mp3");
    fs.writeFileSync(mp3, "x");
    expect(() => copyAudioInto(destVoice, mp3, "nope")).toThrow(/group-invalid|PetError/);
    expect(() => copyAudioInto(destVoice, path.join(root, "ghost.mp3"), "general")).toThrow(/audio-not-found|PetError/);
  });
  it("writeAudioInto (upload path) same dedup rules", () => {
    const { root } = layout();
    const destVoice = path.join(root, "d4", "voice");
    const a = writeAudioInto(destVoice, "hello m4a".replace(" ", ".") , Buffer.from("x"), "done");
    expect(a.file).toBe("voice/done/hello.m4a");
    const b = writeAudioInto(destVoice, "hello.m4a", Buffer.from("y"), "done");
    expect(b.file).toBe("voice/done/hello-2.m4a");
    expect(() => writeAudioInto(destVoice, "../evil.m4a", Buffer.from("z"), "done")).toThrow(/audio-relpath-invalid|PetError/);
    expect(() => writeAudioInto(destVoice, "x.exe", Buffer.from("z"), "done")).toThrow(/audio-format-unsupported|PetError/);
  });
  it("removeAudio rejects traversal and non-group segments; deletes legal", () => {
    const { pets, staging, root } = layout();
    const src = mkSourcePet(root, "rm-pet");
    const s = stageFromFolder(pets, staging, src);
    const stagingDir = path.join(staging, s.stagingId);
    writeAudioInto(path.join(stagingDir, "voice"), "hi.mp3", Buffer.from("mp3"), "done");
    for (const bad of ["../evil", "voice/backup/x.m4a", "voice//x.m4a", "voice/general/../../x.m4a", "a\\b"]) {
      expect(() => removeAudio(stagingDir, bad)).toThrow(/audio-relpath-invalid|PetError/);
    }
    removeAudio(stagingDir, "voice/done/hi.mp3");
    expect(fs.existsSync(path.join(stagingDir, "voice/done/hi.mp3"))).toBe(false);
    // 非分组目录文件不得借 remove 通道删除
    const foreign = path.join(stagingDir, "voice", "backup");
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, "x.m4a"), "x");
    expect(() => removeAudio(stagingDir, "voice/backup/x.m4a")).toThrow(/audio-relpath-invalid|PetError/);
    expect(fs.existsSync(path.join(foreign, "x.m4a"))).toBe(true);
  });
  it("listStagedVoice only three-segment legal files", () => {
    const { pets, staging, root } = layout();
    const src = mkSourcePet(root, "ls-pet");
    const s = stageFromFolder(pets, staging, src);
    const dir = path.join(staging, s.stagingId);
    fs.mkdirSync(path.join(dir, "voice/general/sub"), { recursive: true });
    fs.writeFileSync(path.join(dir, "voice/general/sub/deep.mp3"), "d");
    expect(listStagedVoice(dir).map((v) => v.file)).toEqual(["voice/general/休息一下吧.m4a"]);
  });
});

describe("finalizeImport (原子落地)", () => {
  it("moves staging to pets/<name>, writes manifest, empties staging", () => {
    const { pets, staging, root } = layout();
    const src = mkSourcePet(root, "fin-src");
    const s = stageFromFolder(pets, staging, src);
    const sum = finalizeImport(pets, staging, s.stagingId, "starry-dew", manifestFor("starry-dew", s.spritesheetSize));
    expect(sum.id).toBe("starry-dew");
    expect(fs.existsSync(path.join(pets, "starry-dew", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(staging, s.stagingId))).toBe(false);
    expect(loadManifest(path.join(pets, "starry-dew")).displayName).toBe("starry-dew display");
  });
  it("rejects duplicate name / reserved / missing sheet / manifest-disk mismatch", () => {
    const { pets, staging, root } = layout();
    const src = mkSourcePet(root, "fin-src2");
    const s = stageFromFolder(pets, staging, src);
    fs.mkdirSync(path.join(pets, "dup"));
    expect(() => finalizeImport(pets, staging, s.stagingId, "dup", manifestFor("dup", 1))).toThrow(/pet-exists|PetError/);
    expect(() => finalizeImport(pets, staging, s.stagingId, "foxbell", manifestFor("foxbell", 1))).toThrow(/pet-name-reserved|PetError/);
    expect(() => finalizeImport(pets, staging, "no-such-sid", "ok-name", manifestFor("ok-name", 1))).toThrow(/staging-not-found|PetError/);
    // manifest 大小与磁盘不一致
    expect(() => finalizeImport(pets, staging, s.stagingId, "mm", manifestFor("mm", 999))).toThrow(/manifest-invalid|PetError/);
    // 暂存缺图集
    fs.rmSync(path.join(staging, s.stagingId, "spritesheet.webp"));
    expect(() => finalizeImport(pets, staging, s.stagingId, "nosheet", manifestFor("nosheet", 1))).toThrow(/staging-missing-sheet|PetError/);
  });
  it("manifest voices cross-checked against staging disk", () => {
    const { pets, staging, root } = layout();
    const src = mkSourcePet(root, "fin-src3");
    const s = stageFromFolder(pets, staging, src);
    const m = manifestFor("vx", s.spritesheetSize, [
      { group: "general", name: "ghost", file: "voice/general/ghost.m4a", sizeBytes: 1, durationMs: 2000 },
    ]);
    expect(() => finalizeImport(pets, staging, s.stagingId, "vx", m)).toThrow(/manifest-invalid|PetError/);
  });
  it("cancelImport cleans staging, silent when missing", () => {
    const { pets, staging, root } = layout();
    const src = mkSourcePet(root, "cx-src");
    const s = stageFromFolder(pets, staging, src);
    cancelImport(staging, s.stagingId);
    expect(fs.existsSync(path.join(staging, s.stagingId))).toBe(false);
    expect(() => cancelImport(staging, s.stagingId)).not.toThrow();
  });
});

describe("sweepStaging (启动清扫)", () => {
  it("clears leftovers only, never touches pet dirs", () => {
    const { pets, staging, root } = layout();
    const src = mkSourcePet(root, "sw-src");
    finalizeImport(pets, staging, stageFromFolder(pets, staging, src).stagingId, "real-pet", manifestFor("real-pet", "sheet-bytes".length));
    for (const leftover of ["leftover-1", "extract-abc"]) {
      fs.mkdirSync(path.join(staging, leftover, "voice/general"), { recursive: true });
      fs.writeFileSync(path.join(staging, leftover, "spritesheet.webp"), "s");
    }
    expect(sweepStaging(staging)).toBe(2);
    expect(fs.readdirSync(staging)).toHaveLength(0);
    expect(fs.existsSync(path.join(pets, "real-pet", "spritesheet.webp"))).toBe(true);
  });
});

describe("renamePet / deletePet / validatePetName", () => {
  function withPet(pets, id) {
    fs.mkdirSync(path.join(pets, id), { recursive: true });
    fs.writeFileSync(path.join(pets, id, "spritesheet.webp"), "s");
    writeManifest(path.join(pets, id), manifestFor(id, 1), { backup: false });
  }
  it("rename updates dir + manifest.id with .bak", () => {
    const { pets, trash } = layout();
    withPet(pets, "old-name");
    renamePet(pets, "old-name", "new-name");
    expect(fs.existsSync(path.join(pets, "new-name"))).toBe(true);
    expect(fs.existsSync(path.join(pets, "old-name"))).toBe(false);
    expect(loadManifest(path.join(pets, "new-name")).id).toBe("new-name");
    expect(fs.existsSync(path.join(pets, "new-name", "manifest.json.bak"))).toBe(true);
    void trash;
  });
  it("rename no-op for same id; conflict → pet-exists, zero side effects", () => {
    const { pets } = layout();
    withPet(pets, "a");
    withPet(pets, "b");
    expect(() => renamePet(pets, "a", "a")).not.toThrow();
    expect(() => renamePet(pets, "a", "b")).toThrow(/pet-exists|PetError/);
    expect(loadManifest(path.join(pets, "a")).id).toBe("a");
  });
  it("rename rejects escape/reserved targets", () => {
    const { pets } = layout();
    withPet(pets, "src");
    for (const bad of ["../x", "foxbell", "con", ""]) {
      expect(() => renamePet(pets, "src", bad)).toThrow(/pet-name|PetError/);
    }
    expect(() => renamePet(pets, "ghost", "fine")).toThrow(/pet-not-found|PetError/);
  });
  it("delete moves dir into trash (不物理删除)", () => {
    const { pets, trash } = layout();
    withPet(pets, "doomed");
    const dest = deletePet(pets, trash, "doomed");
    expect(fs.existsSync(path.join(pets, "doomed"))).toBe(false);
    expect(fs.existsSync(dest)).toBe(true);
    expect(dest.startsWith(trash)).toBe(true);
    expect(fs.readFileSync(path.join(dest, "spritesheet.webp"), "utf8")).toBe("s");
    expect(() => deletePet(pets, trash, "doomed")).toThrow(/pet-not-found|PetError/);
    expect(() => deletePet(pets, trash, "foxbell")).toThrow(/pet-name-reserved|PetError/);
  });
  it("validatePetName: static rules + repo dedup", () => {
    const { pets } = layout();
    expect(() => validatePetName(pets, "abc-123_X")).not.toThrow();
    fs.mkdirSync(path.join(pets, "taken"));
    expect(() => validatePetName(pets, "taken")).toThrow(/pet-exists|PetError/);
  });
});

describe("scanPet / listPets", () => {
  it("scan reports stats, only three-segment voice", () => {
    const { pets, root } = layout();
    fs.mkdirSync(path.join(pets, "p1", "voice/general"), { recursive: true });
    fs.writeFileSync(path.join(pets, "p1", "spritesheet.webp"), "sheet");
    fs.writeFileSync(path.join(pets, "p1", "voice/general/a.m4a"), "audio-a");
    fs.mkdirSync(path.join(pets, "p1", "voice/general/sub"), { recursive: true });
    fs.writeFileSync(path.join(pets, "p1", "voice/general/sub/deep.mp3"), "d");
    const s = scanPet(pets, "p1");
    expect(s.spritesheet).toMatchObject({ exists: true, size: 5 });
    expect(s.voiceFiles).toHaveLength(1);
    expect(s.voiceFiles[0].rel).toBe("voice/general/a.m4a");
    void root;
  });
  it("listPets skips hidden dirs, sorts, falls back to id without manifest", () => {
    const { pets, staging } = layout();
    fs.mkdirSync(path.join(pets, "b-pet"), { recursive: true });
    fs.writeFileSync(path.join(pets, "b-pet", "spritesheet.webp"), "s");
    writeManifest(path.join(pets, "b-pet"), manifestFor("b-pet", 1), { backup: false });
    fs.mkdirSync(path.join(pets, "a-pet"), { recursive: true });
    fs.mkdirSync(path.join(staging, "x"), { recursive: true });
    const list = listPets(pets);
    expect(list.map((s) => s.id)).toEqual(["a-pet", "b-pet"]);
    expect(list[0].manifestExists).toBe(false);
    expect(list[0].displayName).toBe("a-pet");
    expect(list[1].manifestExists).toBe(true);
  });
});

// ---- R2 补强：symlink 目录口径 + 改名中途失败零副作用 ----
describe("symlink 宠物目录（R2 安全自查）", () => {
  it("scanPet 对 symlink 目录抛 pet-not-found（不跟随出商店根）", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-slink-"));
    const petsDir = path.join(root, "pets");
    fs.mkdirSync(petsDir, { recursive: true });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-out-"));
    fs.writeFileSync(path.join(outside, "spritesheet.webp"), "outside-sheet");
    fs.symlinkSync(outside, path.join(petsDir, "linked"), "dir");
    expect(() => scanPet(petsDir, "linked")).toThrowError(/pet-not-found|PetError/);
    // listPets 同样不收录（dirent.isDirectory 对 symlink 为 false）
    expect(listPets(petsDir).map((p) => p.id)).not.toContain("linked");
  });
});

describe("renamePet 中途失败（R2 边界自查 3d）", () => {
  it("父目录只读导致 rename 失败 → rename-failed，源目录完好、无半成品新目录", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-rename-"));
    const petsDir = path.join(root, "pets");
    const dir = path.join(petsDir, "oldname");
    fs.mkdirSync(path.join(dir, "voice/general"), { recursive: true });
    fs.writeFileSync(path.join(dir, "spritesheet.webp"), "sheet");
    writeManifest(dir, {
      schemaVersion: 2, id: "oldname", displayName: "旧名", description: "", source: "folder",
      spriteVersionNumber: 2, spritesheetSizeBytes: 5, hasVoice: false, hasSubtitle: false, voices: [],
    }, { backup: false });

    fs.chmodSync(petsDir, 0o500); // 只读+可执行：rename 必 EACCES（非 root）
    let err = null;
    try { renamePet(petsDir, "oldname", "newname"); } catch (e) { err = e; }
    fs.chmodSync(petsDir, 0o700); // 恢复（供 tmp 清理）

    expect(err).not.toBeNull();
    expect(err.code).toBe("rename-failed");
    // 零副作用：源目录完整（含 manifest 与图集），目标不存在
    expect(fs.existsSync(path.join(petsDir, "oldname", "spritesheet.webp"))).toBe(true);
    expect(loadManifest(path.join(petsDir, "oldname"))?.id).toBe("oldname");
    expect(fs.existsSync(path.join(petsDir, "newname"))).toBe(false);
  });
});
