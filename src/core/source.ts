import { parseRepoUrl, giteaProbeUrl } from "./forge/detect";
import type { AssetRef, HttpPort, HttpRequest, ReleaseInfo, RepoRef } from "./forge/types";
import * as gh from "./forge/github";
import * as gitea from "./forge/gitea";
import { rawFileUrl } from "./forge/raw";
import {
  parseChecksums,
  parsePluginManifest,
  verifyChecksum,
  type ChecksumVerdict,
  type PluginManifestData,
} from "./install";

export async function detectForge(http: HttpPort, url: string): Promise<RepoRef | null> {
  const parsed = parseRepoUrl(url);
  if (!parsed) return null;
  const { baseUrl, owner, repo } = parsed;
  if (new URL(baseUrl).host === "github.com") {
    return { kind: "github", baseUrl, owner, repo };
  }
  const probeRes = await http({ url: giteaProbeUrl(baseUrl) });
  if (probeRes.status === 200) {
    try {
      const body = JSON.parse(probeRes.text) as { version?: unknown };
      if (typeof body.version !== "undefined") {
        return { kind: "gitea", baseUrl, owner, repo };
      }
    } catch {
      // kein JSON -> keine Gitea-API, faellt durch zu raw
    }
  }
  return { kind: "raw", baseUrl, owner, repo };
}

export async function fetchLatestRelease(
  http: HttpPort,
  ref: RepoRef,
  token: string | null,
): Promise<ReleaseInfo> {
  if (ref.kind === "github") {
    const res = await http({ url: gh.latestReleaseUrl(ref), headers: gh.apiHeaders(token) });
    return gh.parseGithubRelease(res.text);
  }
  if (ref.kind === "gitea") {
    const res = await http({ url: gitea.latestReleaseUrl(ref), headers: gitea.authHeaders(token) });
    return gitea.parseGiteaRelease(res.text);
  }
  // raw: kein Release-Endpunkt — Manifest direkt vom Default-Branch laden und ein
  // synthetisches ReleaseInfo daraus bauen.
  const src = { ref, gitRef: "main" };
  const manifestUrl = rawFileUrl(src, "manifest.json");
  const manifestRes = await http({ url: manifestUrl, headers: {} });
  if (manifestRes.status !== 200) {
    throw new Error(`Download fehlgeschlagen fuer manifest.json (${manifestUrl}): HTTP ${manifestRes.status}`);
  }
  const manifest = JSON.parse(manifestRes.text) as { version?: unknown };
  const version = typeof manifest.version === "string" ? manifest.version : "0.0.0";
  return {
    tagName: version,
    version,
    notes: "",
    htmlUrl: `${ref.baseUrl}/${ref.owner}/${ref.repo}`,
    assets: ["main.js", "manifest.json", "styles.css"].map((f) => ({
      name: f,
      downloadUrl: rawFileUrl(src, f),
    })),
  };
}

export interface FetchedPlugin {
  manifest: PluginManifestData;
  files: Array<{ name: string; data: ArrayBuffer }>;
  /** Aggregiertes Checksummen-Verdikt ueber alle geladenen `files` (worst-of:
   *  mismatch > absent > ok). "mismatch" heisst: die Bytes in `files` sind NICHT geprueft
   *  vertrauenswuerdig — ein Aufrufer, der sie auf Platte schreibt, MUSS bei "mismatch"
   *  vor jedem Schreibvorgang abbrechen. Diese Funktion selbst schreibt nichts und
   *  erzwingt das nicht; die Durchsetzung ist Aufgabe einer spaeteren Task. */
  checksums: ChecksumVerdict;
  release: ReleaseInfo;
}

function buildAssetRequest(ref: RepoRef, asset: AssetRef, token: string | null): HttpRequest {
  if (ref.kind === "github") return gh.assetRequest(asset, token);
  return { url: asset.downloadUrl, headers: gitea.authHeaders(token) };
}

const VERDICT_RANK: Record<ChecksumVerdict, number> = { ok: 0, absent: 1, mismatch: 2 };

function worstVerdict(verdicts: ChecksumVerdict[]): ChecksumVerdict {
  let worst: ChecksumVerdict = "ok";
  for (const v of verdicts) if (VERDICT_RANK[v] > VERDICT_RANK[worst]) worst = v;
  return worst;
}

export async function fetchPluginFiles(
  http: HttpPort,
  ref: RepoRef,
  release: ReleaseInfo,
  token: string | null,
): Promise<FetchedPlugin> {
  const findAsset = (name: string): AssetRef | undefined =>
    release.assets.find((a) => a.name === name);

  let checksums: Map<string, string> | null = null;
  const checksumsAsset = findAsset("checksums.sha256");
  if (checksumsAsset) {
    const res = await http(buildAssetRequest(ref, checksumsAsset, token));
    if (res.status === 200) checksums = parseChecksums(res.text);
  }

  const files: Array<{ name: string; data: ArrayBuffer }> = [];
  const verdicts: ChecksumVerdict[] = [];

  for (const name of ["main.js", "manifest.json"]) {
    const asset = findAsset(name);
    if (!asset) throw new Error(`Pflicht-Asset fehlt im Release: ${name}`);
    const res = await http(buildAssetRequest(ref, asset, token));
    if (res.status !== 200) {
      throw new Error(`Download fehlgeschlagen fuer ${name}: HTTP ${res.status}`);
    }
    const data = new Uint8Array(res.arrayBuffer);
    files.push({ name, data: res.arrayBuffer });
    verdicts.push(verifyChecksum(checksums, name, data));
  }

  const stylesAsset = findAsset("styles.css");
  if (stylesAsset) {
    const res = await http(buildAssetRequest(ref, stylesAsset, token));
    if (res.status === 200) {
      const data = new Uint8Array(res.arrayBuffer);
      files.push({ name: "styles.css", data: res.arrayBuffer });
      verdicts.push(verifyChecksum(checksums, "styles.css", data));
    } else if (res.status !== 404) {
      throw new Error(`Download fehlgeschlagen fuer styles.css: HTTP ${res.status}`);
    }
  }

  const manifestFile = files.find((f) => f.name === "manifest.json");
  if (!manifestFile) throw new Error("manifest.json konnte nicht geladen werden");
  const manifestText = new TextDecoder().decode(manifestFile.data);
  const manifest = parsePluginManifest(manifestText);

  return {
    manifest,
    files,
    checksums: worstVerdict(verdicts),
    release,
  };
}
