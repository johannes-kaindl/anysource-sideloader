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

Ids must match `^[a-z0-9][a-z0-9-_]{0,63}$` — stricter than Obsidian itself, which permits
uppercase and dots. An otherwise valid manifest whose id does not match is rejected.

An install is bound to the id it was made with: a release that changes the id is refused rather
than silently swapping out what you installed.
