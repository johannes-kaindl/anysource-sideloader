/**
 * Aufnahme-Treiber fuer die README-Bilder — faehrt den Vertrag aus `docs/images/README.md`
 * gegen ein **laufendes** Obsidian. Bruecke, Aufnahme-Primitive und Fixture→Vault liegen
 * zentral im Dach (`../tools/obsidian-cdp/`), hier steht nur das Rezept.
 *
 * ## Ablauf (Zweitinstanz, eigener Port — die reguelaere Instanz auf 9222 bleibt tabu)
 *
 * ```bash
 * UD=/tmp/obs-test-anysource-sideloader
 * npm run build && npm run shots -- --setup          # Vault aus docs/images/fixture bauen
 * # $UD/obsidian.json: Vault eintragen + "language":"en"; localStorage "language" = "en"
 * # (der Treiber prueft beides und bricht sonst ab), Obsidian mit
 * #   --user-data-dir=$UD --remote-debugging-port=9326 starten, Restricted Mode aufheben
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label anysource-sideloader \
 *   --intent "shots.ts" --exclusive focus --port 9326 --ttl 600
 * npm run shots -- --port 9326                       # alles
 * npm run shots -- --port 9326 --only hero.png       # ein Bild
 * ```
 *
 * ## Woher die Daten kommen
 *
 * Der Katalog wird von einem kleinen lokalen HTTP-Server ausgeliefert (`fixture/demo/
 * catalog.json`, generische englische Eintraege); die getrackten Plugins stehen in
 * `fixture/demo/state.json` und werden zur Laufzeit in die Plugin-Einstellungen geschrieben,
 * die installierten Manifeste in `.obsidian/plugins/<id>/`. Es gibt kein Netz und kein
 * Konto — und keine Zeile, die ein echtes Plugin nennt.
 *
 * ⚠️ Der Katalog-URL steht in der Sektion „Catalogs“. Keines der Bilder zeigt sie: sie waere
 * `http://127.0.0.1:<port>/…`, ein Ort, den es beim Leser nicht gibt.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { argv, cwd, env, exit } from "node:process";

import { attachTo, Cdp, pollUntil } from "../../tools/obsidian-cdp/cdp.js";
import { capture, setWindowSize, writeShot, type Rect, type ShotOptions } from "../../tools/obsidian-cdp/shot.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "anysource-sideloader";
const REPO_NAME = "anysource-sideloader";
const OUT_DIR = "docs/images";
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;

interface Shot {
  name: string;
  klasse: "hero" | "feature" | "detail";
  run(ctx: Kontext): Promise<{ cdp: Cdp; box: Rect } | null>;
}

interface Kontext {
  workspace: Cdp;
  port: number;
}

interface DemoState {
  plugins: unknown[];
  untrackedInstalled: Array<{ id: string; name: string; version: string }>;
}

// --- Gegenstelle ----------------------------------------------------------------------

function startKatalogServer(katalog: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(katalog);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}/catalog.json` });
    });
  });
}

/** Zustand herstellen, den JEDES Bild voraussetzt: Katalog abonniert, drei Plugins
 *  verfolgt, eines installiert-aber-unverfolgt. Wird vor jedem Bild wiederholt — ein Bild
 *  darf nicht vom Zustand abhaengen, den das vorige hinterliess. */
async function zustandHerstellen(cdp: Cdp, katalogUrl: string, state: DemoState): Promise<void> {
  const manifeste = [
    ...(state.plugins as Array<{ id: string; installedVersion: string }>).map((p) => ({
      id: p.id, name: p.id, version: p.installedVersion,
    })),
    ...state.untrackedInstalled,
  ];
  await cdp.evaluate(`
    const dir = app.vault.configDir + "/plugins";
    for (const m of ${JSON.stringify(manifeste)}) {
      const d = dir + "/" + m.id;
      if (!(await app.vault.adapter.exists(d))) await app.vault.adapter.mkdir(d);
      await app.vault.adapter.write(d + "/manifest.json", JSON.stringify({
        id: m.id, name: m.name, version: m.version, minAppVersion: "1.5.0",
        description: "Demo", author: "Demo",
      }));
    }
    const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    plugin.settings.catalogs = [${JSON.stringify(katalogUrl)}];
    plugin.settings.plugins = ${JSON.stringify(state.plugins)};
    plugin.settings.hostSecrets = {};
    plugin.settings.checkOnStartup = true;
    await plugin.saveSettings();
    return true;
  `);
}

