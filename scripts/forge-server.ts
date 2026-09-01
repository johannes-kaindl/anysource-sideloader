/**
 * Lokale Forge-Gegenstelle fuer den GUI-Smoke — drei HTTP-Server auf 127.0.0.1.
 *
 * ## Warum lokal statt gegen die echte Forge
 *
 * Der Pruefling ist netzzentriert: ohne Gegenstelle misst ein GUI-Smoke nur Empty-States.
 * Gegen `git.jkaindl.de` zu fahren waere ehrlicher, aber nicht wiederholbar — ein Lauf
 * haenge dann an Netz, Token und daran, dass genau ein bestimmtes Release dort noch
 * liegt. Vor allem aber: **die beiden Pflicht-Messpunkte lassen sich an einer echten
 * Forge gar nicht herstellen** (Cockpit-Task „GUI-Smoke einrichten"):
 *
 *  - folgt Obsidians `requestUrl` einem **303** auf dem Raw-Pfad?
 *  - reicht `requestUrl` den `Authorization`-Header ueber einen **Cross-Host-Redirect**
 *    weiter? (Das Ergebnis entscheidet, ob „private GitHub is experimental" in den README
 *    Known limitations eine Vermutung bleibt oder eine Messung wird.)
 *
 * Ein Server, der beides auf Kommando tut, beantwortet die Fragen in einer Sekunde und
 * ohne fremdes Konto. **Was er NICHT ersetzt:** den Beweis, dass eine echte Forgejo-
 * Instanz sich so verhaelt wie hier angenommen — dafuer gibt es Abschnitt L im Treiber
 * (`--section live`, netzabhaengig und ausdruecklich ueberspringbar) und die
 * Integrationstests in `tests/integration/live-forge.test.ts`.
 *
 * ⚠️ REGISTRY-Warnung, die hier ausdruecklich NICHT greift: „ein lokaler Testserver mit
 * `Access-Control-Allow-Origin: *` verdeckt den Fehler" (audio-interface, 2026-08-16).
 * Dieser Befund gilt fuer Pruefungen, die `fetch` aus dem Renderer benutzen — dort
 * verdeckt ein freundlicher CORS-Header, dass die echte Quelle keinen schickt. Der
 * Pruefling hier laeuft ausschliesslich ueber `requestUrl` (`src/obsidian/http.ts`), und
 * das geht am CORS-Modell des Renderers vorbei. Dieser Server setzt deshalb **keine**
 * CORS-Header — dann kann er auch keine verdecken.
 *
 * ## Die drei Server und warum es drei sind
 *
 * | Rolle | Was ihn ausmacht |
 * |---|---|
 * | `gitea` | beantwortet `/api/v1/version` → `detectForge` erkennt `kind: "gitea"` |
 * | `raw`   | beantwortet `/api/v1/version` mit 404 → derselbe Code faellt auf `kind: "raw"` |
 * | `other` | fremder Host fuer den Cross-Host-Redirect; protokolliert, was ankommt |
 *
 * Zwei Ports auf 127.0.0.1 sind fuer `new URL(...).host` zwei verschiedene Hosts — genau
 * die Unterscheidung, auf der der Same-Host-Guard in `src/core/source.ts`
 * (`buildAssetRequest`) beruht. Der Cross-Host-Fall ist damit ohne zweite Maschine
 * herstellbar.
 */

import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** Ein einzelner Zugriff, wie ihn der Server gesehen hat. Der `authorization`-Wert ist
 *  der eigentliche Messwert des Cross-Host-Punkts — deshalb wird er festgehalten, nicht
 *  nur die Tatsache des Zugriffs. */
export interface ForgeRequestLog {
  role: ForgeRole;
  method: string;
  path: string;
  /** Roher `Authorization`-Header oder `null`, wenn keiner ankam. */
  authorization: string | null;
  status: number;
}

export type ForgeRole = "gitea" | "raw" | "other";

/** Die Repos, die diese Forge kennt. Jeder Name steht fuer genau eine Kante des
 *  Install-Pfads, damit ein roter Pruefpunkt sagt, welche gemeint war. */
