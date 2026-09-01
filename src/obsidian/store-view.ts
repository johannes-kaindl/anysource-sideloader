// Store-View: Hub mit drei Panels (Browse/Installed/Updates). Baut auf den
// Anwendungsfaellen aus `flows.ts` auf — dieses Modul zeichnet nur DOM und ruft sie auf.
import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import { buildHubInto, type HubController, type HubPanel } from "../vendor/kit-obsidian/hub";
import { parseCatalog, type CatalogEntry } from "../core/catalog";
import { filterCatalogEntries, matchInstalledPlugin } from "../core/catalog-match";
import type { ManagedPlugin } from "../core/settings";
import type { RepoRef } from "../core/forge/types";
import * as gh from "../core/forge/github";
import * as gitea from "../core/forge/gitea";
import { STRINGS } from "../i18n/strings";
import {
  applyUpdate,
  checkOneUpdate,
  fetchReleaseNotesFor,
  installFromUrl,
  removeInstalled,
  type FlowContext,
} from "./flows";
import { adapterFilePort, readInstalledManifest } from "./installer";
import { ReleaseNotesModal } from "./release-notes-modal";

export const VIEW_TYPE_SIDELOADER = "anysource-sideloader";

type TabId = "browse" | "installed" | "updates";
type StatusState = "ok" | "warning" | "error";

function issuesUrlFor(ref: RepoRef): string {
  return ref.kind === "github" ? gh.issuesUrl(ref) : gitea.issuesUrl(ref);
}

function renderEmptyState(container: HTMLElement, text: string): void {
  container.createDiv({ cls: "asl-empty", text });
}

function renderStatus(container: HTMLElement, state: StatusState, label: string): void {
  const icons: Record<StatusState, string> = { ok: "circle-check", warning: "alert-triangle", error: "circle-x" };
  const el = container.createSpan({ cls: `asl-status is-${state}`, attr: { "aria-label": label } });
  const icon = el.createSpan({ cls: "asl-status-icon" });
  setIcon(icon, icons[state]);
  el.createSpan({ cls: "asl-status-label", text: label });
}

async function openReleaseNotes(ctx: FlowContext, plugin: ManagedPlugin, displayName: string): Promise<void> {
  try {
    const info = await fetchReleaseNotesFor(ctx, plugin.id);
    new ReleaseNotesModal(ctx.app, `${displayName} ${info?.version ?? plugin.installedVersion}`, info?.notes ?? "").open();
  } catch (err) {
    new ReleaseNotesModal(ctx.app, displayName, "").open();
    console.error("anysource-sideloader: release notes fetch failed", err);
  }
}

/** Browse-Panel: laedt jeden abonnierten Katalog, zeigt Eintraege als Info-Karten,
 *  filtert per Suchfeld ueber Name/Beschreibung/Tags. */
class BrowsePanel implements HubPanel<TabId> {
  readonly id: TabId = "browse";
  readonly icon = "compass";
  private root: HTMLElement | null = null;

  get label(): string { return STRINGS.view.tabBrowse; }

  constructor(private readonly ctx: FlowContext) {}

  mount(container: HTMLElement): void {
    this.root = container.createDiv({ cls: "asl-browse" });
  }

  onShow(): void { void this.render(); }
  onHide(): void {}
  destroy(): void { this.root = null; }

