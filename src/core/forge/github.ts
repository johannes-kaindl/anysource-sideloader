import type { AssetRef, HttpRequest, ReleaseInfo, RepoRef } from "./types";
import { normalizeVersion } from "../version";

export function latestReleaseUrl(ref: RepoRef): string {
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/releases/latest`;
}

export function parseGithubRelease(jsonText: string): ReleaseInfo {
  let data: unknown;
  try { data = JSON.parse(jsonText); } catch { throw new Error("Antwort ist kein JSON"); }
  const rel = data as { tag_name?: unknown; body?: unknown; html_url?: unknown; assets?: unknown };
  if (typeof rel.tag_name !== "string" || rel.tag_name === "") throw new Error("Antwort ist kein Release (tag_name fehlt)");
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  return {
    tagName: rel.tag_name,
    version: normalizeVersion(rel.tag_name),
    notes: typeof rel.body === "string" ? rel.body : "",
    htmlUrl: typeof rel.html_url === "string" ? rel.html_url : "",
    assets: assets
      .filter((a): a is { name: string; browser_download_url: string; url: string } =>
        typeof (a as { name?: unknown }).name === "string" &&
        typeof (a as { browser_download_url?: unknown }).browser_download_url === "string" &&
        typeof (a as { url?: unknown }).url === "string")
      .map((a) => ({ name: a.name, downloadUrl: a.browser_download_url, apiUrl: a.url })),
  };
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
