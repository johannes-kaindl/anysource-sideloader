import { describe, expect, it } from "vitest";
import { detectForge, fetchLatestRelease, fetchPluginFiles } from "../../src/core/source";
import type { HttpPort } from "../../src/core/forge/types";

const nodeHttp: HttpPort = async (req) => {
  const res = await fetch(req.url, { method: req.method ?? "GET", headers: req.headers });
  const buf = await res.arrayBuffer();
  return { status: res.status, text: new TextDecoder().decode(buf), arrayBuffer: buf };
};

describe("live: git.jkaindl.de", () => {
  it("detect -> latest -> files fuer calendar-notes", async () => {
    const ref = await detectForge(nodeHttp, "https://git.jkaindl.de/jkaindl/calendar-notes");
    expect(ref?.kind).toBe("gitea");
    const rel = await fetchLatestRelease(nodeHttp, ref!, null);
    const got = await fetchPluginFiles(nodeHttp, ref!, rel, null);
    expect(got.manifest.id).toBe("calendar-notes");
    expect(got.files.length).toBeGreaterThanOrEqual(2);
    // checksums: "absent" solange kein Release nach Task 14 gebaut wurde; danach "ok" — beides zulaessig:
    expect(["ok", "absent"]).toContain(got.checksums);
  });
});

describe("live: github.com (public)", () => {
  it("detect -> latest -> files fuer obsidian42-brat", async () => {
    const ref = await detectForge(nodeHttp, "https://github.com/TfTHacker/obsidian42-brat");
    const rel = await fetchLatestRelease(nodeHttp, ref!, null);
    const got = await fetchPluginFiles(nodeHttp, ref!, rel, null);
    expect(got.manifest.id).toBe("obsidian42-brat");
  });
});

describe.skipIf(!process.env.FORGE_TOKEN)("live: git.jkaindl.de (private, mit Token)", () => {
  it("detect -> latest -> files fuer das private anysource-sideloader-Repo selbst", async () => {
    const token = process.env.FORGE_TOKEN ?? null;
    const ref = await detectForge(nodeHttp, "https://git.jkaindl.de/jkaindl/anysource-sideloader");
    expect(ref?.kind).toBe("gitea");
    const rel = await fetchLatestRelease(nodeHttp, ref!, token);
    const got = await fetchPluginFiles(nodeHttp, ref!, rel, token);
    expect(got.manifest.id).toBe("anysource-sideloader");
  });
});
