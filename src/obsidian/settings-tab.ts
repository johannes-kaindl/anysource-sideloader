// Zweigleisige Settings — eine Wahrheit fuer beide Renderpfade (REGISTRY „Zweigleisige
// deklarative Settings — eine-Wahrheit-Walker"). `getSettingDefinitions()` ist die
// Struktur (Store-Pflicht, `prefer-setting-definitions`); `display()` zeichnet dieselbe
// Struktur mit der klassischen Setting-API fuer Obsidian <1.13 nach. Form-Referenz:
// paperless-storage/src/obsidian/settings-tab.ts.
import {
  App,
  PluginSettingTab,
  SecretComponent,
  Setting,
  type Plugin,
  type SettingDefinitionItem,
  type SettingGroupItem,
} from "obsidian";
import type { SideloaderSettings } from "../core/settings";
import type { SecretStore } from "./secrets";
import { refreshSettingsTab, renderSettingDefinitions } from "../vendor/kit-obsidian/settings_walker";
import { STRINGS } from "../i18n/strings";

export interface SettingsHost extends Plugin {
  settings: SideloaderSettings;
  secretStore: SecretStore;
  saveSettings(): Promise<void>;
}

/** Trimmt und entfernt Protokoll + Pfad — uebrig bleibt host[:port]. Ein Nutzer tippt
 *  typischerweise die volle Repo-URL statt nur des Hosts; die Karte in
 *  `settings.hostSecrets` ist aber pro FORGE-HOST, nicht pro Repo. */
export function normalizeHost(input: string): string {
  let s = input.trim();
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(0, slash);
  return s;
}

