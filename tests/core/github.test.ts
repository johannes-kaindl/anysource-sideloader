import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { apiHeaders, assetRequest, issuesUrl, latestReleaseUrl, parseGithubRelease } from "../../src/core/forge/github";
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

it("issuesUrl + apiHeaders", () => {
  expect(issuesUrl(REF)).toBe("https://github.com/TfTHacker/obsidian42-brat/issues/new");
  expect(apiHeaders("t")).toEqual({ Authorization: "Bearer t" });
  expect(apiHeaders(null)).toEqual({});
});
