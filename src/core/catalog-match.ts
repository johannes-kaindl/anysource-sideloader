import type { CatalogEntry } from "./catalog";
import { parseRepoUrl } from "./forge/detect";
import type { ManagedPlugin } from "./settings";
import type { RepoRef } from "./forge/types";

/** Vergleichsschluessel fuer "dieselbe Quelle" — case-insensitiv, unabhaengig davon, ob
 *  die URL ueber `parseRepoUrl` (Katalog-Eintrag) oder ein aufgeloestes `RepoRef`
 *  (installiertes Plugin) kam. */
function repoKey(baseUrl: string, owner: string, repo: string): string {
  return `${baseUrl}/${owner}/${repo}`.toLowerCase();
}

function refKey(ref: RepoRef): string {
  return repoKey(ref.baseUrl, ref.owner, ref.repo);
}

/** Findet, ob ein Katalog-Eintrag (`entry.repo`) bereits als `ManagedPlugin` installiert
 *  ist — Browse-Panel zeigt dann die Version statt eines Install-Knopfs. Reine Funktion:
 *  kein Netzwerk, kein Obsidian, mit einem Standard-`vitest`-Test abgedeckt. */
export function matchInstalledPlugin(plugins: readonly ManagedPlugin[], repoUrl: string): ManagedPlugin | undefined {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return undefined;
  const key = repoKey(parsed.baseUrl, parsed.owner, parsed.repo);
  return plugins.find((p) => refKey(p.ref) === key);
}

/** Suchfeld-Filter des Browse-Panels: Treffer ueber Name, Beschreibung ODER einen Tag,
 *  case-insensitiv. Leere Anfrage liefert alles zurueck. */
export function filterCatalogEntries(entries: readonly CatalogEntry[], query: string): CatalogEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return entries.slice();
  return entries.filter(
    (e) =>
      e.name.toLowerCase().includes(needle) ||
      e.description.toLowerCase().includes(needle) ||
      e.tags.some((t) => t.toLowerCase().includes(needle)),
  );
}

/**
 * Was ein Katalog-Eintrag im Vault vorfindet — die Antwort auf „Install oder nicht?“.
 *
 * Das Plugin sah bis 0.1.1 nur, was es **selbst** installiert hatte (`settings.plugins`).
 * Ein Vault voller Plugins aus dem Community-Store war fuer es damit leer: der Katalog bot
 * „Install“ fuer laengst Installiertes an, und `checkAllUpdates` lief ueber eine leere
 * Liste — es meldete nie einen Rueckstand, weil es keinen kannte (gemessen 2026-09-01 in
 * zwei produktiven Vaults: 0 verwaltete Plugins bei ~20 installierten).
 *
 * Deshalb bekommt diese Funktion die **tatsaechlich installierte Version** von der Platte
 * herein, nicht nur die verwaltete Liste. `installedVersion === null` heisst: der Ordner
 * existiert nicht.
 */
export type CatalogEntryState =
  | { kind: "not-installed" }
  /** Liegt im Vault, gehoert aber keinem `ManagedPlugin` — uebernehmbar. */
  | { kind: "unmanaged"; installedVersion: string }
  /** Wird verwaltet; `availableVersion` ist der letzte Check-Befund (null = aktuell). */
  | { kind: "managed"; installedVersion: string; availableVersion: string | null };

export function catalogEntryState(
  entry: CatalogEntry,
  installedVersion: string | null,
  managed: readonly ManagedPlugin[],
): CatalogEntryState {
  if (installedVersion === null) return { kind: "not-installed" };

  // Zugeordnet wird ueber die QUELLE, nicht ueber die id: zwei Forges koennen dieselbe id
  // fuehren, und ein Update von der falschen waere stillschweigend fremder Code.
  const eintrag = matchInstalledPlugin(managed, entry.repo);
  if (!eintrag) return { kind: "unmanaged", installedVersion };

  // Die Version kommt von der Platte, nicht aus `settings.plugins`: ein Update ausserhalb
  // des Sideloaders (Store, BRAT, von Hand) aendert das Manifest, nicht die Einstellungen.
  return { kind: "managed", installedVersion, availableVersion: eintrag.availableVersion };
}
