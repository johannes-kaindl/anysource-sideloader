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
