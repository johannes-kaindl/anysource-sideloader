# Why there is only one distribution channel

> **Diátaxis: Explanation.** Understanding-oriented — background and trade-offs.

## The problem this plugin exists for

The Obsidian Community Store depends on GitHub as a single point of failure. Not for hosting
the store, but for hosting every plugin in it: the store lists releases, and those releases
live on GitHub.

That dependency is invisible right up to the moment an account is flagged. When it happens,
every plugin whose maintainer is caught in the sweep becomes uninstallable overnight — not
because anything is wrong with the code, and not through any decision about the plugins
themselves. One such flag removed 21 plugins from the store in a single day.

There is no appeal path that runs on a useful timescale, and no way for a user who already
has the plugin to get the next version. The plugin is fine. Its only road is closed.

## What the plugin does about it

It removes the assumption that a plugin's releases live in one particular place. A release can
sit on GitHub, on a self-hosted Forgejo or Gitea, or behind a plain HTTP(S) URL, and the plugin
installs and updates from there directly — regardless of whether the Community Store lists it
at all.

## The trade this makes, in both directions

Distribution for these plugins now runs entirely over `git.jkaindl.de` — the catalog, every
plugin release, and this plugin's own bootstrap download. There is no second channel: they are
not in the Community Store, and the GitHub mirrors are gone.

**What that buys:** the failure mode above cannot happen again. No third party can make these
plugins uninstallable by a decision about an account.

**What it costs:** if `git.jkaindl.de` does not answer, nothing installs and nothing updates
until it does. That is one server rather than one of the largest hosting providers, and it is
honest to say so.

**What it does not touch:** plugins you already have keep working. They live in your vault, not
on a server. An outage delays new installs and updates; it takes nothing away.

## Why the answer is not "both channels"

Two channels sound strictly better, and for a while there were two. The cost shows up not in
the good case but in the drift: two release paths mean two places a version can exist, two
places a manifest can be read from, and a set of failure modes where they disagree — usually
silently, because both answer successfully.

Given that one of the two channels is the one whose failure started this project, keeping it as
a fallback would mean maintaining the drift in order to preserve the option of depending again
on the thing that failed.

## What this means for you

Distribution is not the same thing as trust. Anything you install through this plugin is
third-party code running with full Obsidian API access, and the confirmation dialog is the only
gate. That is discussed separately in [the security model](security-model.md).
