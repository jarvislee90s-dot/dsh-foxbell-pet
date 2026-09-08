// id/清单校验测试：petid 规则（MAM 同表）+ manifest v2 解析/校验/原子写/.bak。
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { petIdProblem, petNameProblem, validatePetId, MAX_PET_ID_LEN, WINDOWS_RESERVED_DEVICES } from "../src/host/petid.js";
import {
  ACCEPTED_SCHEMA_VERSIONS, isVoiceRel, loadManifest, nameFromRel, parseManifest, writeManifest,
} from "../src/host/manifest.js";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-test-"));
}

describe("validatePetId (MAM 同表拒绝顺序)", () => {
  const cases = [
    ["", "pet-name-empty"],
    [".", "pet-name-dot-prefix"],
    ["..", "pet-name-dot-prefix"],
    [".hidden", "pet-name-dot-prefix"],
    ["../skills", "pet-name-dot-prefix"],
    ["..\\skills", "pet-name-dot-prefix"],
    ["/etc", "pet-name-illegal"],
    ["C:\\Windows", "pet-name-illegal"],
    ["a/b", "pet-name-illegal"],
    ["中文", "pet-name-illegal"],
    ["foxbell", "pet-name-reserved"],
    ["FoxBell", "pet-name-reserved"],
  ];
  for (const [id, code] of cases) {
    it(`rejects ${JSON.stringify(id)} with ${code}`, () => {
      const p = petIdProblem(id);
      expect(p).not.toBeNull();
      expect(p.code).toBe(code);
    });
  }
  for (const bad of ["con", "CON", "Nul", "aux", "PRN", "com1", "Com9", "lpt1", "LPT9"]) {
    it(`rejects windows reserved device ${bad}`, () => {
      expect(petIdProblem(bad).code).toBe("pet-name-reserved-device");
    });
  }
  it("rejects overlong id with max param", () => {
    const p = petIdProblem("a".repeat(MAX_PET_ID_LEN + 1));
    expect(p.code).toBe("pet-name-too-long");
    expect(p.params.max).toBe("64");
    expect(petIdProblem("a".repeat(MAX_PET_ID_LEN))).toBeNull();
  });
  it("accepts legal ids", () => {
    for (const ok of ["starry-dew", "abc_123-X", "A9"]) expect(petIdProblem(ok)).toBeNull();
  });
  it("validatePetId throws PetError", () => {
    expect(() => validatePetId("../x")).toThrowError(/pet-name/);
  });
});

describe("petNameProblem (客户端镜像同款语义)", () => {
  it("duplicate check ignores selfId and is case-insensitive", () => {
    expect(petNameProblem("dup", { existingIds: ["Dup", "other"] })).toBe("duplicate");
    expect(petNameProblem("dup", { existingIds: ["dup"], selfId: "dup" })).toBeNull();
  });
  it("too-long precedes charset", () => {
    expect(petNameProblem("字".repeat(65))).toBe("too-long");
  });
  it("builtin foxbell always reserved (MAM 同款：保留字检查先于 selfId 过滤)", () => {
    expect(petNameProblem("foxbell", { existingIds: [] })).toBe("reserved");
    expect(petNameProblem("foxbell", { selfId: "foxbell", existingIds: ["foxbell"] })).toBe("reserved");
    expect(petNameProblem("FoxBell", { existingIds: [] })).toBe("reserved");
  });
});

describe("isVoiceRel / nameFromRel", () => {
  it("accepts only voice/<group>/<file> three segments", () => {
    expect(isVoiceRel("voice/general/a.m4a")).toBe(true);
    expect(isVoiceRel("voice/backup/a.m4a")).toBe(false);
    expect(isVoiceRel("voice/general/sub/a.m4a")).toBe(false);
    expect(isVoiceRel("voice/general/")).toBe(false);
    expect(isVoiceRel("voice/general/..")).toBe(false);
    expect(isVoiceRel("../x/y")).toBe(false);
  });
  it("nameFromRel strips extension", () => {
    expect(nameFromRel("voice/general/你好.m4a")).toBe("你好");
    expect(nameFromRel("noext")).toBe("noext");
  });
});

const sample = () => ({
  schemaVersion: 2,
  id: "starry-dew",
  displayName: "Starry Dew",
  description: "test",
  source: "folder",
  spriteVersionNumber: 1,
  spritesheetSizeBytes: 1652314,
  hasVoice: true,
  hasSubtitle: true,
  voices: [
    { group: "general", name: "休息一下吧", file: "voice/general/休息一下吧.m4a", sizeBytes: 123456, durationMs: 3200 },
  ],
});

