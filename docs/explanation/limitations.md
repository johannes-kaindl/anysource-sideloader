# Known limitations

> **Diátaxis: Explanation.** Understanding-oriented — what is not solved, and how well it
> is understood.

## Private GitHub sources are experimental

One half of why is measured; the other half is not, and the distinction matters.

**What is measured (2026-09-01, Obsidian 1.13.7, against a local server):** Obsidian's
`requestUrl` **forwards the `Authorization` header across a redirect to a different host** —
for both 302 and 303, in 4 of 4 requests. Node's `fetch` strips it on the same setup.

Private GitHub asset downloads go through exactly such a redirect: the API asset URL answers
302 with a pre-signed S3 URL. So the bearer token is passed on to S3, which typically rejects
requests carrying two authentication mechanisms at once.

**What is not measured:** how S3 actually answers in that case. Establishing that needs a real
private GitHub repository, which the available test account could not provide.

Private **Forgejo and Gitea** sources are on entirely different footing: supported end to end
and covered by an integration test against a real private repository, from detection through
release lookup to asset download.

## Checksums prove transport, not authenticity

Covered in full in [the security model](security-model.md). Short version: the sums are fetched
from the same forge as the payload and are not signed.

## Installing runs third-party code

Also in [the security model](security-model.md). There is no sandbox; the confirmation dialog
is the only gate.

## The raw fallback only knows `main` and `master`

There is no branch or tag selection. A repository whose default branch is named anything else
cannot be installed through the raw path. The error message always names the `main` attempt,
because that is the expected name — so a repository on `develop` reports a failure about
`main`.

## A locked-down instance can be misdetected

Forge detection probes `/api/v1/version` without a token. An instance that gates that endpoint
behind authentication looks like "no Gitea API here", the plugin falls back to raw files, and
those fail too. The result is a raw-fallback error on an instance that has a working API.

## Plugin ids are stricter than Obsidian's

Ids must match `^[a-z0-9][a-z0-9-_]{0,63}$` — no uppercase, no dots, where Obsidian permits
both. A plugin with an otherwise valid but non-matching id is rejected rather than installed
under a corrected name.

## Adoption only sees catalog entries

Plugins already in your vault are recognised by matching them against subscribed catalogs. A
plugin that appears in no subscribed catalog will not show up as adoptable; add its repository
as a source instead.

## The settings page blanks during a self-update

When the Sideloader updates itself, the settings page you are looking at goes blank, because
the plugin drawing it unloads itself for a moment. The window stays open and the tab is
immediately available again. Cosmetic, but it looks alarming the first time.
