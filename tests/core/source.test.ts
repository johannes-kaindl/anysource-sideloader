import { describe, expect, it } from "vitest";
import { detectForge, fetchLatestRelease, fetchPluginFiles, fetchReleasesSince } from "../../src/core/source";
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

it("fetchLatestRelease (github): non-200 wirft sprechenden Fehler statt 'tag_name fehlt' (I6)", async () => {
  const http = fakeHttp({ "https://api.github.com/repos/o/r/releases/latest": { status: 401, text: "" } });
  await expect(
    fetchLatestRelease(http, { kind: "github", baseUrl: "https://github.com", owner: "o", repo: "r" }, null),
  ).rejects.toThrow(/401/);
});

it("fetchLatestRelease (gitea): non-200 wirft sprechenden Fehler statt 'tag_name fehlt' (I6)", async () => {
  const http = fakeHttp({
    "https://git.example.com/api/v1/repos/o/r/releases/latest": { status: 403, text: "" },
  });
  await expect(
    fetchLatestRelease(http, { kind: "gitea", baseUrl: "https://git.example.com", owner: "o", repo: "r" }, null),
  ).rejects.toThrow(/403/);
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

  it("I5: schickt den Auth-Header NICHT an ein Asset mit fremdem Host (nur an ref.baseUrl-Host)", async () => {
    const seenHeaders: Record<string, Record<string, string> | undefined> = {};
    const http = async (req: { url: string; headers?: Record<string, string> }) => {
      seenHeaders[req.url] = req.headers;
      const text = req.url.endsWith("manifest.json") ? MANIFEST : "console.log(1)";
      const bytes = new TextEncoder().encode(text);
      return { status: 200, text, arrayBuffer: bytes.buffer as ArrayBuffer };
    };
    const rel = {
      ...REL,
      assets: [
        { name: "main.js", downloadUrl: "https://cdn.foreign.example/main.js" },
        { name: "manifest.json", downloadUrl: "https://x/dl/manifest.json" },
      ],
    };
    await fetchPluginFiles(http, REF, rel, "secret-token");
    expect(seenHeaders["https://cdn.foreign.example/main.js"]).toEqual({});
    expect(seenHeaders["https://x/dl/manifest.json"]).toEqual({ Authorization: "token secret-token" });
  });
});

describe("raw-Quelle: Default-Branch", () => {
  /** Ein HttpPort, der nur die genannten URLs mit 200 beantwortet — alles andere 404. */
  function nurDiese(ok: Record<string, string>): { port: HttpPort; gesehen: string[] } {
    const gesehen: string[] = [];
    const port: HttpPort = async (req) => {
      gesehen.push(req.url);
      const body = ok[req.url];
      const buf = new TextEncoder().encode(body ?? "").buffer as ArrayBuffer;
      return { status: body === undefined ? 404 : 200, text: body ?? "", arrayBuffer: buf };
    };
    return { port, gesehen };
  }

  const ref = { kind: "raw" as const, baseUrl: "https://forge.example.com", owner: "o", repo: "r" };

  it("nimmt `main`, wenn es dort liegt", async () => {
    const { port, gesehen } = nurDiese({
      "https://forge.example.com/o/r/raw/main/manifest.json": '{"version":"2.0.0"}',
    });
    const rel = await fetchLatestRelease(port, ref, null);
    expect(rel.version).toBe("2.0.0");
    expect(gesehen).toHaveLength(1);
  });

  it("faellt auf `master` zurueck, wenn `main` 404 liefert", async () => {
    // Der haeufigste Grund, warum eine sonst gueltige Raw-Quelle nicht installierbar war:
    // aeltere Repos heissen `master`, und der Default war hart auf `main` verdrahtet.
    const { port, gesehen } = nurDiese({
      "https://forge.example.com/o/r/raw/master/manifest.json": '{"version":"1.5.0"}',
    });
    const rel = await fetchLatestRelease(port, ref, null);
    expect(rel.version).toBe("1.5.0");
    expect(gesehen[0]).toContain("/raw/main/");
    expect(gesehen[1]).toContain("/raw/master/");
    // Die Asset-URLs muessen auf DENSELBEN Branch zeigen wie das gefundene Manifest —
    // sonst laedt der Install die Dateien von einem Branch, den es nicht gibt.
    expect(rel.assets.every((a) => a.downloadUrl.includes("/raw/master/"))).toBe(true);
  });

  it("meldet den Fehler des ERSTEN Versuchs, wenn beide fehlschlagen", async () => {
    const { port } = nurDiese({});
    await expect(fetchLatestRelease(port, ref, null)).rejects.toThrow(/manifest\.json/);
  });
});

