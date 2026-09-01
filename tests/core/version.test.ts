import { describe, expect, it } from "vitest";
import { compareVersions, isNewer, normalizeVersion } from "../../src/core/version";

it("normalizeVersion strippt v-Praefix und Whitespace", () => {
  expect(normalizeVersion(" v1.2.3 ")).toBe("1.2.3");
  expect(normalizeVersion("0.19.0")).toBe("0.19.0");
});

describe("compareVersions", () => {
  it("vergleicht numerisch je Segment (nicht lexikografisch)", () => {
    expect(compareVersions("0.10.0", "0.9.1")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2", "1.2.1")).toBeLessThan(0);
  });
  it("behandelt nicht-numerische Segmente als 0 (defensiv, kein Wurf)", () => {
    expect(compareVersions("1.x.0", "1.0.0")).toBe(0);
  });
});

it("isNewer", () => {
  expect(isNewer("0.2.0", "0.1.9")).toBe(true);
  expect(isNewer("0.1.9", "0.1.9")).toBe(false);
  expect(isNewer("v0.2.0", "0.1.9")).toBe(true); // nimmt Tag-Namen direkt
});
