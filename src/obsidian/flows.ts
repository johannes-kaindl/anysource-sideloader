// Anwendungsfaelle (Task-13-Brief): View und Commands rufen ausschliesslich diese
// Funktionen auf. Kein View-/Panel-DOM-Code hier — nur Confirm-Dialoge (Kit) und Notice
// duerfen UI anfassen, alles andere ist reine Ablauflogik ueber core/*.
import { Notice, type App } from "obsidian";
import { confirmAction } from "../vendor/kit-obsidian/confirm";
import { detectForge, fetchLatestRelease, fetchPluginFiles, type FetchedPlugin } from "../core/source";
import { pluginDir } from "../core/install";
import type { HttpPort, ReleaseInfo, RepoRef } from "../core/forge/types";
import type { ManagedPlugin, SideloaderSettings } from "../core/settings";
import { fasseFehlerZusammen, planUpdates, type UpdateCheckResult } from "../core/plan";
import { isNewer } from "../core/version";
import { STRINGS } from "../i18n/strings";
import type { SecretStore } from "./secrets";
import { resolveHostToken } from "./tokens";
import { adapterFilePort, enablePlugin, reloadIfEnabled, removePlugin, writePluginFiles } from "./installer";

/** Alles, was ein Use-Case braucht — vom Host (`main.ts`/`store-view.ts`) einmal gebaut
 *  und durchgereicht. `settings` ist dieselbe Objektreferenz wie `plugin.settings`: die
 *  Flows mutieren sie in-place und rufen `saveSettings()` selbst auf, damit ein Aufrufer
 *  nie vergisst zu persistieren. */
export interface FlowContext {
  app: App;
  http: HttpPort;
  settings: SideloaderSettings;
  saveSettings(): Promise<void>;
  secretStore: SecretStore;
}

/** host -> hostSecrets-Eintrag -> Schluesselbund. Kein Eintrag oder kein gespeicherter
 *  Wert heisst: unauthentifiziert anfragen (oeffentliche Repos/Kataloge). */
function resolveToken(ctx: FlowContext, ref: RepoRef): string | null {
  return resolveHostToken(ctx.settings, ctx.secretStore, new URL(ref.baseUrl).host);
}

function excerpt(notes: string, maxLen = 240): string {
  const trimmed = notes.trim();
  if (trimmed === "") return "";
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed;
}

function upsertManagedPlugin(settings: SideloaderSettings, plugin: ManagedPlugin): void {
  const i = settings.plugins.findIndex((p) => p.id === plugin.id);
  if (i >= 0) settings.plugins[i] = plugin;
  else settings.plugins.push(plugin);
}

function sourceLine(ref: RepoRef): string {
  return `Source: ${ref.baseUrl}/${ref.owner}/${ref.repo}`;
}

async function confirmChecksumAwareInstall(
  ctx: FlowContext,
  opts: {
    title: string;
    confirmLabel: string;
    id: string;
    ref: RepoRef;
    version: string;
    notes: string;
    checksums: FetchedPlugin["checksums"];
  },
): Promise<boolean> {
  const message = [sourceLine(opts.ref), `ID: ${opts.id}`, `Version: ${opts.version}`];
  const notes = excerpt(opts.notes);
  if (notes) message.push(notes);
  if (opts.checksums === "absent") message.push(STRINGS.confirm.checksumAbsent);
  return confirmAction(ctx.app, {
    title: opts.title,
    message,
    confirmLabel: opts.confirmLabel,
    cancelLabel: STRINGS.confirm.cancel,
    warning: false,
  });
}

/** installFromUrl: detectForge -> (http(s) egal welcher Art: Zusatz-Confirm, Task I4) ->
 *  fetchLatestRelease -> fetchPluginFiles -> optionaler id-Abgleich gegen einen Katalog-
 *  Eintrag (`expectedId`, Task M18) -> Checksum-Verdikt ("mismatch" bricht VOR jedem
 *  Schreiben ab, "absent" bekommt eine Zusatzzeile im Confirm) -> Overwrite-Guard (Task
 *  C2: ein bereits belegter, aber NICHT verwalteter Plugin-Ordner verlangt ein zweites,
 *  destruktiv markiertes Confirm, das die id nennt) -> confirmAction Install -> Schreiben
 *  -> ManagedPlugin upsert + saveSettings -> confirmAction "jetzt aktivieren?".
 *  `expectedId` kommt von einem Katalog-Card-Klick, der die id schon kennt — weicht die
 *  tatsaechlich gelieferte id ab, bricht der Flow VOR jedem Schreiben mit einer Notice ab
 *  (derselbe idChanged-Text wie beim Update-Pfad). */
