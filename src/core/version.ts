export function normalizeVersion(tagOrVersion: string): string {
  return tagOrVersion.trim().replace(/^v/, "");
}

export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split(".");
  const pb = normalizeVersion(b).split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number.parseInt(pa[i] ?? "0", 10) || 0;
    const nb = Number.parseInt(pb[i] ?? "0", 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export function isNewer(candidate: string, installed: string): boolean {
  return compareVersions(candidate, installed) > 0;
}
