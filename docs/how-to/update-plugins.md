# How to keep plugins up to date

> **Diátaxis: How-to.** Task-oriented.

Nothing in this plugin updates on its own. Every update is something you trigger and then
confirm.

## Run a check

Three ways, all doing the same thing:

- **Check now** at the top of the plugin's settings.
- The command **check-updates** from the command palette — bind a hotkey to it if you check
  often.
- Automatically, once shortly after Obsidian starts, if **Check for updates on startup** is on.

Sources are queried one after another, so a check takes a moment when you track many plugins.
Measured against a self-hosted Forgejo on a local network, 22 tracked plugins take about two
seconds; a remote forge is slower. A spinner sits next to the button while the check runs and
the result arrives as a notice.

If a source fails, the check says which one and why. It does not fold a failure into "everything
is up to date".

## Apply an update

Two places, one mechanism:

- **In the row itself.** Each entry under *Installed plugins* carries a button that changes with
  its state: **Check** while nothing is pending, **Update to `<version>`** once a newer release
  is known. Install straight from the row you are looking at.
- **In the Updates section**, which lists everything that is due, as an overview.

Either way you get the release notes of the new version before anything happens, and nothing is
written until you confirm.

## Updating the Sideloader itself

The same row, the same button — the plugin updates itself the way it updates anything else.
This has been measured end to end on Obsidian 1.13.7: the files are replaced, the new code
loads, the plugin stays enabled, and settings and commands survive.

One visible quirk: **the settings page you are looking at goes blank at that moment**, because
the plugin that draws the page briefly unloads itself. The window stays open. Click the plugin
again in the sidebar and everything is there.
