/**
 * GUI-Smoke-Treiber — fährt die Checkliste aus `docs/SMOKE.md` gegen ein **laufendes**
 * Obsidian statt von Hand (CORE-TEST-02 b).
 *
 * Was er prüft, das die vitest-Suite strukturell nicht kann: den echten `requestUrl`-
 * Transport (Redirects, Header-Weitergabe), echtes Modal- und Hub-DOM, echte Mausklicks,
 * den echten Schreibweg nach `.obsidian/plugins/`, den echten Plugin-Lebenszyklus.
 *
 * ## Die Gegenstelle ist lokal
 *
 * `scripts/forge-server.ts` startet drei HTTP-Server auf 127.0.0.1 (Gitea-artige Forge,
 * ein Host ohne API für den Raw-Pfad, ein fremder Host für den Cross-Host-Redirect). Der
 * Lauf braucht damit **kein Netz und kein Token** — und kann zwei Dinge herstellen, die
 * an einer echten Forge nicht herstellbar sind: einen 303 auf dem Raw-Pfad und einen
 * Redirect über eine Host-Grenze. Beides sind die Pflicht-Messpunkte aus dem
 * Final-Review (Abschnitt F).
 *
 * Abschnitt `L` fährt zusätzlich gegen die echte Forge und ist der einzige netzabhängige
 * Teil; ohne Netz meldet er `übersprungen`, nicht rot.
 *
 * ## Voraussetzung
 *
 * ⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
 * `quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und
 * zerstört deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht
 * woanders und fällt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
 * curl -s http://127.0.0.1:9222/json/list | python3 -c "import json,sys; [print(' ·', t.get('title')) for t in json.load(sys.stdin) if t.get('type')=='page']"
 * ```
 *
 * Die zweite Zeile beantwortet, wen ein Quit träfe — der CDP-Lock beantwortet das
 * **nicht** (er ist frei, solange niemand gerade misst, auch bei sechs offenen Vaults).
 * Vor dem Lauf trotzdem den Lock nehmen, er ist die Eintrittskarte:
 *
 * ```bash
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label anysource-sideloader \
 *   --intent "GUI-Smoke" --exclusive focus
 * ```
 *
 * Hört der Port schon und ist der Staging-Vault Obsidian bekannt, dann **mitnutzen statt
 * neu starten**: `open "obsidian://open?vault=anysource-sideloader"` öffnet ein zusätzliches
 * Fenster derselben Instanz, `--vault` wählt es aus.
 *
 * ```bash
 * npm run build
 * npm run smoke:gui -- --setup      # baut den Staging-Vault aus fixtures/vault/
 * open "obsidian://open?vault=anysource-sideloader"
 * npm run smoke:gui -- --vault anysource-sideloader
 * npm run smoke:gui -- --section transport --keep
 * ```
 *
 * `STAGING_VAULTS_DIR` muss gesetzt sein (Dach-`AGENTS.md` § Staging-Vaults) — der Ort
 * steht in der Umgebung, nie hier im Code.
 *
 * ⚠️ Chromium drosselt das Rendering nicht-fokussierter Fenster: ohne Fokus bleibt der
 * DOM der Ansicht leer und man debuggt ein Phantom (CORE-TEST-02).
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Die CDP-Brücke liegt seit 2026-08-16 zentral im Dach (tools/obsidian-cdp/) und wird
// importiert, nicht vendored. Fehlt das Dach (fremder Checkout), bricht esbuild beim
// Auflösen ab — das ist die gewollte Meldung. Was ihr fehlt, wird DORT ergänzt.
import {
  type Cdp,
  attachTo,
  clickReal,
  closeExtraLeaves,
  notices,
  pollUntil,
  releaseAlwaysOnTop,
  requireVisible,
} from "../../tools/obsidian-cdp/cdp.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";
import {
  OWNER,
  REPOS,
  TARGET_PLUGIN_ID,
  TARGET_PLUGIN_NAME,
  startForge,
  type RunningForge,
} from "./forge-server.js";

const PLUGIN_ID = "anysource-sideloader";
/** View-Registrierungs-Key aus `src/obsidian/store-view.ts` — zufällig gleich der
 *  Plugin-id, aber eine eigene Konstante: die beiden dürfen auseinanderlaufen. */
const VIEW_TYPE = "anysource-sideloader";
const REPO_NAME = "anysource-sideloader";
/** npm-Scripts laufen im Repo-Root. */
const REPO_ROOT = process.cwd();
const FIXTURE_DIR = join(REPO_ROOT, "fixtures/vault");

/** Pfad des Plugin-Ordners, den der Smoke im Staging-Vault anlegt und wieder entfernt. */
const targetDir = (configDir: string): string => `${configDir}/plugins/${TARGET_PLUGIN_ID}`;

// --- Protokoll ---------------------------------------------------------------

interface Result {
  name: string;
  passed: boolean;
  detail: string;
}

const results: Result[] = [];

function check(name: string, passed: boolean, detail = ""): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Was der Lauf bewusst NICHT misst. Steht im Protokoll, damit eine Lücke nicht wie
 *  Abdeckung aussieht — ein stillschweigend ausgelassener Punkt liest sich hinterher
 *  wie ein grüner. */
function skipped(name: string, reason: string): void {
  console.log(`  – ${name} — übersprungen: ${reason}`);
}

/** Eine reine Messung ohne Soll-Wert (Abschnitt F). Sie kann nicht „rot“ sein: das
 *  Ergebnis IST das Ergebnis. Rot wird der zugehörige Prüfpunkt nur, wenn gar nichts
 *  messbar war — „Prüfpunkt kennt nur einen richtigen Ausgang“ (Skill-Falle). */
function measured(name: string, value: string): void {
  console.log(`  ◆ ${name} — gemessen: ${value}`);
}

// --- Renderer-Helfer ---------------------------------------------------------

/** Ausdruck, der auf dem Container der Store-View auswertet. Immer über die View-Instanz,
 *  nie über `document.querySelector`: eine nackte Obsidian-Klasse träfe bei mehreren
 *  offenen Blättern (oder einem fremden Plugin) das falsche Element — grün am Falschen. */
const inView = (body: string): string => `
  const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
  const view = leaf?.view;
  if (!view || !view.containerEl) return null;
  const root = view.containerEl;
  ${body}
`;

/** Die Store-View öffnen — über den registrierten Befehl, nicht über die Methode.
 *  Die Registrierung ist Teil dessen, was hier geprüft wird. */
