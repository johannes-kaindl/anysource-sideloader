import { beforeEach, describe, expect, it, vi } from "vitest";

const { render } = vi.hoisted(() => ({ render: vi.fn(async () => {}) }));
vi.mock("obsidian", async (orig) => {
  const m = await orig<typeof import("obsidian")>();
  return {
    ...m,
    MarkdownRenderer: { render },
    Component: class {
      load(): void {}
      unload(): void {}
    },
  };
});

import { App } from "obsidian";
import { ReleaseNotesModal } from "../../src/obsidian/release-notes-modal";

// Release-Notes kommen aus dem Katalog, also von Fremden. Ein ```dataviewjs-Fence im Text
// wuerde von Dataview im Modal AUSGEFUEHRT; deshalb geht der Text neutralisiert zum Renderer.
describe("ReleaseNotesModal — fremder Text wird neutralisiert", () => {
  beforeEach(() => render.mockClear());

  it("uebergibt keinen Fence und kein '<' an den Renderer", () => {
    const modal = new ReleaseNotesModal(new App(), "Notes", [
      { version: "1.0.0", notes: "Fix\n\n```dataviewjs\ndv.paragraph(app.vault.getName())\n```\n\n<script>x</script>" },
    ]);
    modal.onOpen();
    expect(render).toHaveBeenCalledTimes(1);
    const text = String((render.mock.calls[0] as unknown[])[1]);
    expect(text).not.toContain("```");
    expect(text).toContain("ˋˋˋdataviewjs");
    expect(text).not.toContain("<");
    // Die eigene Struktur bleibt: Versions-Ueberschrift.
    expect(text).toMatch(/^## 1\.0\.0/);
  });

  it("bleibt bei 40 000 x '![' schnell (ReDoS, code-kit 0.15.4)", () => {
    const modal = new ReleaseNotesModal(new App(), "Notes", [{ version: "1.0.0", notes: "![".repeat(40_000) }]);
    const t0 = Date.now();
    modal.onOpen();
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
