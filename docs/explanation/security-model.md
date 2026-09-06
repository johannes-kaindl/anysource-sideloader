# The security model

> **Diátaxis: Explanation.** Understanding-oriented. Read this before installing anything
> you did not write.

This page is deliberately about what the plugin does **not** protect you from, because that
is the part checksums and confirmation dialogs make easy to misjudge.

## Installing a plugin runs third-party code

An Obsidian plugin has full access to the Obsidian API: your vault's contents, the network,
and on desktop the parts of your machine Obsidian can reach. There is no sandbox, no
permission model and no capability system — not in this plugin, and not in Obsidian.

**The install confirmation is the only gate, and the judgement behind it is yours.** That is
equally true of the Community Store; the difference is that the store performs an automated
review first, and a sideload does not.

Practical consequence: treat adding a source the way you would treat running someone's script.
The question is not "is this plugin safe" but "do I trust whoever controls this repository,
now and for every future update".

## What checksum verification proves

When a release carries `checksums.sha256`, every downloaded asset is hashed and compared
before anything is written to your vault. A mismatch blocks the install.

This proves **transport integrity**: the bytes you got are the bytes the release says it has.
It catches corruption, a truncated download and a mixed-up asset.

It does **not** prove authenticity. The checksum file is fetched from the same forge as the
payload it verifies, and it is not signed. A forge that has been compromised, or a maintainer
account that has been taken over, can publish a tampered release together with matching sums,
and verification passes. Defending against that needs signatures and a key you have
independently, which this plugin does not implement.

## What the id guard does

An install is bound to the plugin id it was made with. If a later release carries a different
id, the update is refused rather than applied.

This closes one specific hole: a repository you tracked for plugin A cannot quietly start
shipping plugin B into the folder Obsidian loads A from.

## Tokens

Access tokens are stored per host in Obsidian's keychain via the built-in `SecretComponent` —
never in `data.json`, never in plain text. The settings file holds only the identifier of the
keychain entry.

Tokens are scoped by host, so a token for your organisation's Forgejo is never sent to another
forge. Note that a token is sent to **every** source on the host it belongs to.

⚠️ One measured caveat applies to private **GitHub** sources specifically — the token can leave
the host it was scoped to. See [Limitations](limitations.md).

## Nothing happens unattended

There is no silent auto-update. The startup check reads; it never writes. Every install and
every update is a deliberate action with a confirmation showing the release notes first.

This is a design position rather than an implementation detail: an unattended update path would
mean that trusting a repository once means trusting every future release from it, unread.

## Release notes are remote content

The release notes shown before an update are Markdown from the remote release, rendered — 
including any images it embeds. Opening release notes therefore loads images from that plugin's
own source, which is an outbound request to that host.
