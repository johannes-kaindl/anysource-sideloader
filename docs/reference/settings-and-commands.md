# Reference — settings and commands

> **Diátaxis: Reference.** Information-oriented.

Everything lives in the plugin's own tab under **Settings → AnySource Sideloader**. There is
no sidebar view to open.

## Commands

Available from the command palette; bind hotkeys as you like.

| Command id | Name in the palette | Does |
|---|---|---|
| `open-store` | Open settings | Opens the plugin's settings tab. |
| `check-updates` | Check for updates | Runs an update check across all tracked plugins. |
| `install-from-url` | Install plugin from URL | Prompts for a repository URL and installs from it. |

## Settings

| Setting | Default | Does |
|---|---|---|
| Check for updates on startup | on | Runs one check shortly after Obsidian starts. Applies nothing; only reports. |
| Catalogs | one entry | Subscribed catalog URLs. Removable, including the preinstalled one. |
| Access tokens | none | Per **host**, stored in Obsidian's keychain. |

## Stored data

`data.json` in the plugin folder holds:

| Key | Contents |
|---|---|
| `plugins` | Tracked plugins: `id`, `repoUrl`, resolved `ref`, `installedVersion`, last seen `availableVersion`, and whether it came from a URL or a catalog. |
| `catalogs` | Subscribed catalog URLs. |
| `hostSecrets` | Host → **keychain entry id**. Never the token itself. |
| `checkOnStartup` | Boolean. |

### Entries are validated on load

A tracked-plugin entry that does not validate completely is **dropped silently** when settings
load. This matters if you ever hand-edit `data.json`: an entry missing `repoUrl` or `addedFrom`
disappears, which looks exactly like data loss.

## Plugin ids

An id must be safe as a folder name: ASCII letters and digits, with `-`, `_` and `.` from the second character on; at most 128 characters; no `..`, no dot at the end, no Windows device name (`con`, `nul`, `com1` …). Uppercase letters are fine. A manifest whose id does not fit is rejected rather than installed under a corrected name.

Ids are compared the way the file system sees them, without regard to case: `Vault-Rag` and `vault-rag` are the same folder on macOS and Windows, so they count as the same plugin when the sideloader checks whether one is already installed. The id guard below is exact: a release that changes the id, even only its case, is refused.

An install is bound to the id it was made with: a release that changes the id is refused rather
than silently swapping out what you installed.
