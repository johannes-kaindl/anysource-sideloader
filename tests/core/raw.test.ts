import { expect, it } from "vitest";
import { rawFileUrl } from "../../src/core/forge/raw";

it("baut Gitea-Raw-URLs", () => {
  expect(rawFileUrl(
    { ref: { kind: "gitea", baseUrl: "https://git.jkaindl.de", owner: "o", repo: "r" }, gitRef: "main" },
    "manifest.json",
  )).toBe("https://git.jkaindl.de/o/r/raw/main/manifest.json");
});

it("kennt KEINEN github-Sonderfall mehr — auch ein github-Ref bekommt die Gitea-Form", () => {
  // Der frühere Zweig baute `raw.githubusercontent.com`-URLs und war tot: `detectForge`
  // routet github.com nie in den Raw-Pfad, dort greift immer die Release-API. Ein Test,
  // der toten Code festschreibt, lässt ihn erprobt aussehen — dieser hält stattdessen die
  // Entscheidung fest. Käme github je hierher, fällt es sofort auf.
  expect(rawFileUrl(
    { ref: { kind: "github", baseUrl: "https://github.com", owner: "o", repo: "r" }, gitRef: "1.0.0" },
    "main.js",
  )).toBe("https://github.com/o/r/raw/1.0.0/main.js");
});
