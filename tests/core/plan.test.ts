import { describe, expect, it } from "vitest";
import { fasseFehlerZusammen, planUpdates, releasesSince } from "../../src/core/plan";
import type { ReleaseInfo } from "../../src/core/forge/types";

describe("planUpdates", () => {
  it("filtert auf echte Updates", () => {
    const mk = (id: string, v: string) => ({
      id,
      repoUrl: "u",
      installedVersion: v,
      availableVersion: null,
      addedFrom: "url" as const,
      ref: { kind: "gitea" as const, baseUrl: "b", owner: "o", repo: id },
    });
    const latest = new Map([
      ["a", { tagName: "2.0.0", version: "2.0.0", notes: "## Neu", htmlUrl: "", assets: [] }],
      ["b", { tagName: "1.0.0", version: "1.0.0", notes: "", htmlUrl: "", assets: [] }],
    ]);
    const plan = planUpdates([mk("a", "1.0.0"), mk("b", "1.0.0"), mk("c", "1.0.0")], latest);
    expect(plan).toEqual([{ id: "a", installed: "1.0.0", available: "2.0.0", notes: "## Neu" }]);
  });

  it("liefert leere Liste ohne Treffer in der Map", () => {
    const plugin = {
      id: "x",
      repoUrl: "u",
      installedVersion: "1.0.0",
      availableVersion: null,
      addedFrom: "url" as const,
      ref: { kind: "gitea" as const, baseUrl: "b", owner: "o", repo: "x" },
    };
    expect(planUpdates([plugin], new Map())).toEqual([]);
  });
});

describe("releasesSince", () => {
  const mk = (version: string, notes: string): ReleaseInfo => ({
    tagName: version, version, notes, htmlUrl: "", assets: [],
  });

  it("filtert auf Releases NEUER als installed und sortiert neueste zuerst", () => {
    const releases = [mk("0.4.0", "a"), mk("0.5.0", "c"), mk("0.4.1", "b"), mk("0.3.1", "alt")];
    expect(releasesSince("0.3.1", releases)).toEqual([mk("0.5.0", "c"), mk("0.4.1", "b"), mk("0.4.0", "a")]);
  });

  it("installed selbst und aeltere Versionen bleiben aussen vor", () => {
    expect(releasesSince("1.0.0", [mk("1.0.0", "x"), mk("0.9.0", "y")])).toEqual([]);
  });

  it("leere Liste bleibt leer", () => {
    expect(releasesSince("1.0.0", [])).toEqual([]);
  });
});

describe("fasseFehlerZusammen", () => {
  it("ohne Fehler keine Meldung", () => {
    expect(fasseFehlerZusammen([])).toBeNull();
  });

  it("ein Fehler bleibt einzeln — dort ist die id die nuetzlichste Information", () => {
    expect(fasseFehlerZusammen([{ id: "a", message: "HTTP 500" }])).toBe(
      'Update check for "a" failed: HTTP 500',
    );
  });

  it("viele Fehler werden EINE Zeile — sonst stapeln sich bei einem Forge-Ausfall zwanzig Notices", () => {
    const zwanzig = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, message: "ECONNREFUSED" }));
    const text = fasseFehlerZusammen(zwanzig);
    expect(text).toBe('20 update checks failed (first: "p0" — ECONNREFUSED)');
    expect(text?.split("\n")).toHaveLength(1);
  });
});
