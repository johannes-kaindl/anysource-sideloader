import { App, ButtonComponent, Modal, Setting } from "obsidian";
import { STRINGS } from "../i18n/strings";

/** Task C1: "Install from URL" war dokumentiert, hatte aber keine UI — dieses Modal ist
 *  die fehlende Bedienung. Ein einzelnes Textfeld (Enter oder Button-Klick loesen
 *  denselben Submit aus) reicht die getrimmte URL an `onSubmit` durch; die Flow-Logik
 *  selbst (Forge-Erkennung, Confirms, Schreiben) bleibt vollstaendig in `flows.ts`
 *  (`installFromUrl`) — dieses Modul zeichnet nur DOM, wie `ReleaseNotesModal` daneben. */
export class InstallUrlModal extends Modal {
  private value = "";

  constructor(
    app: App,
    private readonly onSubmit: (url: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(STRINGS.installUrl.title);

    new Setting(this.contentEl).addText((text) => {
      text.setPlaceholder(STRINGS.installUrl.placeholder).onChange((v) => {
        this.value = v;
      });
      text.inputEl.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });

    const btns = this.contentEl.createDiv({ cls: "modal-button-container" });
    new ButtonComponent(btns).setButtonText(STRINGS.installUrl.submit).setCta().onClick(() => {
      this.submit();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private submit(): void {
    const trimmed = this.value.trim();
    if (!trimmed) return;
    this.close();
    this.onSubmit(trimmed);
  }
}
