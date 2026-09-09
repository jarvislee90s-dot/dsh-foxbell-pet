// Petdex mock 测试：allowlist / slug 解析 / 双形态清单 / 体积封顶 / 重定向策略 / 错误码。
import { describe, expect, it } from "vitest";
import {
  allowedHost, downloadZip, fetchEntry, fetchManifestList, MANIFEST_URL, MAX_MANIFEST_BYTES,
  MAX_REDIRECTS, MAX_ZIP_BYTES, parseManifestPayload, parseSlug, PETDEX_TIMEOUT_MS,
  searchPets, stageFromPetdex, tmpZipName, urlAllowed,
} from "../src/host/petdex.js";

/** 最小 fetch mock：按 URL 路由到 {status, headers, body}；记录调用与重定向链 */
function mockFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (!r) throw new Error(`unexpected url ${url}`);
    if (r.throw) throw r.throw;
    const body = Buffer.isBuffer(r.body) ? r.body : Buffer.from(String(r.body ?? ""));
    return {
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      headers: new Map(Object.entries({ "content-length": String(body.length), ...(r.headers ?? {}) })),
      body: null, // 走 arrayBuffer 分支
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    };
  };
  impl.calls = calls;
  // readCapped 使用 headers.get —— Map 无 get 兼容问题（Map.get 即所需签名）
  return impl;
}

const WRAPPED = JSON.stringify({
  generatedAt: "2026-09-04T10:16:13.368Z",
  total: 2,
  pets: [
    { slug: "capvolt", displayName: "Pikachu", zipUrl: "https://assets.petdex.dev/pets/capvolt-x/zip.zip", spriteVersionNumber: 1 },
    { slug: "homelander", displayName: "", zipUrl: "", spriteVersionNumber: 2 },
  ],
});
const BARE = JSON.stringify([
  { slug: "capvolt", displayName: "Pikachu", zipUrl: "https://assets.petdex.dev/pets/x/zip.zip", spriteVersionNumber: 1 },
]);

describe("allowedHost / urlAllowed (域名 allowlist)", () => {
  it("accepts petdex.dev, www and subdomains", () => {
    expect(allowedHost("petdex.dev")).toBe(true);
    expect(allowedHost("www.petdex.dev")).toBe(true);
    expect(allowedHost("assets.petdex.dev")).toBe(true);
  });
  it("rejects lookalikes", () => {
    expect(allowedHost("evil.dev")).toBe(false);
    expect(allowedHost("petdex.dev.evil.com")).toBe(false);
    expect(allowedHost("evil-petdex.dev")).toBe(false);
    expect(allowedHost("petdex.devi")).toBe(false);
  });
  it("urlAllowed enforces https", () => {
    expect(urlAllowed("https://petdex.dev/x.zip")).toBe(true);
    expect(urlAllowed("http://petdex.dev/x.zip")).toBe(false);
    expect(urlAllowed("https://evil.com/x.zip")).toBe(false);
    expect(urlAllowed("not a url")).toBe(false);
  });
});

describe("parseSlug", () => {
  it("parses page links with variants", () => {
    expect(parseSlug("https://petdex.dev/pets/capvolt")).toBe("capvolt");
    expect(parseSlug("https://petdex.dev/en/pets/capvolt/")).toBe("capvolt");
    expect(parseSlug("https://petdex.dev/pets/capvolt?x=1#frag")).toBe("capvolt");
  });
  it("rejects non-pet urls and bad charset", () => {
    expect(parseSlug("https://petdex.dev/collections")).toBeNull();
    expect(parseSlug("https://petdex.dev/pets/")).toBeNull();
    expect(parseSlug("https://petdex.dev/pets/../etc")).toBeNull();
    expect(parseSlug("https://petdex.dev/pets/a_b")).toBeNull();
  });
});

describe("parseManifestPayload (双形态)", () => {
  it("accepts wrapped {pets:[]} and bare array", () => {
    expect(parseManifestPayload(Buffer.from(WRAPPED))).toHaveLength(2);
    expect(parseManifestPayload(Buffer.from(BARE))).toHaveLength(1);
  });
  it("rejects unknown shape / broken JSON with manifest-parse-failed", () => {
    expect(() => parseManifestPayload(Buffer.from('{"foo":1}'))).toThrow(/manifest-parse-failed|PetError/);
    expect(() => parseManifestPayload(Buffer.from("{broken"))).toThrow(/manifest-parse-failed|PetError/);
  });
  it("normalizes entries (missing fields → defaults)", () => {
    const list = parseManifestPayload(Buffer.from(JSON.stringify([{ slug: "x" }, { nope: 1 }])));
    expect(list).toEqual([{ slug: "x", displayName: "", zipUrl: "", spriteVersionNumber: 0 }]);
  });
});