export async function installFromUrl(ctx: FlowContext, url: string, expectedId?: string): Promise<void> {
  const ref = await detectForge(ctx.http, url);
  if (!ref) {
    new Notice(STRINGS.notices.invalidSource);
    return;
  }

  if (new URL(ref.baseUrl).protocol === "http:") {
    const proceed = await confirmAction(ctx.app, {
      message: [STRINGS.confirm.httpSource],
      confirmLabel: STRINGS.confirm.install,
      cancelLabel: STRINGS.confirm.cancel,
      warning: false,
    });
    if (!proceed) return;
  }

  const token = resolveToken(ctx, ref);
  const release = await fetchLatestRelease(ctx.http, ref, token);
  const fetched = await fetchPluginFiles(ctx.http, ref, release, token);

  if (expectedId && fetched.manifest.id !== expectedId) {
    new Notice(STRINGS.confirm.idChanged(expectedId, fetched.manifest.id));
    return;
  }

  if (fetched.checksums === "mismatch") {
    new Notice(STRINGS.notices.checksumMismatch);
    return;
  }

  const port = adapterFilePort(ctx.app);
  const dir = pluginDir(ctx.app.vault.configDir, fetched.manifest.id);
  const dirExists = await port.exists(dir);
  const isKnownPlugin = ctx.settings.plugins.some((p) => p.id === fetched.manifest.id);
  if (dirExists && !isKnownPlugin) {
    // Ein Plugin-Ordner mit dieser id existiert bereits, ist aber keinem ManagedPlugin
    // zugeordnet — er gehoert also entweder einem manuell installierten Plugin oder einem
    // frueheren Sideload, das nicht (mehr) in settings.plugins steht. Ein normales Install
    // wuerde ihn stillschweigend ueberschreiben (Task C2); das verlangt ein eigenes,
    // destruktiv markiertes Confirm, das die id nennt.
    const proceedOverwrite = await confirmAction(ctx.app, {
      title: STRINGS.confirm.overwriteTitle(fetched.manifest.id),
      message: [STRINGS.confirm.overwriteWarning(fetched.manifest.id)],
      confirmLabel: STRINGS.confirm.install,
      cancelLabel: STRINGS.confirm.cancel,
      warning: true,
    });
    if (!proceedOverwrite) return;
  }

  const confirmed = await confirmChecksumAwareInstall(ctx, {
    title: STRINGS.confirm.installTitle(fetched.manifest.name),
    confirmLabel: STRINGS.confirm.install,
    id: fetched.manifest.id,
    ref,
    version: fetched.manifest.version,
    notes: fetched.release.notes,
    checksums: fetched.checksums,
  });
  if (!confirmed) return;

  await writePluginFiles(port, ctx.app.vault.configDir, fetched);

  upsertManagedPlugin(ctx.settings, {
    id: fetched.manifest.id,
    repoUrl: url,
    ref,
    installedVersion: fetched.manifest.version,
    availableVersion: null,
    addedFrom: "url",
  });
  await ctx.saveSettings();

  new Notice(STRINGS.notices.installed(fetched.manifest.name, fetched.manifest.version));

  const enableNow = await confirmAction(ctx.app, {
    message: STRINGS.confirm.enableNow,
    confirmLabel: STRINGS.confirm.enable,
    cancelLabel: STRINGS.confirm.later,
    warning: false,
  });
  if (enableNow) await enablePlugin(ctx.app, fetched.manifest.id);
}

export interface CheckAllUpdatesResult {
  results: UpdateCheckResult[];
  errors: Array<{ id: string; message: string }>;
}

/** checkAllUpdates: pro ManagedPlugin fetchLatestRelease — ein fehlgeschlagener Fetch
 *  wird gesammelt, nicht abgebrochen (eine tote Quelle darf die anderen nicht blockieren).
 *  planUpdates traegt dann availableVersion nach (null = aktuell) und persistiert. Die
 *  Notice fuer den Nutzer macht der Aufrufer (Command/Startup-Check), nicht dieser Flow. */
