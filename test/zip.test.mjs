// zip 防护测试：三重上限（总量/文件数/路径穿越）+ 按实际写出字节累计（防 zip 头谎报）。
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fmtLimit, MAX_ZIP_FILES, MAX_ZIP_TOTAL_BYTES, safeEntryPath, safeUnzip } from "../src/host/zip.js";
import { buildZip } from "./helpers/zipwriter.mjs";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-zip-"));
}

describe("safeEntryPath (zip-slip 防御)", () => {
  it("rejects traversal / absolute / drive letters", () => {
    for (const bad of ["../evil.txt", "a/../../evil", "/etc/passwd", "C:\\Windows\\x", "\\abs", "..\\win"]) {
      expect(safeEntryPath(bad)).toBeNull();
    }
  });
  it("normalizes legal nested paths", () => {
    expect(safeEntryPath("inner/spritesheet.webp")).toBe("inner/spritesheet.webp");
    expect(safeEntryPath("a\\b\\c.m4a")).toBe("a/b/c.m4a");
    expect(safeEntryPath("./x/./y")).toBe("x/y");
    expect(safeEntryPath("")).toBeNull();
  });
});

describe("fmtLimit", () => {
  it("MiB multiples render as MB, others as bytes", () => {
    expect(fmtLimit(100 * 1024 * 1024)).toBe("100MB");
    expect(fmtLimit(1024 * 1024)).toBe("1MB");
    expect(fmtLimit(10)).toBe("10B");
    expect(fmtLimit(1024 * 1024 + 1)).toBe("1048577B");
  });
  it("public caps are MAM-identical", () => {
    expect(MAX_ZIP_TOTAL_BYTES).toBe(100 * 1024 * 1024);
    expect(MAX_ZIP_FILES).toBe(200);
  });
});

describe("safeUnzip", () => {
  it("extracts legal nested zip", async () => {
    const dir = tmp();
    const zp = path.join(dir, "ok.zip");
    fs.writeFileSync(zp, buildZip([
      { name: "pet/spritesheet.webp", data: "sheet" },
      { name: "pet/voice/general/a m4a".replace(" ", ".") , data: "audio" },
    ]));
    const dest = path.join(dir, "out");
    const r = await safeUnzip(zp, dest);
    expect(r.entries).toBe(2);
    expect(r.totalBytes).toBe(10);
    expect(fs.readFileSync(path.join(dest, "pet/spritesheet.webp"), "utf8")).toBe("sheet");
  });

  it("rejects ../ traversal entries with zip-entry-illegal-path", async () => {
    const dir = tmp();
    const zp = path.join(dir, "evil.zip");
    // 自建 zip 写出真实恶意条目名（正规 writer 会规范化，安全防护测试需要真恶意形态）
    fs.writeFileSync(zp, buildZip([
      { name: "../evil.txt", data: "x" },
      { name: "ok.txt", data: "y" },
    ]));
    const dest = path.join(dir, "dest");
    await expect(safeUnzip(zp, dest)).rejects.toMatchObject({ code: "zip-entry-illegal-path" });
    expect(fs.existsSync(path.join(dir, "evil.txt"))).toBe(false);
  });

  it("rejects absolute path entries", async () => {
    const dir = tmp();
    const zp = path.join(dir, "abs.zip");
    fs.writeFileSync(zp, buildZip([{ name: "/tmp/foxbell-abs-evil.txt", data: "x" }]));
    await expect(safeUnzip(zp, path.join(dir, "d2"))).rejects.toMatchObject({ code: "zip-entry-illegal-path" });
    expect(fs.existsSync("/tmp/foxbell-abs-evil.txt")).toBe(false);
  });

  it("enforces total-byte cap on ACTUAL written bytes (lies in header don't help)", async () => {
    const dir = tmp();
    const zp = path.join(dir, "big.zip");
    fs.writeFileSync(zp, buildZip([{ name: "a.bin", data: "01234567890123456789" }]));
    const dest = path.join(dir, "d3");
    await expect(safeUnzip(zp, dest, { maxTotalBytes: 10 })).rejects.toMatchObject({
      code: "zip-total-over-limit",
      params: { limit: "10B" },
    });
    // 失败不留残留文件（dest 被整体清理）
    expect(fs.existsSync(path.join(dest, "a.bin"))).toBe(false);
    // 同包 20 字节上限正常通过
    await expect(safeUnzip(zp, path.join(dir, "d4"), { maxTotalBytes: 20 })).resolves.toBeTruthy();
  });

  it("enforces file-count cap", async () => {
    const dir = tmp();
    const zp = path.join(dir, "many.zip");
    const entries = Array.from({ length: 12 }, (_, i) => ({ name: `f${i}.txt`, data: "x" }));
    fs.writeFileSync(zp, buildZip(entries));
    await expect(safeUnzip(zp, path.join(dir, "d5"), { maxFiles: 10 })).rejects.toMatchObject({
      code: "zip-too-many-entries",
      params: { limit: "10" },
    });
  });

  it("broken zip → zip-open-failed / zip-read-failed", async () => {
    const dir = tmp();
    const zp = path.join(dir, "broken.zip");
    fs.writeFileSync(zp, Buffer.from("not a zip at all"));
    await expect(safeUnzip(zp, path.join(dir, "d6"))).rejects.toSatisfy(
      (e) => e.code === "zip-open-failed" || e.code === "zip-read-failed",
    );
  });

  // ---- R2 安全自查补强：UTF-8 中文条目名 + 反斜杠穿越变体 ----
  it("UTF-8 中文条目名正常解压（文件名保真）", async () => {
    const dir = tmp();
    const zp = path.join(dir, "cn.zip");
    fs.writeFileSync(zp, buildZip([
      { name: "宠物/spritesheet.webp", data: "cn-sheet" },
      { name: "宠物/voice/general/你好.m4a", data: "cn-audio" },
    ]));
    const dest = path.join(dir, "cn-out");
    await safeUnzip(zp, dest);
    expect(fs.readFileSync(path.join(dest, "宠物/spritesheet.webp"), "utf8")).toBe("cn-sheet");
    expect(fs.readFileSync(path.join(dest, "宠物/voice/general/你好.m4a"), "utf8")).toBe("cn-audio");
  });

  it('反斜杠穿越变体 "..\\\\evil.txt" 被拒（zip-entry-illegal-path，归一化后同 ../ 口径）', async () => {
    const dir = tmp();
    const zp = path.join(dir, "bs.zip");
    fs.writeFileSync(zp, buildZip([{ name: "..\\evil.txt", data: "pwned" }]));
    const dest = path.join(dir, "bs-out");
    await expect(safeUnzip(zp, dest)).rejects.toMatchObject({ code: "zip-entry-illegal-path" });
    // 店外无落盘 + 无半成品目标目录
    expect(fs.existsSync(path.join(dir, "evil.txt"))).toBe(false);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('内嵌反斜杠穿越 "a\\\\..\\\\b.txt" 同样被拒', async () => {
    const dir = tmp();
    const zp = path.join(dir, "bs2.zip");
    fs.writeFileSync(zp, buildZip([{ name: "a\\..\\b.txt", data: "pwned" }]));
    await expect(safeUnzip(zp, path.join(dir, "bs2-out"))).rejects.toMatchObject({
      code: "zip-entry-illegal-path",
    });
  });
});