describe("fetchManifestList / fetchEntry / searchPets (mock fetch)", () => {
  it("fetches manifest over https allowlisted host", async () => {
    const f = mockFetch({ [MANIFEST_URL]: { body: WRAPPED } });
    const list = await fetchManifestList({ fetchImpl: f });
    expect(list).toHaveLength(2);
    expect(f.calls).toEqual([MANIFEST_URL]);
  });
  it("fetchEntry matches slug or throws pet-not-on-petdex", async () => {
    const f = mockFetch({ [MANIFEST_URL]: { body: WRAPPED } });
    expect((await fetchEntry("capvolt", { fetchImpl: f })).zipUrl).toContain("assets.petdex.dev");
    await expect(fetchEntry("ghost", { fetchImpl: f })).rejects.toMatchObject({ code: "pet-not-on-petdex", params: { slug: "ghost" } });
  });
  it("searchPets filters by slug/displayName substring, caps to limit", async () => {
    const f = mockFetch({ [MANIFEST_URL]: { body: WRAPPED } });
    const hits = await searchPets("pika", { fetchImpl: f });
    expect(hits.map((h) => h.slug)).toEqual(["capvolt"]);
    expect(hits[0].hasZip).toBe(true);
    const none = await searchPets("zzz", { fetchImpl: f });
    expect(none).toEqual([]);
    const all = await searchPets("", { fetchImpl: f, limit: 1 });
    expect(all).toHaveLength(1);
  });
  it("non-2xx → manifest-status", async () => {
    const f = mockFetch({ [MANIFEST_URL]: { status: 503, body: "" } });
    await expect(fetchManifestList({ fetchImpl: f })).rejects.toMatchObject({ code: "manifest-status" });
  });
  it("network failure → manifest-request-failed", async () => {
    const f = mockFetch({ [MANIFEST_URL]: { throw: new Error("conn refused") } });
    await expect(fetchManifestList({ fetchImpl: f })).rejects.toMatchObject({ code: "manifest-request-failed" });
  });
  it("timeout constants are task-mandated 8s and MAM size caps", () => {
    expect(PETDEX_TIMEOUT_MS).toBe(8000);
    expect(MAX_ZIP_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_MANIFEST_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_REDIRECTS).toBe(5);
  });
});

describe("downloadZip (redirect + caps)", () => {
  it("rejects non-allowlist first hop with host-forbidden", async () => {
    const f = mockFetch({});
    await expect(downloadZip("https://evil.com/x.zip", { fetchImpl: f })).rejects.toMatchObject({
      code: "host-forbidden",
      params: { host: "evil.com" },
    });
    expect(f.calls).toHaveLength(0); // 未发出任何请求
  });
  it("rejects http downgrade", async () => {
    await expect(downloadZip("http://petdex.dev/x.zip", { fetchImpl: mockFetch({}) })).rejects.toMatchObject({ code: "host-forbidden" });
  });
  it("invalid url → download-url-invalid", async () => {
    await expect(downloadZip("::not a url::", { fetchImpl: mockFetch({}) })).rejects.toMatchObject({ code: "download-url-invalid" });
  });
  it("follows allowlisted redirects, refuses off-list hop", async () => {
    const zipUrl = "https://petdex.dev/dl/capvolt.zip";
    const ok = mockFetch({
      [zipUrl]: { status: 302, headers: { location: "https://assets.petdex.dev/pets/capvolt/zip.zip" }, body: "" },
      "https://assets.petdex.dev/pets/capvolt/zip.zip": { body: Buffer.from("PKzipbytes") },
    });
    const bytes = await downloadZip(zipUrl, { fetchImpl: ok });
    expect(bytes.toString()).toBe("PKzipbytes");
    expect(ok.calls).toHaveLength(2);

    const evil = mockFetch({
      [zipUrl]: { status: 302, headers: { location: "https://evil.com/x.zip" }, body: "" },
    });
    await expect(downloadZip(zipUrl, { fetchImpl: evil })).rejects.toMatchObject({ code: "redirect-forbidden" });
  });
  it("too many redirects → redirect-too-many", async () => {
    const routes = {};
    for (let i = 0; i <= MAX_REDIRECTS + 1; i++) {
      routes[`https://petdex.dev/hop${i}`] = { status: 302, headers: { location: `https://petdex.dev/hop${i + 1}` }, body: "" };
    }
    const f = mockFetch(routes);
    await expect(downloadZip("https://petdex.dev/hop0", { fetchImpl: f })).rejects.toMatchObject({ code: "redirect-too-many" });
  });
  it("non-2xx → download-status", async () => {
    const f = mockFetch({ "https://petdex.dev/x.zip": { status: 404, body: "" } });
    await expect(downloadZip("https://petdex.dev/x.zip", { fetchImpl: f })).rejects.toMatchObject({ code: "download-status" });
  });
  it("content-length over cap → download-too-large without buffering", async () => {
    const f = mockFetch({
      "https://petdex.dev/big.zip": { body: "small", headers: { "content-length": String(MAX_ZIP_BYTES + 1) } },
    });
    await expect(downloadZip("https://petdex.dev/big.zip", { fetchImpl: f })).rejects.toMatchObject({ code: "download-too-large" });
  });
});

