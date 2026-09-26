# Troubleshooting

> **Diátaxis: How-to.** Task-oriented — you see a message or a symptom, this page tells you what it means and what to do. Messages are quoted exactly as the plugin shows them; some of them are in German, because that is how they are written in the code.

## The plugin itself

### The plugin does not appear in *Installed plugins* at all

**Cause:** the folder layout is wrong. The most common form is one level too many: `plugins/anysource-sideloader/anysource-sideloader/main.js`.

**Fix:** the three files `main.js`, `manifest.json` and `styles.css` must sit directly in `<vault>/.obsidian/plugins/anysource-sideloader/`. See [Install by hand](manual-install.md), step 4.

### It appears but will not switch on

**Cause:** Obsidian is still in Restricted mode. In that state a correctly placed plugin never loads, and there is no error, no notice and nothing in the console.

**Fix:** **Settings → Community plugins → Exit Restricted mode**, then **Reload plugins**. Check this even if you are sure, because every other indicator looks healthy in that state.

## Adding a plugin

### "Could not detect a supported source (GitHub, Forgejo/Gitea, or a raw file URL) from this address."

**Cause:** the address is not the front page of a repository, or the forge could not be recognised. Links to a release, a tag or a single file do not work; neither does an address with a typo in the host.

**Fix:** use the command **Install plugin from URL** (command palette) and paste the front page of the repository, for example `https://github.com/owner/repo`. Which forges are recognised is listed in [Forge support](../reference/forge-support.md).

### "Download fehlgeschlagen fuer manifest.json (…): HTTP 404"

**Cause:** the plugin found no Gitea-compatible API on that host and fell back to reading raw files from the repository. That fallback only knows the branch names `main` and `master`, and the message always names the `main` attempt — so a repository whose default branch is called `develop` reports a failure about `main`. Two other causes produce the same message: the repository is private and no token is set for its host, or the instance hides even its version endpoint behind a login.

**Fix:**

1. Open the address in a browser and check that the repository has a release and that `manifest.json` sits at its top level.
2. If the repository is private, add a token for its host under **Access tokens** in the plugin's settings — see [Use private repositories](private-repositories.md).
3. If the default branch has another name, the raw path cannot install it. Publish a release instead, which does not depend on the branch name.

### "Pflicht-Asset fehlt im Release: main.js" (or `manifest.json`)

**Cause:** the latest release of the repository does not carry that file as a release asset. The plugin installs release assets, not the source tree.

**Fix:** ask the plugin's author to attach `main.js` and `manifest.json` to the release, or install a plugin that does.

### "Download fehlgeschlagen fuer … HTTP 401 / 403 / 404" on a release or asset

**Cause:** without a token the forge answers as if a private repository did not exist. With a token, it may be one that lacks read access, or one stored for a different host.

**Fix:** check that the host under **Access tokens** matches the host of the source exactly, and that the token can read the repository. Private **GitHub** sources are experimental; see [Known limitations](../explanation/limitations.md).

### The confirmation dialog warns "This release carries no checksum file; the download cannot be verified."

**Cause:** the release has no `checksums.sha256`. Nothing is wrong with the download; the plugin just has nothing to compare it against.

**Fix:** decide whether you trust the source. If you do, confirm; if not, cancel. What checksums prove and what they do not is in [the security model](../explanation/security-model.md).

### The confirmation dialog warns "This source uses plain HTTP; the download is not encrypted in transit."

**Cause:** the source address starts with `http://`.

**Fix:** use an `https://` address if the host offers one. On a trusted local network you can confirm.

### "Checksum mismatch — installation aborted."

**Cause:** a downloaded file does not match the sum in the release's `checksums.sha256`. The plugin refuses to write anything. Typical reasons are a release that was re-uploaded after its checksum file was created, or a proxy that altered the download.

**Fix:** try again later. If it persists, tell the plugin's author; do not work around it.

### The source now serves a plugin with id "…" instead of "…". This would overwrite a different plugin — aborted.

**Cause:** the plugin id in the release's `manifest.json` differs from the id this entry is bound to. This guard stops a release, or a wrong catalog entry, from silently replacing another plugin.

**Fix:** check that the repository or catalog entry is the one you meant. If the author really renamed the plugin, install it as a new plugin.

### "Overwrite existing plugin "…"?"

**Cause:** a folder for that plugin id already exists in your vault, but the Sideloader does not track it as one of its installs. Continuing replaces its files with the ones from this source.

**Fix:** if you installed the plugin some other way and want to keep it, cancel and use **Track for updates** instead — see [Adopt plugins you already have](adopt-existing-plugins.md). Its data file (`data.json`) is kept either way.

## Catalogs

### "No catalog could be loaded (HTTP 404)."

**Cause:** the catalog URL is wrong, moved or private. The text in brackets is the reason for each failed catalog, separated by `;`.

**Fix:** open the URL in a browser; it must return the JSON file itself. For a private catalog, add a token for its host. To change the list, go to **Catalogs** in the settings: remove the entry and use **Add catalog URL**.

### "No catalog could be loaded (Katalog: …)"

**Cause:** the URL answers, but the file is not a valid catalog. The three messages are `Katalog: kein Objekt` (the JSON is not an object), `Katalog: catalogVersion … wird nicht unterstuetzt` (only version 1 is supported) and `Katalog: name fehlt` (the `name` field is missing). A reply that is not JSON at all, such as an HTML login page, fails the same way.

**Fix:** open the URL in a browser and compare the file with [Catalog format](../reference/catalog-format.md).

### "No catalogs are configured yet. Add one under "Catalogs" below."

**Cause:** the list under **Catalogs** is empty.

**Fix:** add a catalog URL there, for example the one in the [README](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/README.md#usage).

### A catalog loads but some plugins are missing from it

**Cause:** entries that do not validate are left out.

**Fix:** see [Catalog format](../reference/catalog-format.md) for what an entry must contain.

## Updates

### "No plugins are tracked yet — track your installed ones under "Browse catalogs" in these settings."

**Cause:** update checks only cover plugins the Sideloader tracks. Plugins you installed through the Community Store or by hand are not tracked until you adopt them.

**Fix:** under **Browse catalogs**, click **Track for updates** on an entry, or **Track all N installed** for the whole set. See [Adopt plugins you already have](adopt-existing-plugins.md).

### "No installed plugins from this catalog are untracked."

**Cause:** everything from the subscribed catalogs that is installed in your vault is already tracked. Adoption only sees plugins that appear in a subscribed catalog.

**Fix:** for a plugin in no catalog, add its repository with **Install plugin from URL** instead.

### `Update check for "…" failed: …` or "N update checks failed (first: "…" — …)"

**Cause:** the forge of that plugin could not be reached or refused the request. With several failures, the notice names only the first one. "All sideloaded plugins are up to date." is not shown in that case, because it would be a statement about plugins that could not be checked.

**Fix:** read the reason after the plugin id and follow the matching entry above (HTTP status, token, network). Check the rest again with **Check now**.

### The settings page goes blank after "Update"

**Cause:** this happens when the Sideloader updates itself. The plugin that draws the page unloads for a moment.

**Fix:** none needed. The window stays open and the tab is available again immediately.

## Getting help

If none of this matches, open an issue at <https://github.com/johannes-kaindl/anysource-sideloader/issues> and include the exact message, the source address (without any token) and your Obsidian version.