describe("fetchReleasesSince — Update-Notes ueber das ganze Versions-Delta", () => {
  it("github: holt die Liste, filtert auf neuer-als-installed, neueste zuerst", async () => {
    const einzelnes = JSON.parse(readFileSync(new URL("../fixtures/github-release.json", import.meta.url), "utf8")) as Record<string, unknown>;
    const liste = [
      { ...einzelnes, tag_name: "v0.5.0", body: "0.5.0" },
      { ...einzelnes, tag_name: "v0.4.1", body: "0.4.1" },
      { ...einzelnes, tag_name: "v0.4.0", body: "0.4.0" },
      { ...einzelnes, tag_name: "v0.3.1", body: "0.3.1" },
    ];
    const http = fakeHttp({
      "https://api.github.com/repos/o/r/releases?per_page=100": { text: JSON.stringify(liste) },
    });
    const releases = await fetchReleasesSince(
      http, { kind: "github", baseUrl: "https://github.com", owner: "o", repo: "r" }, "0.3.1", null,
    );
    expect(releases.map((r) => r.version)).toEqual(["0.5.0", "0.4.1", "0.4.0"]);
  });

  it("gitea: dieselbe Filterung ueber den Gitea-Adapter", async () => {
    const einzelnes = JSON.parse(GITEA_FIXTURE) as Record<string, unknown>;
    const liste = [{ ...einzelnes, tag_name: "0.2.0" }, { ...einzelnes, tag_name: "0.1.0" }];
    const http = fakeHttp({
      "https://git.jkaindl.de/api/v1/repos/jkaindl/calendar-notes/releases?limit=50": { text: JSON.stringify(liste) },
    });
    const releases = await fetchReleasesSince(
      http,
      { kind: "gitea", baseUrl: "https://git.jkaindl.de", owner: "jkaindl", repo: "calendar-notes" },
      "0.1.0",
      null,
    );
    expect(releases.map((r) => r.version)).toEqual(["0.2.0"]);
  });

  it("raw: kein Release-Endpunkt — faellt auf das synthetische Einzel-Release aus fetchLatestRelease zurueck", async () => {
    const http = fakeHttp({
      "https://forge.example.com/o/r/raw/main/manifest.json": { text: '{"version":"2.0.0"}' },
    });
    const releases = await fetchReleasesSince(
      http, { kind: "raw", baseUrl: "https://forge.example.com", owner: "o", repo: "r" }, "1.0.0", null,
    );
    expect(releases.map((r) => r.version)).toEqual(["2.0.0"]);
  });

  it("raw: liefert leere Liste, wenn die synthetische Version nicht neuer ist", async () => {
    const http = fakeHttp({
      "https://forge.example.com/o/r/raw/main/manifest.json": { text: '{"version":"1.0.0"}' },
    });
    const releases = await fetchReleasesSince(
      http, { kind: "raw", baseUrl: "https://forge.example.com", owner: "o", repo: "r" }, "1.0.0", null,
    );
    expect(releases).toEqual([]);
  });

  it("github: non-200 auf die Liste wirft einen sprechenden Fehler", async () => {
    const http = fakeHttp({ "https://api.github.com/repos/o/r/releases?per_page=100": { status: 403, text: "" } });
    await expect(
      fetchReleasesSince(http, { kind: "github", baseUrl: "https://github.com", owner: "o", repo: "r" }, "0.1.0", null),
    ).rejects.toThrow(/403/);
  });
});
