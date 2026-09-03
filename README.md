# AnySource Sideloader

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
![Obsidian](https://img.shields.io/badge/obsidian-1.11.4%2B%20%C2%B7%20desktop%20%26%20mobile-7c3aed)

Install and update Obsidian plugins from any git forge — GitHub, Forgejo, Gitea, or raw
URLs — including subscribable plugin catalogs, without waiting on the Community Store.

*Auch auf Deutsch verfügbar: [`README.de.md`](README.de.md).*

## Why this exists

The Community Store depends on GitHub as a single point of failure: when an account gets
flagged, every plugin whose maintainer is caught in the sweep becomes uninstallable
overnight. One such flag made 21 plugins disappear from the store in a single day — none
of them had a code problem, they simply lost their only distribution channel. AnySource
Sideloader removes that single point of failure by letting a plugin's release live on
*any* forge (GitHub, Forgejo, Gitea, or even a plain HTTP(S) URL) and installing/updating
from there directly, independent of whether the Community Store lists it at all.

## Features

- **Any git forge as a source** — GitHub, Forgejo, Gitea, or a plain raw-file URL. The
  forge type is detected from a pasted repo URL; nothing needs to be configured per source.
- **Subscribable catalogs** — a catalog is one JSON file listing plugins. Versions always
  come live from each plugin's own forge, never from the catalog.
- **Everything lives in the settings tab**, where Obsidian manages plugins anyway — no extra
  sidebar view to open, and the layout is Obsidian's own.
- **Tracks plugins you already have.** Installed but unmanaged plugins are recognised and
  can be adopted with one click, or all at once — no reinstall, no version loss.
- **Checksum verification** of every downloaded release asset before anything is written.
- **Private repositories** via per-host access tokens kept in Obsidian's keychain.
- **Nothing happens without confirmation** — every install and update is a deliberate,
  visible action, and updates are never applied automatically.

## Requirements

- Obsidian **1.11.4** or newer (the version that introduced the keychain API used for
  access tokens).
- Works on **desktop and mobile**; no Node, no runtime dependencies, no external binaries.
- A network connection to whichever forge hosts the plugins you install. Nothing is sent
  anywhere else.

## Install

Because this plugin's whole purpose is working without the Community Store, its own
first install is manual:

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Copy all three into `<vault>/.obsidian/plugins/anysource-sideloader/` (create the
   folder if it doesn't exist).
3. Enable the plugin in Obsidian's Community plugins settings.

From then on, the plugin can update **itself** the same way it updates any other
sideloaded plugin — no manual copying needed after the bootstrap.

## Usage

### Adding sources

Add a source by pasting a repo URL (e.g. `https://github.com/user/repo`,
`https://git.jkaindl.de/jkaindl/some-plugin`, or a Gitea instance URL). The forge is
auto-detected from the URL shape — GitHub, Forgejo, and Gitea each expose a slightly
different release/asset API, and the plugin picks the right adapter automatically. For a
forge without a Gitea-compatible API, the plugin falls back to raw files instead: it
still takes a **repo URL** (not a direct asset URL), and derives
`<base>/<owner>/<repo>/raw/<branch>/<file>` for each of `manifest.json`, `main.js`, and
`styles.css` — there is no branch or tag selection yet, so this fallback only works against
the repo's default branch, and only if it is named `main` or `master` (tried in that order;
the error message always names the `main` attempt, because that is the expected name).

### The maintainer's own catalog

The plugins maintained by this repo's author are published as one subscribable catalog —
paste this URL into **Browse catalogs**:

```
https://git.jkaindl.de/jkaindl/anysource-sideloader/raw/branch/main/catalog.json
```

It lists 23 plugins, each installing from its own Forgejo release. The file is generated
from the plugin repos themselves (`obsidian-plugins/tools/catalog/build_catalog.py`), so it
never drifts from what actually exists; versions are always read live from each plugin's
forge, never from the catalog.

### Catalogs

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

### Updates

- A startup check (toggle in settings) looks for new releases across all configured
  sources and shows a notice when updates are available.
- Updates are applied manually — there is no silent, unattended auto-update.
- Before applying, the plugin shows the release notes from the new version so you know
  what you're installing.
- **Each row in Installed plugins carries its own button, and it changes with the state:**
  **Check** while nothing is pending, and **Update to `<version>`** once a newer release is
  known. So you can install straight from the row you are looking at; the **Updates**
  section remains as the overview of everything that is due.

Updating this plugin itself works through the same row (measured end-to-end on Obsidian
1.13.7): the files are replaced, the new code is loaded, and your settings survive. One
visible quirk — the settings page you are looking at goes blank at that moment, because
the plugin that owns the page briefly unloads itself. The window stays open; click the
plugin again in the sidebar and everything is there.

### One channel, on purpose

Distribution runs entirely over **`git.jkaindl.de`** — the catalog, every plugin release,
and this plugin's own bootstrap download. There is no second channel: these plugins are not
in the Obsidian Community Store, and the GitHub mirrors are gone.

That is a deliberate trade, and it cuts both ways. It removes the single point of failure
that started this project — a flagged GitHub account made 21 plugins uninstallable overnight,
without any of them having a code problem. It also means that if `git.jkaindl.de` does not
answer, nothing installs or updates until it does. Already-installed plugins keep working;
they live in your vault, not on a server.

If a check fails, the plugin says which source failed and why rather than reporting that
everything is up to date.

### Already have plugins installed?

The **Browse catalogs** section in the plugin's settings reads what is actually in your vault, not just what it installed itself. A
catalog entry whose plugin is already present shows **Track for updates** instead of
Install — one click, no reinstall, and it keeps whatever version you have. Above the list,
**Track all N installed** does the whole set at once.

This matters because update checks only cover *tracked* plugins. If nothing is tracked, a
check has nothing to look at — and it will say so rather than report that everything is up
to date.

Checking is manual by default: the **Check now** button sits at the top of the plugin's
settings, and the same action is available from the command palette (so you can bind a
hotkey). With "Check for updates on startup" enabled, it also runs once shortly after
Obsidian starts. Updates are never installed without your confirmation.

Sources are queried one after another, so a check takes a moment when you track many
plugins — measured against a self-hosted Forgejo on the local network, 22 tracked plugins
take about two seconds, and a remote forge is slower. A spinner next to the button shows
for as long as the check is running; the result arrives as a notice.

## Configuration

### Access tokens

Private repos and private catalogs need authentication. Tokens are stored per forge
host in Obsidian's own keychain (via the built-in `SecretComponent` in the settings
tab) — never in `data.json`, never in plain text. This is the mechanism that makes the
organisation use case work: an org can host a private Forgejo/Gitea instance with
internal plugins and catalogs, and members authenticate with a token scoped to that
host.

## How it works

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
- **Checksums prove transport integrity only, not authenticity.** A `checksums.sha256`
  file is fetched from the same forge as the payload it verifies, and is not signed. It
  catches corruption and accidental mismatch; it does **not** catch a compromised forge
  that ships matching sums for a tampered release.
- **Installing a plugin runs third-party code with full Obsidian API access.** The
  install/update confirm dialog is the only gate — there is no sandboxing, permission
  model, or code review beyond what you do yourself before confirming.
- **The raw fallback only knows `main` and `master`.** There is no branch or tag
  selection yet; a repo whose default branch is named anything else cannot be installed via
  the raw path (see "Adding sources" above).
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
