import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notice, Setting } from "obsidian";

const confirmMock = vi.hoisted(() => vi.fn<(app: unknown, opts: { title?: string; message: string | string[]; warning?: boolean }) => Promise<boolean>>());
vi.mock("../../src/vendor/kit-obsidian/confirm", () => ({ confirmAction: confirmMock }));

import { SideloaderSettingTab, type SettingsHost } from "../../src/obsidian/settings-tab";
import { reportFlowError } from "../../src/obsidian/flows";
import { DEFAULT_SETTINGS, type SideloaderSettings } from "../../src/core/settings";
import { MemorySecretStore } from "../../src/vendor/kit/secrets";
import { STRINGS } from "../../src/i18n/strings";

function tabFor(settings: Partial<SideloaderSettings>): { tab: SideloaderSettingTab; settings: SideloaderSettings; saved: ReturnType<typeof vi.fn> } {
  const merged: SideloaderSettings = { ...DEFAULT_SETTINGS, plugins: [], catalogs: [], hostSecrets: {}, ...settings };
  const saved = vi.fn(async () => {});
  const host = { settings: merged, secretStore: new MemorySecretStore(), saveSettings: saved } as unknown as SettingsHost;
  return { tab: new SideloaderSettingTab({} as never, host), settings: merged, saved };
}

/** Klickt den Mülleimer der Zeile `index` der Gruppe `heading` (Zeile 0 ist die Beschreibung). */
function clickRemove(tab: SideloaderSettingTab, heading: string, index: number): void {
  const group = (tab.getSettingDefinitions() as unknown as Array<{ heading?: string; items?: Array<{ render?: (s: Setting) => void }> }>).find((g) => g.heading === heading);
  const setting = new Setting(undefined as never);
  group?.items?.[index]?.render?.(setting);
  const btn = (setting as unknown as { components: Array<{ clickCB?: () => void; onClickCB?: () => void; icon?: string }> }).components.find((c) => (c.clickCB ?? c.onClickCB) !== undefined);
  (btn?.clickCB ?? btn?.onClickCB)?.();
}

describe("Entfernen von Katalog und Token-Host fragt nach", () => {
  beforeEach(() => { confirmMock.mockReset(); });

  it("Katalog: nach Nein bleibt er, nach Ja ist er weg und gespeichert", async () => {
    const { tab, settings, saved } = tabFor({ catalogs: ["https://a/c.json"] });
    confirmMock.mockResolvedValueOnce(false);
    clickRemove(tab, "Catalogs", 1);
    await vi.waitFor(() => { expect(confirmMock).toHaveBeenCalledTimes(1); });
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.catalogs).toEqual(["https://a/c.json"]);
    expect(saved).not.toHaveBeenCalled();
    expect(confirmMock.mock.calls[0]?.[1]).toMatchObject({ title: STRINGS.confirm.removeCatalogTitle, warning: true });

    confirmMock.mockResolvedValueOnce(true);
    clickRemove(tab, "Catalogs", 1);
    await vi.waitFor(() => { expect(settings.catalogs).toEqual([]); });
    expect(saved).toHaveBeenCalled();
  });

  it("Token-Host: nach Nein bleibt der Eintrag, nach Ja ist er weg", async () => {
    const { tab, settings } = tabFor({ hostSecrets: { "git.example.com": "id-1" } });
    confirmMock.mockResolvedValueOnce(false);
    clickRemove(tab, "Access tokens", 1);
    await vi.waitFor(() => { expect(confirmMock).toHaveBeenCalledTimes(1); });
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.hostSecrets).toEqual({ "git.example.com": "id-1" });
    expect(confirmMock.mock.calls[0]?.[1]).toMatchObject({ title: STRINGS.confirm.removeHostTitle("git.example.com") });

    confirmMock.mockResolvedValueOnce(true);
    clickRemove(tab, "Access tokens", 1);
    await vi.waitFor(() => { expect(settings.hostSecrets).toEqual({}); });
  });
});

describe("reportFlowError", () => {
  it("zeigt die Fehlermeldung eines Ablaufs als Notice", () => {
    const notices = (Notice as unknown as { instances: Array<{ message: unknown }> }).instances;   // der Mock zeichnet sie auf
    notices.length = 0;
    reportFlowError(new Error("Download fehlgeschlagen: HTTP 404"));
    reportFlowError("roh");
    expect(notices.map((n) => n.message)).toEqual([STRINGS.notices.actionFailed("Download fehlgeschlagen: HTTP 404"), STRINGS.notices.actionFailed("roh")]);
  });
});
