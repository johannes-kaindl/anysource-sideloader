import { sha256Hex } from "../vendor/code-kit/sha256";

const ID_RE = /^[a-z0-9][a-z0-9\-_]{0,63}$/;

export interface PluginManifestData { id: string; name: string; version: string; minAppVersion?: string; }

export function isValidPluginId(id: string): boolean { return ID_RE.test(id); }

export function parsePluginManifest(jsonText: string): PluginManifestData {
  const m = JSON.parse(jsonText) as { id?: unknown; name?: unknown; version?: unknown; minAppVersion?: unknown };
  if (typeof m.id !== "string" || !isValidPluginId(m.id)) throw new Error(`Manifest ohne gueltige id`);
  if (typeof m.name !== "string" || typeof m.version !== "string") throw new Error("Manifest ohne name/version");
  return { id: m.id, name: m.name, version: m.version,
    minAppVersion: typeof m.minAppVersion === "string" ? m.minAppVersion : undefined };
}

export function pluginDir(configDir: string, id: string): string {
  if (!isValidPluginId(id)) throw new Error(`ungueltige Plugin-id: ${id}`);
  return `${configDir}/plugins/${id}`;
}

export function parseChecksums(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim());
    if (m?.[1] && m[2]) map.set(m[2], m[1]);
  }
  return map;
}

export type ChecksumVerdict = "ok" | "mismatch" | "absent";

export function verifyChecksum(checksums: Map<string, string> | null, name: string, data: Uint8Array): ChecksumVerdict {
  const expected = checksums?.get(name);
  if (!expected) return "absent";
  return sha256Hex(data) === expected ? "ok" : "mismatch";
}
