import { describe, expect, it } from "vitest";
import { parseCatalog } from "../../src/core/catalog";

const OK = JSON.stringify({
  catalogVersion: 1,
  name: "Test",
  plugins: [
    { id: "vault-rag", name: "Vault RAG", description: "d", repo: "https://git.jkaindl.de/jkaindl/vault-rag", author: "JK" },
    { id: "ohne-repo", name: "X", description: "d", author: "JK" },
  ],
});

describe("parseCatalog", () => {
  it("parst und verwirft kaputte Eintraege einzeln", () => {
    const cat = parseCatalog(OK);
    expect(cat.name).toBe("Test");
    expect(cat.plugins).toHaveLength(1);
    expect(cat.plugins[0]?.tags).toEqual([]);
  });

  it("wirft bei fremder catalogVersion und bei Nicht-JSON", () => {
    expect(() => parseCatalog('{"catalogVersion":2,"name":"x","plugins":[]}')).toThrow(/catalogVersion/);
    expect(() => parseCatalog("<html>")).toThrow();
  });

  it("uebernimmt tags, wenn sie als String-Array vorliegen", () => {
    const cat = parseCatalog(
      JSON.stringify({
        catalogVersion: 1,
        name: "Tagged",
        plugins: [
          {
            id: "vault-rag",
            name: "Vault RAG",
            description: "d",
            repo: "https://git.jkaindl.de/jkaindl/vault-rag",
            author: "JK",
            tags: ["retrieval", 5, "ai"],
          },
        ],
      }),
    );
    expect(cat.plugins[0]?.tags).toEqual(["retrieval", "ai"]);
  });

  it("verwirft Eintraege mit ungueltiger id oder nicht parsebarem repo", () => {
    const cat = parseCatalog(
      JSON.stringify({
        catalogVersion: 1,
        name: "Bad",
        plugins: [
          { id: "Not Valid!", name: "X", description: "d", repo: "https://x/o/r", author: "JK" },
          { id: "valid-id", name: "X", description: "d", repo: "not-a-url", author: "JK" },
        ],
      }),
    );
    expect(cat.plugins).toHaveLength(0);
  });
});
