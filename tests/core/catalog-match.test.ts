import { describe, expect, it } from "vitest";
import { filterCatalogEntries, matchInstalledPlugin } from "../../src/core/catalog-match";
import type { CatalogEntry } from "../../src/core/catalog";
import type { ManagedPlugin } from "../../src/core/settings";

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: "sample",
    name: "Sample Plugin",
    description: "Does sample things",
    repo: "https://git.example.com/acme/sample",
    author: "Acme",
    tags: ["utility", "sample"],
    ...overrides,
  };
}

function managed(overrides: Partial<ManagedPlugin> = {}): ManagedPlugin {
  return {
    id: "sample",
    repoUrl: "https://git.example.com/acme/sample",
    ref: { kind: "gitea", baseUrl: "https://git.example.com", owner: "acme", repo: "sample" },
    installedVersion: "1.0.0",
    availableVersion: null,
    addedFrom: "url",
    ...overrides,
  };
}

describe("matchInstalledPlugin", () => {
  it("findet ein installiertes Plugin ueber Host/Owner/Repo, case-insensitiv", () => {
    const plugins = [managed()];
    const found = matchInstalledPlugin(plugins, "HTTPS://GIT.EXAMPLE.COM/ACME/sample");
    expect(found?.id).toBe("sample");
  });

  it("liefert undefined ohne Treffer", () => {
    expect(matchInstalledPlugin([managed()], "https://git.example.com/acme/other")).toBeUndefined();
  });

  it("liefert undefined bei nicht parsbarer URL", () => {
    expect(matchInstalledPlugin([managed()], "not-a-url")).toBeUndefined();
  });
});

describe("filterCatalogEntries", () => {
  const entries = [
    entry({ id: "a", name: "Alpha", description: "first one", tags: ["foo"] }),
    entry({ id: "b", name: "Beta", description: "second one", tags: ["bar", "baz"] }),
  ];

  it("liefert alles bei leerer Anfrage", () => {
    expect(filterCatalogEntries(entries, "")).toHaveLength(2);
  });

  it("filtert ueber den Namen", () => {
    expect(filterCatalogEntries(entries, "alpha").map((e) => e.id)).toEqual(["a"]);
  });

  it("filtert ueber die Beschreibung", () => {
    expect(filterCatalogEntries(entries, "second").map((e) => e.id)).toEqual(["b"]);
  });

  it("filtert ueber Tags, case-insensitiv", () => {
    expect(filterCatalogEntries(entries, "BAZ").map((e) => e.id)).toEqual(["b"]);
  });

  it("liefert leere Liste ohne Treffer", () => {
    expect(filterCatalogEntries(entries, "nope")).toEqual([]);
  });
});
