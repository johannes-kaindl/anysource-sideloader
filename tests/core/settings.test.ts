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

/**
 * Waechter gegen den Fehler, der am 2026-09-03 passiert ist: `bf343b2` stellte die
 * Katalog-URL in beiden READMEs um und liess `DEFAULT_CATALOG_URL` stehen. Beide Ziele
 * antworteten mit 200, deshalb schlug kein Link-Check an — nutzersichtbar abonnierte eine
 * frische Installation einen anderen Katalog, als die Doku zum Abonnieren empfahl.
 *
 * Ein Test, der den String hier bloss wiederholt, faengt das NICHT: er wird beim naechsten
 * Umzug mitgeaendert und bestaetigt danach die neue Haelfte gegen sich selbst. Geprueft wird
 * deshalb die Naht — Code gegen Doku (CORE-META-16 a).
 */
describe("DEFAULT_CATALOG_URL steht in Code und README gleich", () => {
  const readmes = ["README.md", "README.de.md"] as const;
  const CATALOG_URL_RE = /https:\/\/git\.jkaindl\.de\/\S+?\/raw\/branch\/\S+?\/catalog\.json/g;

  it.each(readmes)("%s nennt genau die URL, die der Code vorabonniert", async (name) => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
    const found = [...new Set(text.match(CATALOG_URL_RE) ?? [])];

    // Die Gegenprobe zur Gegenprobe: findet der Ausdruck ueberhaupt etwas? Ohne diese
    // Zusicherung wuerde eine umformulierte README den Test still gruen halten (CORE-TEST-16).
    expect(found.length).toBeGreaterThan(0);
    expect(found).toEqual([DEFAULT_SETTINGS.catalogs[0]]);
  });
});
