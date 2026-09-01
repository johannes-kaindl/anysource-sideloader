// Anwendungsfaelle (Task-13-Brief): View und Commands rufen ausschliesslich diese
// Funktionen auf. Kein View-/Panel-DOM-Code hier — nur Confirm-Dialoge (Kit) und Notice
// duerfen UI anfassen, alles andere ist reine Ablauflogik ueber core/*.
import { Notice, type App } from "obsidian";
import { confirmAction } from "../vendor/kit-obsidian/confirm";
import { detectForge, fetchLatestRelease, fetchPluginFiles, type FetchedPlugin } from "../core/source";
import type { HttpPort, ReleaseInfo, RepoRef } from "../core/forge/types";
import type { ManagedPlugin, SideloaderSettings } from "../core/settings";
import { planUpdates, type UpdateCheckResult } from "../core/plan";
import { isNewer } from "../core/version";
import { STRINGS } from "../i18n/strings";
import type { SecretStore } from "./secrets";
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
  const host = new URL(ref.baseUrl).host;
  const secretId = ctx.settings.hostSecrets[host];
  return secretId ? ctx.secretStore.get(secretId) : null;
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
  opts: { title: string; confirmLabel: string; ref: RepoRef; version: string; notes: string; checksums: FetchedPlugin["checksums"] },
): Promise<boolean> {
  const message = [sourceLine(opts.ref), `Version: ${opts.version}`];
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

/** installFromUrl: detectForge -> (raw+http: Zusatz-Confirm) -> fetchLatestRelease ->
 *  fetchPluginFiles -> Checksum-Verdikt ("mismatch" bricht VOR jedem Schreiben ab,
 *  "absent" bekommt eine Zusatzzeile im Confirm) -> confirmAction Install -> Schreiben ->
 *  ManagedPlugin upsert + saveSettings -> confirmAction "jetzt aktivieren?". */
export async function installFromUrl(ctx: FlowContext, url: string): Promise<void> {
  const ref = await detectForge(ctx.http, url);
  if (!ref) {
    new Notice(STRINGS.notices.invalidSource);
    return;
  }

  if (ref.kind === "raw" && new URL(ref.baseUrl).protocol === "http:") {
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

  if (fetched.checksums === "mismatch") {
    new Notice(STRINGS.notices.checksumMismatch);
    return;
  }

  const confirmed = await confirmChecksumAwareInstall(ctx, {
    title: STRINGS.confirm.installTitle(fetched.manifest.name),
    confirmLabel: STRINGS.confirm.install,
    ref,
    version: fetched.manifest.version,
    notes: fetched.release.notes,
    checksums: fetched.checksums,
  });
  if (!confirmed) return;

  const port = adapterFilePort(ctx.app);
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
