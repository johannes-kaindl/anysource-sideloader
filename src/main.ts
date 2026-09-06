import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, loadSettings, type SideloaderSettings } from "./core/settings";
import { obsidianSecretStore, MemorySecretStore, type SecretStore } from "./obsidian/secrets";
import { SideloaderSettingTab } from "./obsidian/settings-tab";
import { obsidianHttp } from "./obsidian/http";
import { checkAllUpdates, checkUpdatesWithNotices, installFromUrl, type FlowContext } from "./obsidian/flows";
import { InstallUrlModal } from "./obsidian/install-url-modal";
import { STRINGS } from "./i18n/strings";
import type { HttpPort } from "./core/forge/types";

export default class AnySourceSideloaderPlugin extends Plugin {
  settings: SideloaderSettings = DEFAULT_SETTINGS;
  secretStore: SecretStore = new MemorySecretStore();
  private http: HttpPort = obsidianHttp();
  /** Referenz, um den Tab nach Ablaeufen ausserhalb der UI neu zeichnen zu lassen. */
  private settingsTab: SideloaderSettingTab | null = null;

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    // secretStorage gibt es ab 1.11.4 (minAppVersion) — Form pruefen statt Existenz annehmen:
    const hasKeychain = typeof (this.app as { secretStorage?: { getSecret?: unknown } }).secretStorage?.getSecret === "function";
    this.secretStore = hasKeychain ? obsidianSecretStore(this.app) : new MemorySecretStore();
    this.http = obsidianHttp();
    this.settingsTab = new SideloaderSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    // Kein eigener View mehr: Installation und Updates leben im Einstellungs-Tab — dem
    // Ort, an dem Obsidian Plugins ohnehin verwaltet. Das spart nicht nur eine Ansicht,
    // sondern das gesamte Karten-/Zeilen-CSS, das sie gebraucht hat (UI-STANDARD §5:
    // Sektionen ueber `setHeading()`, Zeilen ueber `Setting` — Typografie kommt vom Host).
    this.addCommand({
      id: "open-store",
      name: STRINGS.store.openStoreCommand,
      callback: () => { this.openSettings(); },
    });
    this.addCommand({
      id: "check-updates",
      name: STRINGS.store.checkUpdatesCommand,
      callback: () => { void this.runCheckUpdatesCommand(); },
    });
    // Task C1: "Install from URL" war dokumentiert, hatte aber keine Bedienung — ein
    // Command statt eines eigenen Ribbon-Icons (das bestehende Ribbon-Icon oeffnet die
    // Store-View, nicht diesen Pfad; beide sind unabhaengige Einstiege).
    this.addCommand({
      id: "install-from-url",
      name: STRINGS.installUrl.commandName,
      callback: () => {
        new InstallUrlModal(this.app, (url) => { void installFromUrl(this.flowContext(), url); }).open();
      },
    });

    if (this.settings.checkOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        // Nach dem Layout, nicht im Ladepfad: ein Netzwerk-Roundtrip fuer jede Quelle
        // darf onload() nicht blockieren oder verzoegern. this.register() raeumt den Timer
        // beim Unload auf (Task M12) — sonst feuert er auf einen bereits entladenen Plugin-
        // Kontext, falls Obsidian zwischen onLayoutReady und den 5s deaktiviert/neu laedt.
        const timer = window.setTimeout(() => { void this.runStartupCheck(); }, 5000);
        this.register(() => window.clearTimeout(timer));
      });
    }
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  /** Oeffentlich, weil auch der Settings-Tab Ablaeufe ausloest (Update-Pruefung) —
   *  gebaut wird der Kontext weiterhin nur hier. */
  flowContext(): FlowContext {
    return {
      app: this.app,
      http: this.http,
      settings: this.settings,
      saveSettings: () => this.saveSettings(),
      secretStore: this.secretStore,
    };
  }

  /** Den eigenen Einstellungs-Tab oeffnen. `app.setting` ist wie `app.plugins` nicht in
   *  `obsidian.d.ts` deklariert — schmales lokales Interface plus Form-Pruefung statt `any`. */
  private openSettings(): void {
    const setting = (this.app as unknown as {
      setting?: { open?: () => void; openTabById?: (id: string) => void };
    }).setting;
    if (typeof setting?.open !== "function" || typeof setting.openTabById !== "function") return;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  private async runCheckUpdatesCommand(): Promise<void> {
    // Der Lade-Zustand klammert den Ablauf: gemessen dauert eine Pruefung mit 22 Plugins
    // 1,8 s gegen die eigene Forge und hochgerechnet 6,7 s gegen GitHub — ohne Anzeige
    // liest sich das als „habe ich den Knopf getroffen?".
    //
    // Bewusst im `finally`, damit ein Fehlschlag den Spinner nicht stehen laesst. Dass
    // hier eine DOM-Aenderung aus einem `finally` heraus passiert, ist gemessen
    // unbedenklich — eingefroren ist am 2026-09-01 ausschliesslich `setDisabled` in
    // dieser Position (2026-09-02 in sieben Laeufen isoliert, `docs/internal/SMOKE.md` § Freeze).
    this.settingsTab?.setzePruefungLaeuft(true);
    try {
      await checkUpdatesWithNotices(this.flowContext());
    } finally {
      this.settingsTab?.setzePruefungLaeuft(false);
      // Der Befehl laeuft ausserhalb des Tabs; ohne diesen Anstoss zeigt ein offener Tab
      // weiter den Stand von vor der Pruefung.
      this.settingsTab?.aktualisieren();
    }
  }

  private async runStartupCheck(): Promise<void> {
    const { results } = await checkAllUpdates(this.flowContext());
    this.settingsTab?.aktualisieren();
    if (results.length > 0) new Notice(STRINGS.notices.updatesAvailable(results.length), 10000);
    // n === 0: bewusst still, keine Notice bei jedem Start (Brief: "n > 0 ? Notice : stumm").
  }
}
