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
  getSettingDefinitions(): SettingDefinitionItem<keyof SideloaderSettings>[] {
    return [
      {
        name: STRINGS.settings.checkOnStartup.name,
        desc: STRINGS.settings.checkOnStartup.desc,
        control: { type: "toggle", key: "checkOnStartup" },
      },
      {
        name: STRINGS.settings.catalogs.name,
        desc: STRINGS.settings.catalogs.desc,
        // Liste mit Add/Remove: der Fallback-Walker zeichnet SettingDefinitionList-
        // Affordanzen (onDelete/addItem) nicht nach (i2m-Befund) — deshalb eine einzelne
        // render-Hatch, die sich selbst um Zeilen + Add/Remove kuemmert.
        render: (setting) => this.renderCatalogs(setting),
      },
      {
        name: STRINGS.settings.tokens.name,
        desc: STRINGS.settings.tokens.desc,
        render: (setting) => this.renderTokens(setting),
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

  // ── Render-Hatches (ein Code, beide Pfade) ───────────────────────────────

  private renderCatalogs(setting: Setting): void {
    setting.setName(STRINGS.settings.catalogs.name).setDesc(STRINGS.settings.catalogs.desc);
    const parent = setting.settingEl.parentElement ?? setting.settingEl;

    this.host.settings.catalogs.forEach((url, index) => {
      const row = new Setting(parent);
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
    });

    let pendingCatalog = "";
    const addRow = new Setting(parent);
    addRow.settingEl.addClass("anysource-sideloader-list-row");
    addRow.addText((text) =>
      text.setPlaceholder(STRINGS.settings.catalogAdd).onChange((value) => {
        pendingCatalog = value;
      }),
    );
    addRow.addButton((btn) =>
      btn.setButtonText(STRINGS.settings.catalogAdd).onClick(() => {
        const trimmed = pendingCatalog.trim();
        if (!trimmed) return;
        this.host.settings.catalogs.push(trimmed);
        void this.host.saveSettings();
        this.refresh();
      }),
    );
  }

  private renderTokens(setting: Setting): void {
    setting.setName(STRINGS.settings.tokens.name).setDesc(STRINGS.settings.tokens.desc);
    const parent = setting.settingEl.parentElement ?? setting.settingEl;

    for (const host of Object.keys(this.host.settings.hostSecrets)) {
      const row = new Setting(parent);
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
    }

    let pendingHost = "";
    const addRow = new Setting(parent);
    addRow.settingEl.addClass("anysource-sideloader-list-row");
    addRow.addText((text) =>
      text.setPlaceholder(STRINGS.settings.tokenHost).onChange((value) => {
        pendingHost = value;
      }),
    );
    addRow.addButton((btn) =>
      btn.setButtonText(STRINGS.settings.tokenAdd).onClick(() => {
        const host = normalizeHost(pendingHost);
        if (!host || host in this.host.settings.hostSecrets) return;
        this.host.settings.hostSecrets[host] = "";
        void this.host.saveSettings();
        this.refresh();
      }),
    );
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