async function openStore(cdp: Cdp): Promise<boolean> {
  await cdp.evaluate(`
    app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open-store`)});
    await new Promise((r) => setTimeout(r, 400));
    return true;
  `);
  const ready = await pollUntil<boolean>(
    cdp,
    inView(`return Boolean(root.querySelector(".okit-hub-root .okit-hub-tabs"));`),
    12_000,
    250,
  );
  return ready === true;
}

/** View schließen und neu öffnen. Der einzige Weg von außen, ein Panel nach einer
 *  Settings-Änderung neu zeichnen zu lassen: `HubController.refreshActive()` ist nicht
 *  exportiert, und die Panels rendern nur in `onShow`. */
async function reopenStore(cdp: Cdp): Promise<boolean> {
  await cdp.evaluate(`
    for (const leaf of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) leaf.detach();
    await new Promise((r) => setTimeout(r, 300));
    return true;
  `);
  return openStore(cdp);
}

/** Sichtbarer Text eines Panels — `getClientRects()`, nicht `querySelector`.
 *  Der Hub versteckt Panels per `is-hidden`, sie bleiben also im DOM stehen; ein
 *  Existenz-Test wäre für jedes Panel gleichzeitig wahr. */
async function panelText(cdp: Cdp, tab: string): Promise<{ visible: boolean; text: string } | null> {
  return cdp.evaluate<{ visible: boolean; text: string } | null>(
    inView(`
      const panel = root.querySelector('.okit-hub-panel[data-tab="${tab}"]');
      if (!panel) return null;
      return { visible: panel.getClientRects().length > 0, text: panel.textContent.trim() };
    `),
  );
}

async function clickTab(cdp: Cdp, tab: string): Promise<boolean> {
  const expr = `(() => {
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    return leaf?.view?.containerEl?.querySelector('.okit-hub-tab[data-tab="${tab}"]') ?? null;
  })()`;
  // 150 ms halten: der Klick löst ein Neuzeichnen des Panels aus, und ein Null-Klick
  // kann in der neu gebauten Ansicht landen (Brücken-Doku zu `clickReal`).
  const ok = await clickReal(cdp, expr, 150);
  if (!ok) return false;
  const shown = await pollUntil<boolean>(
    cdp,
    inView(`
      const p = root.querySelector('.okit-hub-panel[data-tab="${tab}"]');
      return Boolean(p && p.getClientRects().length > 0);
    `),
    8000,
    200,
  );
  return shown === true;
}

interface ModalInfo {
  title: string;
  text: string;
  buttons: string[];
  /** Beschriftungen der destruktiv markierten Knöpfe. */
  destructive: string[];
  /** Alle Klassen aller Knöpfe, `Label: klasse klasse`. Steht im Detail-Text jedes roten
   *  Punkts: ein Prüfpunkt, der nur „destruktiv: false“ meldet, verschweigt, was
   *  stattdessen dastand — und genau daran hing der erste Lauf (CORE-TEST-14). */
  buttonClasses: string[];
}

/** Wie eine destruktive Markierung im DOM aussieht — beide zulässigen Ausgänge.
 *
 * Das Kit (`vendor/kit-obsidian/confirm.ts`, `applyDestructive`) ruft ab Obsidian 1.13
 * `ButtonComponent.setDestructive()` und fällt darunter auf die Klasse `mod-warning`
 * zurück, die `setWarning()` intern setzt. Welche Klasse `setDestructive()` schreibt,
 * ist nicht vertraglich zugesichert — gemessen an 1.13.7 ist es `mod-destructive`.
 * Der Prüfpunkt akzeptiert deshalb die MENGE der richtigen Ergebnisse statt eines
 * erwarteten Werts; falsch ist nur ein Knopf ohne jede Markierung. */
const DESTRUKTIV_KLASSEN = ["mod-destructive", "mod-warning"];

/** Das oberste offene Modal. Obsidian-Modals sind global (`.modal-container`) — das ist
 *  eine fremde Klasse, also wird vor jeder auslösenden Aktion `closeModals()` gefahren
 *  und danach gezielt auf ein NEUES Modal gewartet. */
async function currentModal(cdp: Cdp): Promise<ModalInfo | null> {
  return cdp.evaluate<ModalInfo | null>(`
    const containers = [...document.querySelectorAll(".modal-container")];
    const last = containers[containers.length - 1];
    const modal = last?.querySelector(".modal");
    if (!modal) return null;
    const btns = [...modal.querySelectorAll("button")];
    const destruktiv = ${JSON.stringify(DESTRUKTIV_KLASSEN)};
    return {
      title: modal.querySelector(".modal-title")?.textContent?.trim() ?? "",
      text: modal.querySelector(".modal-content")?.textContent?.trim() ?? modal.textContent.trim(),
      buttons: btns.map((b) => b.textContent.trim()),
      destructive: btns.filter((b) => destruktiv.some((c) => b.classList.contains(c))).map((b) => b.textContent.trim()),
      buttonClasses: btns.map((b) => b.textContent.trim() + ": " + ([...b.classList].join(" ") || "(keine Klasse)")),
    };
  `);
}

/** Auf ein Modal warten, dessen Beschriftungen einen bestimmten Knopf enthalten.
 *  Auf den KNOPF zu warten und nicht nur auf „irgendein Modal“ ist der Unterschied
 *  zwischen „der erwartete Dialog steht“ und „irgendein Dialog steht“. */
async function waitForModal(cdp: Cdp, button: string, timeoutMs = 20_000): Promise<ModalInfo | null> {
  return pollUntil<ModalInfo>(
    cdp,
    `
      const containers = [...document.querySelectorAll(".modal-container")];
      const last = containers[containers.length - 1];
      const modal = last?.querySelector(".modal");
      if (!modal) return null;
      const btns = [...modal.querySelectorAll("button")];
      const labels = btns.map((b) => b.textContent.trim());
      if (!labels.includes(${JSON.stringify(button)})) return null;
      const destruktiv = ${JSON.stringify(DESTRUKTIV_KLASSEN)};
      return {
        title: modal.querySelector(".modal-title")?.textContent?.trim() ?? "",
        text: modal.querySelector(".modal-content")?.textContent?.trim() ?? modal.textContent.trim(),
        buttons: labels,
        destructive: btns.filter((b) => destruktiv.some((c) => b.classList.contains(c))).map((b) => b.textContent.trim()),
        buttonClasses: btns.map((b) => b.textContent.trim() + ": " + ([...b.classList].join(" ") || "(keine Klasse)")),
      };
    `,
    timeoutMs,
    250,
  );
}

/**
 * Einen Knopf im obersten Modal klicken — und warten, bis dieses Modal WEG ist.
 *
 * Das Warten ist der eigentliche Punkt. Der Install-Pfad reiht bis zu drei Confirms
 * hintereinander, die dieselben Knopf-Beschriftungen tragen („Cancel“/„Install“): ein
 * `waitForModal("Install")` unmittelbar nach dem Klick träfe sonst mit hoher
 * Wahrscheinlichkeit noch das ALTE Modal und wäre grün, ohne dass der erwartete Dialog
 * je erschienen ist. Gewartet wird auf das Verschwinden, nicht auf eine Frist — eine
 * feste Wartezeit ist genau der sporadisch-rote Prüfpunkt, den der Skill beschreibt.
 */
async function clickModalButton(cdp: Cdp, label: string): Promise<boolean> {
  const vorher = await cdp.evaluate<number>(`return document.querySelectorAll(".modal-container").length;`);
  const expr = `(() => {
    const containers = [...document.querySelectorAll(".modal-container")];
    const modal = containers[containers.length - 1]?.querySelector(".modal");
    if (!modal) return null;
    return [...modal.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)}) ?? null;
  })()`;
  const ok = await clickReal(cdp, expr, 120);
  if (!ok) return false;
  const zu = await pollUntil<boolean>(
    cdp,
    `return document.querySelectorAll(".modal-container").length < ${vorher} ? true : null;`,
    5000,
    150,
  );
  return zu === true;
}

/** Alle offenen Modals schließen. Vor jeder Aktion, die ein Modal erwartet: ein
 *  stehengebliebenes Modal aus dem Schritt davor sähe aus wie das erwartete. */
async function closeModals(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    for (const c of document.querySelectorAll(".modal-container")) c.remove();
    await new Promise((r) => setTimeout(r, 150));
    return true;
  `);
}

/** Notices leeren. Obsidians Toast ist global — jedes der Plugins im Vault schreibt
 *  hinein, und ein alter Text sähe aus wie die Antwort auf die gerade ausgelöste
 *  Aktion (Skill-Falle „Ort, den sich das Plugin mit Obsidian teilt“). */
