import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  authHeaders,
  issuesUrl,
  latestReleaseUrl,
  parseGiteaRelease,
  parseGiteaReleaseList,
  releasesListUrl,
} from "../../src/core/forge/gitea";
import type { RepoRef } from "../../src/core/forge/types";

const REF: RepoRef = { kind: "gitea", baseUrl: "https://git.jkaindl.de", owner: "jkaindl", repo: "calendar-notes" };
const FIXTURE = readFileSync(new URL("../fixtures/gitea-release.json", import.meta.url), "utf8");

it("latestReleaseUrl", () => {
  expect(latestReleaseUrl(REF)).toBe("https://git.jkaindl.de/api/v1/repos/jkaindl/calendar-notes/releases/latest");
});

describe("parseGiteaRelease", () => {
  it("liest tag/version/notes/assets aus der echten Antwortform", () => {
    const rel = parseGiteaRelease(FIXTURE);
    expect(rel.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(rel.tagName.length).toBeGreaterThan(0);
    const names = rel.assets.map((a) => a.name);
    expect(names).toContain("main.js");
    expect(names).toContain("manifest.json");
    expect(rel.assets[0]?.downloadUrl).toMatch(/^https:\/\//);
  });
  it("wirft bei einer Nicht-Release-Antwort (z.B. Fehlerobjekt)", () => {
    expect(() => parseGiteaRelease('{"message":"Not Found"}')).toThrow();
  });
});

it("releasesListUrl geht an /releases (nicht /latest)", () => {
  expect(releasesListUrl(REF)).toBe("https://git.jkaindl.de/api/v1/repos/jkaindl/calendar-notes/releases?limit=50");
});

describe("parseGiteaReleaseList", () => {
  it("parst ein Array aus Release-Objekten in ReleaseInfo[]", () => {
    const einzelnes = JSON.parse(FIXTURE) as Record<string, unknown>;
    const zweites = { ...einzelnes, tag_name: "v0.1.0", body: "aeltere Notes" };
    const liste = parseGiteaReleaseList(JSON.stringify([einzelnes, zweites]));
    expect(liste).toHaveLength(2);
    expect(liste[1]?.version).toBe("0.1.0");
    expect(liste[1]?.notes).toBe("aeltere Notes");
  });

  it("wirft bei einer Nicht-Liste (z.B. Fehlerobjekt)", () => {
    expect(() => parseGiteaReleaseList('{"message":"Not Found"}')).toThrow();
  });

  it("ueberspringt Eintraege ohne tag_name statt die ganze Liste zu verwerfen", () => {
    const liste = parseGiteaReleaseList(JSON.stringify([{ body: "kein tag" }, JSON.parse(FIXTURE)]));
    expect(liste).toHaveLength(1);
  });
});

it("issuesUrl + authHeaders", () => {
  expect(issuesUrl(REF)).toBe("https://git.jkaindl.de/jkaindl/calendar-notes/issues/new");
  expect(authHeaders("abc")).toEqual({ Authorization: "token abc" });
  expect(authHeaders(null)).toEqual({});
});
