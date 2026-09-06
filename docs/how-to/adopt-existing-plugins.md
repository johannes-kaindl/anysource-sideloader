# How to adopt plugins you already have

> **Diátaxis: How-to.** Task-oriented. Read this if you are not starting from an empty vault.

The Sideloader reads what is actually in your vault, not only what it installed itself. A
plugin you installed some other way can be brought under its care without reinstalling it and
without losing the version you have.

## Why this matters

**Update checks only cover tracked plugins.** If nothing is tracked, a check has nothing to
look at. It will say so rather than report that everything is up to date — but it is still an
easy thing to overlook on a vault that already has a dozen plugins in it.

## Adopt one plugin

Open **Browse catalogs**. Any catalog entry whose plugin is already present in your vault shows
**Track for updates** instead of **Install**.

Click it. Nothing is downloaded and nothing is overwritten: the plugin is added to the tracked
list at whatever version you currently have, and the next check compares that against its forge.

## Adopt everything at once

Above the catalog list there is a **Track all N installed** action, where *N* is the number of
entries in the subscribed catalogs that match plugins already in your vault. One click, the
whole set.

## What about plugins in no catalog?

Adoption works through catalog matching, so a plugin that appears in none of your subscribed
catalogs will not show up as adoptable. Add its repository as a source instead — see
[Add sources and catalogs](add-sources-and-catalogs.md). The result is the same tracked entry.
