import type { ManagedPlugin } from "./settings";
import type { ReleaseInfo } from "./forge/types";
import { isNewer } from "./version";

export interface UpdateCheckResult {
  id: string;
  installed: string;
  available: string;
  notes: string;
}

export function planUpdates(plugins: ManagedPlugin[], latest: Map<string, ReleaseInfo>): UpdateCheckResult[] {
  const result: UpdateCheckResult[] = [];
  for (const plugin of plugins) {
    const release = latest.get(plugin.id);
    if (!release) continue;
    if (!isNewer(release.version, plugin.installedVersion)) continue;
    result.push({
      id: plugin.id,
      installed: plugin.installedVersion,
      available: release.version,
      notes: release.notes,
    });
  }
  return result;
}

/**
 * Fehlermeldungen eines Sammel-Laufs zu EINER Zeile zusammenfassen.
 *
 * Der Anlass ist konkret: bei einem Forge-Ausfall und zwanzig verwalteten Plugins stapelten
 * sich zwanzig Notices uebereinander — dieselbe Ursache, zwanzigmal, und die eigentliche
 * Meldung („x Updates verfuegbar") verschwand darunter. Ein Nutzer mit vielen Plugins wurde
 * also ausgerechnet dann zugeschuettet, wenn etwas kaputt war.
 *
 * Ein einzelner Fehler bleibt einzeln: dort ist die id die nuetzlichste Information.
 * Mehrere werden gezaehlt und mit dem ERSTEN Fall illustriert — die Ursache ist bei einem
 * Forge-Ausfall fuer alle dieselbe, und eine Liste aus zwanzig Zeilen liest niemand.
 */
export function fasseFehlerZusammen(
  fehler: ReadonlyArray<{ id: string; message: string }>,
): string | null {
  if (fehler.length === 0) return null;
  const erster = fehler[0];
  if (!erster) return null;
  if (fehler.length === 1) return `Update check for "${erster.id}" failed: ${erster.message}`;
  return `${fehler.length} update checks failed (first: "${erster.id}" — ${erster.message})`;
}