describe("parseManifest", () => {
  it("accepts schemaVersion 1 (MAM 互操作) 和 2, normalizes to 2", () => {
    expect(ACCEPTED_SCHEMA_VERSIONS).toEqual([1, 2]);
    const m1 = parseManifest({ ...sample(), schemaVersion: 1 });
    expect(m1.schemaVersion).toBe(2);
    const m2 = parseManifest(sample());
    expect(m2.id).toBe("starry-dew");
  });
  it("tolerates missing optional fields", () => {
    const m = parseManifest({
      schemaVersion: 2, id: "a-b", displayName: "A", spriteVersionNumber: 1, hasVoice: false, hasSubtitle: false,
    });
    expect(m.voices).toEqual([]);
    expect(m.source).toBe("");
    expect(m.description).toBe("");
  });
  it("hasSubtitle 收敛到 hasVoice && hasSubtitle", () => {
    const m = parseManifest({ ...sample(), hasVoice: false, hasSubtitle: true });
    expect(m.hasSubtitle).toBe(false);
  });
  const bad = [
    [{ ...sample(), schemaVersion: 3 }, "schemaVersion"],
    [{ ...sample(), id: "" }, "id"],
    [{ ...sample(), id: "../evil" }, "id"],
    [{ ...sample(), displayName: 42 }, "displayName"],
    [{ ...sample(), source: "torrent" }, "source"],
    [{ ...sample(), spriteVersionNumber: 7 }, "spriteVersionNumber"],
    [{ ...sample(), voices: [{ group: "general", name: "x", file: "voice/general/../x.m4a", sizeBytes: 1, durationMs: 1 }] }, "voice.file"],
    [{ ...sample(), voices: [{ group: "nope", name: "x", file: "voice/nope/x.m4a", sizeBytes: 1, durationMs: 1 }] }, "分组"],
    [{ ...sample(), voices: [{ group: "general", name: "x", file: "voice/general/x.m4a", sizeBytes: -1, durationMs: 1 }] }, "sizeBytes"],
    [null, "不是对象"],
  ];
  for (const [raw, label] of bad) {
    it(`rejects invalid manifest (${label})`, () => {
      expect(() => parseManifest(raw)).toThrowError(/manifest-invalid|PetError/);
    });
  }
  it("id mismatch with directory rejected", () => {
    expect(() => parseManifest(sample(), { id: "other" })).toThrow();
  });
  it("duplicate voice files rejected", () => {
    const v = sample().voices[0];
    expect(() => parseManifest({ ...sample(), voices: [v, { ...v }] })).toThrow();
  });
});

describe("writeManifest / loadManifest（原子写 + .bak）", () => {
  it("writes pretty JSON, leaves no .tmp leftover", () => {
    const dir = tmp();
    writeManifest(dir, sample(), { backup: false });
    const loaded = loadManifest(dir, { id: "starry-dew" });
    expect(loaded.displayName).toBe("Starry Dew");
    const leftovers = fs.readdirSync(dir).filter((n) => n.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });
  it("backup keeps exactly one .bak with old content", () => {
    const dir = tmp();
    writeManifest(dir, sample(), { backup: false });
    writeManifest(dir, { ...sample(), displayName: "v2" }, { backup: true });
    const bak = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json.bak"), "utf8"));
    expect(bak.displayName).toBe("Starry Dew");
    expect(loadManifest(dir).displayName).toBe("v2");
    writeManifest(dir, { ...sample(), displayName: "v3" }, { backup: true });
    const bak2 = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json.bak"), "utf8"));
    expect(bak2.displayName).toBe("v2"); // 仅保留最近一份
  });
  it("loadManifest returns null on missing/corrupt", () => {
    const dir = tmp();
    expect(loadManifest(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, "manifest.json"), "{broken");
    expect(loadManifest(dir)).toBeNull();
  });
});

// ---- R2 安全自查补强：Windows 保留名全表 × 大小写变体 ----
describe("windows reserved devices（全表 22 项，MAM mod.rs:31 同表）", () => {
  it("表长 22 且与 MAM [&str; 22] 逐项一致", () => {
    expect(WINDOWS_RESERVED_DEVICES).toHaveLength(22);
    expect(WINDOWS_RESERVED_DEVICES).toEqual([
      "CON", "PRN", "AUX", "NUL",
      "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
      "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]);
  });
  it("全表 × {原样, 全小写, 全大写, 首字母大写, 混写} 全部拒绝为 reserved-device", () => {
    let n = 0;
    for (const d of WINDOWS_RESERVED_DEVICES) {
      const mixed = d.split("").map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase())).join("");
      const variants = [d, d.toLowerCase(), d.toUpperCase(), d[0] + d.slice(1).toLowerCase(), mixed];
      for (const v of [...new Set(variants)]) {
        expect(petIdProblem(v)?.code, `variant ${v}`).toBe("pet-name-reserved-device");
        n += 1;
      }
    }
    expect(n).toBeGreaterThanOrEqual(22 * 4); // 原样/小写/首大写/交错 至少四形态（全大写与原样同串去重）
  });
  it("带扩展名形态 con.txt / nul.json 同样拒绝（MAM eq_ignore_ascii_case 前缀口径按整 id 匹配——文件名形态由字符集规则兜底）", () => {
    // 口径说明：id 是目录名而非文件名，MAM 与本实现均按「整个 id 恰为设备名（忽略大小写）」拒绝；
    // con.txt 含点号 → 命中 dot-prefix/charset 分支同样被拒，绝无放行路径。
    for (const v of ["con.txt", "nul.json", "COM1.a"]) {
      expect(petIdProblem(v), v).not.toBeNull();
    }
  });
  it("表外近邻 COM10 / LPT0 / CONSOLE 放行（同 MAM 表口径，不私自扩表）", () => {
    expect(petIdProblem("COM10")).toBeNull();
    expect(petIdProblem("LPT0")).toBeNull();
    expect(petIdProblem("CONSOLE")).toBeNull();
  });
});
