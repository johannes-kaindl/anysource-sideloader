import { describe, it, expect } from "vitest";
import { STRINGS } from "../../src/i18n/strings";

// Fehler der Quellen erscheinen als Notice und werden in der Doku zitiert: Store-Publikum, Englisch.
describe("STRINGS.errors", () => {
  const E = STRINGS.errors;
  const alle: string[] = [
    E.downloadFailed("x", 404, "https://e/x"), E.downloadFailed("x", 500),
    E.requiredAssetMissing("main.js"), E.manifestNotLoaded, E.manifestInvalidId, E.manifestMissingFields,
    E.invalidPluginId("a"), E.notJson, E.notARelease, E.notAReleaseList, E.catalogNotObject,
    E.catalogVersionUnsupported("2"), E.catalogNameMissing, E.checksumVerificationFailed("p"), E.unexpectedFileName("f"),
  ];

  it("enthält keine deutschen Wörter", () => {
    for (const text of alle) expect(text).not.toMatch(/\b(fuer|fehlgeschlagen|fehlt|nicht|ungueltig\w*|kein\w*|Katalog|Antwort)\b/);
  });

  it("nennt URL und Status in der Download-Meldung", () => {
    expect(E.downloadFailed("manifest.json", 404, "https://e/m")).toBe("Download failed for manifest.json (https://e/m): HTTP 404");
    expect(E.downloadFailed("styles.css", 500)).toBe("Download failed for styles.css: HTTP 500");
  });
});
