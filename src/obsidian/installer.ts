import type { App } from "obsidian";
import { parsePluginManifest, pluginDir, type PluginManifestData } from "../core/install";
import type { FetchedPlugin } from "../core/source";

/** Schmaler Port ueber `app.vault.adapter` — testbar mit einem In-Memory-Fake, ohne echtes
 *  Obsidian. Die Methoden bilden genau den Ausschnitt der `DataAdapter`-API ab, den dieses
 *  Modul braucht. */
export interface VaultFilePort {
  mkdir(dir: string): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  readText(path: string): Promise<string | null>;
}

export function adapterFilePort(app: App): VaultFilePort {
  const adapter = app.vault.adapter;
  return {
    mkdir: (dir) => adapter.mkdir(dir),
    writeBinary: (path, data) => adapter.writeBinary(path, data),
    exists: (path) => adapter.exists(path),
    remove: (path) => adapter.remove(path),
    async readText(path) {
      if (!(await adapter.exists(path))) return null;
      return adapter.read(path);
    },
  };
}

/** Die drei Code-Dateien, die ein Sideload schreibt/entfernt. `data.json` (Nutzerdaten)
 *  gehoert bewusst NICHT dazu — die bleiben bei einer Deinstallation erhalten. */
const CODE_FILES = ["main.js", "manifest.json", "styles.css"];

export async function writePluginFiles(
  port: VaultFilePort,
  configDir: string,
  fetched: FetchedPlugin,
): Promise<string> {
  // Durchsetzung aus Task 8: "mismatch" heisst, die Bytes in `fetched.files` sind NICHT
  // geprueft vertrauenswuerdig — hier wird verweigert, statt sie auf Platte zu schreiben.
  if (fetched.checksums === "mismatch") {
    throw new Error(
      `Checksum-Verifikation fehlgeschlagen fuer ${fetched.manifest.id}: geladene Dateien werden nicht geschrieben`,
    );
  }
  const dir = pluginDir(configDir, fetched.manifest.id);
  await port.mkdir(dir);
  for (const file of fetched.files) {
    await port.writeBinary(`${dir}/${file.name}`, file.data);
  }
  return dir;
}

export async function readInstalledManifest(
  port: VaultFilePort,
  configDir: string,
  id: string,
): Promise<PluginManifestData | null> {
  const dir = pluginDir(configDir, id);
  const text = await port.readText(`${dir}/manifest.json`);
  if (text === null) return null;
  return parsePluginManifest(text);
}

export async function removePlugin(port: VaultFilePort, configDir: string, id: string): Promise<void> {
  const dir = pluginDir(configDir, id);
  for (const name of CODE_FILES) {
    const path = `${dir}/${name}`;
    if (await port.exists(path)) await port.remove(path);
  }
  // Ordner nur entfernen, wenn er jetzt leer ist (z.B. data.json bleibt liegen).
  const remaining = await Promise.all(
    ["data.json"].map((name) => port.exists(`${dir}/${name}`)),
  );
  if (!remaining.some(Boolean)) await port.remove(dir);
}

// `app.plugins` ist nicht in `obsidian.d.ts` deklariert — Zugriff ueber ein schmales lokales
// Interface, bewusst as-any (BRAT-erprobte, undokumentierte API). Vor jedem Aufruf ein
// `typeof === "function"`-Feature-Check (REGISTRY-Regel „Form pruefen, nicht Existenz").
interface PluginManager {
  enabledPlugins: Set<string>;
  enablePluginAndSave(id: string): Promise<void>;
  disablePlugin(id: string): Promise<void>;
  enablePlugin(id: string): Promise<void>;
  loadManifests(): Promise<void>;
}

function pluginManager(app: App): PluginManager | null {
  const manager = (app as unknown as { plugins?: PluginManager }).plugins;
  return manager && typeof manager === "object" ? manager : null;
}

export async function reloadIfEnabled(app: App, id: string): Promise<void> {
  const manager = pluginManager(app);
  if (!manager) return;
  const isEnabled = manager.enabledPlugins instanceof Set && manager.enabledPlugins.has(id);
  if (!isEnabled) return;
  if (typeof manager.loadManifests === "function") await manager.loadManifests();
  if (typeof manager.disablePlugin === "function") await manager.disablePlugin(id);
  if (typeof manager.enablePlugin === "function") await manager.enablePlugin(id);
}

export async function enablePlugin(app: App, id: string): Promise<void> {
  const manager = pluginManager(app);
  if (!manager) return;
  if (typeof manager.enablePluginAndSave === "function") await manager.enablePluginAndSave(id);
}
