import { describe, expect, it } from "vitest";
import { isValidPluginId, parseChecksums, parsePluginManifest, pluginDir, verifyChecksum } from "../../src/core/install";
import { sha256Hex } from "../../src/vendor/code-kit/sha256";

describe("isValidPluginId — Path-Traversal-Kante", () => {
  it("akzeptiert normale ids", () => {
    for (const id of ["vault-rag", "obsidian42-brat", "a", "x_y-z9"]) expect(isValidPluginId(id)).toBe(true);
  });
  it("lehnt Traversal, Slash, Punkt, Leer und Grossbuchstaben ab", () => {
    for (const id of ["..", "../x", "a/b", "a\\b", "", ".hidden", "a.b", "UPPER", " a"]) {
      expect(isValidPluginId(id)).toBe(false);
    }
  });
});

it("parsePluginManifest zieht id/name/version und wirft bei ungueltiger id", () => {
  expect(parsePluginManifest('{"id":"x","name":"X","version":"1.0.0"}')).toEqual(
    { id: "x", name: "X", version: "1.0.0", minAppVersion: undefined });
  expect(() => parsePluginManifest('{"id":"../evil","name":"E","version":"1"}')).toThrow();
  expect(() => parsePluginManifest('{"name":"ohne id","version":"1"}')).toThrow();
});

it("pluginDir haengt an configDir (nie hartes .obsidian)", () => {
  expect(pluginDir(".obsidian", "x")).toBe(".obsidian/plugins/x");
  expect(pluginDir(".config-custom", "x")).toBe(".config-custom/plugins/x");
});

describe("Checksummen (sha256sum-Format)", () => {
  const data = new TextEncoder().encode("hallo");
  const line = `${sha256Hex(data)}  main.js\nabc123  other.bin\n`;
  it("parst und verifiziert", () => {
    const map = parseChecksums(line);
    expect(map.get("main.js")).toBe(sha256Hex(data));
    expect(verifyChecksum(map, "main.js", data)).toBe("ok");
    expect(verifyChecksum(map, "main.js", new TextEncoder().encode("anders"))).toBe("mismatch");
  });
  it("absent, wenn keine Liste oder Datei nicht gelistet", () => {
    expect(verifyChecksum(null, "main.js", data)).toBe("absent");
    expect(verifyChecksum(parseChecksums(line), "styles.css", data)).toBe("absent");
  });
});
