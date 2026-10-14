import type { RepoRef } from "./forge/types";
import { isValidPluginId } from "./install";
import { mergeSettings } from "../vendor/code-kit/settings";

export interface ManagedPlugin {
  id: string;
  repoUrl: string;
  ref: RepoRef;
  installedVersion: string;
  availableVersion: string | null; // letzter Check-Befund, null = unbekannt/aktuell
  addedFrom: "url" | "catalog";
  /** Was beim letzten Installieren oder Aktualisieren geschrieben wurde: Version und SHA-256 der `main.js`.
   *  Kommt dieselbe Version später mit anderen Bytes wieder, wurde das Release ausgetauscht (Pinning). */
  pin?: ReleasePin;
}

export interface ReleasePin { version: string; mainSha256: string }

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export function isReleasePin(v: unknown): v is ReleasePin {
  return isPlainObject(v) && typeof v.version === "string" && typeof v.mainSha256 === "string" && SHA256_HEX_RE.test(v.mainSha256);
}

export interface SideloaderSettings {
  plugins: ManagedPlugin[];
  catalogs: string[];
  hostSecrets: Record<string, string>; // host ("git.jkaindl.de") -> secretId im Schluesselbund
  checkOnStartup: boolean; // Default true
}

/** Vorabonnierter Katalog des Plugin-Autors — in den Settings jederzeit entfernbar.
 *  Ein leerer Browse-Tab beim ersten Start waere ein Empty-State ohne Ausweg fuer
 *  genau die Nutzer, fuer die dieses Plugin gebaut ist. */
export const DEFAULT_CATALOG_URL =
  "https://git.jkaindl.de/jkaindl/obsidian-catalog/raw/branch/main/catalog.json";

export const DEFAULT_SETTINGS: SideloaderSettings = {
  plugins: [],
  catalogs: [DEFAULT_CATALOG_URL],
  hostSecrets: {},
  checkOnStartup: true,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isRepoRef(v: unknown): v is RepoRef {
  if (!isPlainObject(v)) return false;
  return (
    (v.kind === "github" || v.kind === "gitea" || v.kind === "raw") &&
    typeof v.baseUrl === "string" &&
    typeof v.owner === "string" &&
    typeof v.repo === "string"
  );
}

function isManagedPlugin(v: unknown): v is ManagedPlugin {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.id === "string" &&
    isValidPluginId(v.id) &&
    typeof v.repoUrl === "string" &&
    isRepoRef(v.ref) &&
    typeof v.installedVersion === "string" &&
    (v.availableVersion === null || typeof v.availableVersion === "string") &&
    (v.addedFrom === "url" || v.addedFrom === "catalog")
  );
}

export function loadSettings(raw: unknown): SideloaderSettings {
  const merged = mergeSettings(DEFAULT_SETTINGS, raw);

  // Ein kaputter Pin verwirft nur den Pin, nicht das Plugin: ohne Pin greift die Prüfung "Release ausgetauscht" einfach nicht.
  const plugins = Array.isArray(merged.plugins)
    ? merged.plugins.filter(isManagedPlugin).map(({ pin, ...rest }) => (isReleasePin(pin) ? { ...rest, pin } : rest))
    : DEFAULT_SETTINGS.plugins.slice();

  const checkOnStartup = typeof merged.checkOnStartup === "boolean" ? merged.checkOnStartup : true;

  const hostSecrets: Record<string, string> = {};
  if (isPlainObject(merged.hostSecrets)) {
    for (const [key, value] of Object.entries(merged.hostSecrets)) {
      if (typeof value === "string") hostSecrets[key] = value;
    }
  }

  const catalogs = Array.isArray(merged.catalogs)
    ? merged.catalogs.filter((c): c is string => typeof c === "string")
    : DEFAULT_SETTINGS.catalogs.slice();

  return { plugins, catalogs, hostSecrets, checkOnStartup };
}
