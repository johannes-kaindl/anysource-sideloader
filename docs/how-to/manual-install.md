# How to install AnySource Sideloader by hand

> **Diátaxis: How-to.** Task-oriented — the one installation you have to do yourself.

This plugin is not in the Obsidian Community Store, so its own first install is manual.
It is the only manual install you will do: from then on the plugin installs and updates
everything else, including itself.

The steps below are **identical on macOS, Linux and Windows**. You never need to know
where your vault lives on disk, and you never need to make hidden folders visible —
Obsidian opens the right folder for you.

## What you need

- Obsidian **1.11.4** or newer (this is the version that introduced the keychain API the
  plugin uses for access tokens).
- Nothing else. No Node, no package manager, no terminal.

## Steps

### 1. Allow community plugins

Open **Settings → Community plugins**. If the panel shows **Restricted mode** with a
button labelled **Exit Restricted mode**, click it.

Do this *first*. A fresh Obsidian profile starts in Restricted mode, and in that state a
plugin sitting perfectly in the right folder simply never loads — with no error, no notice
and nothing in the console. If you install first and hit this afterwards, the symptom looks
exactly like a broken plugin.

### 2. Download the plugin

[**Download `anysource-sideloader.zip`**](https://git.jkaindl.de/jkaindl/anysource-sideloader/releases/download/latest/anysource-sideloader.zip)

That link always points at the newest release; it does not need updating when a new version
comes out. The archive contains a single folder, `anysource-sideloader/`, already named the
way Obsidian needs it.

### 3. Open the plugins folder from inside Obsidian

Still in **Settings → Community plugins**, find the **Installed plugins** heading and click
the **folder icon** next to it (its tooltip reads *Open plugins folder*).

Your file manager opens directly in `<your vault>/.obsidian/plugins/`. This is the step that
would otherwise be different on every operating system: `.obsidian` is a hidden folder, and
revealing hidden folders takes a different keystroke in Finder, Explorer and every Linux file
manager. Letting Obsidian open it removes the problem instead of explaining it three times.

### 4. Unpack the archive there

Move or extract `anysource-sideloader.zip` into the folder that just opened, so that you end
up with:

```
<your vault>/.obsidian/plugins/anysource-sideloader/
    main.js
    manifest.json
    styles.css
```

Double-clicking the archive extracts it in place on all three systems. If your browser already
unpacked it into your Downloads folder, drag the resulting `anysource-sideloader` folder over
instead — the folder, not the three loose files.

### 5. Load it

Back in Obsidian, click **Reload plugins** (the refresh icon next to *Installed plugins*),
then switch the toggle next to **AnySource Sideloader** on.

You do not need to restart Obsidian.

## Check that it worked

Open **Settings → AnySource Sideloader**. You should see the plugin's own settings tab with a
**Check now** button at the top and a **Browse catalogs** section below it.

## After this

Nothing else gets installed this way. Adding a plugin is [pasting a repo
URL](add-sources-and-catalogs.md), and the Sideloader also updates *itself* through its own
list — see [Keeping plugins up to date](update-plugins.md).

## If something did not work

The full list of messages and symptoms is in [Troubleshooting](troubleshooting.md). The three that belong to this page:

**The plugin does not appear in the list at all.** Check the folder layout from step 4. The
most common cause is one level too many: `plugins/anysource-sideloader/anysource-sideloader/main.js`
happens when an archive is extracted into a folder that was created for it first.

**It appears but will not switch on.** You are probably still in Restricted mode — go back to
step 1. This is worth re-checking even if you are sure, because every other indicator looks
healthy in that state.

**Your browser saved `main.js` as a text file.** That happens when the individual files are
downloaded instead of the archive: the forge serves them as `text/plain`, so a browser shows
them rather than saving them, and some browsers then append `.txt`. Use the `.zip` from step 2.
If you do want the individual files, the direct links are
[`main.js`](https://git.jkaindl.de/jkaindl/anysource-sideloader/releases/download/latest/main.js),
[`manifest.json`](https://git.jkaindl.de/jkaindl/anysource-sideloader/releases/download/latest/manifest.json)
and
[`styles.css`](https://git.jkaindl.de/jkaindl/anysource-sideloader/releases/download/latest/styles.css)
— use *Save link as…* on each, and make sure the names survive.

## On mobile

The steps above describe the desktop app, which is where the *Open plugins folder* button
exists. The plugin itself runs on mobile as well, so the simplest route is to do this bootstrap
once on a desktop; if that vault syncs to your phone, the plugin arrives with it.

## Verifying the download

Every release also carries `checksums.sha256` covering all of its assets, including the archive.

```
shasum -a 256 anysource-sideloader.zip     # macOS / Linux
```

Compare the result with the line for `anysource-sideloader.zip` in
[`checksums.sha256`](https://git.jkaindl.de/jkaindl/anysource-sideloader/releases/download/latest/checksums.sha256).
What this proves and what it does not is in [the security model](../explanation/security-model.md).
