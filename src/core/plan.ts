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
