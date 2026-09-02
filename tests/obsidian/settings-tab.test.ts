import { describe, expect, it } from "vitest";
import { Setting } from "obsidian";
import { SideloaderSettingTab, normalizeHost, type SettingsHost } from "../../src/obsidian/settings-tab";
import { DEFAULT_SETTINGS, type SideloaderSettings } from "../../src/core/settings";
import { MemorySecretStore } from "../../src/obsidian/secrets";
import { STRINGS } from "../../src/i18n/strings";

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

  /** Der Lade-Zustand der Update-Pruefung.
   *
   *  Warum es ihn ueberhaupt gibt, ist GEMESSEN und nicht vermutet: `checkAllUpdates`
   *  ruft die Quellen **sequenziell** ab (`for … await`), und bei den 22 Plugins des
   *  produktiven Vaults dauert das 1,8 s gegen die eigene Forge im LAN — gegen GitHub
   *  hochgerechnet 6,7 s (5 Messungen, Schnitt 305 ms je Abruf). Ein Klick ohne jede
   *  Rueckmeldung liest sich in dieser Zeit als „habe ich getroffen?".
   *
   *  Bewusst nur EIN Zustand: das Ergebnis meldet ohnehin eine Notice, der Mangel war
   *  allein die Zeit dazwischen. UI-STANDARD §8 erlaubt das ausdruecklich („ein Baustein
   *  mit drei sinnvollen Zustaenden bleibt bei dreien") und bindet nur den NAMEN des
   *  vierten — `is-checking` — samt Icon `loader`.
   *
   *  ⚠️ Bewusst NICHT `setDisabled`: genau dieser Aufruf, aus dem `.finally()` des
   *  Flow-Promise heraus, fror am 2026-09-01 die gesamte App ein (2026-09-02 in sieben
   *  Laeufen isoliert, `docs/SMOKE.md` § Freeze). Der Indikator ist deshalb nicht nur
   *  huebscher als eine gesperrte Schaltflaeche, sondern die einzige gemessen sichere
   *  Form von Rueckmeldung an dieser Stelle. */
  describe("Lade-Zustand der Update-Pruefung (UI-STANDARD §8)", () => {
    function pruefZeile(tab: SideloaderSettingTab): Setting {
      const zeile = tab
        .getSettingDefinitions()
        .find((d) => String((d as { name?: unknown }).name ?? "").startsWith("Check for updates now")) as
        | { render?: (s: Setting) => void }
        | undefined;
      const setting = new Setting(undefined as never);
      zeile?.render?.(setting);
      return setting;
    }
    /** Der Indikator ist der KANON-Baustein aus §8 (`.asl-status`, vom vorhandenen
     *  `status()`-Helfer gezeichnet) — gesucht wird deshalb rekursiv, nicht als direktes
     *  Kind: er sitzt in einem Traeger-Span, den die Zeile beim Umschalten leert. */
    const indikator = (s: Setting): any =>
      (s.controlEl as unknown as { querySelectorAll(q: string): any[] }).querySelectorAll(".asl-status")[0];

    it("ruhend zeigt die Zeile keinen Lade-Zustand", () => {
      // Ruhend steht KEIN Indikator in der Zeile — ein dauerhaft sichtbares, leeres
      // Status-Symbol behauptete einen Zustand, den es nicht gibt.
      expect(indikator(pruefZeile(tabFor()))).toBeUndefined();
    });

    it("waehrend der Pruefung traegt der Indikator Klasse UND Icon UND aria-label", () => {
      // §8: nie eines ohne die anderen — Farbe allein traegt die Aussage nicht (WCAG 1.4.1).
      const tab = tabFor();
      const s = pruefZeile(tab);
      tab.setzePruefungLaeuft(true);
      expect(indikator(s)?.hasClass("is-checking")).toBe(true);
      // Das Icon sitzt im Kind-Span, wie der Kanon-Helfer es baut (`.asl-status-icon`).
      expect(indikator(s)?.querySelectorAll(".asl-status-icon")[0]?.dataset.icon).toBe("loader");
      expect(indikator(s)?.getAttribute("aria-label")).toBeTruthy();
    });

    it("nach der Pruefung ist der Lade-Zustand wieder weg", () => {
      const tab = tabFor();
      const s = pruefZeile(tab);
      tab.setzePruefungLaeuft(true);
      tab.setzePruefungLaeuft(false);
      expect(indikator(s)).toBeUndefined();
    });

    it("ein Neuzeichnen der Zeile behaelt den laufenden Zustand", () => {
      // Der Tab wird waehrend der Pruefung neu gezeichnet (`aktualisieren()` haengt am
      // Befehl). Haenge der Zustand nur am alten Element, waere der Spinner danach weg.
      const tab = tabFor();
      pruefZeile(tab);
      tab.setzePruefungLaeuft(true);
      const frisch = pruefZeile(tab);
      expect(indikator(frisch)?.hasClass("is-checking")).toBe(true);
    });
  });
});

