import { describe, expect, it } from "vitest";
import { parseRepoUrl, giteaProbeUrl } from "../../src/core/forge/detect";

describe("parseRepoUrl", () => {
  it("zerlegt eine Forgejo-URL", () => {
    expect(parseRepoUrl("https://git.jkaindl.de/jkaindl/vault-rag")).toEqual({
      baseUrl: "https://git.jkaindl.de", owner: "jkaindl", repo: "vault-rag",
    });
  });
  it("toleriert .git-Suffix, Slash am Ende und Whitespace", () => {
    expect(parseRepoUrl("  https://github.com/TfTHacker/obsidian42-brat.git/ ")).toEqual({
      baseUrl: "https://github.com", owner: "TfTHacker", repo: "obsidian42-brat",
    });
  });
  it("akzeptiert http (lokale Forge)", () => {
    expect(parseRepoUrl("http://192.168.1.10:3000/org/plugin")?.baseUrl).toBe("http://192.168.1.10:3000");
  });
  it("lehnt Nicht-URLs und URLs ohne owner/repo ab", () => {
    expect(parseRepoUrl("nicht-eine-url")).toBeNull();
    expect(parseRepoUrl("https://github.com/nur-owner")).toBeNull();
    expect(parseRepoUrl("ftp://x/a/b")).toBeNull();
  });
  it("ignoriert tiefere Pfade (nimmt die ersten zwei Segmente)", () => {
    expect(parseRepoUrl("https://github.com/o/r/releases/tag/1.0")?.repo).toBe("r");
  });
});

it("giteaProbeUrl", () => {
  expect(giteaProbeUrl("https://git.jkaindl.de")).toBe("https://git.jkaindl.de/api/v1/version");
});
