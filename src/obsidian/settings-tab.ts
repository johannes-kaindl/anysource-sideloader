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
import type { ManagedPlugin, SideloaderSettings } from "../core/settings";
import { parseCatalog, type CatalogEntry } from "../core/catalog";
import { catalogEntryState, filterCatalogEntries, type CatalogEntryState } from "../core/catalog-match";
import * as gitea from "../core/forge/gitea";
import * as gh from "../core/forge/github";
import type { RepoRef } from "../core/forge/types";
import { adapterFilePort, readInstalledManifest } from "./installer";
import { resolveHostToken } from "./tokens";
import type { SecretStore } from "./secrets";
import {
  adoptFromCatalog,
  applyUpdate,
  checkOneUpdate,
  fetchReleaseNotesFor,
  installFromUrl,
  removeInstalled,
  type FlowContext,
} from "./flows";
import { ReleaseNotesModal } from "./release-notes-modal";
import { Notice, setIcon } from "obsidian";
import { refreshSettingsTab, renderSettingDefinitions } from "../vendor/kit-obsidian/settings_walker";
import { STRINGS } from "../i18n/strings";

export interface SettingsHost extends Plugin {
  settings: SideloaderSettings;
  secretStore: SecretStore;
  saveSettings(): Promise<void>;
  /** Der Settings-Tab loest Ablaeufe aus (Update-Pruefung) und braucht dafuer denselben
   *  Kontext wie View und Kommandos — gebaut wird er weiterhin nur an einer Stelle
   *  (`main.ts`), damit `http`/`secretStore` nicht zweimal verdrahtet werden. */
  flowContext(): FlowContext;
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

  // ── Asynchrone Daten in einer synchronen Struktur ────────────────────────
  //
  // `getSettingDefinitions()` ist synchron, Katalog und installierte Manifeste kommen aber
  // aus Netz und Platte. Deshalb ein Cache, der beim Oeffnen gefuellt wird und danach EIN
  // `refresh()` ausloest: der erste Aufbau zeigt „laedt…“, der zweite die Eintraege. Ohne
  // diesen Umweg muesste die Struktur auf Daten warten, die es beim Zeichnen noch nicht gibt.
  private katalog: {
    stand: "kalt" | "laedt" | "da";
    eintraege: CatalogEntry[];
    fehler: string;
    /** Die Katalog-URLs, zu denen dieser Stand gehoert. Ohne diesen Schluessel ueberlebt
     *  der Cache eine Aenderung der Abos: wer einen Katalog entfernt, saehe dessen
     *  Eintraege weiter (gemessen 2026-09-02 vom GUI-Smoke — bei leerer Abo-Liste standen
     *  noch 22 Plugins in der Sektion). */
    schluessel: string;
  } = { stand: "kalt", eintraege: [], fehler: "", schluessel: "" };
  /** Plugin-id → Version, die TATSAECHLICH unter `.obsidian/plugins/` liegt. */
  private installiert = new Map<string, string>();
  private suche = "";

  private async ladeKatalog(): Promise<void> {
    const schluessel = JSON.stringify(this.host.settings.catalogs);
    this.katalog = { stand: "laedt", eintraege: [], fehler: "", schluessel };
    const eintraege: CatalogEntry[] = [];
    const fehler: string[] = [];
    for (const url of this.host.settings.catalogs) {
      try {
        // Derselbe Host→Token-Lookup wie in den Flows: ein privater Katalog liegt auf
        // derselben Forge wie die Plugins und braucht denselben Schluessel.
        const token = resolveHostToken(this.host.settings, this.host.secretStore, new URL(url).host);
        const res = await this.host.flowContext().http({ url, headers: gitea.authHeaders(token) });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        eintraege.push(...parseCatalog(res.text).plugins);
      } catch (err) {
        fehler.push(err instanceof Error ? err.message : String(err));
      }
    }

    this.katalog = { stand: "da", eintraege, fehler: fehler.join("; "), schluessel };
    await this.ladeInstallierte().catch(() => undefined);
    this.refresh();
  }

