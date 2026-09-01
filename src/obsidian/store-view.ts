// Store-View: Hub mit drei Panels (Browse/Installed/Updates). Baut auf den
// Anwendungsfaellen aus `flows.ts` auf — dieses Modul zeichnet nur DOM und ruft sie auf.
import { ItemView, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import { buildHubInto, type HubController, type HubPanel } from "../vendor/kit-obsidian/hub";
import { parseCatalog, type CatalogEntry } from "../core/catalog";
import { catalogEntryState, filterCatalogEntries, type CatalogEntryState } from "../core/catalog-match";
import type { ManagedPlugin } from "../core/settings";
import type { RepoRef } from "../core/forge/types";
import * as gh from "../core/forge/github";
import * as gitea from "../core/forge/gitea";
import { STRINGS } from "../i18n/strings";
import {
  adoptFromCatalog,
  applyUpdate,
  checkOneUpdate,
  checkUpdatesWithNotices,
  fetchReleaseNotesFor,
  installFromUrl,
  removeInstalled,
  type FlowContext,
} from "./flows";
import { adapterFilePort, readInstalledManifest } from "./installer";
import { ReleaseNotesModal } from "./release-notes-modal";
import { resolveHostToken } from "./tokens";

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
        // Task I3: Kataloge leben auf Forges, genau wie die Plugin-Quellen selbst — ohne
        // Token bleibt ein privater Katalog unlesbar. Derselbe Host->Token-Lookup wie in
        // flows.ts (`resolveHostToken`), derselbe gitea-style Header wie ein Gitea-Asset
        // (der Katalog-Host ist typischerweise dieselbe Forge-Instanz).
        const host = new URL(url).host;
        const token = resolveHostToken(this.ctx.settings, this.ctx.secretStore, host);
        const res = await this.ctx.http({ url, headers: gitea.authHeaders(token) });
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

    // Was WIRKLICH im Vault liegt — je Katalog-id ein Blick auf die Platte, nicht auf
    // `settings.plugins`. Das ist der Unterschied, der das Panel sehend macht: bis 0.1.1
    // bot es „Install“ fuer laengst installierte Plugins an und der Update-Lauf kannte
    // keines davon (gemessen: 0 verwaltet bei ~20 installiert).
    const port = adapterFilePort(this.ctx.app);
    const manifeste = await Promise.all(
      entries.map((e) => readInstalledManifest(port, this.ctx.app.vault.configDir, e.id).catch(() => null)),
    );
    const zustaende = new Map<string, CatalogEntryState>();
    entries.forEach((e, i) => {
      zustaende.set(e.id, catalogEntryState(e, manifeste[i]?.version ?? null, this.ctx.settings.plugins));
    });

    // „Alle verwalten“ spart beim Erstkontakt die Klicks — bei zwanzig installierten
    // Plugins ist die Einzelbedienung die eigentliche Huerde. Der Knopf erscheint nur,
    // wenn es etwas zu uebernehmen gibt.
    const uebernehmbar = entries.filter((e) => zustaende.get(e.id)?.kind === "unmanaged");
    if (uebernehmbar.length > 0) {
      const leiste = root.createDiv({ cls: "asl-bulk" });
      const alle = leiste.createEl("button", {
        cls: "mod-cta",
        text: STRINGS.view.manageAll(uebernehmbar.length),
      });
      alle.addEventListener("click", () => {
        alle.disabled = true;
        void this.adoptAll(uebernehmbar, zustaende).finally(() => {
          alle.disabled = false;
          void this.render();
        });
      });
      root.insertBefore(leiste, listEl);
    }

    const draw = (query: string): void => {
      listEl.empty();
      const filtered = filterCatalogEntries(entries, query);
      if (filtered.length === 0) {
        renderEmptyState(listEl, STRINGS.view.noMatches);
        return;
      }
      for (const entry of filtered) {
        this.renderCard(listEl, entry, zustaende.get(entry.id) ?? { kind: "not-installed" });
      }
    };
    search.addEventListener("input", () => draw(search.value));
    draw("");
  }

  /** Sequenziell, nicht parallel: jede Uebernahme probt ihre Forge (`detectForge`), und
   *  zwanzig gleichzeitige Anfragen an dieselbe Instanz sind der schnellste Weg in ein
   *  Rate-Limit. Fehlschlaege werden gesammelt statt abgebrochen — eine tote Quelle darf
   *  die anderen neunzehn nicht verhindern. */
  private async adoptAll(
    entries: readonly CatalogEntry[],
    zustaende: ReadonlyMap<string, CatalogEntryState>,
  ): Promise<void> {
    let uebernommen = 0;
    for (const entry of entries) {
      const zustand = zustaende.get(entry.id);
      if (zustand?.kind !== "unmanaged") continue;
      try {
        if (await adoptFromCatalog(this.ctx, entry, zustand.installedVersion)) uebernommen++;
      } catch (err) {
        new Notice(STRINGS.notices.adoptFailed(entry.name, err instanceof Error ? err.message : String(err)));
      }
    }
    if (uebernommen > 0) new Notice(STRINGS.notices.adoptedAll(uebernommen));
  }

  private renderCard(listEl: HTMLElement, entry: CatalogEntry, zustand: CatalogEntryState): void {
    const card = listEl.createDiv({ cls: "asl-card" });
    card.createEl("h3", { cls: "asl-card-title", text: entry.name });
    card.createDiv({ cls: "asl-card-desc", text: entry.description });
    if (entry.tags.length > 0) {
      const tags = card.createDiv({ cls: "asl-card-tags" });
      for (const tag of entry.tags) tags.createSpan({ cls: "asl-tag", text: tag });
    }
    card.createDiv({ cls: "asl-card-author", text: STRINGS.view.byAuthor(entry.author) });

    const actions = card.createDiv({ cls: "asl-card-actions" });

    // Der Zustand kommt aus einer puren Funktion (`catalogEntryState`), nicht aus einer
    // Kette von ifs hier: er haengt an drei Quellen (Platte, verwaltete Liste,
    // Check-Befund), und genau deren Verwechslung war der Defekt bis 0.1.1 — das Panel
    // sah nur die verwaltete Liste und bot „Install“ fuer laengst Installiertes an.
    if (zustand.kind === "not-installed") {
      const btn = actions.createEl("button", { cls: "mod-cta", text: STRINGS.view.install });
      btn.addEventListener("click", () => {
        btn.disabled = true;
        // Task M18: der Katalog kennt die id schon — weicht die tatsaechlich gelieferte id
        // ab (kompromittierte/verwechselte Quelle), bricht installFromUrl VOR jedem
        // Schreiben ab, statt ein unerwartetes Plugin unter der Katalog-id zu installieren.
        void installFromUrl(this.ctx, entry.repo, entry.id).finally(() => {
          btn.disabled = false;
          void this.render();
        });
      });
      return;
    }

    if (zustand.kind === "unmanaged") {
      renderStatus(actions, "warning", STRINGS.view.installedUnmanaged(zustand.installedVersion));
      const btn = actions.createEl("button", { text: STRINGS.view.manage });
      btn.addEventListener("click", () => {
        btn.disabled = true;
        void adoptFromCatalog(this.ctx, entry, zustand.installedVersion)
          .then((ok) => {
            if (ok) new Notice(STRINGS.notices.adopted(entry.name, zustand.installedVersion));
          })
          .finally(() => {
            btn.disabled = false;
            void this.render();
          });
      });
      return;
    }

    if (zustand.availableVersion) {
      renderStatus(
        actions,
        "warning",
        STRINGS.view.installedOutdated(zustand.installedVersion, zustand.availableVersion),
      );
      return;
    }
    renderStatus(actions, "ok", STRINGS.view.installedCurrent(zustand.installedVersion));
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
    // Manifest-Reads sind unabhaengig voneinander — parallel statt sequenziell im Loop,
    // Reihenfolge bleibt stabil weil Promise.all die Eingabereihenfolge erhaelt.
    const manifests = await Promise.all(
      plugins.map((plugin) => readInstalledManifest(port, this.ctx.app.vault.configDir, plugin.id)),
    );
    const list = root.createDiv({ cls: "asl-list" });
    plugins.forEach((plugin, i) => {
      const displayName = manifests[i]?.name ?? plugin.id;
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
      issueBtn.addEventListener("click", () => {
        window.open(issuesUrlFor(plugin.ref), "_blank", "noopener,noreferrer");
      });

      const removeBtn = actions.createEl("button", { cls: "mod-warning", text: STRINGS.view.remove });
      removeBtn.addEventListener("click", () => {
        removeBtn.disabled = true;
        void removeInstalled(this.ctx, plugin.id).finally(() => { void this.render(); });
      });
    });
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

    // Der Knopf steht VOR dem Empty-State-Return — sonst fehlt er genau in der Lage, in
    // der man ihn sucht: wenn nichts gefunden wurde und man wissen will, ob ueberhaupt
    // geprueft wurde. Genau das war die Rueckmeldung („ich musste Obsidian neu starten,
    // um den Check auszuloesen“).
    const leiste = root.createDiv({ cls: "asl-bulk" });
    const pruefen = leiste.createEl("button", { cls: "mod-cta", text: STRINGS.view.checkAll });
    pruefen.addEventListener("click", () => {
      pruefen.disabled = true;
      pruefen.setText(STRINGS.notices.checking);
      void checkUpdatesWithNotices(this.ctx).finally(() => {
        pruefen.disabled = false;
        pruefen.setText(STRINGS.view.checkAll);
        void this.render();
      });
    });

    const pending = this.ctx.settings.plugins.filter((p) => p.availableVersion !== null);
    if (pending.length === 0) {
      renderEmptyState(root, STRINGS.view.noUpdates);
      return;
    }

    const port = adapterFilePort(this.ctx.app);
    // Manifest-Reads sind unabhaengig voneinander — parallel statt sequenziell im Loop,
    // Reihenfolge bleibt stabil weil Promise.all die Eingabereihenfolge erhaelt.
    const manifests = await Promise.all(
      pending.map((plugin) => readInstalledManifest(port, this.ctx.app.vault.configDir, plugin.id)),
    );
    const list = root.createDiv({ cls: "asl-list" });
    pending.forEach((plugin, i) => {
      const displayName = manifests[i]?.name ?? plugin.id;
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
    });
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
