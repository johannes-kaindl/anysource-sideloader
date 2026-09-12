import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apiHeaders,
  assetRequest,
  issuesUrl,
  latestReleaseUrl,
  parseGithubRelease,
  parseGithubReleaseList,
  releasesListUrl,
} from "../../src/core/forge/github";
import type { RepoRef } from "../../src/core/forge/types";

const REF: RepoRef = { kind: "github", baseUrl: "https://github.com", owner: "TfTHacker", repo: "obsidian42-brat" };
const FIXTURE = readFileSync(new URL("../fixtures/github-release.json", import.meta.url), "utf8");

it("latestReleaseUrl geht an api.github.com", () => {
  expect(latestReleaseUrl(REF)).toBe("https://api.github.com/repos/TfTHacker/obsidian42-brat/releases/latest");
});

it("parseGithubRelease liefert downloadUrl UND apiUrl je Asset", () => {
  const rel = parseGithubRelease(FIXTURE);
  expect(rel.assets.map((a) => a.name)).toContain("main.js");
  const asset = rel.assets.find((a) => a.name === "main.js");
  expect(asset?.downloadUrl).toContain("github.com");     // browser_download_url
  expect(asset?.apiUrl).toContain("api.github.com");      // API-Asset-URL
});

describe("assetRequest — die S3-Redirect-Kante aus der Spec", () => {
  const asset = { name: "main.js", downloadUrl: "https://github.com/o/r/releases/download/1.0/main.js", apiUrl: "https://api.github.com/repos/o/r/releases/assets/1" };
  it("ohne Token: browser_download_url, KEINE Header", () => {
    expect(assetRequest(asset, null)).toEqual({ url: asset.downloadUrl, headers: {} });
  });
  it("mit Token: API-URL + Accept octet-stream + Bearer", () => {
    expect(assetRequest(asset, "tok")).toEqual({
      url: asset.apiUrl,
      headers: { Authorization: "Bearer tok", Accept: "application/octet-stream" },
    });
  });
});

it("releasesListUrl geht an api.github.com/.../releases (nicht /latest)", () => {
  expect(releasesListUrl(REF)).toBe("https://api.github.com/repos/TfTHacker/obsidian42-brat/releases?per_page=100");
});

describe("parseGithubReleaseList", () => {
  it("parst ein Array aus Release-Objekten in ReleaseInfo[]", () => {
    const einzelnes = JSON.parse(FIXTURE) as Record<string, unknown>;
    const zweites = { ...einzelnes, tag_name: "v0.9.0", body: "aeltere Notes" };
    const liste = parseGithubReleaseList(JSON.stringify([einzelnes, zweites]));
    expect(liste).toHaveLength(2);
    expect(liste[0]?.assets.map((a) => a.name)).toContain("main.js");
    expect(liste[1]?.version).toBe("0.9.0");
    expect(liste[1]?.notes).toBe("aeltere Notes");
  });

  it("wirft bei einer Nicht-Liste (z.B. Fehlerobjekt)", () => {
    expect(() => parseGithubReleaseList('{"message":"Not Found"}')).toThrow();
  });

  it("ueberspringt Eintraege ohne tag_name statt die ganze Liste zu verwerfen", () => {
    const liste = parseGithubReleaseList(JSON.stringify([{ body: "kein tag" }, JSON.parse(FIXTURE)]));
    expect(liste).toHaveLength(1);
  });
});

it("issuesUrl + apiHeaders", () => {
  expect(issuesUrl(REF)).toBe("https://github.com/TfTHacker/obsidian42-brat/issues/new");
  expect(apiHeaders("t")).toEqual({ Authorization: "Bearer t" });
  expect(apiHeaders(null)).toEqual({});
});