export class SideloaderSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly host: SettingsHost,
  ) {
    super(app, host);
  }

  // ── Die eine Wahrheit ────────────────────────────────────────────────────
  //
  // ⚠️ **Eine `render`-Hatch darf genau IHRE EINE Zeile befuellen.** Was sie daneben
  // baut, ueberlebt im nativen 1.13-Pfad nicht: weder ueber `settingEl.parentElement`
  // (das Element haengt beim Aufruf noch nicht im Dokument) noch ueber
  // `group.addSetting()`. Beides an Obsidian 1.13.7 gemessen (2026-09-01, A/B im selben
  // Build: direkt befuellte Zeile erscheint, Zusatzzeile nicht) — und beides **lautlos**,
  // ohne Exception. Vorher standen "Catalogs" und "Access tokens" deshalb als leere
  // Zeilen da und waren nicht bedienbar; gefunden hat es der GUI-Smoke (E2/E3), nicht die
  // Unit-Tests: der Defekt lebt ausschliesslich in der Naht zum Host.
  //
  // ── Abweichung, ausdruecklich statt stillschweigend (UI-STANDARD §1a) ──
  // Die fuenf Nachbarn mit demselben Walker (paperless-storage, calendar-notes,
  // koda-agent, llm-lab, mailstone) loesen das ueber `settingBodyHost(setting)` aus dem
  // Kit-Walker: es leert die Zeile, nimmt ihr die `setting-item`-Klasse und gibt sie als
  // nackten Container zurueck, in den die ganze Liste gebaut wird. Das funktioniert (alles
  // haengt IN der Zeile) und waere die Kit-first-Antwort — die Funktion ist hier sogar
  // schon vendored.
  //
  // Hier trotzdem anders, aus einem Grund, der die Abweichung tragen muss: eine Liste aus
  // ECHTEN Setting-Zeilen ist das, wofuer Obsidian 1.13 `type: "group"` eingefuehrt hat.
  // Sie erbt natives Styling und wird von der Settings-Suche gefunden; ein geleerter
  // Container ist fuer die Suche ein blinder Fleck. `settingBodyHost` ist der Weg aus dem
  // Fallback-Pfad (<1.13), der nativ zufaellig auch traegt.
  // `gilt-solange:` Obsidian `SettingDefinitionGroup.items` unterstuetzt und die
  // Settings-Suche Gruppen-Items indiziert. Faellt eines davon weg, ist
  // `settingBodyHost(setting)` der Rueckweg — der Umbau ist auf die beiden
  // `*Items()`-Methoden begrenzt.
  //
  // Mehrzeilige Listen entstehen deshalb als **Gruppe mit je einer Definition pro Zeile**.
  // Das traegt in BEIDEN Pfaden: der Kit-Walker iteriert `items` genauso und ruft je Item
  // `render(setting)` auf. Die nativen Listen-Affordanzen (`type: "list"` mit
  // `onDelete`/`addItem`) bleiben bewusst ungenutzt — der Fallback-Walker zeichnet sie
  // nicht nach (i2m-Befund), und eine Zeile, die ihren Loeschknopf selbst traegt, ist in
  // beiden Pfaden dieselbe.
  getSettingDefinitions(): SettingDefinitionItem<keyof SideloaderSettings>[] {
    return [
      {
        name: STRINGS.settings.checkOnStartup.name,
        desc: STRINGS.settings.checkOnStartup.desc,
        control: { type: "toggle", key: "checkOnStartup" },
      },
      {
        type: "group",
        heading: STRINGS.settings.catalogs.name,
        items: this.catalogItems(),
      },
      {
        type: "group",
        heading: STRINGS.settings.tokens.name,
        items: this.tokenItems(),
      },
    ];
  }

  getControlValue(key: string): unknown {
    return (this.host.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    (this.host.settings as unknown as Record<string, unknown>)[key] = value;
    await this.host.saveSettings();
  }

  /** Native 1.13-`update()` wenn vorhanden, sonst voller Rebuild. Ruft bewusst `rebuild()`
   *  statt `display()` — ein interner `display()`-Aufruf loest sonst die 1.13-Deprecation
   *  aus (`paperless-storage`-Befund). */
  private refresh(): void {
    refreshSettingsTab(this, () => this.rebuild());
  }

  // ── Listen als Definitionen (ein Code, beide Pfade) ──────────────────────

  /** Erklaertext der Gruppe als eigene Zeile. `heading` traegt nur den Namen, und der
   *  Erklaertext ist nach UI-STANDARD §10 Pflicht — er darf nicht dem Umbau zum Opfer
   *  fallen. */
  private descItem(desc: string): SettingGroupItem<keyof SideloaderSettings> {
    return { name: "", desc };
  }

  private catalogItems(): SettingGroupItem<keyof SideloaderSettings>[] {
    const items: SettingGroupItem<keyof SideloaderSettings>[] = [
      this.descItem(STRINGS.settings.catalogs.desc),
    ];

    this.host.settings.catalogs.forEach((url, index) => {
      items.push({
        name: "",
        render: (row: Setting) => {
          row.settingEl.addClass("anysource-sideloader-list-row");
          row.addText((text) =>
            text.setValue(url).onChange((value) => {
              this.host.settings.catalogs[index] = value.trim();
              void this.host.saveSettings();
            }),
          );
          row.addExtraButton((btn) =>
            btn
              .setIcon("trash-2")
              .setTooltip(STRINGS.settings.catalogRemove)
              .onClick(() => {
                this.host.settings.catalogs.splice(index, 1);
                void this.host.saveSettings();
                this.refresh();
              }),
          );
        },
      });
    });

    let pendingCatalog = "";
    items.push({
      name: "",
      render: (row: Setting) => {
        row.settingEl.addClass("anysource-sideloader-list-row");
        row.addText((text) =>
          text.setPlaceholder(STRINGS.settings.catalogAdd).onChange((value) => {
            pendingCatalog = value;
          }),
        );
        row.addButton((btn) =>
          btn.setButtonText(STRINGS.settings.catalogAdd).onClick(() => {
            const trimmed = pendingCatalog.trim();
            if (!trimmed) return;
            this.host.settings.catalogs.push(trimmed);
            void this.host.saveSettings();
            this.refresh();
          }),
        );
      },
    });

    return items;
  }

  private tokenItems(): SettingGroupItem<keyof SideloaderSettings>[] {
    const items: SettingGroupItem<keyof SideloaderSettings>[] = [
      this.descItem(STRINGS.settings.tokens.desc),
    ];

    for (const host of Object.keys(this.host.settings.hostSecrets)) {
      items.push({
        name: "",
        render: (row: Setting) => {
          row.settingEl.addClass("anysource-sideloader-list-row");
          row.setName(host);
          this.renderSecretControl(row, host);
          row.addExtraButton((btn) =>
            btn
              .setIcon("trash-2")
              .setTooltip(STRINGS.settings.tokenRemove)
              .onClick(() => {
                delete this.host.settings.hostSecrets[host];
                void this.host.saveSettings();
                this.refresh();
              }),
          );
        },
      });
    }

    let pendingHost = "";
    items.push({
      name: "",
      render: (row: Setting) => {
        row.settingEl.addClass("anysource-sideloader-list-row");
        row.addText((text) =>
          text.setPlaceholder(STRINGS.settings.tokenHost).onChange((value) => {
            pendingHost = value;
          }),
        );
        row.addButton((btn) =>
          btn.setButtonText(STRINGS.settings.tokenAdd).onClick(() => {
            const host = normalizeHost(pendingHost);
            if (!host || host in this.host.settings.hostSecrets) return;
            this.host.settings.hostSecrets[host] = "";
            void this.host.saveSettings();
            this.refresh();
          }),
        );
      },
    });

    return items;
  }

  /** SecretComponent-Zeile: `onChange` liefert laut REGISTRY-Befund (calendar-notes,
   *  2026-08-30, `.modal.mod-secret`) die ID des verknuepften Schluesselbund-Eintrags
   *  (oder null bei Entkopplung) — NIE den Geheimwert. Wir schreiben deshalb nur die ID
   *  nach `settings.hostSecrets[host]`, nie `secretStore.set`. Obsidian typisiert
   *  `Setting` ohne `addSecret`-Bruecke (Stand `node_modules/obsidian/obsidian.d.ts`,
   *  keine Treffer fuer `addSecret`) — `SecretComponent` daher direkt instanziiert und
   *  strukturell weiter gefasst (Callback-Param `string | null` statt der engeren
   *  Deklaration). Der `typeof`-Check faengt eine Obsidian-Version < 1.11.1 ab, in der
   *  die Klasse zur Laufzeit fehlen kann, obwohl die Typen sie unbedingt deklarieren. */
  private renderSecretControl(row: Setting, host: string): void {
    const SecretCtor = SecretComponent as unknown as
      | (new (
          app: App,
          el: HTMLElement,
        ) => { setValue(v: string): unknown; onChange(cb: (v: string | null) => unknown): unknown })
      | undefined;
    const currentId = this.host.settings.hostSecrets[host] ?? "";

    if (typeof SecretCtor === "function") {
      const secret = new SecretCtor(this.app, row.controlEl);
      secret.setValue(currentId);
      secret.onChange((id) => {
        if (id) this.host.settings.hostSecrets[host] = id;
        else delete this.host.settings.hostSecrets[host];
        void this.host.saveSettings();
      });
      return;
    }

    // < 1.11.1: keine SecretComponent. Maskiertes Textfeld ueber den (dann in-memory-only)
    // secretStore, damit diese Nutzer nicht ganz ohne Token-Feld dastehen.
    row.addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder(STRINGS.settings.tokenFallbackPlaceholder);
      text.setValue(this.host.secretStore.get(host) ?? "").onChange((value) => {
        this.host.secretStore.set(host, value);
        this.host.settings.hostSecrets[host] = host;
        void this.host.saveSettings();
      });
    });
  }

  // ── Imperativer Fallback (Obsidian < 1.13) ───────────────────────────────
  private cleanupPrevious: () => void = () => {};

  private rebuild(): void {
    this.cleanupPrevious();
    this.containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(this.containerEl, this.getSettingDefinitions(), this, this.app);
  }

  display(): void {
    this.rebuild();
  }
}