/** Einstellungen des Plugins oeffnen und das Fenster holen (ab Obsidian 1.13 ein eigenes). */
async function einstellungenOeffnen(ctx: Kontext): Promise<Cdp | null> {
  await ctx.workspace.evaluate(`
    app.setting.open();
    await new Promise((r) => setTimeout(r, 500));
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 900));
    // Den Tab NEU zeichnen lassen: er haelt seinen Aufbau vom letzten Oeffnen, und die
    // Einstellungen wurden seitdem geschrieben — ohne das zeigt das Bild den Stand davor
    // (im ersten Lauf: Standard-Katalog und leere Listen, obwohl data.json stimmte).
    const tab = (app.setting.pluginTabs ?? []).find((t) => t.id === ${JSON.stringify(PLUGIN_ID)});
    if (tab) {
      if (typeof tab.update === "function") tab.update();
      else if (typeof tab.display === "function") tab.display();
    }
    await new Promise((r) => setTimeout(r, 600));
    return true;
  `);
  const fenster = await attachTo("settings", ctx.port, REPO_NAME);
  if (!fenster) return null;
  await fenster.send("Page.bringToFront");
  // Gross genug, dass `.vertical-tab-content` nicht intern scrollt: getBoundingClientRect
  // liefert nur die SICHTBARE Flaeche, und ein abgeschnittenes Bild meldet keinen Fehler.
  await setWindowSize(fenster, 1000, 1500);
  // Der Katalog kommt aus dem Netz; „Loading catalogs…“ ist kein Bildzustand.
  const geladen = await pollUntil<boolean>(fenster, `
    return [...document.querySelectorAll(".setting-item button")].some((b) =>
      ["Install", "Track for updates"].includes(b.textContent.trim()));
  `, 15_000, 300);
  if (!geladen) {
    console.log("      · Katalog kam nicht in die Liste — Bild wuerde den Leerzustand zeigen");
    await settingsSchliessen(ctx, fenster);
    return null;
  }
  await new Promise((r) => setTimeout(r, 600));
  return fenster;
}

async function settingsSchliessen(ctx: Kontext, fenster: Cdp): Promise<void> {
  await fenster.evaluate("window.close(); return true;").catch(() => undefined);
  fenster.close();
  await ctx.workspace.evaluate(`app.setting.close(); return true;`).catch(() => undefined);
}

/** Rechteck der Sektion zwischen zwei Ueberschriften (die zweite darf fehlen = bis zum Ende). */
async function sektionBox(fenster: Cdp, von: string, bis: string | null): Promise<Rect | null> {
  return fenster.evaluate<Rect | null>(`
    const heads = [...document.querySelectorAll(".setting-item-heading")];
    const find = (t) => heads.find((h) => h.querySelector(".setting-item-name")?.textContent?.trim() === t);
    const a = find(${JSON.stringify(von)});
    if (!a) return null;
    const b = ${bis === null ? "null" : `find(${JSON.stringify(bis)})`};
    // Die Ueberschrift nach oben holen: das Fenster ist durch den Bildschirm begrenzt (rund
    // 950 px), und ein Ausschnitt ueber den Rand hinaus wird SCHWARZ statt abgeschnitten.
    a.scrollIntoView({ block: "start" });
    await new Promise((r) => setTimeout(r, 300));
    const ra = a.getBoundingClientRect();
    const paneEl = document.querySelector(".vertical-tab-content");
    const pane = paneEl.getBoundingClientRect();
    const naechste = b ? b.getBoundingClientRect().top : pane.bottom;
    const bottom = Math.min(naechste, pane.bottom - 8);
    return { x: pane.left, y: ra.top - 8, width: pane.width, height: bottom - ra.top + 8 };
  `);
}

// --- Rezept ---------------------------------------------------------------------------

/** Ein Bild aus einem Ausschnitt des Einstellungen-Fensters. */
function settingsBild(name: string, klasse: Shot["klasse"], ausschnitt: (f: Cdp) => Promise<Rect | null>): Shot {
  return {
    name,
    klasse,
    async run(ctx) {
      const fenster = await einstellungenOeffnen(ctx);
      if (!fenster) return null;
      const box = await ausschnitt(fenster);
      if (!box) {
        await settingsSchliessen(ctx, fenster);
        return null;
      }
      return { cdp: fenster, box };
    },
  };
}

