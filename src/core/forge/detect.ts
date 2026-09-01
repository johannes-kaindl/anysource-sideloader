import "./types";

export function parseRepoUrl(input: string): { baseUrl: string; owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  let url: URL;
  try { url = new URL(trimmed); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length < 2) return null;
  const owner = segments[0];
  const repo = (segments[1] ?? "").replace(/\.git$/, "");
  if (!owner || !repo) return null;
  return { baseUrl: `${url.protocol}//${url.host}`, owner, repo };
}

export function giteaProbeUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/version`;
}
