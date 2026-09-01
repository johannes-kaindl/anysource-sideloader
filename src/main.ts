import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, loadSettings, type SideloaderSettings } from "./core/settings";
import { obsidianSecretStore, MemorySecretStore, type SecretStore } from "./obsidian/secrets";
import { SideloaderSettingTab } from "./obsidian/settings-tab";
import { obsidianHttp } from "./obsidian/http";
import { checkAllUpdates, installFromUrl, type FlowContext } from "./obsidian/flows";
import { StoreView, VIEW_TYPE_SIDELOADER } from "./obsidian/store-view";
import { InstallUrlModal } from "./obsidian/install-url-modal";
import { STRINGS } from "./i18n/strings";
import type { HttpPort } from "./core/forge/types";

export default class AnySourceSideloaderPlugin extends Plugin {
  settings: SideloaderSettings = DEFAULT_SETTINGS;
  secretStore: SecretStore = new MemorySecretStore();
  private http: HttpPort = obsidianHttp();

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    // secretStorage gibt es ab 1.11.4 (minAppVersion) — Form pruefen statt Existenz annehmen:
    const hasKeychain = typeof (this.app as { secretStorage?: { getSecret?: unknown } }).secretStorage?.getSecret === "function";
    this.secretStore = hasKeychain ? obsidianSecretStore(this.app) : new MemorySecretStore();
    this.http = obsidianHttp();
    this.addSettingTab(new SideloaderSettingTab(this.app, this));   // Task 12

    this.registerView(VIEW_TYPE_SIDELOADER, (leaf) => new StoreView(leaf, this.flowContext()));
    this.addRibbonIcon("download", STRINGS.view.ribbonTooltip, () => { void this.activateView(); });
    this.addCommand({
      id: "open-store",
      name: STRINGS.view.openStoreCommand,
      callback: () => { void this.activateView(); },
    });
    this.addCommand({
      id: "check-updates",
      name: STRINGS.view.checkUpdatesCommand,
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

  private flowContext(): FlowContext {
    return {
      app: this.app,
      http: this.http,
      settings: this.settings,
      saveSettings: () => this.saveSettings(),
      secretStore: this.secretStore,
    };
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_SIDELOADER);
    let leaf: WorkspaceLeaf | null = existing[0] ?? null;
    if (leaf === null) {
      leaf = workspace.getRightLeaf(false);
      if (leaf !== null) await leaf.setViewState({ type: VIEW_TYPE_SIDELOADER, active: true });
    }
    if (leaf !== null) void workspace.revealLeaf(leaf);
  }

  private async runCheckUpdatesCommand(): Promise<void> {
    const { results, errors } = await checkAllUpdates(this.flowContext());
    if (results.length > 0) new Notice(STRINGS.notices.updatesAvailable(results.length));
    else new Notice(STRINGS.notices.upToDate);
    for (const err of errors) new Notice(STRINGS.notices.checkFailed(err.id, err.message));
  }

  private async runStartupCheck(): Promise<void> {
    const { results } = await checkAllUpdates(this.flowContext());
    if (results.length > 0) new Notice(STRINGS.notices.updatesAvailable(results.length), 10000);
    // n === 0: bewusst still, keine Notice bei jedem Start (Brief: "n > 0 ? Notice : stumm").
  }
}