  /**
   * Den echten Bestand von der Platte lesen — nicht `settings.plugins`, und **nicht** nur
   * beim Katalog-Laden.
   *
   * Der Platten-Zustand aendert sich, ohne dass ein Katalog neu geladen wird: jemand
   * installiert ein Plugin ueber BRAT oder von Hand, aktualisiert eines am Sideloader
   * vorbei, loescht einen Ordner. Haengt die Anzeige am Katalog-Cache, zeigt der Tab
   * danach „Install“ fuer etwas, das laengst daliegt (gemessen 2026-09-02 vom GUI-Smoke,
   * Abschnitt G). Deshalb bei jedem Aufbau des Tabs, und weil es nur Datei-Reads sind, ist
   * das billig.
   *
   * ⚠️ `refresh()` nur bei ECHTER Aenderung — sonst loest der Aufbau einen Aufbau aus.
   */
  private async ladeInstallierte(): Promise<void> {
    // Defensiv: das Zeichnen der Einstellungen darf an einem Datei-Lesefehler nicht
    // scheitern. Ohne den Guard warf der Aufruf in einer Umgebung ohne `app.vault` (im
    // Unit-Test, aber auch denkbar waehrend des Ladens) eine unbehandelte Rejection —
    // sichtbar wurde das erst, als der Aufruf in `getSettingDefinitions()` wanderte.
    const vault = (this.app as { vault?: unknown } | undefined)?.vault;
    if (!vault) return;
    const port = adapterFilePort(this.app);
    const ids = new Set([
      ...this.katalog.eintraege.map((e) => e.id),
      ...this.host.settings.plugins.map((p) => p.id),
    ]);
    const neu = new Map<string, string>();
    for (const id of ids) {
      const m = await readInstalledManifest(port, this.app.vault.configDir, id).catch(() => null);
      if (m) neu.set(id, m.version);
    }
    const unveraendert =
      neu.size === this.installiert.size && [...neu].every(([k, v]) => this.installiert.get(k) === v);
    this.installiert = neu;
    if (!unveraendert) this.refresh();
  }

  private zustandVon(entry: CatalogEntry): CatalogEntryState {
    return catalogEntryState(entry, this.installiert.get(entry.id) ?? null, this.host.settings.plugins);
  }

  /** Status-Indikator nach UI-STANDARD §8: Form UND Farbe UND Klasse UND aria-label.
   *
   *  `checking` ist der vierte Zustand des Katalogs. Er kommt hier NICHT an die Zeilen,
   *  sondern genau einmal an die Pruef-Schaltflaeche: die Pruefung ist ein Vorgang ueber
   *  ALLE Plugins (`checkAllUpdates`), ein Spinner je Zeile behauptete ein Plugin-genaues
   *  „laeuft gerade", das es nicht gibt. */
  private status(el: HTMLElement, state: "ok" | "warning" | "error" | "checking", label: string): void {
    const icons = {
      ok: "circle-check", warning: "alert-triangle", error: "circle-x", checking: "loader",
    } as const;
    const wrap = el.createSpan({ cls: `asl-status is-${state}`, attr: { "aria-label": label } });
    setIcon(wrap.createSpan({ cls: "asl-status-icon" }), icons[state]);
    wrap.createSpan({ cls: "asl-status-label", text: label });
  }

  /** Traeger des Lade-Zustands an der Pruef-Zeile und der Zustand selbst.
   *
   *  Der Zustand haengt am TAB, nicht am Element: der Tab wird waehrend der Pruefung neu
   *  gezeichnet (`aktualisieren()` haengt am selben Befehl), und ein nur am Element
   *  gehaltener Zustand waere danach verloren. */
  private pruefStatusEl: HTMLElement | null = null;
  private pruefungLaeuft = false;

  /** Von aussen angestossener Lade-Zustand — `main.ts` klammert den Befehl damit ein.
   *
   *  Warum es ihn gibt, ist gemessen: `checkAllUpdates` ruft sequenziell ab, und die 22
   *  Plugins des produktiven Vaults brauchen 1,8 s gegen die eigene Forge im LAN, gegen
   *  GitHub hochgerechnet 6,7 s. So lange sah man nach dem Klick nichts.
   *
   *  ⚠️ Bewusst KEIN `setDisabled` als Rueckmeldung — siehe die Warnung an der
   *  Knopf-Zeile: genau der Aufruf friert die App ein. */
  setzePruefungLaeuft(laeuft: boolean): void {
    this.pruefungLaeuft = laeuft;
    this.zeichnePruefStatus();
  }

