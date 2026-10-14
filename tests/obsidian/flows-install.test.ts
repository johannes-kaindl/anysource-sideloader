import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmMock = vi.hoisted(() => vi.fn<(app: unknown, opts: { title?: string; message: string | string[]; warning?: boolean }) => Promise<boolean>>());
vi.mock("../../src/vendor/kit-obsidian/confirm", () => ({ confirmAction: confirmMock }));
const sourceMock = vi.hoisted(() => ({ detectForge: vi.fn(), fetchLatestRelease: vi.fn(), fetchPluginFiles: vi.fn() }));
vi.mock("../../src/core/source", async (orig) => ({ ...(await orig<typeof import("../../src/core/source")>()), ...sourceMock }));

import { Notice } from "obsidian";
import { applyUpdate, installFromUrl, type FlowContext } from "../../src/obsidian/flows";
import { loadSettings, type ManagedPlugin, type SideloaderSettings } from "../../src/core/settings";
import { MemorySecretStore } from "../../src/vendor/kit/secrets";
import { sha256Hex } from "../../src/vendor/code-kit/sha256";
import { STRINGS } from "../../src/i18n/strings";
import type { FetchedPlugin } from "../../src/core/source";
import type { RepoRef } from "../../src/core/forge/types";

const HTTPS_REF: RepoRef = { kind: "gitea", baseUrl: "https://git.example.com", owner: "o", repo: "demo" };
const bytes = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

function fetched(version: string, mainJs: string, checksums: FetchedPlugin["checksums"] = "ok"): FetchedPlugin {
  return {
    manifest: { id: "demo", name: "Demo", version },
    files: [{ name: "main.js", data: bytes(mainJs) }, { name: "manifest.json", data: bytes(JSON.stringify({ id: "demo", name: "Demo", version })) }],
    checksums,
    release: { tagName: version, version, notes: "", htmlUrl: "", assets: [] },
  } as FetchedPlugin;
}

function ctxWith(plugins: ManagedPlugin[] = []) {
  const written = new Map<string, ArrayBuffer>();
  const settings: SideloaderSettings = { ...loadSettings({}), plugins, catalogs: [] };
  const saved = vi.fn(async () => {});
  const adapter = {
    mkdir: async () => {}, writeBinary: async (p: string, d: ArrayBuffer) => { written.set(p, d); },
    exists: async () => false, remove: async () => {}, read: async () => "",
  };
  const ctx = {
    app: { vault: { configDir: ".obsidian", adapter }, plugins: { enabledPlugins: new Set<string>() } } as never,
    http: (async () => ({ status: 404, text: "", arrayBuffer: new ArrayBuffer(0) })) as FlowContext["http"],
    settings, saveSettings: saved, secretStore: new MemorySecretStore(),
  } as FlowContext;
  return { ctx, written, settings, saved };
}

const notices = (): Array<{ message: unknown }> => (Notice as unknown as { instances: Array<{ message: unknown }> }).instances;

beforeEach(() => {
  confirmMock.mockReset(); Object.values(sourceMock).forEach((m) => m.mockReset());
  notices().length = 0;
  sourceMock.detectForge.mockResolvedValue(HTTPS_REF);
  sourceMock.fetchLatestRelease.mockResolvedValue({ tagName: "1.0.0", version: "1.0.0", notes: "", htmlUrl: "", assets: [] });
});

