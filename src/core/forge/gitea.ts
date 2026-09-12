import type { ReleaseInfo, RepoRef } from "./types";
import { normalizeVersion } from "../version";

export function latestReleaseUrl(ref: RepoRef): string {
  return `${ref.baseUrl}/api/v1/repos/${ref.owner}/${ref.repo}/releases/latest`;
}

/** Liste statt Einzel-Release — Grundlage fuer die Update-Notes ueber das ganze
 *  Versions-Delta (Quicktask 2026-09-12). Gitea sortiert neueste zuerst; `limit=50` deckt
 *  jede in diesem Workspace denkbare Release-Kadenz. */
export function releasesListUrl(ref: RepoRef): string {
  return `${ref.baseUrl}/api/v1/repos/${ref.owner}/${ref.repo}/releases?limit=50`;
}

function toReleaseInfo(rel: unknown): ReleaseInfo | null {
  const r = rel as { tag_name?: unknown; body?: unknown; html_url?: unknown; assets?: unknown };
  if (typeof r.tag_name !== "string" || r.tag_name === "") return null;
  const assets = Array.isArray(r.assets) ? r.assets : [];
  return {
    tagName: r.tag_name,
    version: normalizeVersion(r.tag_name),
    notes: typeof r.body === "string" ? r.body : "",
    htmlUrl: typeof r.html_url === "string" ? r.html_url : "",
    assets: assets
      .filter((a): a is { name: string; browser_download_url: string } =>
        typeof (a as { name?: unknown }).name === "string" &&
        typeof (a as { browser_download_url?: unknown }).browser_download_url === "string")
      .map((a) => ({ name: a.name, downloadUrl: a.browser_download_url })),
  };
}

export function parseGiteaRelease(jsonText: string): ReleaseInfo {
  let data: unknown;
  try { data = JSON.parse(jsonText); } catch { throw new Error("Antwort ist kein JSON"); }
  const rel = toReleaseInfo(data);
  if (!rel) throw new Error("Antwort ist kein Release (tag_name fehlt)");
  return rel;
}

/** Eintraege ohne `tag_name` werden uebersprungen statt die ganze Liste zu verwerfen. */
export function parseGiteaReleaseList(jsonText: string): ReleaseInfo[] {
  let data: unknown;
  try { data = JSON.parse(jsonText); } catch { throw new Error("Antwort ist kein JSON"); }
  if (!Array.isArray(data)) throw new Error("Antwort ist keine Release-Liste");
  const out: ReleaseInfo[] = [];
  for (const item of data) {
    const rel = toReleaseInfo(item);
    if (rel) out.push(rel);
  }
  return out;
}

export function issuesUrl(ref: RepoRef): string {
  return `${ref.baseUrl}/${ref.owner}/${ref.repo}/issues/new`;
}

export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `token ${token}` } : {};
}
