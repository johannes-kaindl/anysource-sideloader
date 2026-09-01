# AnySource Sideloader

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
![Obsidian](https://img.shields.io/badge/obsidian-1.11.4%2B%20%C2%B7%20desktop%20%26%20mobile-7c3aed)

Install and update Obsidian plugins from any git forge — GitHub, Forgejo, Gitea, or raw
URLs — including subscribable plugin catalogs, without waiting on the Community Store.

## Why this exists

The Community Store depends on GitHub as a single point of failure: when an account gets
flagged, every plugin whose maintainer is caught in the sweep becomes uninstallable
overnight. One such flag made 21 plugins disappear from the store in a single day — none
of them had a code problem, they simply lost their only distribution channel. AnySource
Sideloader removes that single point of failure by letting a plugin's release live on
*any* forge (GitHub, Forgejo, Gitea, or even a plain HTTP(S) URL) and installing/updating
from there directly, independent of whether the Community Store lists it at all.

## Install (bootstrap)

Because this plugin's whole purpose is working without the Community Store, its own
first install is manual:

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Copy all three into `<vault>/.obsidian/plugins/anysource-sideloader/` (create the
   folder if it doesn't exist).
3. Enable the plugin in Obsidian's Community plugins settings.

From then on, the plugin can update **itself** the same way it updates any other
sideloaded plugin — no manual copying needed after the bootstrap.

## Adding sources

Add a source by pasting a repo URL (e.g. `https://github.com/user/repo`,
`https://git.jkaindl.de/jkaindl/some-plugin`, or a Gitea instance URL). The forge is
auto-detected from the URL shape — GitHub, Forgejo, and Gitea each expose a slightly
different release/asset API, and the plugin picks the right adapter automatically. For a
forge without a Gitea-compatible API, the plugin falls back to raw files instead: it
still takes a **repo URL** (not a direct asset URL), and derives
`<base>/<owner>/<repo>/raw/main/<file>` for each of `manifest.json`, `main.js`, and
`styles.css` — there is no branch or tag selection yet, so this fallback only works
against the repo's default branch, and only if it is named `main`.

## Catalogs

A catalog is a small JSON file that lists multiple plugins at once — useful for
publishing "these are the plugins I maintain" or "these are the plugins approved for
this organisation" as a single subscribable URL. Subscribing to a catalog surfaces all
its listed plugins for one-click install, and refreshes them together.

Catalog format:

```json
{ "catalogVersion": 1, "name": "Order from Traces — Obsidian Plugins",
  "plugins": [{ "id": "vault-rag", "name": "Vault RAG", "description": "…",
    "repo": "https://git.jkaindl.de/jkaindl/vault-rag", "author": "Johannes Kaindl", "tags": ["ai"] }] }
```

## Tokens

Private repos and private catalogs need authentication. Tokens are stored per forge
host in Obsidian's own keychain (via the built-in `SecretComponent` in the settings
tab) — never in `data.json`, never in plain text. This is the mechanism that makes the
organisation use case work: an org can host a private Forgejo/Gitea instance with
internal plugins and catalogs, and members authenticate with a token scoped to that
host.

## Updates

- A startup check (toggle in settings) looks for new releases across all configured
  sources and shows a notice when updates are available.
- Updates are applied manually — there is no silent, unattended auto-update.
- Before applying, the plugin shows the release notes from the new version so you know
  what you're installing.

## Security

- When a release carries a `checksums.sha256` file, the downloaded asset is verified
  against it before installation; a mismatch blocks the install.
- No silent auto-updates: every update is a deliberate, visible action.
- An id-change guard prevents a malicious or misconfigured release from silently
  swapping out the plugin id an install is bound to.

No screenshots yet — a follow-up pass will add them via the `readme-shots` workflow.

## Known limitations

- **Private GitHub sources are experimental — and one half of why is now measured.**
  Obsidian's `requestUrl` **forwards the `Authorization` header across a redirect to a
  different host** (measured 2026-09-01 on Obsidian 1.13.7 against a local server, for both
  302 and 303, 4/4 requests; Node's `fetch` strips it on the same setup). Private GitHub
  asset downloads go through exactly such a redirect — the API asset URL answers 302 with a
  pre-signed S3 URL — so the bearer token is sent on to S3, which typically rejects requests
  carrying two authentication mechanisms. What is **not** measured is that second half: how
  S3 actually answers. That still needs a real private GitHub repo, which the currently
  available test account (flagged) could not provide. Private **Forgejo/Gitea** sources, by
  contrast, are fully supported and proven end-to-end (private repo + token, detect → latest
  release → asset download) in `tests/integration/live-forge.test.ts`.
- **Catalogs and access tokens cannot be managed on Obsidian 1.13.** Both settings render
  as empty rows there — name and description, no controls — so neither catalog subscriptions
  nor per-host tokens can be edited from the settings tab. The pre-subscribed default catalog
  and "Install plugin from URL" still work. Found by the GUI smoke (`docs/SMOKE.md`, E2/E3);
  a fix is tracked.
- **Checksums prove transport integrity only, not authenticity.** A `checksums.sha256`
  file is fetched from the same forge as the payload it verifies, and is not signed. It
  catches corruption and accidental mismatch; it does **not** catch a compromised forge
  that ships matching sums for a tampered release.
- **Installing a plugin runs third-party code with full Obsidian API access.** The
  install/update confirm dialog is the only gate — there is no sandboxing, permission
  model, or code review beyond what you do yourself before confirming.
- **The raw fallback assumes the default branch is named `main`.** There is no branch or
  tag selection yet; a repo whose default branch has a different name cannot be installed
  via the raw path (see "Adding sources" above).
- **Plugin ids are restricted to `^[a-z0-9][a-z0-9-_]{0,63}$`**, which is stricter than
  Obsidian itself — no uppercase letters and no dots. A manifest with an otherwise valid
  but non-matching id is rejected.
- **A fully private Forgejo/Gitea instance can be misdetected as a raw source.**
  Forge detection probes `/api/v1/version` without sending a token; on an instance that
  gates that endpoint behind authentication, the probe looks like "no Gitea API here" and
  the plugin falls back to raw files, which then also fail without a token.
- **Release notes render remote Markdown**, including any images it embeds — opening the
  release notes for a plugin loads images from that plugin's own source.

## License

- **Code:** AGPL-3.0-or-later ([`LICENSE`](LICENSE)).
- **No runtime dependencies.** Vendored build/test helpers from the author's own
  `obsidian-kit`/`code-kit` carry their provenance headers in `src/vendor/`.
