import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import { STRINGS } from "../i18n/strings";

/** Zeigt die Release-Notes eines Plugins als gerendertes Markdown. Ein eigener
 *  `Component` traegt die Markdown-Postprozessoren (Links, eingebettete Bilder etc.) und
 *  wird mit dem Modal geladen/entladen — ohne ihn liefe `MarkdownRenderer.render` gegen
 *  ein bereits totes Lebenszyklus-Objekt, sobald das Modal schliesst. */
export class ReleaseNotesModal extends Modal {
  private readonly component = new Component();

  constructor(
    app: App,
    private readonly title: string,
    private readonly notes: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this.component.load();
    const notes = this.notes.trim();
    if (notes === "") {
      this.contentEl.createEl("p", { cls: "asl-release-notes-empty", text: STRINGS.releaseNotes.empty });
      return;
    }
    void MarkdownRenderer.render(this.app, notes, this.contentEl, "", this.component);
  }

  onClose(): void {
    this.component.unload();
    this.contentEl.empty();
  }
}
