import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import { STRINGS } from "../i18n/strings";

export interface ReleaseNoteEntry {
  version: string;
  notes: string;
}

/** Baut EIN Markdown-Dokument aus mehreren Releases — neueste zuerst, je eine
 *  Versions-Ueberschrift (Quicktask 2026-09-12: das Update-Notes-Modal zeigte bisher nur
 *  das zuletzt gefetchte Release, nicht das ganze Versions-Delta seit der installierten
 *  Version). Reihenfolge kommt vom Aufrufer (`releasesSince`) — reine Zusammensetzung,
 *  keine eigene Sortierung. Eine leere Liste ergibt einen leeren String, damit der
 *  Empty-State (kein Release im Delta) am Aufrufer haengt, nicht doppelt hier. */
export function buildReleaseNotesMarkdown(releases: ReadonlyArray<ReleaseNoteEntry>): string {
  return releases.map((r) => `## ${r.version}\n\n${r.notes.trim()}`).join("\n\n---\n\n");
}

/** Zeigt die Release-Notes eines Plugins als gerendertes Markdown, ueber ALLE Releases
 *  des Versions-Deltas seit der installierten Version. Ein eigener `Component` traegt die
 *  Markdown-Postprozessoren (Links, eingebettete Bilder etc.) und wird mit dem Modal
 *  geladen/entladen — ohne ihn liefe `MarkdownRenderer.render` gegen ein bereits totes
 *  Lebenszyklus-Objekt, sobald das Modal schliesst. */
export class ReleaseNotesModal extends Modal {
  private readonly component = new Component();

  constructor(
    app: App,
    private readonly title: string,
    private readonly releases: ReadonlyArray<ReleaseNoteEntry>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this.component.load();
    if (this.releases.length === 0) {
      this.contentEl.createEl("p", { cls: "asl-release-notes-empty", text: STRINGS.releaseNotes.empty });
      return;
    }
    const markdown = buildReleaseNotesMarkdown(this.releases);
    void MarkdownRenderer.render(this.app, markdown, this.contentEl, "", this.component);
  }

  onClose(): void {
    this.component.unload();
    this.contentEl.empty();
  }
}
