export function normalizeVersion(tagOrVersion: string): string {
  // Task M13: nur ein fuehrendes "v" VOR einer Ziffer ist ein Tag-Praefix (v1.2.3). Ohne
  // das Lookahead wuerde z.B. "version-1.2" zu "ersion-1.2" verstuemmelt.
  return tagOrVersion.trim().replace(/^v(?=\d)/, "");
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