describe("installFromUrl — Quellen-Härtung", () => {
  it("Release mit falscher Prüfsumme: Abbruch mit Notice, nichts geschrieben, kein Eintrag", async () => {
    sourceMock.fetchPluginFiles.mockResolvedValue(fetched("1.0.0", "a", "mismatch"));
    const { ctx, written, settings } = ctxWith();
    await installFromUrl(ctx, "https://git.example.com/o/demo");
    expect(notices().map((n) => n.message)).toContain(STRINGS.notices.checksumMismatch);
    expect(written.size).toBe(0);
    expect(settings.plugins).toHaveLength(0);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("Release ohne Prüfsumme: Rückfrage mit Hinweis; nach Nein wird nichts geschrieben", async () => {
    sourceMock.fetchPluginFiles.mockResolvedValue(fetched("1.0.0", "a", "absent"));
    confirmMock.mockResolvedValueOnce(false);
    const { ctx, written, settings } = ctxWith();
    await installFromUrl(ctx, "https://git.example.com/o/demo");
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(confirmMock.mock.calls[0]?.[1].message)).toContain(STRINGS.confirm.checksumAbsent);
    expect(written.size).toBe(0);
    expect(settings.plugins).toHaveLength(0);
  });

  it("Quelle mit http://: eigene Rückfrage VOR dem Laden; nach Nein wird nichts geladen", async () => {
    sourceMock.detectForge.mockResolvedValue({ ...HTTPS_REF, baseUrl: "http://git.example.com" });
    confirmMock.mockResolvedValueOnce(false);
    const { ctx, written } = ctxWith();
    await installFromUrl(ctx, "http://git.example.com/o/demo");
    expect(JSON.stringify(confirmMock.mock.calls[0]?.[1].message)).toContain(STRINGS.confirm.httpSource);
    expect(sourceMock.fetchPluginFiles).not.toHaveBeenCalled();
    expect(written.size).toBe(0);
  });

  it("die erste Installation merkt Version und SHA-256 der main.js als Pin", async () => {
    sourceMock.fetchPluginFiles.mockResolvedValue(fetched("1.0.0", "code-1"));
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);   // Install ja, Aktivieren später
    const { ctx, settings } = ctxWith();
    await installFromUrl(ctx, "https://git.example.com/o/demo");
    expect(settings.plugins[0]?.pin).toEqual({ version: "1.0.0", mainSha256: sha256Hex(new TextEncoder().encode("code-1")) });
  });

  it("dieselbe Version mit anderen Bytes: eigene Warnung; nach Nein bleibt der Pin und nichts wird geschrieben", async () => {
    const pin = { version: "1.0.0", mainSha256: sha256Hex(new TextEncoder().encode("code-1")) };
    const known: ManagedPlugin = { id: "demo", repoUrl: "u", ref: HTTPS_REF, installedVersion: "1.0.0", availableVersion: null, addedFrom: "url", pin };
    sourceMock.fetchPluginFiles.mockResolvedValue(fetched("1.0.0", "code-AUSGETAUSCHT"));
    confirmMock.mockResolvedValueOnce(false);
    const { ctx, written, settings } = ctxWith([known]);
    await installFromUrl(ctx, "https://git.example.com/o/demo");
    expect(confirmMock.mock.calls[0]?.[1]).toMatchObject({ title: STRINGS.confirm.releaseChangedTitle("demo", "1.0.0"), warning: true });
    expect(written.size).toBe(0);
    expect(settings.plugins[0]?.pin).toEqual(pin);
  });

  it("eine ID in anderer Schreibweise ist dasselbe Plugin (APFS/NTFS): der Pin des Eintrags greift", async () => {
    const pin = { version: "1.0.0", mainSha256: sha256Hex(new TextEncoder().encode("code-1")) };
    const known: ManagedPlugin = { id: "demo", repoUrl: "u", ref: HTTPS_REF, installedVersion: "1.0.0", availableVersion: null, addedFrom: "url", pin };
    const f = fetched("1.0.0", "code-AUSGETAUSCHT");
    f.manifest = { ...f.manifest, id: "Demo" };
    sourceMock.fetchPluginFiles.mockResolvedValue(f);
    confirmMock.mockResolvedValueOnce(false);
    const { ctx, settings } = ctxWith([known]);
    await installFromUrl(ctx, "https://git.example.com/o/demo");
    expect(confirmMock.mock.calls[0]?.[1].title).toBe(STRINGS.confirm.releaseChangedTitle("Demo", "1.0.0"));
    expect(settings.plugins).toHaveLength(1);
  });

  it("dieselbe Version mit denselben Bytes fragt nicht zusätzlich", async () => {
    const pin = { version: "1.0.0", mainSha256: sha256Hex(new TextEncoder().encode("code-1")) };
    const known: ManagedPlugin = { id: "demo", repoUrl: "u", ref: HTTPS_REF, installedVersion: "1.0.0", availableVersion: null, addedFrom: "url", pin };
    sourceMock.fetchPluginFiles.mockResolvedValue(fetched("1.0.0", "code-1"));
    confirmMock.mockResolvedValue(false);
    const { ctx } = ctxWith([known]);
    await installFromUrl(ctx, "https://git.example.com/o/demo");
    const titles = confirmMock.mock.calls.map((c) => c[1].title);
    expect(titles).not.toContain(STRINGS.confirm.releaseChangedTitle("demo", "1.0.0"));
  });
});

