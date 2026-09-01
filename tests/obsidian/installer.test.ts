import { describe, expect, it } from "vitest";
import { readInstalledManifest, removePlugin, writePluginFiles } from "../../src/obsidian/installer";
import type { VaultFilePort } from "../../src/obsidian/installer";

function memPort(): VaultFilePort & { files: Map<string, ArrayBuffer>; dirs: Set<string> } {
  const files = new Map<string, ArrayBuffer>(); const dirs = new Set<string>();
  return {
    files, dirs,
    async mkdir(d) { dirs.add(d); },
    async writeBinary(p, data) { files.set(p, data); },
    async exists(p) { return files.has(p) || dirs.has(p); },
    async remove(p) { files.delete(p); dirs.delete(p); },
    async readText(p) { const b = files.get(p); return b ? new TextDecoder().decode(b) : null; },
  };
}
const FETCHED = {
  manifest: { id: "demo", name: "Demo", version: "1.0.0" },
  files: [
    { name: "main.js", data: new TextEncoder().encode("x").buffer as ArrayBuffer },
    { name: "manifest.json", data: new TextEncoder().encode('{"id":"demo","name":"Demo","version":"1.0.0"}').buffer as ArrayBuffer },
  ],
  checksums: "absent" as const,
  release: { tagName: "1.0.0", version: "1.0.0", notes: "", htmlUrl: "", assets: [] },
};

describe("installer", () => {
  it("writePluginFiles legt Ordner an und schreibt alle Dateien unter configDir", async () => {
    const port = memPort();
    const dir = await writePluginFiles(port, ".obsidian", FETCHED);
    expect(dir).toBe(".obsidian/plugins/demo");
    expect(port.dirs.has(".obsidian/plugins/demo")).toBe(true);
    expect([...port.files.keys()].sort()).toEqual([".obsidian/plugins/demo/main.js", ".obsidian/plugins/demo/manifest.json"]);
  });

  it("readInstalledManifest liest zurueck, null wenn fehlt", async () => {
    const port = memPort();
    await writePluginFiles(port, ".obsidian", FETCHED);
    expect((await readInstalledManifest(port, ".obsidian", "demo"))?.version).toBe("1.0.0");
    expect(await readInstalledManifest(port, ".obsidian", "fehlt")).toBeNull();
  });

  it("removePlugin entfernt die drei bekannten Dateien + den Ordner", async () => {
    const port = memPort();
    await writePluginFiles(port, ".obsidian", FETCHED);
    await removePlugin(port, ".obsidian", "demo");
    expect(port.files.size).toBe(0);
  });

  it("removePlugin loescht data.json NICHT (Nutzdaten bleiben)", async () => {
    const port = memPort();
    await writePluginFiles(port, ".obsidian", FETCHED);
    await port.writeBinary(".obsidian/plugins/demo/data.json", new TextEncoder().encode("{}").buffer as ArrayBuffer);
    await removePlugin(port, ".obsidian", "demo");
    expect(port.files.has(".obsidian/plugins/demo/data.json")).toBe(true);
  });

  it("writePluginFiles verweigert das Schreiben bei checksums === \"mismatch\"", async () => {
    const port = memPort();
    const mismatched = { ...FETCHED, checksums: "mismatch" as const };
    await expect(writePluginFiles(port, ".obsidian", mismatched)).rejects.toThrow(/checksum/i);
    expect(port.files.size).toBe(0);
    expect(port.dirs.size).toBe(0);
  });

  it("writePluginFiles verweigert Dateien ausserhalb der Code-Allowlist (M11)", async () => {
    const port = memPort();
    const smuggled = {
      ...FETCHED,
      files: [...FETCHED.files, { name: "../../evil.js", data: new TextEncoder().encode("x").buffer as ArrayBuffer }],
    };
    await expect(writePluginFiles(port, ".obsidian", smuggled)).rejects.toThrow(/evil\.js/);
  });
});