export async function checkAllUpdates(ctx: FlowContext): Promise<CheckAllUpdatesResult> {
  const latest = new Map<string, ReleaseInfo>();
  const errors: Array<{ id: string; message: string }> = [];

  for (const plugin of ctx.settings.plugins) {
    try {
      const token = resolveToken(ctx, plugin.ref);
      const release = await fetchLatestRelease(ctx.http, plugin.ref, token);
      latest.set(plugin.id, release);
    } catch (err) {
      errors.push({ id: plugin.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  const results = planUpdates(ctx.settings.plugins, latest);
  const availableById = new Map(results.map((r) => [r.id, r.available]));
  for (const plugin of ctx.settings.plugins) {
    plugin.availableVersion = availableById.get(plugin.id) ?? null;
  }
  await ctx.saveSettings();

  return { results, errors };
}

/** Check-Knopf einer einzelnen Zeile im Installed-Panel: derselbe Fetch wie
 *  `checkAllUpdates`, nur fuer ein Plugin und mit Fehlerrueckgabe statt Sammlung — die
 *  View zeigt ihn als `is-error`-Status direkt an der betroffenen Zeile. */
export async function checkOneUpdate(ctx: FlowContext, id: string): Promise<string | null> {
  const plugin = ctx.settings.plugins.find((p) => p.id === id);
  if (!plugin) return null;
  try {
    const token = resolveToken(ctx, plugin.ref);
    const release = await fetchLatestRelease(ctx.http, plugin.ref, token);
    plugin.availableVersion = isNewer(release.version, plugin.installedVersion) ? release.version : null;
    await ctx.saveSettings();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Release-Notes fuer eine Zeile (Installed- oder Updates-Panel): ein frischer
 *  fetchLatestRelease liefert die aktuellsten Notes, unabhaengig davon, ob zuletzt
 *  geprueft wurde. Wirft weiter, wenn die Quelle nicht erreichbar ist — der Aufrufer
 *  (View) faengt das ab und zeigt eine Notice statt eines leeren Modals. */
export async function fetchReleaseNotesFor(ctx: FlowContext, id: string): Promise<{ version: string; notes: string } | null> {
  const plugin = ctx.settings.plugins.find((p) => p.id === id);
  if (!plugin) return null;
  const token = resolveToken(ctx, plugin.ref);
  const release = await fetchLatestRelease(ctx.http, plugin.ref, token);
  return { version: release.version, notes: release.notes };
}

/** applyUpdate: wie installFromUrl ab fetchPluginFiles, mit zwei Sicherheits-Zusatzkanten:
 *  ein id-Wechsel der Quelle bricht VOR jedem Schreiben ab (sonst wuerde unter dem neuen
 *  id-Ordner ein voellig anderes Plugin installiert, waehrend das erwartete Update
 *  ausbleibt), und nach dem Schreiben wird ein aktiviertes Plugin neu geladen. */
export async function applyUpdate(ctx: FlowContext, id: string): Promise<void> {
  const plugin = ctx.settings.plugins.find((p) => p.id === id);
  if (!plugin) return;

  const token = resolveToken(ctx, plugin.ref);
  const release = await fetchLatestRelease(ctx.http, plugin.ref, token);
  const fetched = await fetchPluginFiles(ctx.http, plugin.ref, release, token);

  if (fetched.manifest.id !== id) {
    new Notice(STRINGS.confirm.idChanged(id, fetched.manifest.id));
    return;
  }

  if (fetched.checksums === "mismatch") {
    new Notice(STRINGS.notices.checksumMismatch);
    return;
  }

  const confirmed = await confirmChecksumAwareInstall(ctx, {
    title: STRINGS.confirm.updateTitle(fetched.manifest.name, plugin.installedVersion, fetched.manifest.version),
    confirmLabel: STRINGS.confirm.update,
    id: fetched.manifest.id,
    ref: plugin.ref,
    version: fetched.manifest.version,
    notes: fetched.release.notes,
    checksums: fetched.checksums,
  });
  if (!confirmed) return;

  const port = adapterFilePort(ctx.app);
  await writePluginFiles(port, ctx.app.vault.configDir, fetched);

  plugin.installedVersion = fetched.manifest.version;
  plugin.availableVersion = null;
  await ctx.saveSettings();

  new Notice(STRINGS.notices.updated(fetched.manifest.name, fetched.manifest.version));
  await reloadIfEnabled(ctx.app, id);
}

/** removeInstalled: Confirm (destruktiv) -> Dateien entfernen -> aus settings.plugins
 *  streichen -> saveSettings. `data.json` bleibt laut `removePlugin`-Vertrag erhalten. */
export async function removeInstalled(ctx: FlowContext, id: string): Promise<void> {
  const plugin = ctx.settings.plugins.find((p) => p.id === id);
  if (!plugin) return;

  const confirmed = await confirmAction(ctx.app, {
    title: STRINGS.confirm.removeTitle(id),
    message: STRINGS.confirm.removeMessage,
    confirmLabel: STRINGS.confirm.remove,
    cancelLabel: STRINGS.confirm.cancel,
    warning: true,
  });
  if (!confirmed) return;

  const port = adapterFilePort(ctx.app);
  await removePlugin(port, ctx.app.vault.configDir, id);
  ctx.settings.plugins = ctx.settings.plugins.filter((p) => p.id !== id);
  await ctx.saveSettings();
}

/**
 * Ein bereits installiertes Plugin unter Verwaltung nehmen, ohne es neu zu installieren.
 *
 * Der Anlass ist gemessen: in zwei produktiven Vaults standen ~20 installierte Plugins
 * neben **null** verwalteten. Wer den Sideloader erst benutzt, nachdem er seine Plugins
 * hat, bekam von ihm nie einen Update-Hinweis — nicht weil die Pruefung fehlschlug,
 * sondern weil sie ueber eine leere Liste lief.
 *
 * Bewusst **ohne Confirm**: es wird nichts heruntergeladen und nichts auf die Platte
 * geschrieben, nur ein Eintrag in den Einstellungen angelegt. Die Bestaetigung sitzt dort,
 * wo sie hingehoert — beim spaeteren Update, das Code schreibt.
 */
export async function adoptFromCatalog(
  ctx: FlowContext,
  entry: { id: string; name: string; repo: string },
  installedVersion: string,
): Promise<boolean> {
  const ref = await detectForge(ctx.http, entry.repo);
  if (!ref) {
    new Notice(STRINGS.notices.adoptFailed(entry.name, STRINGS.notices.invalidSource));
    return false;
  }
  upsertManagedPlugin(ctx.settings, {
    id: entry.id,
    repoUrl: entry.repo,
    ref,
    installedVersion,
    availableVersion: null,
    addedFrom: "catalog",
  });
  await ctx.saveSettings();
  return true;
}

/** Update-Pruefung MIT Rueckmeldung — die eine Wahrheit fuer Befehl, Hub-Knopf und
 *  Settings-Knopf. Ohne sie haetten drei Aufrufstellen drei leicht verschiedene
 *  Meldungen, und die Frage „lief die Pruefung ueberhaupt?" bliebe an der Stelle offen,
 *  an der sie gestellt wird. */
export async function checkUpdatesWithNotices(ctx: FlowContext): Promise<CheckAllUpdatesResult> {
  if (ctx.settings.plugins.length === 0) {
    // Der haeufigste Fall beim Erstkontakt — und frueher der stillste: eine Pruefung ohne
    // Gegenstand meldete "alles aktuell", was wie ein Ergebnis aussieht und keines ist.
    new Notice(STRINGS.notices.nothingTracked);
    return { results: [], errors: [] };
  }
  const ergebnis = await checkAllUpdates(ctx);
  if (ergebnis.results.length > 0) new Notice(STRINGS.notices.updatesAvailable(ergebnis.results.length));
  else if (ergebnis.errors.length === 0) new Notice(STRINGS.notices.upToDate);
  // Eine Zeile statt einer pro Fehler: bei einem Forge-Ausfall mit zwanzig verwalteten
  // Plugins stapelten sich sonst zwanzig identische Notices uebereinander und begruben die
  // eigentliche Meldung. Und „alles aktuell“ wird nicht mehr gemeldet, wenn Pruefungen
  // fehlgeschlagen sind — das waere eine Aussage ueber Plugins, die gar nicht geprueft
  // werden konnten.
  const zusammenfassung = fasseFehlerZusammen(ergebnis.errors);
  if (zusammenfassung) new Notice(zusammenfassung, 10000);
  return ergebnis;
}