describe("applyUpdate — Pin", () => {
  it("ein Update auf eine neuere Version setzt den Pin neu, ohne Zusatzwarnung", async () => {
    const known: ManagedPlugin = { id: "demo", repoUrl: "u", ref: HTTPS_REF, installedVersion: "1.0.0", availableVersion: "1.1.0", addedFrom: "url", pin: { version: "1.0.0", mainSha256: sha256Hex(new TextEncoder().encode("code-1")) } };
    sourceMock.fetchLatestRelease.mockResolvedValue({ tagName: "1.1.0", version: "1.1.0", notes: "", htmlUrl: "", assets: [] });
    sourceMock.fetchPluginFiles.mockResolvedValue(fetched("1.1.0", "code-2"));
    confirmMock.mockResolvedValue(true);
    const { ctx, settings } = ctxWith([known]);
    await applyUpdate(ctx, "demo");
    expect(confirmMock.mock.calls.map((c) => c[1].title)).not.toContain(STRINGS.confirm.releaseChangedTitle("demo", "1.1.0"));
    expect(settings.plugins[0]?.pin).toEqual({ version: "1.1.0", mainSha256: sha256Hex(new TextEncoder().encode("code-2")) });
    expect(settings.plugins[0]?.installedVersion).toBe("1.1.0");
  });

  it("ein Release, das die ID nur in der Schreibweise ändert, wird wie ein ID-Wechsel abgelehnt (Guard vergleicht genau)", async () => {
    const known: ManagedPlugin = { id: "demo", repoUrl: "u", ref: HTTPS_REF, installedVersion: "1.0.0", availableVersion: "1.1.0", addedFrom: "url" };
    const f = fetched("1.1.0", "code-2");
    f.manifest = { ...f.manifest, id: "Demo" };
    sourceMock.fetchPluginFiles.mockResolvedValue(f);
    const { ctx, written, settings } = ctxWith([known]);
    await applyUpdate(ctx, "demo");
    expect(notices().map((n) => n.message)).toContain(STRINGS.confirm.idChanged("demo", "Demo"));
    expect(written.size).toBe(0);
    expect(settings.plugins[0]?.installedVersion).toBe("1.0.0");
  });

  it("die Warnung zum ausgetauschten Release beschriftet ihren Knopf nach der Aktion (Update, nicht Install)", async () => {
    const pin = { version: "1.1.0", mainSha256: sha256Hex(new TextEncoder().encode("code-1")) };
    const known: ManagedPlugin = { id: "demo", repoUrl: "u", ref: HTTPS_REF, installedVersion: "1.0.0", availableVersion: "1.1.0", addedFrom: "url", pin };
    sourceMock.fetchLatestRelease.mockResolvedValue({ tagName: "1.1.0", version: "1.1.0", notes: "", htmlUrl: "", assets: [] });
    sourceMock.fetchPluginFiles.mockResolvedValue(fetched("1.1.0", "anders"));
    confirmMock.mockResolvedValueOnce(false);
    const { ctx } = ctxWith([known]);
    await applyUpdate(ctx, "demo");
    expect(confirmMock.mock.calls[0]?.[1]).toMatchObject({ confirmLabel: STRINGS.confirm.update, warning: true });
  });
});
