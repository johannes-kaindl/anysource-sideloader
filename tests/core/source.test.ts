import { describe, expect, it } from "vitest";
import { detectForge, fetchLatestRelease, fetchPluginFiles } from "../../src/core/source";
import type { HttpPort } from "../../src/core/forge/types";
import { readFileSync } from "node:fs";

function fakeHttp(routes: Record<string, { status?: number; text?: string; bytes?: Uint8Array }>): HttpPort {
  return async (req) => {
    const r = routes[req.url];
    if (!r) return { status: 404, text: "not found", arrayBuffer: new ArrayBuffer(0) };
    const bytes = r.bytes ?? new TextEncoder().encode(r.text ?? "");
    return { status: r.status ?? 200, text: r.text ?? "", arrayBuffer: bytes.buffer as ArrayBuffer };
  };
}

const GITEA_FIXTURE = readFileSync(new URL("../fixtures/gitea-release.json", import.meta.url), "utf8");

describe("detectForge", () => {
  it("github.com direkt, ohne Netz-Probe", async () => {
    const http = fakeHttp({});
    const ref = await detectForge(http, "https://github.com/o/r");
    expect(ref).toEqual({ kind: "github", baseUrl: "https://github.com", owner: "o", repo: "r" });
  });
  it("Gitea-Probe: 200 auf /api/v1/version => gitea", async () => {
    const http = fakeHttp({ "https://git.jkaindl.de/api/v1/version": { text: '{"version":"12"}' } });
    expect((await detectForge(http, "https://git.jkaindl.de/o/r"))?.kind).toBe("gitea");
  });
  it("keine API => raw", async () => {
    const http = fakeHttp({});
    expect((await detectForge(http, "https://example.com/o/r"))?.kind).toBe("raw");
  });
  it("unparsebare URL => null", async () => {
    expect(await detectForge(fakeHttp({}), "quatsch")).toBeNull();
  });
});

it("fetchLatestRelease (raw): 404 auf manifest.json wirft sprechenden Fehler statt SyntaxError", async () => {
  const http = fakeHttp({});
  await expect(
    fetchLatestRelease(
      http,
      { kind: "raw", baseUrl: "https://example.com", owner: "o", repo: "r" },
      null,
    ),
  ).rejects.toThrow(/manifest\.json/);
});

it("fetchLatestRelease nutzt den passenden Adapter", async () => {
  const http = fakeHttp({
    "https://git.jkaindl.de/api/v1/repos/jkaindl/calendar-notes/releases/latest": { text: GITEA_FIXTURE },
  });
  const rel = await fetchLatestRelease(http,
    { kind: "gitea", baseUrl: "https://git.jkaindl.de", owner: "jkaindl", repo: "calendar-notes" }, null);
  expect(rel.assets.map((a) => a.name)).toContain("main.js");
});

describe("fetchPluginFiles", () => {
  const REF = { kind: "gitea" as const, baseUrl: "https://x", owner: "o", repo: "r" };
  const MANIFEST = '{"id":"demo","name":"Demo","version":"1.0.0"}';
  const REL = {
    tagName: "1.0.0", version: "1.0.0", notes: "", htmlUrl: "",
    assets: [
      { name: "main.js", downloadUrl: "https://x/dl/main.js" },
      { name: "manifest.json", downloadUrl: "https://x/dl/manifest.json" },
    ],
  };
  it("laedt Pflicht-Assets, parst Manifest, checksums=absent ohne Liste", async () => {
    const http = fakeHttp({
      "https://x/dl/main.js": { text: "console.log(1)" },
      "https://x/dl/manifest.json": { text: MANIFEST },
    });
    const got = await fetchPluginFiles(http, REF, REL, null);
    expect(got.manifest.id).toBe("demo");
    expect(got.files.map((f) => f.name).sort()).toEqual(["main.js", "manifest.json"]);
    expect(got.checksums).toBe("absent");
  });
  it("wirft, wenn main.js fehlt", async () => {
    const rel = { ...REL, assets: [REL.assets[1]!] };
    await expect(fetchPluginFiles(fakeHttp({ "https://x/dl/manifest.json": { text: MANIFEST } }), REF, rel, null))
      .rejects.toThrow(/main\.js/);
  });
  it("meldet mismatch, wenn checksums.sha256 nicht passt", async () => {
    const rel = { ...REL, assets: [...REL.assets, { name: "checksums.sha256", downloadUrl: "https://x/dl/c" }] };
    const http = fakeHttp({
      "https://x/dl/main.js": { text: "console.log(1)" },
      "https://x/dl/manifest.json": { text: MANIFEST },
      "https://x/dl/c": { text: "0".repeat(64) + "  main.js\n" },
    });
    expect((await fetchPluginFiles(http, REF, rel, null)).checksums).toBe("mismatch");
  });
});
