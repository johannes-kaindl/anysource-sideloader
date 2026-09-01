import { describe, expect, it } from "vitest";
import { catalogEntryState } from "../../src/core/catalog-match";
import type { CatalogEntry } from "../../src/core/catalog";
import type { ManagedPlugin } from "../../src/core/settings";

const eintrag: CatalogEntry = {
  id: "demo",
  name: "Demo",
  description: "",
  repo: "https://git.example.com/owner/demo",
  author: "someone",
  tags: [],
};

function verwaltet(over: Partial<ManagedPlugin> = {}): ManagedPlugin {
  return {
    id: "demo",
    repoUrl: "https://git.example.com/owner/demo",
    ref: { kind: "gitea", baseUrl: "https://git.example.com", owner: "owner", repo: "demo" },
    installedVersion: "1.0.0",
    availableVersion: null,
    addedFrom: "catalog",
    ...over,
  };
}

describe("catalogEntryState", () => {
  it("nicht installiert: der Katalog-Eintrag ist ein Angebot", () => {
    expect(catalogEntryState(eintrag, null, [])).toEqual({ kind: "not-installed" });
  });

  it("installiert, aber niemandem zugeordnet: uebernehmbar", () => {
    // Der Fall, der das Plugin blind machte: im Vault liegt es, in `settings.plugins`
    // steht es nicht — und ein Update-Lauf ueber `settings.plugins` findet es deshalb nie.
    expect(catalogEntryState(eintrag, "1.0.0", [])).toEqual({
      kind: "unmanaged",
      installedVersion: "1.0.0",
    });
  });

  it("verwaltet und aktuell", () => {
    expect(catalogEntryState(eintrag, "1.0.0", [verwaltet()])).toEqual({
      kind: "managed",
      installedVersion: "1.0.0",
      availableVersion: null,
    });
  });

  it("verwaltet mit bekanntem Rueckstand", () => {
    expect(catalogEntryState(eintrag, "1.0.0", [verwaltet({ availableVersion: "1.1.0" })])).toEqual({
      kind: "managed",
      installedVersion: "1.0.0",
      availableVersion: "1.1.0",
    });
  });

  it("die Version kommt von der PLATTE, nicht aus den Einstellungen", () => {
    // Beide koennen auseinanderlaufen: ein Update ausserhalb des Sideloaders (Store,
    // BRAT, von Hand) aendert das Manifest, nicht `settings.plugins`. Angezeigt gehoert,
    // was wirklich installiert ist.
    const s = catalogEntryState(eintrag, "2.0.0", [verwaltet({ installedVersion: "1.0.0" })]);
    expect(s).toEqual({ kind: "managed", installedVersion: "2.0.0", availableVersion: null });
  });

  it("gleiche id, ANDERE Quelle: dieser Eintrag gilt nicht als verwaltet", () => {
    // Sonst behauptete der Katalog, ein Plugin von hier zu verwalten, dessen Updates in
    // Wahrheit von einer fremden Forge kaemen — und der Nutzer bekaeme beim Update
    // stillschweigend fremden Code.
    const fremd = verwaltet({ repoUrl: "https://andere.example.com/owner/demo" });
    fremd.ref = { kind: "gitea", baseUrl: "https://andere.example.com", owner: "owner", repo: "demo" };
    expect(catalogEntryState(eintrag, "1.0.0", [fremd])).toEqual({
      kind: "unmanaged",
      installedVersion: "1.0.0",
    });
  });

  it("Grossschreibung in der Quelle trennt nicht", () => {
    const gross = verwaltet({ repoUrl: "https://GIT.example.com/Owner/Demo" });
    gross.ref = { kind: "gitea", baseUrl: "https://GIT.example.com", owner: "Owner", repo: "Demo" };
    expect(catalogEntryState(eintrag, "1.0.0", [gross]).kind).toBe("managed");
  });
});
