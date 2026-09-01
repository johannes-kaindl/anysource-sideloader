import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, loadSettings, type SideloaderSettings } from "./core/settings";
import { obsidianSecretStore, MemorySecretStore, type SecretStore } from "./obsidian/secrets";
import { SideloaderSettingTab } from "./obsidian/settings-tab";

export default class AnySourceSideloaderPlugin extends Plugin {
  settings: SideloaderSettings = DEFAULT_SETTINGS;
  secretStore: SecretStore = new MemorySecretStore();

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    // secretStorage gibt es ab 1.11.4 (minAppVersion) — Form pruefen statt Existenz annehmen:
    const hasKeychain = typeof (this.app as { secretStorage?: { getSecret?: unknown } }).secretStorage?.getSecret === "function";
    this.secretStore = hasKeychain ? obsidianSecretStore(this.app) : new MemorySecretStore();
    this.addSettingTab(new SideloaderSettingTab(this.app, this));   // Task 12
    // View, Commands, Startup-Check folgen in Task 13.
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }
}
