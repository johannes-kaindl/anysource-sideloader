import { describe, it, expect } from "vitest";
import { obsidianSecretStore, secretStorageAvailable } from "../../src/vendor/kit-obsidian/secrets";
import { MemorySecretStore } from "../../src/vendor/kit/secrets";
import type { App } from "obsidian";

function fakeApp(opts?: { setSecret?: (id: string, v: string) => void }): App {
  const store = new Map<string, string>();
  return {
    secretStorage: {
      getSecret: (id: string) => store.get(id) ?? null,
      setSecret: (id: string, v: string) => {
        if (opts?.setSecret) opts.setSecret(id, v);
        else store.set(id, v);
      },
      listSecrets: () => [...store.keys()],
    },
  } as unknown as App;
}

describe("MemorySecretStore", () => {
  it("set/get/has roundtrip", () => {
    const s = new MemorySecretStore();
    expect(s.has("a")).toBe(false);
    expect(s.get("a")).toBeNull();
    s.set("a", "geheim");
    expect(s.has("a")).toBe(true);
    expect(s.get("a")).toBe("geheim");
  });

  it("an empty secret counts as missing (has() is false)", () => {
    const s = new MemorySecretStore();
    s.set("a", "");
    expect(s.has("a")).toBe(false);
    expect(s.get("a")).toBe("");
  });

  it("strips a trailing newline from a pasted password (pbcopy < datei artifact)", () => {
    const s = new MemorySecretStore();
    s.set("a", "geheim\n");
    expect(s.get("a")).toBe("geheim");
  });

  it("strips leading/trailing CRLF but keeps interior newlines and spaces", () => {
    const s = new MemorySecretStore();
    s.set("a", "\r\nge heim\nrest\r\n");
    expect(s.get("a")).toBe("ge heim\nrest");
  });

  it("delete removes a stored secret", () => {
    const s = new MemorySecretStore();
    s.set("a", "geheim");
    s.delete("a");
    expect(s.has("a")).toBe(false);
    expect(s.get("a")).toBeNull();
  });
});

describe("secretStorageAvailable", () => {
  it("true when app.secretStorage has getSecret and setSecret", () => {
    expect(secretStorageAvailable(fakeApp())).toBe(true);
  });

  it("false when app.secretStorage is missing", () => {
    expect(secretStorageAvailable({} as App)).toBe(false);
  });
});

describe("obsidianSecretStore", () => {
  it("get/set/has go through app.secretStorage", () => {
    const app = fakeApp();
    const s = obsidianSecretStore(app);
    expect(s.has("id1")).toBe(false);
    s.set("id1", "geheim");
    expect(s.has("id1")).toBe(true);
    expect(s.get("id1")).toBe("geheim");
  });

  it("set throws when the read-back does not match (TaskNotes-Kniff)", () => {
    const app = fakeApp({ setSecret: () => {} }); // schluckt den Wert stillschweigend
    const s = obsidianSecretStore(app);
    expect(() => s.set("id1", "geheim")).toThrow("Obsidian SecretStorage did not persist id1");
  });

  it("an empty secret counts as missing (has() is false, get() is null)", () => {
    const app = fakeApp();
    const s = obsidianSecretStore(app);
    s.set("id1", "");
    expect(s.has("id1")).toBe(false);
    expect(s.get("id1")).toBeNull();
  });

  it("strips a trailing newline before persisting (pbcopy < datei artifact)", () => {
    const app = fakeApp();
    const s = obsidianSecretStore(app);
    s.set("id1", "geheim\n");
    expect(s.get("id1")).toBe("geheim");
  });

  it("delete clears the stored secret (Obsidian API has no delete call)", () => {
    const app = fakeApp();
    const s = obsidianSecretStore(app);
    s.set("id1", "geheim");
    s.delete("id1");
    expect(s.has("id1")).toBe(false);
    expect(s.get("id1")).toBeNull();
  });
});
