import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "../../src/core/settings";

describe("loadSettings", () => {
  it("liefert Defaults bei undefined", () => {
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("verwirft kaputte Plugin-Eintraege und haertet checkOnStartup", () => {
    const s = loadSettings({
      plugins: [
        {
          id: "ok",
          repoUrl: "https://x/o/r",
          installedVersion: "1.0.0",
          availableVersion: null,
          addedFrom: "url",
          ref: { kind: "gitea", baseUrl: "https://x", owner: "o", repo: "r" },
        },
        { id: "kaputt" },
      ],
      checkOnStartup: "ja",
    });
    expect(s.plugins.map((p) => p.id)).toEqual(["ok"]);
    expect(s.checkOnStartup).toBe(true);
  });

  it("behaelt hostSecrets nur als String-zu-String-Paare", () => {
    const s = loadSettings({
      hostSecrets: { "git.jkaindl.de": "secret-id", bad: 42, other: null },
    });
    expect(s.hostSecrets).toEqual({ "git.jkaindl.de": "secret-id" });
  });

  it("behaelt catalogs nur als Strings", () => {
    const s = loadSettings({ catalogs: ["https://x/catalog.json", 5, null] });
    expect(s.catalogs).toEqual(["https://x/catalog.json"]);
  });

  it("faellt bei nicht-boolschem checkOnStartup auf true zurueck (auch false-artige Werte werden geprueft, nicht typof-blind)", () => {
    expect(loadSettings({ checkOnStartup: false }).checkOnStartup).toBe(false);
  });
});