/**
 * Eine laufende Eingabe überlebt ein Neuzeichnen (Produktfehler, gemessen 2026-09-02).
 *
 * Der Tab zeichnet sich bei mehreren Anlässen komplett neu — Katalog fertig geladen,
 * Platten-Bestand geändert, nach jedem Flow. Der getippte Text lebte bis dahin in einer
 * **Closure-Variablen** (`pendingCatalog`/`pendingHost`), die `getSettingDefinitions()` bei
 * jedem Aufbau neu und leer anlegt. Wer tippte, während der Katalog fertig lud, klickte
 * danach auf „Add" — und trug nichts ein.
 *
 * Gemessen wurde es am Prüfwerkzeug (`hostSecrets` blieb leer, `selbesFeld: false`), es
 * trifft aber jeden Nutzer, der die Einstellungen öffnet und sofort tippt: das Zeitfenster
 * ist so lang, wie der Katalog lädt — über WAN mehrere Sekunden.
 *
 * ⚠️ Was diese Tests NICHT abdecken: **Fokus und Cursorposition**. Der Wert überlebt hier
 * nachweislich; ob das Feld nach dem Neuzeichnen noch bedienbar ist, ist eine DOM-Aussage
 * und gehört dem GUI-Smoke (Abschnitt E). Die Arbeitsteilung steht hier, damit ein grüner
 * Lauf nicht als Freispruch für die ganze Sache gelesen wird.
 */
describe("Eine laufende Eingabe überlebt ein Neuzeichnen", () => {
  /** Die „Add“-Zeile ist die letzte Zeile ihrer Gruppe — gezielt über die Position, weil
   *  sie als einzige Zeile der Gruppe keinen Namen trägt und kein Abo repräsentiert. */
  function addZeile(tab: SideloaderSettingTab, heading: string): Setting {
    const items = (gruppe(tab, heading)?.items ?? []) as { render?: (s: Setting) => void }[];
    const s = new Setting(undefined as never);
    items[items.length - 1]?.render?.(s);
    return s;
  }
  const teile = (s: Setting): any[] => (s as unknown as { components: any[] }).components;
  const feld = (s: Setting): any => teile(s).find((c) => "onChangeCB" in c && typeof c.getValue === "function");
  const knopf = (s: Setting, text: string): any => teile(s).find((c) => c.textValue === text);

  it("die getippte Katalog-URL wird eingetragen, obwohl der Tab dazwischen neu zeichnet", () => {
    const h = host();
    const tab = new SideloaderSettingTab({} as never, h);

    feld(addZeile(tab, "Catalogs")).onChangeCB("https://forge.example/c.json");
    tab.aktualisieren(); // der Katalog ist fertig geladen — der Tab zeichnet neu
    knopf(addZeile(tab, "Catalogs"), STRINGS.settings.catalogAdd).clickCB();

    expect(h.settings.catalogs).toEqual(["https://forge.example/c.json"]);
  });

  it("der getippte Token-Host wird uebernommen, obwohl der Tab dazwischen neu zeichnet", () => {
    // Exakt der gemessene Fall: der GUI-Smoke fuellte das Host-Feld, der Tab zeichnete
    // neu, „Add host" traf ein leeres Feld — `hostSecrets` blieb leer.
    const h = host();
    const tab = new SideloaderSettingTab({} as never, h);

    feld(addZeile(tab, "Access tokens")).onChangeCB("https://git.example.com/owner/repo");
    tab.aktualisieren();
    knopf(addZeile(tab, "Access tokens"), STRINGS.settings.tokenAdd).clickCB();

    expect(Object.keys(h.settings.hostSecrets)).toEqual(["git.example.com"]);
  });

  it("das neu gezeichnete Feld zeigt den getippten Wert weiter an", () => {
    // Ohne das waere der Wert zwar gerettet, das Feld aber sichtbar leer — der Nutzer
    // tippte ihn ein zweites Mal und haette ihn danach doppelt.
    const tab = new SideloaderSettingTab({} as never, host());
    feld(addZeile(tab, "Catalogs")).onChangeCB("https://forge.example/c.json");
    tab.aktualisieren();
    expect(feld(addZeile(tab, "Catalogs")).getValue()).toBe("https://forge.example/c.json");
  });

  it("nach dem Eintragen ist das Feld wieder leer", () => {
    // Der Rueckweg in einen Fehler, den erst die Rettung erzeugt: bleibt der Wert stehen,
    // traegt der naechste Klick denselben Katalog ein zweites Mal ein.
    const h = host();
    const tab = new SideloaderSettingTab({} as never, h);
    feld(addZeile(tab, "Catalogs")).onChangeCB("https://forge.example/c.json");
    knopf(addZeile(tab, "Catalogs"), STRINGS.settings.catalogAdd).clickCB();
    expect(feld(addZeile(tab, "Catalogs")).getValue()).toBe("");
  });
});