async function clearNotices(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    const docs = new Set([document]);
    if (typeof activeDocument !== "undefined" && activeDocument) docs.add(activeDocument);
    for (const d of docs) for (const n of d.querySelectorAll(".notice")) n.remove();
    return true;
  `);
}

/** Auf eine Notice warten, die `needle` enthält — und bei Zeitablauf zurückgeben, was
 *  stattdessen dastand. Ein roter Punkt, der nur „keine Notice“ sagt, verschweigt die
 *  Antwort des Prüflings (CORE-TEST-14). */
async function waitForNotice(cdp: Cdp, needle: string, timeoutMs = 20_000): Promise<string> {
  const hit = await pollUntil<string>(
    cdp,
    `
      const docs = new Set([document]);
      if (typeof activeDocument !== "undefined" && activeDocument) docs.add(activeDocument);
      const texte = [];
      for (const d of docs) for (const n of d.querySelectorAll(".notice")) texte.push(n.textContent.trim());
      const alle = texte.join(" | ");
      return alle.includes(${JSON.stringify(needle)}) ? alle : null;
    `,
    timeoutMs,
    250,
  );
  if (hit !== null) return hit;
  // Nichts Passendes gefunden: zurueckgegeben wird, was STATTDESSEN dastand — ein roter
  // Punkt, der nur „keine Notice“ meldet, verschweigt die Antwort des Prueflings.
  return (await notices(cdp)) || "(keine Notice)";
}

interface SettingsSnapshot {
  catalogs: string[];
  plugins: Array<{ id: string; installedVersion: string; availableVersion: string | null }>;
  hostSecrets: Record<string, string>;
  checkOnStartup: boolean;
}

async function readSettings(cdp: Cdp): Promise<SettingsSnapshot> {
  return cdp.evaluate<SettingsSnapshot>(`
    const s = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings;
    return {
      catalogs: s.catalogs.slice(),
      plugins: s.plugins.map((p) => ({ id: p.id, installedVersion: p.installedVersion, availableVersion: p.availableVersion })),
      hostSecrets: JSON.parse(JSON.stringify(s.hostSecrets)),
      checkOnStartup: s.checkOnStartup,
    };
  `);
}

/** Settings des Prüflings setzen und persistieren. */
async function writeSettings(cdp: Cdp, patch: Record<string, unknown>): Promise<void> {
  await cdp.evaluate(`
    const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    Object.assign(plugin.settings, ${JSON.stringify(patch)});
    await plugin.saveSettings();
    await new Promise((r) => setTimeout(r, 250));
    return true;
  `);
}

async function fileExists(cdp: Cdp, path: string): Promise<boolean> {
  return cdp.evaluate<boolean>(`return app.vault.adapter.exists(${JSON.stringify(path)});`);
}

async function readFile(cdp: Cdp, path: string): Promise<string | null> {
  return cdp.evaluate<string | null>(`
    const p = ${JSON.stringify(path)};
    if (!(await app.vault.adapter.exists(p))) return null;
    return app.vault.adapter.read(p);
  `);
}

async function configDirOf(cdp: Cdp): Promise<string> {
  return cdp.evaluate<string>(`return app.vault.configDir;`);
}

/** Den vom Smoke installierten Plugin-Ordner restlos entfernen. Defensiv: der Pfad muss
 *  auf die Smoke-id enden, sonst passiert nichts — ein Fehlgriff hier löschte ein echtes
 *  Plugin des Vaults. */
async function removeTargetPlugin(cdp: Cdp, configDir: string): Promise<void> {
  const dir = targetDir(configDir);
  await cdp.evaluate(`
    const dir = ${JSON.stringify(dir)};
    if (!dir.endsWith(${JSON.stringify("/plugins/" + TARGET_PLUGIN_ID)})) return false;
    const a = app.vault.adapter;
    for (const name of ["main.js", "manifest.json", "styles.css", "data.json"]) {
      if (await a.exists(dir + "/" + name)) await a.remove(dir + "/" + name);
    }
    if (await a.exists(dir)) { try { await a.rmdir(dir, true); } catch (e) { /* leerer Ordner reicht */ } }
    return true;
  `);
}

// --- Einstellungen: Modal oder eigenes Fenster -------------------------------

interface Verbindung {
  port: number;
  vault: string;
}

/**
 * Wo die Einstellungen gerade zu messen sind — und ein Ausdrucks-Bauer dafür.
 *
 * Ab Obsidian 1.13 sind die Einstellungen ein **eigenes Fenster**: `app.setting.open()`
 * gelingt, `app.setting.activeTab.id` stimmt, und `document.querySelector(".modal.mod-settings")`
 * im Workspace-Renderer bleibt trotzdem `null`. Wer daraus auf einen Plugin-Defekt
 * schließt, sucht am falschen Ende (Skill-Falle). Beide Lagen bleiben deshalb offen und
 * werden an der **Sache** unterschieden — nie am Fenstertitel, der lokalisiert ist.
 *
 * Der Preis des eigenen Fensters: es hat kein `window.app`. Alles, was den Zustand des
 * Plugins liest, läuft weiter über das Workspace-Handle; nur das DOM kommt von hier.
 */
interface SettingsStelle {
  cdp: Cdp;
  eigenesFenster: boolean;
  /** Rumpf mit `root` als Wurzel des Einstellungs-DOM. */
  inRoot: (body: string) => string;
  /** Element-Ausdruck (für `clickReal`) mit `root` als Wurzel. */
  el: (ausdruck: string) => string;
}

async function settingsStelle(cdp: Cdp, verbindung: Verbindung): Promise<SettingsStelle | null> {
  const alsModal = await cdp.evaluate<boolean>(
    `return Boolean(document.querySelector(".modal.mod-settings"));`,
  );
  if (alsModal) {
    const wurzel = `const root = document.querySelector(".modal.mod-settings"); if (!root) return null;`;
    return {
      cdp,
      eigenesFenster: false,
      inRoot: (body) => `${wurzel}\n${body}`,
      // Die Klammern um den Ausdruck sind load-bearing: ein mehrzeiliger Ausdruck beginnt
      // mit einem Zeilenumbruch, und `return` + Newline ist per ASI ein `return;` — der
      // Rest wird toter Code, `clickReal` bekommt `undefined` und meldet „nicht
      // getroffen“, obwohl das Element da ist (gemessen 2026-09-01 an E6).
      el: (ausdruck) => `(() => { const root = document.querySelector(".modal.mod-settings"); if (!root) return null; return (${ausdruck}) ?? null; })()`,
    };
  }
  const fenster = await attachTo("settings", verbindung.port, verbindung.vault);
  if (!fenster) return null;
  return {
    cdp: fenster,
    eigenesFenster: true,
    inRoot: (body) => `const root = document;\n${body}`,
    el: (ausdruck) => `(() => { const root = document; return (${ausdruck}) ?? null; })()`,
  };
}

// --- Abschnitte --------------------------------------------------------------

interface Section {
  key: string;
  title: string;
  run: (cdp: Cdp, forge: RunningForge, cfg: string, verbindung: Verbindung) => Promise<void>;
}

const SECTIONS: Section[] = [
  {
    key: "hub",
    title: "A — Store-View und Hub-Tab-Leiste",
    run: async (cdp) => {
      const opened = await openStore(cdp);
      check("A1 Befehl „Open store“ öffnet die View", opened, opened ? "" : "kein .okit-hub-root nach 12 s");
      if (!opened) return;

      const tabs = await cdp.evaluate<{ labels: string[]; active: string } | null>(
        inView(`
          const btns = [...root.querySelectorAll(".okit-hub-tab")];
          return {
            labels: btns.map((b) => b.querySelector(".okit-hub-tab-label")?.textContent?.trim() ?? "(ohne Label)"),
            active: btns.find((b) => b.classList.contains("is-active"))?.getAttribute("data-tab") ?? "(keiner)",
          };
        `),
      );
      const erwartet = ["Browse", "Installed", "Updates"];
      check(
        "A2 drei Tabs mit Label, Browse aktiv",
        tabs !== null && JSON.stringify(tabs.labels) === JSON.stringify(erwartet) && tabs.active === "browse",
        tabs ? `Labels: ${tabs.labels.join(", ")} · aktiv: ${tabs.active}` : "keine Tab-Leiste gefunden",
      );

      // Der Tabwechsel wird über einen ECHTEN Mausklick gefahren, nicht über setTab():
      // gemessen wird die Bedienung, nicht die Methode dahinter.
      const wechsel = await clickTab(cdp, "installed");
      const nach = await cdp.evaluate<{ active: string; sichtbar: string[] } | null>(
        inView(`
          const panels = [...root.querySelectorAll(".okit-hub-panel")];
          return {
            active: [...root.querySelectorAll(".okit-hub-tab")].find((b) => b.classList.contains("is-active"))?.getAttribute("data-tab") ?? "(keiner)",
            sichtbar: panels.filter((p) => p.getClientRects().length > 0).map((p) => p.getAttribute("data-tab")),
          };
        `),
      );
      check(
        "A3 Klick auf „Installed“ blendet genau ein Panel ein",
        wechsel && nach?.active === "installed" && JSON.stringify(nach.sichtbar) === JSON.stringify(["installed"]),
        nach ? `aktiv: ${nach.active} · sichtbar: ${nach.sichtbar.join(",") || "keins"}` : "Panel-Zustand nicht lesbar",
      );

      // Roving tabindex + Pfeiltasten sind der ARIA-Vertrag der Kit-Leiste (hub.ts,
      // Falle 6): inaktive Tabs sind bewusst NICHT per Tab-Taste erreichbar, dafür
      // navigieren die Pfeiltasten. Ein Bruch fällt sonst nirgends auf.
      const aria = await cdp.evaluate<{ roving: string[]; selected: string[] } | null>(
        inView(`
          const btns = [...root.querySelectorAll(".okit-hub-tab")];
          return {
            roving: btns.map((b) => b.getAttribute("tabindex") ?? "(fehlt)"),
            selected: btns.map((b) => b.getAttribute("aria-selected") ?? "(fehlt)"),
          };
        `),
      );
      check(
        "A4 roving tabindex: genau ein Tab fokussierbar, aria-selected passend",
        aria !== null && aria.roving.filter((t) => t === "0").length === 1 && aria.selected.filter((s) => s === "true").length === 1,
        aria ? `tabindex: ${aria.roving.join(",")} · aria-selected: ${aria.selected.join(",")}` : "keine Tabs",
      );

      const pfeil = await cdp.evaluate<string>(
        inView(`
          const btn = root.querySelector('.okit-hub-tab[data-tab="installed"]');
          btn.focus();
          btn.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
          await new Promise((r) => setTimeout(r, 400));
          return [...root.querySelectorAll(".okit-hub-tab")].find((b) => b.classList.contains("is-active"))?.getAttribute("data-tab") ?? "(keiner)";
        `),
      );
      check("A5 Pfeil rechts wechselt auf „Updates“", pfeil === "updates", `aktiv nach ArrowRight: ${pfeil}`);
    },
  },

  {
    key: "empty",
    title: "B — Empty-States (UI-STANDARD §8: verbindlicher Baustein)",
    run: async (cdp) => {
      await writeSettings(cdp, { catalogs: [], plugins: [] });
      const ok = await reopenStore(cdp);
      if (!ok) {
        check("B0 View nach Settings-Reset offen", false, "Store-View ließ sich nicht neu öffnen");
        return;
      }

      const browse = await panelText(cdp, "browse");
      check(
        "B1 Browse ohne Katalog nennt den Ausweg (Settings)",
        browse?.visible === true && browse.text.includes("No catalogs are configured yet"),
        browse ? `sichtbar: ${browse.visible} · Text: „${browse.text.slice(0, 90)}“` : "kein Browse-Panel",
      );

      await clickTab(cdp, "installed");
      const installed = await panelText(cdp, "installed");
      check(
        "B2 Installed ohne Plugins zeigt den Empty-State",
        installed?.visible === true && installed.text.includes("No plugins are sideloaded yet"),
        installed ? `Text: „${installed.text.slice(0, 90)}“` : "kein Installed-Panel",
      );

      await clickTab(cdp, "updates");
      const updates = await panelText(cdp, "updates");
      check(
        "B3 Updates ohne Rückstand zeigt den Empty-State",
        updates?.visible === true && updates.text.includes("Everything up to date"),
        updates ? `Text: „${updates.text.slice(0, 90)}“` : "kein Updates-Panel",
      );

      // Der Empty-State muss der Kit-Grammatik folgen (.asl-empty), sonst greift kein
      // Theme-CSS — gemessen wird die Klasse UND dass sie wirklich Fläche hat.
      const grammatik = await cdp.evaluate<{ klasse: boolean; hoehe: number } | null>(
        inView(`
          const el = root.querySelector('.okit-hub-panel[data-tab="updates"] .asl-empty');
          if (!el) return null;
          return { klasse: true, hoehe: Math.round(el.getBoundingClientRect().height) };
        `),
      );
      check(
        "B4 Empty-State nutzt .asl-empty und hat Fläche",
        grammatik !== null && grammatik.hoehe > 0,
        grammatik ? `Höhe: ${grammatik.hoehe}px` : "kein .asl-empty im Updates-Panel",
      );
    },
  },

  {
    key: "katalog",
    title: "C — Katalog, Install, Update, Remove (gegen die lokale Forge)",
    run: async (cdp, forge, cfg) => {
      await writeSettings(cdp, { catalogs: [forge.catalogUrl], plugins: [] });
      await removeTargetPlugin(cdp, cfg);
      const ok = await reopenStore(cdp);
      if (!ok) {
        check("C0 Store-View offen", false, "Store-View ließ sich nicht öffnen");
        return;
      }

      const karten = await pollUntil<{ titel: string[]; autoren: string[]; tags: string[] } | null>(
        cdp,
        inView(`
          const cards = [...root.querySelectorAll('.okit-hub-panel[data-tab="browse"] .asl-card')];
          if (cards.length === 0) return null;
          return {
            titel: cards.map((c) => c.querySelector(".asl-card-title")?.textContent?.trim() ?? ""),
            autoren: cards.map((c) => c.querySelector(".asl-card-author")?.textContent?.trim() ?? ""),
            tags: [...root.querySelectorAll('.okit-hub-panel[data-tab="browse"] .asl-tag')].map((t) => t.textContent.trim()),
          };
        `),
        15_000,
        300,
      );
      const browseText = (await panelText(cdp, "browse"))?.text ?? "";
      check(
        "C1 Katalog geladen: zwei Karten mit Name, Autor, Tags",
        karten !== null && karten.titel.length === 2 && karten.titel.includes(TARGET_PLUGIN_NAME) && karten.autoren[0] === "by gui-smoke",
        karten ? `Titel: ${karten.titel.join(" / ")} · Tags: ${karten.tags.join(",")}` : `keine Karte — Panel sagt: „${browseText.slice(0, 120)}“`,
      );

      const gefiltert = await cdp.evaluate<{ vor: number; nach: number; text: string } | null>(
        inView(`
          const panel = root.querySelector('.okit-hub-panel[data-tab="browse"]');
          const input = panel.querySelector(".asl-search-input");
          if (!input) return null;
          const vor = panel.querySelectorAll(".asl-card").length;
          input.value = "decoy";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 300));
          const nach = panel.querySelectorAll(".asl-card").length;
          const text = panel.querySelector(".asl-card-title")?.textContent?.trim() ?? "";
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 300));
          return { vor, nach, text };
        `),
      );
      check(
        "C2 Suchfeld filtert die Kartenliste",
        gefiltert !== null && gefiltert.vor === 2 && gefiltert.nach === 1 && gefiltert.text === "Search Decoy",
        gefiltert ? `${gefiltert.vor} → ${gefiltert.nach} Karten, übrig: „${gefiltert.text}“` : "kein Suchfeld",
      );

      // ── Install-Kette: HTTP-Warnung → Install-Confirm → Abbrechen ──────────
      // Der Abbruch ist der eigentliche Prüfpunkt: ein Confirm, das man wegklicken kann
      // und das trotzdem installiert, ist schlimmer als keines.
      await closeModals(cdp);
      await clearNotices(cdp);
      const installExpr = `(() => {
        const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
        const root = leaf?.view?.containerEl;
        const card = [...(root?.querySelectorAll('.okit-hub-panel[data-tab="browse"] .asl-card') ?? [])]
          .find((c) => c.querySelector(".asl-card-title")?.textContent?.trim() === ${JSON.stringify(TARGET_PLUGIN_NAME)});
        return card?.querySelector("button") ?? null;
      })()`;
      const geklickt = await clickReal(cdp, installExpr, 150);
      const httpModal = await waitForModal(cdp, "Install");
      check(
        "C3 HTTP-Quelle warnt vor unverschlüsseltem Transport",
        geklickt && httpModal !== null && httpModal.text.includes("plain HTTP"),
        httpModal ? `Modal: „${httpModal.text.slice(0, 100)}“ · Knöpfe: ${httpModal.buttons.join("/")}` : "kein Modal nach Install-Klick",
      );
      if (httpModal) await clickModalButton(cdp, "Install");

      const installModal = await waitForModal(cdp, "Install");
      const zeigtQuelle = installModal?.text.includes(forge.repoUrl(REPOS.target)) === true;
      const zeigtId = installModal?.text.includes(`ID: ${TARGET_PLUGIN_ID}`) === true;
      const zeigtVersion = installModal?.text.includes("Version: 1.0.0") === true;
      check(
        "C4 Install-Confirm nennt Quelle, id und Version",
        installModal !== null && zeigtQuelle && zeigtId && zeigtVersion,
        installModal
          ? `Titel: „${installModal.title}“ · Text: „${installModal.text.slice(0, 140)}“`
          : "kein Install-Confirm",
      );

      await clickModalButton(cdp, "Cancel");
      await cdp.evaluate(`await new Promise((r) => setTimeout(r, 600)); return true;`);
      const nachAbbruch = await fileExists(cdp, `${targetDir(cfg)}/manifest.json`);
      const settingsNachAbbruch = await readSettings(cdp);
      check(
        "C5 „Cancel“ bricht wirklich ab — nichts geschrieben, nichts registriert",
        !nachAbbruch && settingsNachAbbruch.plugins.length === 0,
        `manifest.json auf Platte: ${nachAbbruch} · settings.plugins: ${settingsNachAbbruch.plugins.length}`,
      );

      // ── Install-Kette: derselbe Weg, diesmal bis zum Ende ──────────────────
      await closeModals(cdp);
      await clearNotices(cdp);
      await clickReal(cdp, installExpr, 150);
      if (await waitForModal(cdp, "Install")) await clickModalButton(cdp, "Install");
      const zweites = await waitForModal(cdp, "Install");
      if (zweites) await clickModalButton(cdp, "Install");
      const noticeText = await waitForNotice(cdp, `Installed ${TARGET_PLUGIN_NAME}`);
      const manifestRoh = await pollUntil<string>(
        cdp,
        `
          const p = ${JSON.stringify(`${targetDir(cfg)}/manifest.json`)};
          if (!(await app.vault.adapter.exists(p))) return null;
          return app.vault.adapter.read(p);
        `,
        10_000,
        300,
      );
      const manifest = manifestRoh ? (JSON.parse(manifestRoh) as { id?: string; version?: string }) : null;
      check(
        "C6 Install schreibt manifest.json/main.js und meldet es",
        manifest?.id === TARGET_PLUGIN_ID && manifest.version === "1.0.0" && noticeText.includes("Installed"),
        `manifest: ${manifest ? `${manifest.id}@${manifest.version}` : "fehlt"} · Notice: „${noticeText.slice(0, 80)}“`,
      );
      const mainJs = await fileExists(cdp, `${targetDir(cfg)}/main.js`);
      const stylesCss = await fileExists(cdp, `${targetDir(cfg)}/styles.css`);
      check("C7 alle drei Code-Dateien liegen im Plugin-Ordner", mainJs && stylesCss && manifest !== null, `main.js: ${mainJs} · styles.css: ${stylesCss}`);

      // Enable-Confirm: „Later“ darf NICHTS aktivieren. Der Smoke aktiviert bewusst nie
      // fremden Code — geprüft wird, dass die Wahl auch wirkt.
      const enableModal = await waitForModal(cdp, "Enable");
      if (enableModal) await clickModalButton(cdp, "Later");
      const aktiv = await cdp.evaluate<boolean>(
        `return Boolean(app.plugins.enabledPlugins?.has(${JSON.stringify(TARGET_PLUGIN_ID)}));`,
      );
      check(
        "C8 Enable-Confirm erscheint, „Later“ aktiviert nichts",
        enableModal !== null && !aktiv,
        enableModal ? `Knöpfe: ${enableModal.buttons.join("/")} · aktiv danach: ${aktiv}` : "kein Enable-Confirm",
      );

      // ── Installed-Panel: Status-Indikator ─────────────────────────────────
      await reopenStore(cdp);
      await clickTab(cdp, "installed");
      const zeile = await pollUntil<{ name: string; version: string; host: string; status: string; label: string } | null>(
        cdp,
        inView(`
          const row = root.querySelector('.okit-hub-panel[data-tab="installed"] .asl-row');
          if (!row) return null;
          const st = row.querySelector(".asl-status");
          return {
            name: row.querySelector(".asl-row-name")?.textContent?.trim() ?? "",
            version: row.querySelector(".asl-row-version")?.textContent?.trim() ?? "",
            host: row.querySelector(".asl-row-host")?.textContent?.trim() ?? "",
            status: st ? [...st.classList].filter((c) => c.startsWith("is-")).join(",") : "(kein Status)",
            label: st?.querySelector(".asl-status-label")?.textContent?.trim() ?? "",
          };
        `),
        10_000,
        300,
      );
      check(
        "C9 Installed-Zeile zeigt Name, Version, Host und Status is-ok",
        zeile !== null && zeile.name === TARGET_PLUGIN_NAME && zeile.version === "1.0.0" && zeile.status === "is-ok" && zeile.label === "Up to date",
        zeile ? `${zeile.name} ${zeile.version} @${zeile.host} · Status: ${zeile.status} „${zeile.label}“` : "keine Zeile im Installed-Panel",
      );

      // ── Update-Pfad ───────────────────────────────────────────────────────
      forge.setVersion("1.1.0");
      const checkExpr = `(() => {
        const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
        const row = leaf?.view?.containerEl?.querySelector('.okit-hub-panel[data-tab="installed"] .asl-row');
        return [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Check") ?? null;
      })()`;
      await clickReal(cdp, checkExpr, 150);
      const warnung = await pollUntil<{ status: string; label: string } | null>(
        cdp,
        inView(`
          const st = root.querySelector('.okit-hub-panel[data-tab="installed"] .asl-status');
          if (!st) return null;
          const cls = [...st.classList].filter((c) => c.startsWith("is-")).join(",");
          if (cls !== "is-warning") return null;
          return { status: cls, label: st.querySelector(".asl-status-label")?.textContent?.trim() ?? "" };
        `),
        15_000,
        300,
      );
      check(
        "C10 „Check“ findet 1.1.0 und setzt den Status auf is-warning",
        warnung !== null && warnung.label === "Update available: 1.1.0",
        warnung ? `Status: ${warnung.status} „${warnung.label}“` : "Status blieb nicht auf is-warning",
      );

      await clickTab(cdp, "updates");
      const updateZeile = await pollUntil<string>(
        cdp,
        inView(`
          const row = root.querySelector('.okit-hub-panel[data-tab="updates"] .asl-row');
          return row?.querySelector(".asl-row-version")?.textContent?.trim() ?? null;
        `),
        10_000,
        300,
      );
      check(
        "C11 Updates-Tab zeigt die Zeile mit „alt → neu“",
        updateZeile === "1.0.0 → 1.1.0",
        `Version-Zelle: „${updateZeile ?? "(keine Zeile)"}“`,
      );

      await closeModals(cdp);
      await clearNotices(cdp);
      const updateExpr = `(() => {
        const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
        const row = leaf?.view?.containerEl?.querySelector('.okit-hub-panel[data-tab="updates"] .asl-row');
        return [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Update") ?? null;
      })()`;
      await clickReal(cdp, updateExpr, 150);
      const updateModal = await waitForModal(cdp, "Update");
      if (updateModal) await clickModalButton(cdp, "Update");
      const neuesManifest = await pollUntil<string>(
        cdp,
        `
          const p = ${JSON.stringify(`${targetDir(cfg)}/manifest.json`)};
          if (!(await app.vault.adapter.exists(p))) return null;
          const t = await app.vault.adapter.read(p);
          return JSON.parse(t).version === "1.1.0" ? t : null;
        `,
        15_000,
        300,
      );
      check(
        "C12 Update-Confirm nennt „1.0.0 → 1.1.0“ und schreibt die neue Version",
        updateModal !== null && updateModal.title.includes("1.0.0 → 1.1.0") && neuesManifest !== null,
        updateModal
          ? `Titel: „${updateModal.title}“ · manifest.json danach: ${neuesManifest ? "1.1.0" : "unverändert"}`
          : "kein Update-Confirm",
      );

      // ── Remove: destruktives Confirm, data.json überlebt ───────────────────
      // Der data.json-Vertrag steht in `installer.ts` (`removePlugin`) und ist genau die
      // Sorte Zusage, die ein Unit-Test bestätigt und die Platte widerlegen kann.
      await cdp.evaluate(`
        await app.vault.adapter.write(${JSON.stringify(`${targetDir(cfg)}/data.json`)}, '{"nutzerdaten":"bleiben"}');
        return true;
      `);
      await reopenStore(cdp);
      await clickTab(cdp, "installed");
      await closeModals(cdp);
      const removeExpr = `(() => {
        const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
        const row = leaf?.view?.containerEl?.querySelector('.okit-hub-panel[data-tab="installed"] .asl-row');
        return [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Remove") ?? null;
      })()`;
      await clickReal(cdp, removeExpr, 150);
      const removeModal = await waitForModal(cdp, "Remove");
      const destruktiv = removeModal?.destructive.includes("Remove") === true;
      if (removeModal) await clickModalButton(cdp, "Remove");
      const weg = await pollUntil<boolean>(
        cdp,
        `return (await app.vault.adapter.exists(${JSON.stringify(`${targetDir(cfg)}/main.js`)})) ? null : true;`,
        10_000,
        300,
      );
      const datenBleiben = await fileExists(cdp, `${targetDir(cfg)}/data.json`);
      check(
        "C13 Remove: destruktiv markiert, Code weg, data.json bleibt",
        removeModal !== null && destruktiv && weg === true && datenBleiben,
        removeModal
          ? `destruktiv markiert: ${destruktiv} (${removeModal.buttonClasses.join(" | ")}) · ` +
            `main.js weg: ${weg === true} · data.json da: ${datenBleiben}`
          : "kein Remove-Confirm",
      );
    },
  },

  {
    key: "adoption",
    title: "G — Adoption: installierte Plugins sichtbar machen und uebernehmen",
    run: async (cdp, forge, cfg) => {
      // Der Fall, der das Plugin bis 0.1.1 blind machte: im Vault liegt ein Plugin, das
      // der Katalog kennt — aber `settings.plugins` ist leer, also bot Browse „Install“
      // an und der Update-Lauf kannte es nicht. Gemessen an zwei produktiven Vaults:
      // ~20 installiert, 0 verwaltet.
      await removeTargetPlugin(cdp, cfg);
      await writeSettings(cdp, { catalogs: [forge.catalogUrl], plugins: [] });

      // Installiert, aber NICHT verwaltet: Dateien von Hand hinlegen, Einstellungen leer.
      await cdp.evaluate(`
        const dir = ${JSON.stringify(targetDir(cfg))};
        const a = app.vault.adapter;
        await a.mkdir(dir);
        await a.write(dir + "/manifest.json", ${JSON.stringify(
          JSON.stringify({ id: TARGET_PLUGIN_ID, name: TARGET_PLUGIN_NAME, version: "0.9.0" }),
        )});
        await a.write(dir + "/main.js", "// vorhanden");
        return true;
      `);
      await reopenStore(cdp);

      const karte = await pollUntil<{ text: string; knoepfe: string[]; status: string } | null>(
        cdp,
        inView(`
          const card = [...root.querySelectorAll('.okit-hub-panel[data-tab="browse"] .asl-card')]
            .find((c) => c.querySelector(".asl-card-title")?.textContent?.trim() === ${JSON.stringify(TARGET_PLUGIN_NAME)});
          if (!card) return null;
          const st = card.querySelector(".asl-status");
          return {
            text: card.textContent.trim(),
            knoepfe: [...card.querySelectorAll("button")].map((b) => b.textContent.trim()),
            status: st ? [...st.classList].filter((c) => c.startsWith("is-")).join(",") : "(kein Status)",
          };
        `),
        15_000,
        300,
      );
      check(
        "G1 installiertes, nicht verwaltetes Plugin wird als solches erkannt",
        karte !== null && karte.text.includes("Installed 0.9.0") && karte.knoepfe.some((b) => b.includes("Track")) && !karte.knoepfe.includes("Install"),
        karte
          ? `Status: ${karte.status} · Knoepfe: ${karte.knoepfe.join(",")} · Text: „${karte.text.slice(0, 90)}“`
          : "keine Karte fuer das installierte Plugin",
      );

      const bulk = await cdp.evaluate<string | null>(
        inView(`
          const b = root.querySelector(".asl-bulk button");
          return b ? b.textContent.trim() : null;
        `),
      );
      check(
        "G2 „Alle verwalten“ erscheint und nennt die Anzahl",
        typeof bulk === "string" && /Track all 1 installed/.test(bulk),
        `Sammelknopf: „${bulk ?? "(keiner)"}“`,
      );

      // Uebernahme ueber die ECHTE Bedienung, nicht ueber den Flow.
      await clickReal(
        cdp,
        `(() => {
          const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
          const root = leaf?.view?.containerEl;
          const card = [...(root?.querySelectorAll('.okit-hub-panel[data-tab="browse"] .asl-card') ?? [])]
            .find((c) => c.querySelector(".asl-card-title")?.textContent?.trim() === ${JSON.stringify(TARGET_PLUGIN_NAME)});
          return [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim().includes("Track")) ?? null;
        })()`,
        150,
      );
      const verwaltet = await pollUntil<{ id: string; installedVersion: string } | null>(
        cdp,
        `
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.plugins[0];
          return p ? { id: p.id, installedVersion: p.installedVersion } : null;
        `,
        15_000,
        300,
      );
      check(
        "G3 „Verwalten“ traegt es mit der Version VON DER PLATTE ein",
        verwaltet?.id === TARGET_PLUGIN_ID && verwaltet.installedVersion === "0.9.0",
        verwaltet ? `${verwaltet.id} @ ${verwaltet.installedVersion}` : "settings.plugins blieb leer",
      );

      // Jetzt findet der Update-Lauf das Plugin — genau das ging vorher nicht.
      forge.setVersion("1.0.0");
      await clearNotices(cdp);
      await clickTab(cdp, "updates");
      await clickReal(
        cdp,
        `(() => {
          const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
          const root = leaf?.view?.containerEl;
          return [...(root?.querySelectorAll('.okit-hub-panel[data-tab="updates"] .asl-bulk button') ?? [])][0] ?? null;
        })()`,
        150,
      );
      const notice = await waitForNotice(cdp, "update", 25_000);
      const gefunden = await pollUntil<string>(
        cdp,
        `
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.plugins[0];
          return p && p.availableVersion ? p.availableVersion : null;
        `,
        15_000,
        300,
      );
      check(
        "G4 der Pruef-Knopf im Updates-Tab findet den Rueckstand des uebernommenen Plugins",
        gefunden === "1.0.0",
        `availableVersion: ${gefunden ?? "(keine)"} · Notice: „${notice.slice(0, 80)}“`,
      );

      // Und die Karte im Katalog sagt es jetzt auch.
      await clickTab(cdp, "browse");
      const nachCheck = await pollUntil<string>(
        cdp,
        inView(`
          const card = [...root.querySelectorAll('.okit-hub-panel[data-tab="browse"] .asl-card')]
            .find((c) => c.querySelector(".asl-card-title")?.textContent?.trim() === ${JSON.stringify(TARGET_PLUGIN_NAME)});
          const label = card?.querySelector(".asl-status-label")?.textContent?.trim();
          return label || null;
        `),
        15_000,
        300,
      );
      check(
        "G5 die Katalog-Karte zeigt installiert + verfuegbar statt „Install“",
        nachCheck === "Installed 0.9.0 — 1.0.0 available",
        `Status-Text: „${nachCheck ?? "(keiner)"}“`,
      );

      await removeTargetPlugin(cdp, cfg);
      await writeSettings(cdp, { plugins: [] });
    },
  },

  {
    key: "url",
    title: "D — Install per URL (Befehl + Modal) und Sicherheitskanten",
    run: async (cdp, forge, cfg) => {
      await removeTargetPlugin(cdp, cfg);
      await writeSettings(cdp, { plugins: [] });
      await closeModals(cdp);
      await clearNotices(cdp);

      // Task C1 aus dem Final-Review: „Install from URL“ war dreifach dokumentiert und
      // hatte keine Bedienung. Geprüft wird der Befehl, nicht die Modal-Klasse.
      const geoeffnet = await cdp.evaluate<boolean>(`
        const ok = app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:install-from-url`)});
        await new Promise((r) => setTimeout(r, 500));
        return Boolean(ok);
      `);
      const modal = await currentModal(cdp);
      const hatFeld = await cdp.evaluate<boolean>(`
        const c = [...document.querySelectorAll(".modal-container")].pop();
        return Boolean(c?.querySelector(".modal input[type='text'], .modal input:not([type])"));
      `);
      check(
        "D1 Befehl „Install plugin from URL“ öffnet ein Modal mit Eingabefeld",
        geoeffnet && modal?.title === "Install plugin from URL" && hatFeld,
        modal ? `Titel: „${modal.title}“ · Feld: ${hatFeld} · Knöpfe: ${modal.buttons.join("/")}` : "kein Modal",
      );

      // Ungültige Quelle: die Notice ist die einzige Antwort, die der Nutzer bekommt —
      // bleibt sie aus, wirkt der Install wie stumm geschluckt.
      await cdp.evaluate(`
        const c = [...document.querySelectorAll(".modal-container")].pop();
        const input = c?.querySelector(".modal input");
        input.value = "not-a-url";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 150));
        return true;
      `);
      await clickModalButton(cdp, "Install");
      const invalid = await waitForNotice(cdp, "Could not detect a supported source", 15_000);
      check(
        "D2 unbrauchbare Adresse meldet „no supported source“, ohne etwas zu schreiben",
        invalid.includes("Could not detect a supported source"),
        `Notice: „${invalid.slice(0, 110)}“`,
      );

      // Overwrite-Guard (Task C2): ein Ordner mit dieser id existiert, gehört aber keinem
      // verwalteten Plugin. Erst-Install darf ihn nicht still überschreiben.
      await cdp.evaluate(`
        const dir = ${JSON.stringify(targetDir(cfg))};
        await app.vault.adapter.mkdir(dir);
        await app.vault.adapter.write(dir + "/manifest.json", '{"id":"${TARGET_PLUGIN_ID}","name":"Fremd","version":"9.9.9"}');
        return true;
      `);
      await closeModals(cdp);
      await clearNotices(cdp);
      await cdp.evaluate(`
        app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:install-from-url`)});
        await new Promise((r) => setTimeout(r, 400));
        const c = [...document.querySelectorAll(".modal-container")].pop();
        const input = c?.querySelector(".modal input");
        input.value = ${JSON.stringify(forge.repoUrl(REPOS.target))};
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 150));
        return true;
      `);
      await clickModalButton(cdp, "Install");
      if (await waitForModal(cdp, "Install")) await clickModalButton(cdp, "Install"); // HTTP-Warnung
      const overwrite = await waitForModal(cdp, "Install");
      const nenntId = overwrite?.text.includes(TARGET_PLUGIN_ID) === true;
      const warnt = overwrite?.destructive.includes("Install") === true;
      check(
        "D3 fremder Plugin-Ordner: destruktives Overwrite-Confirm, das die id nennt",
        overwrite !== null && nenntId && warnt && overwrite.title.toLowerCase().includes("overwrite"),
        overwrite
          ? `Titel: „${overwrite.title}“ · id genannt: ${nenntId} · destruktiv: ${warnt} ` +
            `(${overwrite.buttonClasses.join(" | ")})`
          : "kein Overwrite-Confirm",
      );
      await clickModalButton(cdp, "Cancel");
      const fremdesManifest = await readFile(cdp, `${targetDir(cfg)}/manifest.json`);
      check(
        "D4 Abbruch am Overwrite-Confirm lässt das fremde Plugin unangetastet",
        fremdesManifest !== null && fremdesManifest.includes('"version":"9.9.9"'),
        `manifest.json danach: ${fremdesManifest?.slice(0, 70) ?? "(weg)"}`,
      );
      await removeTargetPlugin(cdp, cfg);

      // Checksummen: „mismatch“ muss VOR jedem Schreiben abbrechen.
      await closeModals(cdp);
      await clearNotices(cdp);
      await cdp.evaluate(`
        app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:install-from-url`)});
        await new Promise((r) => setTimeout(r, 400));
        const c = [...document.querySelectorAll(".modal-container")].pop();
        const input = c?.querySelector(".modal input");
        input.value = ${JSON.stringify(forge.repoUrl(REPOS.badsum))};
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 150));
        return true;
      `);
      await clickModalButton(cdp, "Install");
      if (await waitForModal(cdp, "Install")) await clickModalButton(cdp, "Install"); // HTTP-Warnung
      const mismatch = await waitForNotice(cdp, "Checksum mismatch", 20_000);
      const nichtsGeschrieben = !(await fileExists(cdp, `${targetDir(cfg)}/main.js`));
      check(
        "D5 falsche Prüfsumme bricht ab, bevor irgendetwas geschrieben wird",
        mismatch.includes("Checksum mismatch") && nichtsGeschrieben,
        `Notice: „${mismatch.slice(0, 90)}“ · main.js auf Platte: ${!nichtsGeschrieben}`,
      );

      // Release ohne Prüfsummen-Datei: kein Abbruch, aber eine ehrliche Zusatzzeile.
      await closeModals(cdp);
      await clearNotices(cdp);
      await cdp.evaluate(`
        app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:install-from-url`)});
        await new Promise((r) => setTimeout(r, 400));
        const c = [...document.querySelectorAll(".modal-container")].pop();
        const input = c?.querySelector(".modal input");
        input.value = ${JSON.stringify(forge.repoUrl(REPOS.nosums))};
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 150));
        return true;
      `);
      await clickModalButton(cdp, "Install");
      if (await waitForModal(cdp, "Install")) await clickModalButton(cdp, "Install"); // HTTP-Warnung
      const absent = await waitForModal(cdp, "Install");
      check(
        "D6 Release ohne checksums.sha256 sagt das im Confirm",
        absent !== null && absent.text.includes("carries no checksum file"),
        absent ? `Text: „${absent.text.slice(0, 130)}“` : "kein Install-Confirm",
      );
      await clickModalButton(cdp, "Cancel");
      await closeModals(cdp);
    },
  },

  {
    key: "settings",
    title: "E — Settings-Tab: Kataloge, Token-Hosts, SecretComponent",
    run: async (cdp, forge, _cfg, verbindung) => {
      await writeSettings(cdp, { catalogs: [], hostSecrets: {}, checkOnStartup: true });
      await cdp.evaluate(`
        app.setting.open();
        await new Promise((r) => setTimeout(r, 500));
        app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
        await new Promise((r) => setTimeout(r, 900));
        return true;
      `);

      const tabId = await cdp.evaluate<string>(`return app.setting?.activeTab?.id ?? "(kein aktiver Tab)";`);
      if (tabId !== PLUGIN_ID) {
        check("E1 Settings-Tab des Plugins ist aktiv", false, `activeTab: ${tabId}`);
        return;
      }

      // Ab Obsidian 1.13 sind die Einstellungen ein eigenes FENSTER: `activeTab.id` stimmt,
      // aber ihr DOM liegt nicht in diesem Renderer. Beide Lagen offen halten und aus der
      // Sache ableiten, welche vorliegt — nie über den (lokalisierten) Fenstertitel.
      const stelle = await settingsStelle(cdp, verbindung);
      if (!stelle) {
        check(
          "E1 Settings-DOM ist erreichbar",
          false,
          "weder ein .modal.mod-settings im Workspace-Fenster noch ein Einstellungen-Fenster auf dem Debug-Port",
        );
        return;
      }
      console.log(`  (Einstellungen ${stelle.eigenesFenster ? "als eigenes Fenster" : "als Modal im Workspace-Fenster"})`);

      try {
        if (stelle.eigenesFenster) await requireVisible(stelle.cdp).catch(() => undefined);

        const felder = await stelle.cdp.evaluate<{ namen: string[]; toggles: number } | null>(
          stelle.inRoot(`
            const items = [...root.querySelectorAll(".setting-item")];
            return {
              namen: items.map((i) => i.querySelector(".setting-item-name")?.textContent?.trim() ?? "").filter(Boolean),
              toggles: root.querySelectorAll(".checkbox-container").length,
            };
          `),
        );
        check(
          "E1 alle drei Einstellungen sind gezeichnet",
          felder !== null &&
            felder.namen.includes("Check for updates on startup") &&
            felder.namen.includes("Catalogs") &&
            felder.namen.includes("Access tokens") &&
            felder.toggles >= 1,
          felder ? `Namen: ${felder.namen.join(" | ").slice(0, 140)} · Toggles: ${felder.toggles}` : "kein Settings-DOM",
        );

        // Die beiden Listen-Einstellungen werden über eine `render`-Hatch gezeichnet
        // (`SettingDefinitionRender`, seit 1.13.0). Gemessen wird, ob dabei eine BEDIENUNG
        // entsteht — nicht, ob der Name dasteht: ein Item mit Namen und ohne Knopf sieht
        // im Screenshot vollständig aus und ist es nicht.
        const bedienung = await stelle.cdp.evaluate<{ listRows: number; knoepfe: string[]; leereItems: string[] } | null>(
          stelle.inRoot(`
            const items = [...root.querySelectorAll(".setting-item")];
            return {
              listRows: root.querySelectorAll(".anysource-sideloader-list-row").length,
              knoepfe: [...root.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
              leereItems: items
                .filter((i) => (i.querySelector(".setting-item-control")?.childElementCount ?? 0) === 0)
                .map((i) => i.querySelector(".setting-item-name")?.textContent?.trim() ?? "(ohne Namen)"),
            };
          `),
        );
        const katalogBedienbar = bedienung !== null && bedienung.knoepfe.includes("Add catalog URL");
        const tokenBedienbar = bedienung !== null && bedienung.knoepfe.includes("Add host");
        const diagnose = bedienung
          ? `Zeilen: ${bedienung.listRows} · Knöpfe: ${bedienung.knoepfe.join(",") || "keine"} · ` +
            `Items ohne Bedienelement: ${bedienung.leereItems.join(", ") || "keins"}`
          : "kein Settings-DOM";

        check("E2 „Catalogs“ ist bedienbar (Eingabefeld + „Add catalog URL“)", katalogBedienbar, diagnose);
        check("E3 „Access tokens“ ist bedienbar (Host-Feld + „Add host“)", tokenBedienbar, diagnose);

        if (katalogBedienbar) {
          await stelle.cdp.evaluate(
            stelle.inRoot(`
              const row = [...root.querySelectorAll(".anysource-sideloader-list-row")]
                .find((r) => [...r.querySelectorAll("button")].some((b) => b.textContent.trim() === "Add catalog URL"));
              const input = row?.querySelector("input");
              if (!input) return false;
              input.value = ${JSON.stringify(forge.catalogUrl)};
              input.dispatchEvent(new Event("input", { bubbles: true }));
              await new Promise((r) => setTimeout(r, 200));
              return true;
            `),
          );
          await clickReal(
            stelle.cdp,
            stelle.el(`[...root.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add catalog URL")`),
            150,
          );
          const nachAdd = await pollUntil<string[]>(
            cdp,
            `
              const c = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.catalogs;
              return c.length > 0 ? c.slice() : null;
            `,
            8000,
            250,
          );
          check(
            "E4 „Add catalog URL“ trägt den Katalog in die Einstellungen ein",
            Array.isArray(nachAdd) && nachAdd[0] === forge.catalogUrl,
            `catalogs: ${JSON.stringify(nachAdd ?? [])}`,
          );
        } else {
          skipped("E4 Katalog eintragen", "die Bedienung fehlt bereits (E2 rot) — der Ablauf hätte keinen Gegenstand");
        }

        if (tokenBedienbar) {
          const host = new URL(forge.giteaBaseUrl).host;
          await stelle.cdp.evaluate(
            stelle.inRoot(`
              const row = [...root.querySelectorAll(".anysource-sideloader-list-row")]
                .find((r) => [...r.querySelectorAll("button")].some((b) => b.textContent.trim() === "Add host"));
              const input = row?.querySelector("input");
              if (!input) return false;
              input.value = ${JSON.stringify(`https://${host}/owner/repo`)};
              input.dispatchEvent(new Event("input", { bubbles: true }));
              await new Promise((r) => setTimeout(r, 200));
              return true;
            `),
          );
          await clickReal(
            stelle.cdp,
            stelle.el(`[...root.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add host")`),
            150,
          );
          const hosts = await pollUntil<string[]>(
            cdp,
            `
              const h = Object.keys(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.hostSecrets);
              return h.length > 0 ? h : null;
            `,
            8000,
            250,
          );
          // Der Schlüsselbund wird bewusst NICHT beschrieben (das änderte den Wirt);
          // geprüft wird, dass die Zeile keinen Geheimwert im Klartext zeigt.
          const zeile = await stelle.cdp.evaluate<{ text: string; klartext: boolean } | null>(
            stelle.inRoot(`
              const row = [...root.querySelectorAll(".anysource-sideloader-list-row")]
                .find((r) => r.querySelector(".setting-item-name")?.textContent?.trim() === ${JSON.stringify(host)});
              if (!row) return null;
              const inputs = [...row.querySelectorAll("input")];
              return {
                text: row.textContent.trim().slice(0, 80),
                klartext: inputs.some((i) => i.type === "text" && i.value.length > 0),
              };
            `),
          );
          check(
            "E5 Token-Host normalisiert (nur host:port), Zeile ohne Klartext-Token",
            Array.isArray(hosts) && hosts[0] === host && zeile !== null && !zeile.klartext,
            `hostSecrets: ${JSON.stringify(hosts ?? [])} · Zeile: „${zeile?.text ?? "(fehlt)"}“ · Klartext: ${zeile?.klartext ?? "?"}`,
          );
        } else {
          skipped("E5 Token-Host + SecretComponent", "die Bedienung fehlt bereits (E3 rot) — der Ablauf hätte keinen Gegenstand");
        }

        // Der Toggle läuft über den deklarativen Pfad und ist damit die Gegenprobe zu
        // E2/E3: er zeigt, dass am Settings-Tab als solchem nichts kaputt ist.
        // Gemessen wird die PLATTE, nicht das Objekt im Speicher.
        const toggleEl = stelle.el(`
          [...root.querySelectorAll(".setting-item")]
            .find((i) => i.querySelector(".setting-item-name")?.textContent?.trim() === "Check for updates on startup")
            ?.querySelector(".checkbox-container")
        `);
        const zustand = async (): Promise<string> =>
          stelle.cdp.evaluate<string>(
            stelle.inRoot(`
              const cb = root.querySelector(".checkbox-container");
              return cb ? (cb.classList.contains("is-enabled") ? "an" : "aus") : "(kein Toggle)";
            `),
          );
        const vorher = await zustand();
        const getroffen = await clickReal(stelle.cdp, toggleEl, 150);
        const nachher = await zustand();
        const imSpeicher = await pollUntil<boolean>(
          cdp,
          `return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.checkOnStartup === false ? true : null;`,
          5000,
          250,
        );
        const persistiert = await pollUntil<string>(
          cdp,
          `
            const p = app.vault.configDir + "/plugins/" + ${JSON.stringify(PLUGIN_ID)} + "/data.json";
            if (!(await app.vault.adapter.exists(p))) return null;
            const t = await app.vault.adapter.read(p);
            return JSON.parse(t).checkOnStartup === false ? t : null;
          `,
          8000,
          300,
        );
        // Die drei Stufen getrennt melden: „Klick kam nicht an“, „kam an, Speicher folgt
        // nicht“ und „Speicher folgt, Platte nicht“ sind drei verschiedene Befunde und
        // schicken die Fehlersuche an drei verschiedene Enden.
        check(
          "E6 Toggle „Check on startup“ landet in data.json, nicht nur im Speicher",
          persistiert !== null,
          `Klick getroffen: ${getroffen} · Toggle: ${vorher} → ${nachher} · ` +
            `im Speicher false: ${imSpeicher === true} · in data.json false: ${persistiert !== null}`,
        );
      } finally {
        if (stelle.eigenesFenster) {
          await releaseAlwaysOnTop(stelle.cdp).catch(() => undefined);
          stelle.cdp.close();
        }
        await cdp.evaluate(`app.setting.close(); await new Promise((r) => setTimeout(r, 300)); return true;`).catch(() => undefined);
      }
    },
  },
  {
    key: "transport",
    title: "F — Transport: die zwei Pflicht-Messpunkte aus dem Final-Review",
    run: async (cdp, forge, cfg) => {
      await removeTargetPlugin(cdp, cfg);
      await writeSettings(cdp, { plugins: [] });
      await closeModals(cdp);
      await clearNotices(cdp);
      forge.setVersion("1.0.0");

      // ── F1: folgt `requestUrl` dem 303 auf dem Raw-Pfad? ──────────────────
      // Gemessen wird über den ECHTEN Install-Weg (der Task verlangt „einmal durch
      // requestUrl installieren"), nicht über einen nackten requestUrl-Aufruf: nur so
      // ist auch belegt, dass die Bytes am Ende korrekt auf der Platte landen.
      forge.clearLog();
      const rawUrl = `${forge.rawBaseUrl}/${OWNER}/rawplugin`;
      await cdp.evaluate(`
        app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:install-from-url`)});
        await new Promise((r) => setTimeout(r, 400));
        const c = [...document.querySelectorAll(".modal-container")].pop();
        const input = c?.querySelector(".modal input");
        input.value = ${JSON.stringify(rawUrl)};
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 150));
        return true;
      `);
      await clickModalButton(cdp, "Install");
      if (await waitForModal(cdp, "Install")) await clickModalButton(cdp, "Install"); // HTTP-Warnung
      const rawConfirm = await waitForModal(cdp, "Install");
      if (rawConfirm) await clickModalButton(cdp, "Install");
      const rawManifest = await pollUntil<string>(
        cdp,
        `
          const p = ${JSON.stringify(`${targetDir(cfg)}/manifest.json`)};
          if (!(await app.vault.adapter.exists(p))) return null;
          return app.vault.adapter.read(p);
        `,
        15_000,
        300,
      );
      if (await waitForModal(cdp, "Enable")) await clickModalButton(cdp, "Later");

      const rawLog = forge.log().filter((e) => e.role === "raw");
      const sahRedirect = rawLog.some((e) => e.status === 303);
      const sahZiel = rawLog.some((e) => e.path.startsWith("/resolved/") && e.status === 200);
      check(
        "F1 requestUrl folgt dem 303 der Gitea/Forgejo-Raw-Form (Pflicht-Messpunkt)",
        sahRedirect && sahZiel && rawManifest !== null,
        `Server sah: ${rawLog.map((e) => `${e.status} ${e.path}`).join(" · ") || "(nichts)"} · ` +
          `manifest.json geschrieben: ${rawManifest !== null}`,
      );
      if (!sahZiel && sahRedirect) {
        measured(
          "F1-Befund",
          "requestUrl hat den 303 NICHT verfolgt — die Raw-Quelle ist damit im Produktivbetrieb tot",
        );
      }
      await removeTargetPlugin(cdp, cfg);
      await writeSettings(cdp, { plugins: [] });
      await closeModals(cdp);

      // ── F2: reicht `requestUrl` `Authorization` über eine Host-Grenze weiter? ──
      // Das ist eine MESSUNG, kein Soll/Ist: beide Ausgänge sind zulässige Antworten,
      // sie stehen nur für verschiedene Sätze in den README Known limitations. Rot ist
      // dieser Punkt nur, wenn der fremde Host gar nicht erreicht wurde — dann ist die
      // Frage unbeantwortet geblieben.
      //
      // Der SecretStore wird für die Dauer durch einen In-Memory-Store ersetzt. Der echte
      // Weg ginge über `app.secretStorage` — und der schreibt in den Schlüsselbund des
      // Rechners. Ein Messwerkzeug, das dort etwas hinterlässt, ändert seinen Wirt
      // (Skill-Falle); der SecretStore ist ein injizierter Port, genau dafür gebaut.
      const giteaHost = new URL(forge.giteaBaseUrl).host;
      await cdp.evaluate(`
        const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        plugin.__smokeSecretStore = plugin.secretStore;
        plugin.secretStore = {
          get: (id) => (id === "smoke-secret" ? "smoke-token-value" : null),
          set: () => {},
          has: (id) => id === "smoke-secret",
        };
        plugin.settings.hostSecrets = { ${JSON.stringify(giteaHost)}: "smoke-secret" };
        await plugin.saveSettings();
        return true;
      `);

      // Beide Redirect-Codes einzeln messen. 303 ist die Forgejo-Raw-Form, 302 die
      // GitHub-Asset-Form — und aus dem einen folgt fuer den anderen nichts (303 schreibt
      // die Methode auf GET um, 302 nicht). Genau diese Verwechslung waere „den
      // Nachbarzweig belegen statt den Fall“.
      const hopFaelle: Array<{ code: number; repo: string; pfad: string }> = [
        { code: 303, repo: REPOS.crosshost, pfad: "/hop/" },
        { code: 302, repo: REPOS.crosshost302, pfad: "/hop302/" },
      ];
      const befunde: string[] = [];
      let alleGemessen = true;

      for (const fall of hopFaelle) {
        forge.clearLog();
        await clearNotices(cdp);
        await closeModals(cdp);
        await cdp.evaluate(`
          app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:install-from-url`)});
          await new Promise((r) => setTimeout(r, 400));
          const c = [...document.querySelectorAll(".modal-container")].pop();
          const input = c?.querySelector(".modal input");
          input.value = ${JSON.stringify(forge.repoUrl(fall.repo))};
          input.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 150));
          return true;
        `);
        await clickModalButton(cdp, "Install");
        if (await waitForModal(cdp, "Install")) await clickModalButton(cdp, "Install"); // HTTP-Warnung
        const crossConfirm = await waitForModal(cdp, "Install");
        if (crossConfirm) await clickModalButton(cdp, "Cancel");
        await closeModals(cdp);

        const alle = forge.log();
        const ersterHop = alle.find((e) => e.role === "gitea" && e.path.startsWith(fall.pfad));
        const fremde = alle.filter((e) => e.role === "other");
        const mitAuth = fremde.filter((e) => e.authorization !== null);
        if (ersterHop === undefined || fremde.length === 0) {
          alleGemessen = false;
          befunde.push(
            `${fall.code}: NICHT MESSBAR (Hop gesehen: ${ersterHop ? "ja" : "nein"}, ` +
              `Zugriffe auf den fremden Host: ${fremde.length})`,
          );
          continue;
        }
        befunde.push(
          mitAuth.length > 0
            ? `${fall.code}: WEITERGEREICHT (${mitAuth.length}/${fremde.length} Zugriffe mit Header)`
            : `${fall.code}: abgestreift (0/${fremde.length} Zugriffe mit Header)`,
        );
      }

      check(
        "F2 Cross-Host-Redirect ist für 303 UND 302 gemessen worden",
        alleGemessen,
        befunde.join(" · "),
      );
      measured("F2 Authorization über die Host-Grenze", befunde.join(" · "));
      if (alleGemessen) {
        const weitergereicht = befunde.some((b) => b.includes("WEITERGEREICHT"));
        measured(
          "F2 Folge für die Known limitations",
          weitergereicht
            ? "requestUrl reicht den Authorization-Header über die Host-Grenze WEITER. Für private " +
              "GitHub-Assets heißt das: der Bearer-Token landet an der signierten S3-URL, und die lehnt " +
              "doppelte Auth typischerweise ab — die in `forge/github.ts::assetRequest` vermutete Kante " +
              "ist real. ⚠️ NICHT gemessen ist die zweite Hälfte (wie S3 darauf antwortet); dafür " +
              "braucht es weiterhin ein echtes privates GitHub-Repo."
            : "requestUrl streift den Header beim Host-Wechsel ab — private GitHub-Assets können dann " +
              "funktionieren, weil die signierte S3-URL ihre Autorisierung selbst trägt.",
        );
      }

      // SecretStore zurück — sofort, nicht erst im finally: der Rest des Laufs soll wieder
      // gegen den echten Port messen.
      await cdp.evaluate(`
        const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (plugin.__smokeSecretStore) { plugin.secretStore = plugin.__smokeSecretStore; delete plugin.__smokeSecretStore; }
        plugin.settings.hostSecrets = {};
        await plugin.saveSettings();
        return true;
      `);
      await removeTargetPlugin(cdp, cfg);
    },
  },

  {
    key: "live",
    title: "L — echte Forge (netzabhängig, darf fehlen)",
    run: async (cdp) => {
      // Der einzige Abschnitt, der das Netz braucht. Er ist die Gegenprobe zur lokalen
      // Forge: dass die Annahmen über die Gitea-Raw-Form und die API-Antwortform nicht
      // nur für den eigenen Server gelten. Kein Netz = übersprungen, nicht rot.
      const erreichbar = await cdp.evaluate<{ ok: boolean; status: number; detail: string }>(`
        try {
          const r = await requestUrl({ url: "https://git.jkaindl.de/api/v1/version", throw: false });
          return { ok: r.status === 200, status: r.status, detail: (r.text ?? "").slice(0, 80) };
        } catch (e) {
          return { ok: false, status: 0, detail: String(e && e.message ? e.message : e).slice(0, 120) };
        }
      `);
      if (!erreichbar.ok) {
        skipped("L1–L2 echte Forge", `git.jkaindl.de nicht erreichbar (${erreichbar.status}: ${erreichbar.detail})`);
        return;
      }
      check(
        "L1 Gitea-API der echten Forge antwortet in erwarteter Form",
        erreichbar.detail.includes("version"),
        `HTTP ${erreichbar.status} · „${erreichbar.detail}“`,
      );

      // Der 303-Befund aus dem Final-Review, diesmal am Original: die Raw-Form
      // /raw/branch/<ref>/ muss über requestUrl bei 200 und echtem Inhalt landen.
      const raw = await cdp.evaluate<{ status: number; ist_json: boolean; detail: string }>(`
        try {
          const url = "https://git.jkaindl.de/jkaindl/obsidian-plugin-catalog/raw/branch/main/catalog.json";
          const r = await requestUrl({ url, throw: false });
          let ist_json = false;
          try { ist_json = typeof JSON.parse(r.text).catalogVersion !== "undefined"; } catch (e) { ist_json = false; }
          return { status: r.status, ist_json, detail: (r.text ?? "").slice(0, 80) };
        } catch (e) {
          return { status: 0, ist_json: false, detail: String(e && e.message ? e.message : e).slice(0, 120) };
        }
      `);
      check(
        "L2 Raw-Form der echten Forgejo-Instanz liefert über requestUrl den Katalog",
        raw.status === 200 && raw.ist_json,
        `HTTP ${raw.status} · JSON erkannt: ${raw.ist_json} · „${raw.detail}“`,
      );
    },
  },
];