describe("tmpZipName (临时文件名注入防御)", () => {
  it("accepts [a-z0-9-] slugs, unique per call", () => {
    const a = tmpZipName("capvolt");
    const b = tmpZipName("capvolt");
    expect(a).not.toBe(b);
    expect(a).toContain("capvolt");
  });
  it("rejects injection-shaped slugs with slug-invalid", () => {
    for (const evil of ["../evil", "a/b", "a\\b", "a b", "a.b", "a:b", "UPPER", ""]) {
      expect(() => tmpZipName(evil)).toThrow(/slug-invalid|PetError/);
    }
  });
});

describe("stageFromPetdex (端到端，mock fetch + 真实临时目录)", () => {
  it("slug → manifest → download → zip staging, meta overwrite", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { buildZip } = await import("./helpers/zipwriter.mjs");
    const { stageFromZip } = await import("../src/host/staging.js");

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "foxbell-petdex-"));
    const stagingRoot = path.join(root, "pets", ".import-staging");
    const tmpDir = path.join(root, "tmp");
    fs.mkdirSync(stagingRoot, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const zipBytes = buildZip([
      { name: "capvolt/spritesheet.webp", data: "sheetbytes" },
      { name: "capvolt/pet.json", data: JSON.stringify({ displayName: "本地名", spriteVersionNumber: 2 }) },
    ]);
    const f = mockFetch({
      [MANIFEST_URL]: { body: WRAPPED },
      "https://assets.petdex.dev/pets/capvolt-x/zip.zip": { body: zipBytes },
    });

    const staged = await stageFromPetdex("https://petdex.dev/pets/capvolt", {
      staging: { stageFromZipPath: (p) => stageFromZip(path.join(root, "pets"), stagingRoot, p) },
      tmpDir,
      fetchImpl: f,
    });
    expect(staged.suggestedName).toBe("capvolt"); // slug 覆写
    expect(staged.suggestedDisplayName).toBe("Pikachu"); // 清单 displayName 覆写
    expect(staged.spriteVersionNumber).toBe(1); // 清单版本覆写
    expect(staged.spritesheetSize).toBe(10);
    // 临时 zip 用完即删
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it("entry without zipUrl → petdex-no-zip", async () => {
    const f = mockFetch({ [MANIFEST_URL]: { body: WRAPPED } });
    await expect(
      stageFromPetdex("homelander", { staging: {}, tmpDir: "/tmp", fetchImpl: f }),
    ).rejects.toMatchObject({ code: "petdex-no-zip" });
  });

  it("unparsable link → slug-parse-failed", async () => {
    await expect(
      stageFromPetdex("https://petdex.dev/collections", { staging: {}, tmpDir: "/tmp", fetchImpl: mockFetch({}) }),
    ).rejects.toMatchObject({ code: "slug-parse-failed" });
  });
});

// ---- R2 安全自查补强：userinfo 伪装 / 端口后缀 / 子域后缀陷阱 ----
describe("urlAllowed 边界形态（R2 安全自查）", () => {
  it("userinfo 伪装 https://petdex.dev@evil.com/ → 拒绝（WHATWG hostname=evil.com）", () => {
    expect(urlAllowed("https://petdex.dev@evil.com/x.zip")).toBe(false);
    expect(urlAllowed("https://petdex.dev%40evil.com@evil.com/x")).toBe(false);
  });
  it("端口后缀：allowlist 按 hostname 判定（允许域任意端口放行、非允许域加端口仍拒绝）", () => {
    // 口径说明：任务要求「域名 allowlist」——hostname 命中即放行，端口不参与域判定
    //（https 已强制；petdex.dev 的任意端口仍是 petdex.dev 的资产面）。
    expect(urlAllowed("https://petdex.dev:8443/x.zip")).toBe(true);
    expect(urlAllowed("https://evil.com:8443/x.zip")).toBe(false);
    expect(urlAllowed("https://petdex.dev:8443@evil.com/x.zip")).toBe(false);
  });
  it("子域后缀陷阱：*.petdex.dev 放行，petdex.dev.* 与前置粘连一律拒绝", () => {
    expect(urlAllowed("https://assets.petdex.dev/x.zip")).toBe(true);
    expect(urlAllowed("https://deep.api.petdex.dev/x.zip")).toBe(true);
    expect(urlAllowed("https://petdex.dev.evil.com/x.zip")).toBe(false);
    expect(urlAllowed("https://evilpetdex.dev/x.zip")).toBe(false);
    expect(urlAllowed("https://petdex.devi/x.zip")).toBe(false);
    expect(urlAllowed("https://petdex.dev-.evil.com/x.zip")).toBe(false);
  });
});
