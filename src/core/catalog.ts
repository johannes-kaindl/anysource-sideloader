import { isValidPluginId } from "./install";
import { parseRepoUrl } from "./forge/detect";

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  repo: string;
  author: string;
  tags: string[];
}

export interface Catalog {
  catalogVersion: 1;
  name: string;
  plugins: CatalogEntry[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseEntry(v: unknown): CatalogEntry | null {
  if (!isPlainObject(v)) return null;
  const { id, name, description, repo, author, tags } = v;
  if (typeof id !== "string" || !isValidPluginId(id)) return null;
  if (typeof name !== "string" || typeof description !== "string") return null;
  if (typeof repo !== "string" || typeof author !== "string") return null;
  if (!parseRepoUrl(repo)) return null;
  const safeTags = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [];
  return { id, name, description, repo, author, tags: safeTags };
}

export function parseCatalog(jsonText: string): Catalog {
  const data: unknown = JSON.parse(jsonText);
  if (!isPlainObject(data)) throw new Error("Katalog: kein Objekt");
  if (data.catalogVersion !== 1) {
    throw new Error(`Katalog: catalogVersion ${String(data.catalogVersion)} wird nicht unterstuetzt`);
  }
  if (typeof data.name !== "string") throw new Error("Katalog: name fehlt");
  const rawPlugins = Array.isArray(data.plugins) ? data.plugins : [];
  const plugins: CatalogEntry[] = [];
  for (const entry of rawPlugins) {
    const parsed = parseEntry(entry);
    if (parsed) plugins.push(parsed);
  }
  return { catalogVersion: 1, name: data.name, plugins };
}
