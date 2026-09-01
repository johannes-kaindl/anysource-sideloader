import { describe, expect, it } from "vitest";
import { Setting } from "obsidian";
import { SideloaderSettingTab, normalizeHost, type SettingsHost } from "../../src/obsidian/settings-tab";
import { DEFAULT_SETTINGS, type SideloaderSettings } from "../../src/core/settings";
import { MemorySecretStore } from "../../src/obsidian/secrets";

/**
 * Diese Datei sichert die **Struktur**, die der Fix vom 2026-09-01 hergestellt hat — und
 * damit genau den Rückweg in den Defekt.
 *
 * Der Defekt war: Kataloge und Token-Hosts wurden aus **einer** `render`-Hatch heraus als
 * mehrere Zeilen gebaut. Im nativen Obsidian-1.13-Pfad überlebt das nicht (gemessen: eine
 * Hatch darf nur ihre eigene Zeile befüllen; Zusatzzeilen verschwinden lautlos), und die
 * beiden Einstellungen waren dort **unbedienbar**. Seitdem ist jede Zeile eine eigene
 * Definition in einer Gruppe.
 *
 * ⚠️ **Was dieser Test NICHT kann:** beweisen, dass Obsidian die Definitionen auch
 * zeichnet. Das ist die Naht zum Host und gehört dem GUI-Smoke (`docs/SMOKE.md`, E2–E5) —
 * er ist die inhaltliche Hälfte zu dieser strukturellen. Ein grüner Test hier hat den
 * Defekt nicht bemerkt und hätte ihn auch nicht bemerken können; deshalb steht die
 * Arbeitsteilung hier ausdrücklich und nicht nur im Commit.
 */

function host(settings: Partial<SideloaderSettings> = {}): SettingsHost {
  const merged: SideloaderSettings = {
    ...DEFAULT_SETTINGS,
    plugins: [],
    catalogs: [],
    hostSecrets: {},
    ...settings,
  };
  return {
    settings: merged,
    secretStore: new MemorySecretStore(),
    saveSettings: async () => {},
  } as unknown as SettingsHost;
}

function tabFor(settings: Partial<SideloaderSettings> = {}): SideloaderSettingTab {
  const h = host(settings);
  return new SideloaderSettingTab({} as never, h);
}

interface Gruppe {
  type?: string;
  heading?: string;
  items?: unknown[];
}

function gruppen(tab: SideloaderSettingTab): Gruppe[] {
  return tab
    .getSettingDefinitions()
    .map((d) => d as unknown as Gruppe)
    .filter((d) => d.type === "group");
}

/** Gruppe über ihre Überschrift statt über den Index: seit 0.3.0 stehen fünf Gruppen im
 *  Tab (Updates, Installed, Browse, Catalogs, Access tokens), und ein Index-Zugriff bricht
 *  bei jeder neuen Sektion, ohne dass etwas kaputt wäre. */
function gruppe(tab: SideloaderSettingTab, heading: string): Gruppe | undefined {
  return gruppen(tab).find((g) => g.heading === heading);
}

describe("normalizeHost", () => {
  it("reduziert eine Repo-URL auf host[:port]", () => {
    expect(normalizeHost(" https://git.example.com/owner/repo ")).toBe("git.example.com");
    expect(normalizeHost("http://127.0.0.1:4711/a/b")).toBe("127.0.0.1:4711");
    expect(normalizeHost("git.example.com")).toBe("git.example.com");
  });
});

describe("getSettingDefinitions — Struktur", () => {
  it("Kataloge und Tokens sind Gruppen, nicht je eine render-Hatch", () => {
    const headings = gruppen(tabFor()).map((x) => x.heading);
    expect(headings).toContain("Catalogs");
    expect(headings).toContain("Access tokens");
  });

  it("die LISTEN-Einstellungen sind keine render-Hatch", () => {
    // Der Rückweg in den Defekt, genau benannt: „Catalogs"/„Access tokens" wieder als
    // einzelne Hatch, die mehrere Zeilen baut.
    //
    // Eine Top-Level-Hatch als solche ist NICHT verboten — der „Check for updates
    // now"-Knopf ist eine und völlig in Ordnung, weil sie genau ihre eigene Zeile
    // befüllt. Der frühere Test verbot jede Hatch und wäre an diesem Knopf zerbrochen,
    // ohne dass etwas kaputt war: er maß die Bauform statt der Zusicherung.
    const oberste = tabFor({ catalogs: ["a", "b"] }).getSettingDefinitions();
    const listenAlsHatch = oberste.filter(
      (d) =>
        typeof (d as { render?: unknown }).render === "function" &&
        ["Catalogs", "Access tokens"].includes(String((d as { name?: unknown }).name ?? "")),
    );
    expect(listenAlsHatch).toHaveLength(0);
  });

  it("die Zeile mit dem Prüf-Knopf ist eine Einzelzeilen-Hatch und bleibt erlaubt", () => {
    const knopf = tabFor()
      .getSettingDefinitions()
      .find((d) => String((d as { name?: unknown }).name ?? "").startsWith("Check for updates now"));
    expect(typeof (knopf as { render?: unknown } | undefined)?.render).toBe("function");
  });

  it("jeder Katalog bekommt eine eigene Zeile — plus Beschreibung und Add-Zeile", () => {
    const ohne = gruppe(tabFor({ catalogs: [] }), "Catalogs");
    const mitZwei = gruppe(tabFor({ catalogs: ["https://a/c.json", "https://b/c.json"] }), "Catalogs");
    // Beschreibung + Add-Zeile = 2 Grundzeilen; je Katalog kommt genau eine dazu.
    expect(ohne?.items).toHaveLength(2);
    expect(mitZwei?.items).toHaveLength(4);
  });

  it("jeder Token-Host bekommt eine eigene Zeile — plus Beschreibung und Add-Zeile", () => {
    const ohne = gruppe(tabFor({ hostSecrets: {} }), "Access tokens");
    const mitZwei = gruppe(tabFor({ hostSecrets: { "a.example": "id-a", "b.example": "id-b" } }), "Access tokens");
    expect(ohne?.items).toHaveLength(2);
    expect(mitZwei?.items).toHaveLength(4);
  });

  it("die Erklärtexte überleben den Umbau (UI-STANDARD §10)", () => {
    const kataloge = gruppe(tabFor(), "Catalogs");
    const tokens = gruppe(tabFor(), "Access tokens");
    const desc = (g: Gruppe | undefined): string =>
      String((g?.items?.[0] as { desc?: unknown } | undefined)?.desc ?? "");
    expect(desc(kataloge)).toContain("A catalog is a JSON list of plugins");
    expect(desc(tokens)).toContain("stored in the Obsidian keychain");
  });

  it("eine Zeilen-Hatch befüllt genau ihre eigene Zeile", () => {
    // Die Zusicherung, an der der Defekt hing: die Hatch baut in das übergebene `Setting`
    // und nicht daneben. Gemessen wird, dass danach Komponenten IN dieser Zeile hängen.
    const g = gruppe(tabFor({ catalogs: ["https://a/c.json"] }), "Catalogs");
    const zeile = g?.items?.[1] as { render?: (s: Setting) => void } | undefined;
    expect(typeof zeile?.render).toBe("function");

    const setting = new Setting(undefined as never);
    zeile?.render?.(setting);
    const komponenten = (setting as unknown as { components: unknown[] }).components;
    expect(komponenten.length).toBeGreaterThan(0);
  });
});
