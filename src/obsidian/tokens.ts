// Gemeinsamer Host->Token-Lookup fuer flows.ts (RepoRef-Quellen: Installs/Updates) und
// store-view.ts (Katalog-URLs, Task I3) — beide Seiten fragen denselben Schluesselbund
// nach demselben Host ab, dieser Helfer verhindert eine zweite, driftende Kopie.
import type { SideloaderSettings } from "../core/settings";
import type { SecretStore } from "./secrets";

/** host -> hostSecrets-Eintrag -> Schluesselbund. Kein Eintrag oder kein gespeicherter
 *  Wert heisst: unauthentifiziert anfragen (oeffentliche Repos/Kataloge). */
export function resolveHostToken(settings: SideloaderSettings, secretStore: SecretStore, host: string): string | null {
  const secretId = settings.hostSecrets[host];
  return secretId ? secretStore.get(secretId) : null;
}
