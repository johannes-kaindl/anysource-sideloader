import { describe, expect, it } from "vitest";
import { buildReleaseNotesMarkdown } from "../../src/obsidian/release-notes-modal";

describe("buildReleaseNotesMarkdown — Darstellung des Versions-Deltas", () => {
  it("baut je Release eine Ueberschrift mit Versionsnummer, in der uebergebenen Reihenfolge", () => {
    const md = buildReleaseNotesMarkdown([
      { version: "0.5.0", notes: "Neu in 0.5.0" },
      { version: "0.4.1", notes: "Fix in 0.4.1" },
    ]);
    const posV5 = md.indexOf("0.5.0");
    const posV4 = md.indexOf("0.4.1");
    expect(posV5).toBeGreaterThanOrEqual(0);
    expect(posV4).toBeGreaterThan(posV5);
    expect(md).toContain("Neu in 0.5.0");
    expect(md).toContain("Fix in 0.4.1");
    expect(md).toMatch(/^## 0\.5\.0/);
  });

  it("ein Release ohne eigene Notes zeigt trotzdem seine Versions-Ueberschrift", () => {
    const md = buildReleaseNotesMarkdown([{ version: "0.5.0", notes: "" }]);
    expect(md).toContain("## 0.5.0");
  });

  it("leere Liste ergibt leeren String", () => {
    expect(buildReleaseNotesMarkdown([])).toBe("");
  });
});
