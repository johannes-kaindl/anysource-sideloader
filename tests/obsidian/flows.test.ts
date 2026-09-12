import { describe, expect, it } from "vitest";
import { fetchReleaseNotesFor, type FlowContext } from "../../src/obsidian/flows";
import { MemorySecretStore } from "../../src/obsidian/secrets";
import type { HttpPort } from "../../src/core/forge/types";
import type { ManagedPlugin, SideloaderSettings } from "../../src/core/settings";

function fakeHttp(routes: Record<string, { status?: number; text?: string }>): HttpPort {
  return async (req) => {
    const r = routes[req.url];
    if (!r) return { status: 404, text: "not found", arrayBuffer: new ArrayBuffer(0) };
    const bytes = new TextEncoder().encode(r.text ?? "");
    return { status: r.status ?? 200, text: r.text ?? "", arrayBuffer: bytes.buffer as ArrayBuffer };
  };
}

function makeCtx(http: HttpPort, plugin: ManagedPlugin): FlowContext {
  const settings: SideloaderSettings = { plugins: [plugin], catalogs: [], hostSecrets: {}, checkOnStartup: true };
  return {
    app: {} as FlowContext["app"],
    http,
    settings,
    saveSettings: async () => {},
    secretStore: new MemorySecretStore(),
  };
}

describe("fetchReleaseNotesFor — Update-Notes ueber das ganze Versions-Delta", () => {
  it("liefert alle Releases seit der installierten Version, neueste zuerst", async () => {
    const plugin: ManagedPlugin = {
      id: "demo",
      repoUrl: "https://git.jkaindl.de/o/demo",
      ref: { kind: "gitea", baseUrl: "https://git.jkaindl.de", owner: "o", repo: "demo" },
      installedVersion: "0.3.1",
      availableVersion: null,
      addedFrom: "url",
    };
    const liste = [
      { tag_name: "0.5.0", body: "5", html_url: "", assets: [] },
      { tag_name: "0.4.1", body: "4.1", html_url: "", assets: [] },
      { tag_name: "0.4.0", body: "4.0", html_url: "", assets: [] },
      { tag_name: "0.3.1", body: "alt", html_url: "", assets: [] },
    ];
    const http = fakeHttp({
      "https://git.jkaindl.de/api/v1/repos/o/demo/releases?limit=50": { text: JSON.stringify(liste) },
    });
    const notes = await fetchReleaseNotesFor(makeCtx(http, plugin), "demo");
    expect(notes.map((n) => n.version)).toEqual(["0.5.0", "0.4.1", "0.4.0"]);
    expect(notes.map((n) => n.notes)).toEqual(["5", "4.1", "4.0"]);
  });

  it("unbekannte id liefert leere Liste", async () => {
    const plugin: ManagedPlugin = {
      id: "demo", repoUrl: "u",
      ref: { kind: "gitea", baseUrl: "https://x", owner: "o", repo: "r" },
      installedVersion: "1.0.0", availableVersion: null, addedFrom: "url",
    };
    const notes = await fetchReleaseNotesFor(makeCtx(fakeHttp({}), plugin), "andere-id");
    expect(notes).toEqual([]);
  });
});
