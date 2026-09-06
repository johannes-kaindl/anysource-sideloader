# How to use private repositories

> **Diátaxis: How-to.** Task-oriented.

Private repositories and private catalogs need authentication. Tokens are stored **per forge
host**, not per repository.

## Add a token

In the plugin's settings, add the host you need a token for — for example
`git.example.org` — and paste the token.

The token goes into Obsidian's own keychain through the built-in `SecretComponent`. It is
never written to `data.json` and never stored in plain text. What is kept in the plugin's
settings file is only the identifier of the keychain entry.

From then on, any source or catalog on that host is fetched with that token.

## The organisation case

This is the mechanism that makes internal distribution work: an organisation runs a private
Forgejo or Gitea instance holding internal plugins and one catalog listing them, and each
member adds one token scoped to that host. Everything else — install, update check, checksum
verification — behaves exactly as it does for public sources.

Private Forgejo and Gitea sources are supported end to end and covered by an integration test
against a real private repository.

## Private GitHub is experimental

Private **GitHub** sources are not on the same footing, and the reason is measured rather than
suspected. See [Limitations](../explanation/limitations.md) for what is known and what is not.

## A detection pitfall on locked-down instances

Forge detection probes `/api/v1/version` **without** sending a token. On an instance that puts
even that endpoint behind authentication, the probe looks like "there is no Gitea API here" and
the plugin falls back to reading raw files — which then also fails, because those need the token
too. The symptom is a raw-fallback error on an instance that does have a perfectly good API.