export const REPOS = {
  /** Der Normalfall: Release mit vier Assets und korrekten Pruefsummen. */
  target: "target",
  /** `checksums.sha256` passt nicht zu den Bytes → Verdikt "mismatch", darf nie schreiben. */
  badsum: "badsum",
  /** Release ohne `checksums.sha256` → Verdikt "absent" → Zusatzzeile im Confirm. */
  nosums: "nosums",
  /** Asset-URLs zeigen auf den gitea-Host, der mit 303 auf den FREMDEN Host umleitet. */
  crosshost: "crosshost",
  /** Dasselbe mit **302**. Eigener Fall, weil die beiden Codes verschiedene Dinge sind:
   *  303 schreibt die Methode auf GET um, 302 nicht — ob ein HTTP-Client seine Header
   *  gleich behandelt, folgt daraus nicht. GitHub schickt bei Release-Assets 302, und
   *  genau dieser Fall ist die offene Frage aus `forge/github.ts::assetRequest`. Aus einer
   *  303-Messung auf ihn zu schliessen waere der Nachbarzweig statt des Falls. */
  crosshost302: "crosshost302",
} as const;

export const OWNER = "smoke";

/** Plugin-id des Test-Artefakts. Bewusst nicht der Name eines echten Plugins: was der
 *  Smoke installiert, landet als echter Ordner unter `.obsidian/plugins/` des
 *  Staging-Vaults, und ein Namenszusammenstoss mit einem echten Plugin waere ein
 *  Loeschvorgang am falschen Ort. */
export const TARGET_PLUGIN_ID = "asl-smoke-target";
export const TARGET_PLUGIN_NAME = "ASL Smoke Target";

function manifestFor(version: string): string {
  return `${JSON.stringify(
    {
      id: TARGET_PLUGIN_ID,
      name: TARGET_PLUGIN_NAME,
      version,
      minAppVersion: "1.0.0",
      description: "Throwaway artefact served by the GUI smoke's local forge.",
      author: "gui-smoke",
      isDesktopOnly: false,
    },
    null,
    2,
  )}\n`;
}

/** Ein Plugin, das nichts tut, aber ein gueltiges Plugin IST. Der Smoke aktiviert es
 *  nicht (er waehlt im Enable-Confirm „Later"); trotzdem soll auf der Platte kein
 *  kaputtes Artefakt liegen, falls jemand mit `--keep` nachsieht. */
function mainJsFor(version: string): string {
  return [
    "'use strict';",
    "var obsidian = require('obsidian');",
    "class AslSmokeTarget extends obsidian.Plugin {",
    `  onload() { console.log('asl-smoke-target ${version} loaded'); }`,
    "}",
    "module.exports = AslSmokeTarget;",
    "",
  ].join("\n");
}

const STYLES_CSS = "/* asl-smoke-target: intentionally empty */\n";

function sha256(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

/** Dateien eines Releases in der Version `version`. */
function filesFor(version: string): Record<string, string> {
  return {
    "main.js": mainJsFor(version),
    "manifest.json": manifestFor(version),
    "styles.css": STYLES_CSS,
  };
}

function checksumsFor(version: string, broken: boolean): string {
  const files = filesFor(version);
  return Object.entries(files)
    .map(([name, body]) => {
      const hash = broken ? "0".repeat(64) : sha256(body);
      return `${hash}  ${name}`;
    })
    .join("\n") + "\n";
}

export interface RunningForge {
  /** Basis mit Gitea-API — `detectForge` liefert dafuer `kind: "gitea"`. */
  giteaBaseUrl: string;
  /** Basis ohne API — `detectForge` faellt auf `kind: "raw"` zurueck. */
  rawBaseUrl: string;
  /** Fremder Host; Ziel des Cross-Host-Redirects. */
  otherBaseUrl: string;
  /** URL des Katalogs (liegt auf dem gitea-Host). */
  catalogUrl: string;
  /** Repo-URL im Katalog-/Install-Format, z. B. `.../smoke/target`. */
  repoUrl(repo: string): string;
  /** Version, die der Release-Endpunkt ab jetzt meldet (Update-Pfad). */
  setVersion(version: string): void;
  /** Alles, was die drei Server gesehen haben — in Ankunftsreihenfolge. */
  log(): ForgeRequestLog[];
  /** Protokoll leeren, damit ein Pruefpunkt nur seine eigenen Zugriffe misst. */
  clearLog(): void;
  stop(): Promise<void>;
}

interface Route {
  (req: IncomingMessage, res: ServerResponse, url: URL): boolean;
}

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  contentType = "text/plain; charset=utf-8",
): number {
  res.writeHead(status, { "Content-Type": contentType, "Content-Length": Buffer.byteLength(body) });
  res.end(body);
  return status;
}

