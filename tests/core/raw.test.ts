import { expect, it } from "vitest";
import { rawFileUrl } from "../../src/core/forge/raw";

it("baut Gitea-Raw-URLs", () => {
  expect(rawFileUrl(
    { ref: { kind: "gitea", baseUrl: "https://git.jkaindl.de", owner: "o", repo: "r" }, gitRef: "main" },
    "manifest.json",
  )).toBe("https://git.jkaindl.de/o/r/raw/main/manifest.json");
});

it("baut GitHub-Raw-URLs", () => {
  expect(rawFileUrl(
    { ref: { kind: "github", baseUrl: "https://github.com", owner: "o", repo: "r" }, gitRef: "1.0.0" },
    "main.js",
  )).toBe("https://raw.githubusercontent.com/o/r/1.0.0/main.js");
});
