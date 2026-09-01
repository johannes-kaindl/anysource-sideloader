# AnySource Sideloader

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
different release/asset API, and the plugin picks the right adapter automatically. A
plain raw URL to a release asset works too, for forges without API support.

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

- **Private GitHub sources are experimental.** Fetching releases/assets from a private
  GitHub repo with a token was not cleanly measurable with the currently available test
  account (flagged), so this path has not been proven end-to-end against a real private
  GitHub repo. Private **Forgejo/Gitea** sources, by contrast, are fully supported and are
  proven end-to-end (private repo + token, detect → latest release → asset download) in
  `tests/integration/live-forge.test.ts`.