// --- Vault-Aufbau ------------------------------------------------------------

/** Staging-Vault aus dem getrackten Fixture herstellen. Eigener Modus, weil Obsidian den
 *  Vault danach neu öffnen muss: `buildVault` setzt `workspace.json` und `data.json`
 *  zurück, und eine laufende Instanz hält beides im Speicher. */
function setupVault(): void {
  const vaultDir = stagingVaultDir(REPO_NAME);
  const log = buildVault({ repoRoot: REPO_ROOT, vaultDir, fixtureDir: FIXTURE_DIR, pluginId: PLUGIN_ID });
  for (const zeile of log) console.log(`  ${zeile}`);
  console.log(
    `\nVault: ${vaultDir}\n` +
      "Ist er Obsidian noch unbekannt, einmal von Hand als Vault öffnen (danach genügt der Link).\n" +
      `  open "obsidian://open?vault=${REPO_NAME}"\n` +
      `  npm run smoke:gui -- --vault ${REPO_NAME}`,
  );
}

// --- Lauf --------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  if (argv.includes("--setup")) {
    setupVault();
    return;
  }

  const port = Number(flag("port") ?? 9222);
  const vault = flag("vault") ?? REPO_NAME;
  const keep = argv.includes("--keep");
  const sectionArg = flag("section");

  const sections = sectionArg ? SECTIONS.filter((s) => s.key === sectionArg) : SECTIONS;
  if (sections.length === 0) {
    throw new Error(`Unbekannter --section ${sectionArg}. Bekannt: ${SECTIONS.map((s) => s.key).join(", ")}`);
  }

  const forge = await startForge();
  console.log(
    `Lokale Forge: gitea ${forge.giteaBaseUrl} · raw ${forge.rawBaseUrl} · fremder Host ${forge.otherBaseUrl}`,
  );
  console.log(`GUI-Smoke — Obsidian auf Port ${port}, Vault „${vault}“`);

  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    await forge.stop();
    throw new Error(
      `Kein Obsidian-Workspace-Fenster auf Port ${port} für Vault „${vault}“. ` +
        `Läuft Obsidian mit --remote-debugging-port=${port} und ist der Vault offen ` +
        `(open "obsidian://open?vault=${vault}")?`,
    );
  }

  // Außerhalb des `try`, damit das `finally` auch nach einem Abbruch mitten im Lauf
  // zurückschreiben kann.
  let previousSettings: string | null = null;
  let configDir = ".obsidian";

  try {
    await cdp.mitschnitt((zeile) => { console.log(`  [renderer] ${zeile}`); });

    // Ohne Fokus drosselt Chromium den Renderer: der DOM bleibt leer, während die App-API
    // den Zustand korrekt meldet — man debuggt ein Phantom. `Page.bringToFront` allein
    // genügt auf macOS nicht.
    if (process.platform === "darwin") {
      try {
        execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
        await new Promise((r) => setTimeout(r, 1500));
      } catch {
        console.log("  (Hinweis: `osascript activate` schlug fehl — Fenster ggf. von Hand nach vorn holen)");
      }
    }
    await requireVisible(cdp);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);

    const vaultName = await cdp.evaluate<string>(`return window.app ? app.vault.getName() : "";`);
    if (!vaultName) throw new Error("Obsidians `app` ist im Renderer nicht erreichbar.");
    if (vaultName !== vault) {
      throw new Error(
        `Verbunden mit Vault „${vaultName}“, erwartet war „${vault}“. Der Smoke läuft nur gegen ` +
          "seinen Staging-Vault — gegen einen Arbeitsvault gemessen wäre das Ergebnis unbelegt " +
          "(Dach-AGENTS.md § Staging-Vaults).",
      );
    }
    console.log(`Vault: ${vaultName}`);

    // Das Plugin NEU LADEN, bevor irgendetwas gemessen wird. `npm run deploy` ersetzt nur
    // die Dateien; die laufende Instanz behält den alten Code im Speicher — ohne diesen
    // Schritt meldet der Smoke den zuletzt geladenen Stand als Ergebnis für den gerade
    // gebauten.
    const plugin = await cdp.evaluate<{ ok: boolean; version?: string }>(`
      const id = ${JSON.stringify(PLUGIN_ID)};
      if (app.plugins.plugins[id]) {
        await app.plugins.disablePlugin(id);
        await new Promise((r) => setTimeout(r, 400));
      }
      await app.plugins.enablePlugin(id);
      await new Promise((r) => setTimeout(r, 1500));
      const p = app.plugins.plugins[id];
      return p ? { ok: true, version: p.manifest.version } : { ok: false };
    `);
    if (!plugin.ok) throw new Error(`Plugin ${PLUGIN_ID} ist nicht aktiv. Erst \`npm run deploy\` in den Staging-Vault.`);
    // Die Version aus der DEPLOYTEN Datei, nicht aus `plugin.manifest`: Obsidian liest die
    // Manifeste beim Start und behält sie im Speicher — ein Deploy danach aktualisiert den
    // geladenen Code, aber nicht diese Angabe (json_viewer-Befund 2026-08-22).
    configDir = await configDirOf(cdp);
    const deployt = await cdp.evaluate<string>(`
      try {
        const pfad = app.vault.configDir + "/plugins/" + ${JSON.stringify(PLUGIN_ID)} + "/manifest.json";
        return JSON.parse(await app.vault.adapter.read(pfad)).version ?? "?";
      } catch (e) { return "?"; }
    `);
    console.log(`Plugin-Version: ${deployt} deployt, ${plugin.version ?? "?"} beim App-Start registriert\n`);

    await closeExtraLeaves(cdp).catch(() => undefined);
    previousSettings = await cdp.evaluate<string>(
      `return JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings ?? {});`,
    );

    for (const section of sections) {
      console.log(`── ${section.title}`);
      await section.run(cdp, forge, configDir, { port, vault });
      console.log("");
    }
  } finally {
    // Aufräumen hängt nie am Ergebnis: auch ein abgebrochener Lauf gibt den Vault so
    // zurück, wie er ihn vorgefunden hat.
    await closeModals(cdp).catch(() => undefined);
    if (!keep) {
      await removeTargetPlugin(cdp, configDir).catch(() => undefined);
      await cdp
        .evaluate(`
          for (const leaf of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) leaf.detach();
          return true;
        `)
        .catch(() => undefined);
    } else {
      console.log(`(--keep: ${TARGET_PLUGIN_ID} bleibt im Vault stehen)`);
    }

    // Die Einstellungen zuletzt — und das ERGEBNIS wird gemeldet, nicht vorausgesetzt:
    // was hier still schiefgeht, lässt eine Testfixtur in den Einstellungen zurück.
    if (previousSettings !== null) {
      const endstand = await cdp
        .evaluate<string>(`
          const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          if (!plugin) return "(Plugin weg)";
          for (const key of Object.keys(plugin.settings)) delete plugin.settings[key];
          Object.assign(plugin.settings, JSON.parse(${JSON.stringify(previousSettings)}));
          if (plugin.__smokeSecretStore) { plugin.secretStore = plugin.__smokeSecretStore; delete plugin.__smokeSecretStore; }
          await plugin.saveSettings();
          await new Promise((r) => setTimeout(r, 600));
          const pfad = app.vault.configDir + "/plugins/" + ${JSON.stringify(PLUGIN_ID)} + "/data.json";
          return JSON.stringify(JSON.parse(await app.vault.adapter.read(pfad)));
        `)
        .catch(() => "(Fehler)");
      const soll = JSON.stringify(JSON.parse(previousSettings) as unknown);
      console.log(
        endstand === soll
          ? "Einstellungen zurückgeschrieben: data.json byte-gleich"
          : `Einstellungen ABWEICHUNG in data.json:\n  vorher:  ${soll}\n  nachher: ${endstand}`,
      );
    }

    await releaseAlwaysOnTop(cdp).catch(() => undefined);
    cdp.close();
    await forge.stop();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`${results.length - failed.length}/${results.length} gruen`);
  if (failed.length > 0) {
    console.log("Rot:");
    for (const r of failed) console.log(`  - ${r.name}: ${r.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