  private zeichnePruefStatus(): void {
    const el = this.pruefStatusEl;
    if (!el) return;
    el.empty();
    if (this.pruefungLaeuft) this.status(el, "checking", STRINGS.settings.checkRunning);
  }

  private issuesUrl(ref: RepoRef): string {
    return ref.kind === "github" ? gh.issuesUrl(ref) : gitea.issuesUrl(ref);
  }

  private async releaseNotes(plugin: ManagedPlugin, name: string): Promise<void> {
    try {
      const info = await fetchReleaseNotesFor(this.host.flowContext(), plugin.id);
      new ReleaseNotesModal(this.app, `${name} ${info?.version ?? plugin.installedVersion}`, info?.notes ?? "").open();
    } catch {
      new ReleaseNotesModal(this.app, name, "").open();
    }
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
    // Der Platten-Zustand wird bei JEDEM Aufbau frisch gelesen — hier und nicht in
    // `rebuild()`, weil das nur den Fallback-Pfad (<1.13) trifft; `getSettingDefinitions()`
    // ist der gemeinsame Punkt beider Renderpfade. Async, und `ladeInstallierte` loest nur
    // bei ECHTER Aenderung ein `refresh()` aus — sonst baute der Aufbau sich selbst neu.
    void this.ladeInstallierte().catch(() => undefined);
    return [
      {
        name: STRINGS.settings.checkOnStartup.name,
        desc: STRINGS.settings.checkOnStartup.desc,
        control: { type: "toggle", key: "checkOnStartup" },
      },
      {
        // Der Knopf, den Johannes gesucht hat. Er sitzt bewusst AUCH hier und nicht nur im
        // Hub: die Einstellungen sind der Ort, an dem man nach „wie loese ich das aus“
        // sucht. Beide Wege rufen denselben Flow — zwei Knoepfe, eine Wahrheit.
        name: STRINGS.settings.checkUpdates.name,
        desc: STRINGS.settings.checkUpdates.desc,
        render: (row: Setting) => {
          // Der Traeger wird bei JEDEM Zeichnen frisch gesetzt und sofort befuellt — so
          // ueberlebt ein laufender Zustand das Neuzeichnen der Zeile.
          this.pruefStatusEl = row.controlEl.createSpan({ cls: "asl-check-status" });
          this.zeichnePruefStatus();
          row.addButton((btn) =>
            btn.setButtonText(STRINGS.settings.checkUpdatesButton).onClick(() => {
              // ⚠️ Hier NICHT den Flow direkt aufrufen und NICHT `setDisabled` setzen.
              //
              // Gemessen 2026-09-01 (Obsidian 1.13.7): ein Klick auf diesen Knopf fror die
              // GESAMTE App ein — beide Renderer antworteten nicht mehr auf
              // `Runtime.evaluate`, ohne Exception und ohne Konsolenmeldung, und
              // `Debugger.pause` lieferte KEINEN laufenden JS-Stack. Es ist also keine
              // JS-Endlosschleife, sondern etwas unterhalb davon; der Zustand blieb
              // bestehen, bis Obsidian neu gestartet wurde.
              //
              // 2026-09-02 in sieben Laeufen getrennt (Belege in `docs/SMOKE.md` § Freeze).
              // Das Ergebnis widerlegt die urspruengliche Frage „welcher der beiden war es":
              // KEINER der Verdaechtigen friert allein ein.
              //
              //   Flow im Settings-Fenster + `setDisabled(false)` im `.finally()`  → FRIERT (2×)
              //   Flow im Settings-Fenster + `setDisabled(true)` allein            → laeuft
              //   Flow im Settings-Fenster ohne jedes `setDisabled`                → laeuft
              //   Flow im Settings-Fenster + `setDisabled(false)` per `setTimeout` → laeuft
              //   Flow im Settings-Fenster + `toggleClass` im `.finally()`         → laeuft
              //   Flow ueber den Befehl    + `setDisabled(false)` per `setTimeout` → laeuft
              //
              // Die beiden letzten Zeilen sind der Schluessel: gegenueber dem Defektfall
              // unterscheidet sich die eine nur im INHALT des `finally` (toggleClass statt
              // setDisabled), die andere nur im ZEITPUNKT (Timer statt Microtask). Beide
              // laufen. Ausloeser ist damit genau die Konjunktion — `setDisabled` im
              // Microtask des Flow-Promise, im Einstellungs-Fenster.
              //
              // Deshalb bleibt es beim Befehl: er fuehrt denselben Ablauf im
              // Workspace-Kontext aus, und die Rueckmeldung an den Nutzer ist der
              // `is-checking`-Indikator (§8) statt einer gesperrten Schaltflaeche. Eine
              // DOM-Aenderung aus dem `finally` heraus ist erlaubt und gemessen
              // unbedenklich — `setDisabled` in dieser Position ist es nicht.
              //
              // `app.commands` ist in `obsidian.d.ts` nicht deklariert (wie `app.plugins`,
              // das dieses Repo an anderer Stelle schon so nutzt): schmales lokales
              // Interface statt `any`, mit Form-Pruefung vor dem Aufruf.
              const commands = (this.app as unknown as {
                commands?: { executeCommandById?: (id: string) => unknown };
              }).commands;
              if (typeof commands?.executeCommandById === "function") {
                commands.executeCommandById(`${this.host.manifest.id}:check-updates`);
              }
            }),
          );
        },
      },
      {
        type: "group",
        heading: STRINGS.settings.sectionUpdates,
        items: this.updateItems(),
      },
      {
        type: "group",
        heading: STRINGS.settings.sectionInstalled,
        items: this.installedItems(),
      },
      {
        type: "group",
        heading: STRINGS.settings.sectionBrowse,
        items: this.browseItems(),
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

  /** Von aussen anstossbares Neuzeichnen.
   *
   *  Noetig, weil Ablaeufe auch ausserhalb des Tabs laufen: „Check for updates“ haengt am
   *  registrierten Befehl (der im Workspace-Kontext ausgefuehrt wird), und der Startup-Check
   *  laeuft ganz ohne UI. Ohne diesen Weg aendert sich `availableVersion`, waehrend der
   *  offene Tab weiter den alten Stand zeigt — man drueckt „Check now“, bekommt eine Notice
   *  und sieht in der Liste nichts (gemessen 2026-09-02, GUI-Smoke G5). */
  aktualisieren(): void {
    this.refresh();
  }

  // ── Listen als Definitionen (ein Code, beide Pfade) ──────────────────────

  /** Hinweiszeile (Empty-State, Fehler, Erklaertext) als SICHTBARE Zeile.
   *
   *  ⚠️ `{ name: "", desc: "…" }` allein genuegt nicht: ein Item ohne Namen und ohne
   *  Bedienelement zeichnet Obsidian nicht sichtbar (gemessen 2026-09-02 an 1.13.7 — die
   *  Browse-Sektion meldete korrekt „No catalog could be loaded", und im DOM stand
   *  nichts). Deshalb eine `render`-Hatch, die den Text selbst in die Zeile setzt und die
   *  Empty-State-Klasse aus UI-STANDARD §8 traegt. */
  private hinweisItem(text: string): SettingGroupItem<keyof SideloaderSettings> {
    return {
      name: "",
      desc: text,
      render: (row: Setting) => {
        row.settingEl.addClass("asl-empty");
        row.setDesc(text);
      },
    };
  }

  /** Erklaertext der Gruppe als eigene Zeile. `heading` traegt nur den Namen, und der
   *  Erklaertext ist nach UI-STANDARD §10 Pflicht — er darf nicht dem Umbau zum Opfer
   *  fallen. */
  private descItem(desc: string): SettingGroupItem<keyof SideloaderSettings> {
    return this.hinweisItem(desc);
  }

  /** Eine Zeile je Plugin mit bekanntem Rueckstand. Kein eigenes CSS: `Setting` liefert
   *  Name, Beschreibung und Aktionsleiste — genau der Grund, warum diese Listen hier und
   *  nicht in einer eigenen View stehen. */
  private updateItems(): SettingGroupItem<keyof SideloaderSettings>[] {
    const items: SettingGroupItem<keyof SideloaderSettings>[] = [];
    const faellig = this.host.settings.plugins.filter((p) => p.availableVersion !== null);

    if (faellig.length === 0) {
      items.push(this.hinweisItem(
        this.host.settings.plugins.length === 0 ? STRINGS.notices.nothingTracked : STRINGS.store.noUpdates,
      ));
    }

    for (const plugin of faellig) {
      items.push({
        name: plugin.id,
        desc: STRINGS.store.installedOutdated(plugin.installedVersion, plugin.availableVersion ?? ""),
        render: (row: Setting) => {
          row.setName(plugin.id).setDesc(
            STRINGS.store.installedOutdated(plugin.installedVersion, plugin.availableVersion ?? ""),
          );
          row.addButton((btn) =>
            btn.setButtonText(STRINGS.store.releaseNotesAction).onClick(() => {
              void this.releaseNotes(plugin, plugin.id);
            }),
          );
          row.addButton((btn) =>
            btn
              .setButtonText(STRINGS.store.update)
              .setCta()
              .onClick(() => {
                void applyUpdate(this.host.flowContext(), plugin.id).finally(() => { this.refresh(); });
              }),
          );
        },
      });
    }
    return items;
  }

  /** Eine Zeile je verwaltetem Plugin: Status, Pruefen, Notes, Melden, Entfernen. */
  private installedItems(): SettingGroupItem<keyof SideloaderSettings>[] {
    const plugins = this.host.settings.plugins;
    if (plugins.length === 0) {
      return [this.hinweisItem(STRINGS.store.noInstalled)];
    }
    return plugins.map((plugin) => ({
      name: plugin.id,
      desc: new URL(plugin.ref.baseUrl).host,
      render: (row: Setting) => {
        // Die angezeigte Version kommt von der PLATTE, nicht aus den Einstellungen — beide
        // laufen auseinander, sobald jemand am Sideloader vorbei aktualisiert.
        const aufPlatte = this.installiert.get(plugin.id) ?? plugin.installedVersion;
        row.setName(plugin.id).setDesc(`${aufPlatte} · ${new URL(plugin.ref.baseUrl).host}`);
        if (plugin.availableVersion) {
          this.status(row.controlEl, "warning", STRINGS.store.updateAvailable(plugin.availableVersion));
        } else {
          this.status(row.controlEl, "ok", STRINGS.store.upToDateStatus);
        }
        row.addButton((btn) =>
          btn.setButtonText(STRINGS.store.check).onClick(() => {
            void checkOneUpdate(this.host.flowContext(), plugin.id).then((fehler) => {
              if (fehler) new Notice(STRINGS.notices.checkFailed(plugin.id, fehler));
              this.refresh();
            });
          }),
        );
        row.addButton((btn) =>
          btn.setButtonText(STRINGS.store.releaseNotesAction).onClick(() => {
            void this.releaseNotes(plugin, plugin.id);
          }),
        );
        row.addExtraButton((btn) =>
          btn
            .setIcon("bug")
            .setTooltip(STRINGS.store.reportIssue)
            .onClick(() => { window.open(this.issuesUrl(plugin.ref), "_blank", "noopener,noreferrer"); }),
        );
        row.addExtraButton((btn) =>
          btn
            .setIcon("trash-2")
            .setTooltip(STRINGS.store.remove)
            .onClick(() => {
              void removeInstalled(this.host.flowContext(), plugin.id).finally(() => { this.refresh(); });
            }),
        );
      },
    }));
  }

  /** Katalog-Eintraege mit ihrem echten Zustand im Vault. */
  private browseItems(): SettingGroupItem<keyof SideloaderSettings>[] {
    if (this.host.settings.catalogs.length === 0) {
      return [this.hinweisItem(STRINGS.store.noCatalogs)];
    }
    // Der Cache gehoert zu einer bestimmten Abo-Liste. Aendert sie sich, ist er wertlos —
    // sonst zeigt die Sektion Eintraege aus einem Katalog, den es nicht mehr gibt.
    if (this.katalog.schluessel !== JSON.stringify(this.host.settings.catalogs)) {
      this.katalog = { stand: "kalt", eintraege: [], fehler: "", schluessel: "" };
    }
    if (this.katalog.stand !== "da") {
      if (this.katalog.stand === "kalt") void this.ladeKatalog();
      return [this.hinweisItem(STRINGS.settings.catalogLoading)];
    }
    if (this.katalog.eintraege.length === 0) {
      return [this.hinweisItem(STRINGS.store.noCatalogEntries(this.katalog.fehler || "empty"))];
    }

    const items: SettingGroupItem<keyof SideloaderSettings>[] = [];

    // Suchfeld + Sammelaktion in EINER Zeile — beide betreffen die Liste als Ganzes.
    const uebernehmbar = this.katalog.eintraege.filter((e) => this.zustandVon(e).kind === "unmanaged");
    items.push({
      name: "",
      render: (row: Setting) => {
        row.addSearch((c) =>
          c
            .setPlaceholder(STRINGS.store.searchPlaceholder)
            .setValue(this.suche)
            .onChange((v) => {
              this.suche = v;
              this.refresh();
            }),
        );
        if (uebernehmbar.length > 0) {
          row.addButton((btn) =>
            btn
              .setButtonText(STRINGS.store.manageAll(uebernehmbar.length))
              .setCta()
              .onClick(() => { void this.uebernimmAlle(uebernehmbar); }),
          );
        }
        row.addExtraButton((btn) =>
          btn
            .setIcon("refresh-cw")
            .setTooltip(STRINGS.settings.catalogReload)
            .onClick(() => { void this.ladeKatalog(); }),
        );
      },
    });

    const gefiltert = filterCatalogEntries(this.katalog.eintraege, this.suche);
    if (gefiltert.length === 0) {
      items.push(this.hinweisItem(STRINGS.store.noMatches));
      return items;
    }

    for (const entry of gefiltert) {
      const zustand = this.zustandVon(entry);
      items.push({
        name: entry.name,
        desc: entry.description,
        render: (row: Setting) => {
          row.setName(entry.name).setDesc(`${entry.description} · ${STRINGS.store.byAuthor(entry.author)}`);
          if (zustand.kind === "not-installed") {
            row.addButton((btn) =>
              btn
                .setButtonText(STRINGS.store.install)
                .setCta()
                .onClick(() => {
                  void installFromUrl(this.host.flowContext(), entry.repo, entry.id).finally(() => {
                    void this.ladeKatalog();
                  });
                }),
            );
            return;
          }
          if (zustand.kind === "unmanaged") {
            this.status(row.controlEl, "warning", STRINGS.store.installedUnmanaged(zustand.installedVersion));
            row.addButton((btn) =>
              btn.setButtonText(STRINGS.store.manage).onClick(() => {
                void adoptFromCatalog(this.host.flowContext(), entry, zustand.installedVersion)
                  .then((ok) => {
                    if (ok) new Notice(STRINGS.notices.adopted(entry.name, zustand.installedVersion));
                  })
                  .finally(() => { this.refresh(); });
              }),
            );
            return;
          }
          if (zustand.availableVersion) {
            this.status(
              row.controlEl,
              "warning",
              STRINGS.store.installedOutdated(zustand.installedVersion, zustand.availableVersion),
            );
          } else {
            this.status(row.controlEl, "ok", STRINGS.store.installedCurrent(zustand.installedVersion));
          }
        },
      });
    }
    return items;
  }

  /** Sequenziell: jede Uebernahme probt ihre Forge, und zwanzig gleichzeitige Anfragen an
   *  dieselbe Instanz sind der schnellste Weg in ein Rate-Limit. */
  private async uebernimmAlle(entries: readonly CatalogEntry[]): Promise<void> {
    let n = 0;
    for (const entry of entries) {
      const zustand = this.zustandVon(entry);
      if (zustand.kind !== "unmanaged") continue;
      try {
        if (await adoptFromCatalog(this.host.flowContext(), entry, zustand.installedVersion)) n++;
      } catch (err) {
        new Notice(STRINGS.notices.adoptFailed(entry.name, err instanceof Error ? err.message : String(err)));
      }
    }
    if (n > 0) new Notice(STRINGS.notices.adoptedAll(n));
    this.refresh();
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