function sendJson(res: ServerResponse, status: number, value: unknown): number {
  return send(res, status, JSON.stringify(value), "application/json; charset=utf-8");
}

/** 303 statt 302 mit Absicht: genau diesen Code schickt Forgejo auf dem Raw-Pfad
 *  (`/raw/{ref}/…`), und genau er ist der ungemessene Teil des Transports. */
function redirect303(res: ServerResponse, location: string): number {
  res.writeHead(303, { Location: location, "Content-Length": 0 });
  res.end();
  return 303;
}

/** 302: den Code schickt GitHub auf Release-Assets (Ziel ist eine signierte S3-URL).
 *  Eigene Funktion, weil 302 und 303 nicht dasselbe sind — 303 schreibt die Methode auf
 *  GET um, 302 nicht. Ob ein Client seine Header gleich behandelt, folgt daraus nicht,
 *  und der GitHub-Fall haengt genau daran. */
function redirect302(res: ServerResponse, location: string): number {
  res.writeHead(302, { Location: location, "Content-Length": 0 });
  res.end();
  return 302;
}

/**
 * Startet die drei Server auf freien Ports.
 *
 * Freie Ports statt fester: ein fester Port kollidiert mit einem haengengebliebenen
 * Vorlauf und der Fehlschlag saehe aus wie ein Defekt des Prueflings.
 */
