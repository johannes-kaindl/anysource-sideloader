# Reference — catalog format

> **Diátaxis: Reference.** Information-oriented. Precise and dry.

A catalog is a single JSON document served over HTTP(S). Its URL is what people subscribe to.

## Document

```json
{
  "catalogVersion": 1,
  "name": "Order from Traces — Obsidian Plugins",
  "plugins": [
    {
      "id": "vault-rag",
      "name": "Vault RAG",
      "description": "Semantic search across your vault.",
      "repo": "https://git.jkaindl.de/jkaindl/vault-rag",
      "author": "Johannes Kaindl",
      "tags": ["ai", "search"]
    }
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `catalogVersion` | `1` | yes | Any other value is rejected outright, with an error naming the value. |
| `name` | string | yes | Display name of the catalog. A missing `name` rejects the whole document. |
| `plugins` | array | yes | A non-array (or absent) value is treated as an empty list, not an error. |

### Plugin entry

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Must match `^[a-z0-9][a-z0-9-_]{0,63}$` and must equal the plugin's own manifest id. |
| `name` | string | yes | Display name. |
| `description` | string | yes | One line, shown under the name. |
| `repo` | string | yes | Repository URL. Must parse as a supported forge URL — see [Forge support](forge-support.md). |
| `author` | string | yes | Display only. |
| `tags` | string array | yes | Searchable: the browse filter matches name, description **or** any tag, case-insensitively. An empty array is valid but makes the entry findable by name and description alone. |

## Validation behaviour

Validation is **per entry, and silent for the entry**: an entry that fails any of the rules
above is dropped, and the rest of the catalog loads normally. There is no partial entry and no
warning per dropped entry.

Only two things reject the whole document: an unsupported `catalogVersion` and a missing or
non-string `name`.

## What a catalog does not do

A catalog carries **no version information**, by design. Versions are read live from each
plugin's own forge at check time. A catalog states what exists; it can never hand out a stale
version, and it cannot be used to pin one.

## Where catalogs come from

One catalog is subscribed by default so that a fresh install has a non-empty browse list. It
is removable like any other subscription. Its URL is named in the project
[README](../../README.md).