  private async render(): Promise<void> {
    const root = this.root;
    if (!root) return;
    root.empty();

    if (this.ctx.settings.catalogs.length === 0) {
      renderEmptyState(root, STRINGS.view.noCatalogs);
      return;
    }

    const searchWrap = root.createDiv({ cls: "asl-search" });
    const search = searchWrap.createEl("input", {
      type: "search",
      placeholder: STRINGS.view.searchPlaceholder,
      cls: "asl-search-input",
    });
    const listEl = root.createDiv({ cls: "asl-catalog-list" });

    const entries: CatalogEntry[] = [];
    const errors: string[] = [];
    for (const url of this.ctx.settings.catalogs) {
      try {
        const res = await this.ctx.http({ url });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        entries.push(...parseCatalog(res.text).plugins);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    if (entries.length === 0) {
      renderEmptyState(listEl, STRINGS.view.noCatalogEntries(errors.join("; ") || "empty"));
      return;
    }

    const draw = (query: string): void => {
      listEl.empty();
      const filtered = filterCatalogEntries(entries, query);
      if (filtered.length === 0) {
        renderEmptyState(listEl, STRINGS.view.noMatches);
        return;
      }
      for (const entry of filtered) this.renderCard(listEl, entry);
    };
    search.addEventListener("input", () => draw(search.value));
    draw("");
  }

  private renderCard(listEl: HTMLElement, entry: CatalogEntry): void {
    const card = listEl.createDiv({ cls: "asl-card" });
    card.createEl("h3", { cls: "asl-card-title", text: entry.name });
    card.createDiv({ cls: "asl-card-desc", text: entry.description });
    if (entry.tags.length > 0) {
      const tags = card.createDiv({ cls: "asl-card-tags" });
      for (const tag of entry.tags) tags.createSpan({ cls: "asl-tag", text: tag });
    }
    card.createDiv({ cls: "asl-card-author", text: STRINGS.view.byAuthor(entry.author) });

    const actions = card.createDiv({ cls: "asl-card-actions" });
    const installed = matchInstalledPlugin(this.ctx.settings.plugins, entry.repo);
    if (installed) {
      actions.createSpan({ cls: "asl-installed-version", text: STRINGS.view.installedVersion(installed.installedVersion) });
      return;
    }
    const btn = actions.createEl("button", { cls: "mod-cta", text: STRINGS.view.install });
    btn.addEventListener("click", () => {
      btn.disabled = true;
      void installFromUrl(this.ctx, entry.repo).finally(() => {
        btn.disabled = false;
        void this.render();
      });
    });
  }
}

/** Installed-Panel: eine Zeile je `ManagedPlugin` mit Status-Indikator und den vier
 *  Aktionen aus dem Brief. Liest den Anzeigenamen aus dem installierten Manifest, weil
 *  `ManagedPlugin` selbst keinen Namen persistiert. */
class InstalledPanel implements HubPanel<TabId> {
  readonly id: TabId = "installed";
  readonly icon = "list";
  private root: HTMLElement | null = null;
  private readonly rowErrors = new Map<string, string>();

  get label(): string { return STRINGS.view.tabInstalled; }

  constructor(private readonly ctx: FlowContext) {}

  mount(container: HTMLElement): void {
    this.root = container.createDiv({ cls: "asl-installed" });
  }

  onShow(): void { void this.render(); }
  onHide(): void {}
  destroy(): void { this.root = null; }

  private async render(): Promise<void> {
    const root = this.root;
    if (!root) return;
    root.empty();

    const plugins = this.ctx.settings.plugins;
    if (plugins.length === 0) {
      renderEmptyState(root, STRINGS.view.noInstalled);
      return;
    }

    const port = adapterFilePort(this.ctx.app);
    const list = root.createDiv({ cls: "asl-list" });
    for (const plugin of plugins) {
      const manifest = await readInstalledManifest(port, this.ctx.app.vault.configDir, plugin.id);
      const displayName = manifest?.name ?? plugin.id;
      const row = list.createDiv({ cls: "asl-row" });
      row.createDiv({ cls: "asl-row-name", text: displayName });
      row.createDiv({ cls: "asl-row-version", text: plugin.installedVersion });
      row.createDiv({ cls: "asl-row-host", text: new URL(plugin.ref.baseUrl).host });

      const statusEl = row.createDiv({ cls: "asl-row-status" });
      const rowError = this.rowErrors.get(plugin.id);
      if (rowError) renderStatus(statusEl, "error", STRINGS.view.checkFailedStatus(rowError));
      else if (plugin.availableVersion) renderStatus(statusEl, "warning", STRINGS.view.updateAvailable(plugin.availableVersion));
      else renderStatus(statusEl, "ok", STRINGS.view.upToDateStatus);

      const actions = row.createDiv({ cls: "asl-row-actions" });

      const notesBtn = actions.createEl("button", { text: STRINGS.view.releaseNotesAction });
      notesBtn.addEventListener("click", () => { void openReleaseNotes(this.ctx, plugin, displayName); });

      const checkBtn = actions.createEl("button", { text: STRINGS.view.check });
      checkBtn.addEventListener("click", () => {
        checkBtn.disabled = true;
        void checkOneUpdate(this.ctx, plugin.id).then((error) => {
          if (error) this.rowErrors.set(plugin.id, error);
          else this.rowErrors.delete(plugin.id);
          checkBtn.disabled = false;
          void this.render();
        });
      });

      const issueBtn = actions.createEl("button", { text: STRINGS.view.reportIssue });
      issueBtn.addEventListener("click", () => { window.open(issuesUrlFor(plugin.ref)); });

      const removeBtn = actions.createEl("button", { cls: "mod-warning", text: STRINGS.view.remove });
      removeBtn.addEventListener("click", () => {
        removeBtn.disabled = true;
        void removeInstalled(this.ctx, plugin.id).finally(() => { void this.render(); });
      });
    }
  }
}

/** Updates-Panel: nur Plugins mit `availableVersion !== null`. */
class UpdatesPanel implements HubPanel<TabId> {
  readonly id: TabId = "updates";
  readonly icon = "arrow-up-circle";
  private root: HTMLElement | null = null;

  get label(): string { return STRINGS.view.tabUpdates; }

  constructor(private readonly ctx: FlowContext) {}

  mount(container: HTMLElement): void {
    this.root = container.createDiv({ cls: "asl-updates" });
  }

  onShow(): void { void this.render(); }
  onHide(): void {}
  destroy(): void { this.root = null; }

  private async render(): Promise<void> {
    const root = this.root;
    if (!root) return;
    root.empty();

    const pending = this.ctx.settings.plugins.filter((p) => p.availableVersion !== null);
    if (pending.length === 0) {
      renderEmptyState(root, STRINGS.view.noUpdates);
      return;
    }

    const port = adapterFilePort(this.ctx.app);
    const list = root.createDiv({ cls: "asl-list" });
    for (const plugin of pending) {
      const manifest = await readInstalledManifest(port, this.ctx.app.vault.configDir, plugin.id);
      const displayName = manifest?.name ?? plugin.id;
      const row = list.createDiv({ cls: "asl-row" });
      row.createDiv({ cls: "asl-row-name", text: displayName });
      row.createDiv({
        cls: "asl-row-version",
        text: `${plugin.installedVersion} → ${plugin.availableVersion ?? ""}`,
      });

      const actions = row.createDiv({ cls: "asl-row-actions" });
      const notesBtn = actions.createEl("button", { text: STRINGS.view.releaseNotesAction });
      notesBtn.addEventListener("click", () => { void openReleaseNotes(this.ctx, plugin, displayName); });

      const updateBtn = actions.createEl("button", { cls: "mod-cta", text: STRINGS.view.update });
      updateBtn.addEventListener("click", () => {
        updateBtn.disabled = true;
        void applyUpdate(this.ctx, plugin.id).finally(() => {
          updateBtn.disabled = false;
          void this.render();
        });
      });
    }
  }
}

export class StoreView extends ItemView {
  private ctrl: HubController<TabId> | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly ctx: FlowContext) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_SIDELOADER; }
  getDisplayText(): string { return STRINGS.view.title; }
  getIcon(): string { return "download"; }

  async onOpen(): Promise<void> {
    const panels: HubPanel<TabId>[] = [
      new BrowsePanel(this.ctx),
      new InstalledPanel(this.ctx),
      new UpdatesPanel(this.ctx),
    ];
    this.ctrl = buildHubInto(this.contentEl, panels, "browse");
  }

  async onClose(): Promise<void> {
    this.ctrl?.destroy();
    this.ctrl = null;
    this.contentEl.empty();
  }
}