const SHOTS: Shot[] = [
  // Hero: Kopf des Tabs — Pruefknopf, Updates, Installed, Beginn von Browse. Querformat (H <= B).
  settingsBild("hero.png", "hero", async (f) => {
    // Ab der ersten Zeile (ohne das leere Polster oben), Querformat: Hoehe <= Breite.
    return f.evaluate<Rect | null>(`
      const pane = document.querySelector(".vertical-tab-content")?.getBoundingClientRect();
      const first = document.querySelector(".vertical-tab-content .setting-item")?.getBoundingClientRect();
      if (!pane || !first) return null;
      const y = first.top - 16;
      // Vor der Ueberschrift „Browse catalogs“ enden: ein halb abgeschnittener Titel am
      // unteren Rand sieht nach einem Fehler aus.
      const browse = [...document.querySelectorAll(".setting-item-heading")]
        .find((h) => h.querySelector(".setting-item-name")?.textContent?.trim() === "Browse catalogs");
      const ende = browse ? browse.getBoundingClientRect().top - 12 : pane.bottom;
      return { x: pane.left, y, width: pane.width, height: Math.min(ende - y, pane.width * 0.98) };`);
  }),
  settingsBild("catalog.png", "feature", (f) => sektionBox(f, "Browse catalogs", "Catalogs")),
  {
    name: "install-url.png",
    klasse: "detail",
    async run(ctx) {
      const cdp = ctx.workspace;
      await cdp.send("Page.bringToFront");
      await cdp.evaluate(`
        app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:install-from-url`)});
        await new Promise((r) => setTimeout(r, 600));
        const input = document.querySelector(".modal input[type=text]");
        if (!input) return false;
        input.focus();
        input.value = "https://github.com/jane-doe/reading-queue";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      `);
      const box = await cdp.evaluate<Rect | null>(`
        const m = document.querySelector(".modal");
        if (!m) return null;
        const r = m.getBoundingClientRect(), pad = 40;
        return { x: r.left - pad, y: r.top - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
      `);
      return box ? { cdp, box } : null;
    },
  },
];

/** Nach JEDEM Bild aufraeumen — der Zustand des einen darf das naechste nicht bestimmen. */
async function aufraeumen(ctx: Kontext): Promise<void> {
  await ctx.workspace.evaluate(`
    document.querySelector(".modal-close-button")?.click();
    app.setting.close();
    return true;
  `).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 400));
}

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

async function main(): Promise<void> {
  const repoRoot = cwd();
  const outDir = join(repoRoot, OUT_DIR);
  const fixtureDir = join(repoRoot, "docs/images/fixture");

  if (argv.includes("--list")) {
    for (const s of SHOTS) console.log(`  ${s.klasse.padEnd(8)} ${s.name}`);
    return;
  }

  if (argv.includes("--setup")) {
    const vaultDir = stagingVaultDir(REPO_NAME);
    console.log(`Aufnahme-Vault: ${vaultDir}`);
    for (const zeile of buildVault({ repoRoot, vaultDir, fixtureDir, pluginId: PLUGIN_ID })) console.log(`  ${zeile}`);
    console.log("\nObsidian danach neu starten (Zweitinstanz, eigener Port); Sprache Englisch, Restricted Mode aus.");
    return;
  }

  const port = Number(flag("--port") ?? env.SHOTS_PORT ?? 9222);
  const nur = flag("--only");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const workspace = await attachTo("workspace", port, REPO_NAME);
  if (!workspace) throw new Error(`Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.`);
  console.log(`Verbunden auf Port ${port}.\n`);

  // Sprache VOR dem ersten Bild pruefen: die Oberflaeche traegt sonst deutsche Beschriftungen
  // in einem englischen README — und der Lauf meldet Erfolg.
  const sprache = await workspace.evaluate<string>(`return window.localStorage.getItem("language") ?? "(nicht gesetzt)";`);
  if (sprache !== "en") {
    throw new Error(`Obsidian-Sprache ist "${sprache}", nicht "en". obsidian.json UND localStorage "language" setzen, dann neu starten.`);
  }
  const plugin = await workspace.evaluate<boolean>(`return !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];`);
  if (!plugin) throw new Error("Plugin nicht geladen (Restricted Mode? app.plugins.setEnable(true)).");

  await workspace.send("Page.bringToFront");
  await setWindowSize(workspace, 1200, 800);
  // Helles Theme: der Fixture-Ordner setzt es nicht, Obsidian folgt sonst dem System.
  await workspace.evaluate(`
    app.vault.setConfig("theme", "moonstone");
    app.workspace.trigger("css-change");
    return true;
  `);

  const state = JSON.parse(readFileSync(join(fixtureDir, "demo/state.json"), "utf-8")) as DemoState;
  const { server, url } = await startKatalogServer(readFileSync(join(fixtureDir, "demo/catalog.json"), "utf-8"));
  const ctx: Kontext = { workspace, port };
  const opts: ShotOptions = { outDir, captureWidth: CAPTURE_WIDTH, thumbWidth: THUMB_WIDTH };

  let ok = 0;
  let fehlend = 0;
  try {
    for (const shot of SHOTS) {
      if (nur && shot.name !== nur) continue;
      try {
        await zustandHerstellen(workspace, url, state);
        const ziel = await shot.run(ctx);
        if (!ziel) {
          console.log(`  ✗ ${shot.name} — Zustand kam nicht zustande`);
          fehlend++;
        } else {
          const png = await capture(ziel.cdp, ziel.box, 2);
          console.log(`  ✓ ${await writeShot(ziel.cdp, shot.name, png, { ...opts, thumb: shot.klasse === "detail" })}`);
          if (ziel.cdp !== workspace) {
            await ziel.cdp.evaluate("window.close(); return true;").catch(() => undefined);
            ziel.cdp.close();
          }
          ok++;
        }
      } catch (err) {
        console.log(`  ✗ ${shot.name} — ${(err as Error).message}`);
        fehlend++;
      }
      await aufraeumen(ctx);
    }
  } finally {
    server.close();
    // Auslieferungszustand zurueck: der Lauf hat Katalog und Plugins gesetzt.
    workspace.close();
  }
  console.log(`\n${ok} Bild(er) geschrieben, ${fehlend} offen.`);
  if (fehlend) exit(1);
}

main().catch((err: Error) => {
  console.error(err.message);
  exit(1);
});