export async function startForge(): Promise<RunningForge> {
  let version = "1.0.0";
  const log: ForgeRequestLog[] = [];

  const listen = async (role: ForgeRole, route: Route): Promise<{ server: Server; base: string }> => {
    const server = createServer((req, res) => {
      const path = req.url ?? "/";
      const url = new URL(path, "http://127.0.0.1");
      const auth = req.headers.authorization ?? null;
      const handled = route(req, res, url);
      if (!handled) send(res, 404, `no route: ${url.pathname}`);
      // Protokolliert wird NACH der Antwort und mit `res.statusCode` — der Header ist da
      // schon geschrieben, der Wert also der tatsaechlich gesendete. Der `authorization`-
      // Eintrag ist der eigentliche Messwert des Cross-Host-Punkts: ohne ihn waere ein
      // Zugriff auf den fremden Host zwar sichtbar, aber die Frage unbeantwortet.
      log.push({
        role,
        method: req.method ?? "GET",
        path: url.pathname,
        authorization: auth,
        status: res.statusCode,
      });
    });
    await new Promise<void>((ok, fail) => {
      server.once("error", fail);
      server.listen(0, "127.0.0.1", () => { ok(); });
    });
    const port = (server.address() as AddressInfo).port;
    return { server, base: `http://127.0.0.1:${port}` };
  };

  // Die Basen werden erst nach dem Binden bekannt, die Routen brauchen sie aber schon —
  // deshalb ueber Boxen, die die Routen zur Laufzeit lesen.
  const bases = { gitea: "", raw: "", other: "" };

  const assetsFor = (repo: string): Array<{ name: string; browser_download_url: string }> => {
    const host = repo === REPOS.crosshost
      ? `${bases.gitea}/hop`
      : repo === REPOS.crosshost302
        ? `${bases.gitea}/hop302`
        : `${bases.gitea}/attachments`;
    const names = repo === REPOS.nosums
      ? ["main.js", "manifest.json", "styles.css"]
      : ["main.js", "manifest.json", "styles.css", "checksums.sha256"];
    return names.map((name) => ({ name, browser_download_url: `${host}/${repo}/${name}` }));
  };

  const fileBody = (repo: string, name: string): string | null => {
    if (name === "checksums.sha256") {
      if (repo === REPOS.nosums) return null;
      return checksumsFor(version, repo === REPOS.badsum);
    }
    const files = filesFor(version);
    return files[name] ?? null;
  };

  const giteaRoute: Route = (req, res, url) => {
    const p = url.pathname;

    if (p === "/api/v1/version") {
      sendJson(res, 200, { version: "1.22.0+asl-smoke" });
      return true;
    }

    // Katalog. Liegt auf derselben Forge wie die Plugins — so wie der echte
    // DEFAULT_CATALOG_URL auch.
    if (p === "/catalog.json") {
      sendJson(res, 200, {
        catalogVersion: 1,
        name: "GUI-Smoke catalog",
        plugins: [
          {
            id: TARGET_PLUGIN_ID,
            name: TARGET_PLUGIN_NAME,
            description: "The install target for the GUI smoke run.",
            repo: `${bases.gitea}/${OWNER}/${REPOS.target}`,
            author: "gui-smoke",
            tags: ["smoke", "throwaway"],
          },
          {
            id: "asl-smoke-decoy",
            name: "Search Decoy",
            description: "Only here so the search field has something to filter away.",
            repo: `${bases.gitea}/${OWNER}/${REPOS.nosums}`,
            author: "gui-smoke",
            tags: ["decoy"],
          },
        ],
      });
      return true;
    }

    const release = /^\/api\/v1\/repos\/([^/]+)\/([^/]+)\/releases\/latest$/.exec(p);
    if (release) {
      const repo = release[2] ?? "";
      sendJson(res, 200, {
        tag_name: `v${version}`,
        body: `Release notes for ${repo} ${version}.\n\n- served by the GUI smoke's local forge`,
        html_url: `${bases.gitea}/${OWNER}/${repo}`,
        assets: assetsFor(repo),
      });
      return true;
    }

    // Cross-Host-Kante: derselbe Host wie `baseUrl`, damit der Same-Host-Guard den
    // `Authorization`-Header ueberhaupt mitschickt — und von hier per 303 auf den
    // FREMDEN Host. Was dort ankommt, ist der Messwert.
    const hop = /^\/hop\/([^/]+)\/(.+)$/.exec(p);
    if (hop) {
      redirect303(res, `${bases.other}/handed-over/${hop[1]}/${hop[2]}`);
      return true;
    }

    const hop302 = /^\/hop302\/([^/]+)\/(.+)$/.exec(p);
    if (hop302) {
      redirect302(res, `${bases.other}/handed-over/${hop302[1]}/${hop302[2]}`);
      return true;
    }

    const asset = /^\/attachments\/([^/]+)\/(.+)$/.exec(p);
    if (asset) {
      const body = fileBody(asset[1] ?? "", asset[2] ?? "");
      if (body === null) send(res, 404, "no such asset");
      else send(res, 200, body, "application/octet-stream");
      return true;
    }

    return false;
  };

  const rawRoute: Route = (req, res, url) => {
    const p = url.pathname;
    // KEIN /api/v1/version: genau daran erkennt `detectForge`, dass dieser Host keine
    // Gitea-API hat, und faellt auf den Raw-Pfad zurueck.
    if (p === "/api/v1/version") {
      send(res, 404, "not a forge api");
      return true;
    }
    // Forgejos Raw-Form. Sie antwortet in der Praxis mit 303 auf eine aufgeloeste
    // Adresse — das ist der Redirect, dem `requestUrl` folgen muss.
    const raw = /^\/([^/]+)\/([^/]+)\/raw\/(?:branch\/|tag\/)?([^/]+)\/(.+)$/.exec(p);
    if (raw) {
      redirect303(res, `${bases.raw}/resolved/${raw[4]}`);
      return true;
    }
    const resolved = /^\/resolved\/(.+)$/.exec(p);
    if (resolved) {
      const body = filesFor(version)[resolved[1] ?? ""];
      if (body === undefined) send(res, 404, "no such file");
      else send(res, 200, body, "application/octet-stream");
      return true;
    }
    return false;
  };

  const otherRoute: Route = (req, res, url) => {
    const handed = /^\/handed-over\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (!handed) return false;
    const body = fileBody(handed[1] ?? "", handed[2] ?? "");
    if (body === null) send(res, 404, "no such asset");
    else send(res, 200, body, "application/octet-stream");
    return true;
  };

  const gitea = await listen("gitea", giteaRoute);
  const raw = await listen("raw", rawRoute);
  const other = await listen("other", otherRoute);
  bases.gitea = gitea.base;
  bases.raw = raw.base;
  bases.other = other.base;

  const stopOne = (server: Server): Promise<void> =>
    new Promise((ok) => {
      server.closeAllConnections?.();
      server.close(() => { ok(); });
    });

  return {
    giteaBaseUrl: gitea.base,
    rawBaseUrl: raw.base,
    otherBaseUrl: other.base,
    catalogUrl: `${gitea.base}/catalog.json`,
    repoUrl: (repo) => `${gitea.base}/${OWNER}/${repo}`,
    setVersion: (v) => { version = v; },
    log: () => log.slice(),
    clearLog: () => { log.length = 0; },
    stop: async () => {
      await Promise.all([stopOne(gitea.server), stopOne(raw.server), stopOne(other.server)]);
    },
  };
}
