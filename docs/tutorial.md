# Tutorial — from nothing to your first sideloaded plugin

> **Diátaxis: Tutorial.** Learning-oriented — one guaranteed-to-work run through, start
> to finish. Not a complete reference.

By the end of this you will have AnySource Sideloader running and one plugin installed
through it. It takes about five minutes and touches no terminal.

## Before you start

You need Obsidian **1.11.4** or newer and a vault you do not mind experimenting in. If you
would rather not experiment in your main vault, make a new one — everything here is
per-vault and leaves no trace elsewhere.

## Step 1 — Install the Sideloader itself

This is the one manual step, and it is written out in full in
[How to install AnySource Sideloader by hand](how-to/manual-install.md). Follow it, then
come back here.

Short version: exit Restricted mode, download the `.zip`, click the folder icon next to
*Installed plugins*, unpack it there, click *Reload plugins*, switch it on.

When you can open **Settings → AnySource Sideloader** and see a **Check now** button, you
are done with step 1.

## Step 2 — Look at what is already on offer

Open the plugin's settings and find **Browse catalogs**.

A catalog is one JSON file that lists plugins — a way to publish "here is a set of plugins"
as a single subscribable link. One catalog is subscribed out of the box, so the list is not
empty on your first visit.

Scroll it. Each entry shows a name, a description and a button. The button is not always the
same word, and that is the interesting part:

- **Install** — the plugin is not in this vault.
- **Track for updates** — you already have this plugin, installed some other way. The
  Sideloader recognised it and offers to look after it without reinstalling anything.

## Step 3 — Install one

Pick an entry that shows **Install** and click it.

You get a confirmation dialog first, showing what is about to happen. Nothing is written to
your vault until you confirm — that is true of every install and every update, without
exception.

Confirm. The plugin downloads, its checksum is verified against the release, and the files
land in your vault. Obsidian picks it up.

## Step 4 — Add a plugin that is in no catalog

Catalogs are convenience, not a gate. Any repository works.

Open the command palette and run **Install plugin from URL**. A dialog asks for the address; paste
a repository URL — the front page of the repo, not a link to a file. For example:

```
https://git.jkaindl.de/jkaindl/vault-rag
```

The plugin works out which kind of forge that is on its own (GitHub, Forgejo and Gitea each
answer differently) and finds the latest release. Confirm the install as before.

## Step 5 — Check for updates

Click **Check now** at the top of the settings.

Every tracked plugin is queried against its own forge, one after another, and you get a
notice with the result. If something has a newer release, its row changes: the button that
said **Check** now reads **Update to `<version>`**, and clicking it applies that update —
after a confirmation showing the release notes.

Nothing updates on its own. There is no silent auto-update in this plugin, by design.

## What you have now

- A vault that can install plugins from any forge, without the Community Store.
- One plugin installed from a catalog and one from a bare URL.
- A working update check.

## Where to go next

- [Add sources and catalogs](how-to/add-sources-and-catalogs.md) — the full set of URL shapes
  that work.
- [Adopt plugins you already have](how-to/adopt-existing-plugins.md) — the important one if
  this is not a fresh vault; update checks only cover tracked plugins.
- [Private repositories](how-to/private-repositories.md) — tokens, and what an organisation
  can do with them.
- [Why there is only one distribution channel](explanation/why-one-channel.md) — the reason
  this plugin exists at all.
