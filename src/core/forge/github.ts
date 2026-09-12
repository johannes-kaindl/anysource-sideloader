import type { AssetRef, HttpRequest, ReleaseInfo, RepoRef } from "./types";
import { normalizeVersion } from "../version";

export function latestReleaseUrl(ref: RepoRef): string {
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/releases/latest`;
}

/** Liste statt Einzel-Release — Grundlage fuer die Update-Notes ueber das ganze
 *  Versions-Delta (Quicktask 2026-09-12). `per_page=100` deckt jede in diesem Workspace
 *  denkbare Release-Kadenz; GitHub sortiert bereits neueste zuerst. */
export function releasesListUrl(ref: RepoRef): string {
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/releases?per_page=100`;
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
      .filter((a): a is { name: string; browser_download_url: string; url: string } =>
        typeof (a as { name?: unknown }).name === "string" &&
        typeof (a as { browser_download_url?: unknown }).browser_download_url === "string" &&
        typeof (a as { url?: unknown }).url === "string")
      .map((a) => ({ name: a.name, downloadUrl: a.browser_download_url, apiUrl: a.url })),
  };
}

export function parseGithubRelease(jsonText: string): ReleaseInfo {
  let data: unknown;
  try { data = JSON.parse(jsonText); } catch { throw new Error("Antwort ist kein JSON"); }
  const rel = toReleaseInfo(data);
  if (!rel) throw new Error("Antwort ist kein Release (tag_name fehlt)");
  return rel;
}

/** Eintraege ohne `tag_name` werden uebersprungen statt die ganze Liste zu verwerfen —
 *  ein einzelner kaputter/Draft-Eintrag darf die Notes-Historie nicht leeren. */
export function parseGithubReleaseList(jsonText: string): ReleaseInfo[] {
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

export function apiHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Private GitHub-Downloads laufen ueber die API-Asset-URL; GitHub antwortet 302 auf S3.
 *  Ob requestUrl den Authorization-Header ans Redirect-Ziel weiterreicht (S3 lehnt doppelte
 *  Auth mit 400 ab), ist UNGEMESSEN — der Verhaltenstest ist Teil des Bootstrap-Tasks (Task 15).
 *  Bis dahin gilt der Private-GitHub-Fall als experimentell. */
export function assetRequest(asset: AssetRef, token: string | null): HttpRequest {
  if (!token) return { url: asset.downloadUrl, headers: {} };
  return {
    url: asset.apiUrl ?? asset.downloadUrl,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" },
  };
}
