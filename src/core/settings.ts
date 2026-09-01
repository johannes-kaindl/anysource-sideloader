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
}

export interface SideloaderSettings {
  plugins: ManagedPlugin[];
  catalogs: string[];
  hostSecrets: Record<string, string>; // host ("git.jkaindl.de") -> secretId im Schluesselbund
  checkOnStartup: boolean; // Default true
}

export const DEFAULT_SETTINGS: SideloaderSettings = {
  plugins: [],
  catalogs: [],
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

  const plugins = Array.isArray(merged.plugins)
    ? merged.plugins.filter(isManagedPlugin)
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
