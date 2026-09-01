# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

First public release.

- Forge adapters for GitHub, Forgejo/Gitea, and plain raw-file sources, with
  auto-detection from a pasted repo URL.
- Install from any repo URL (command + modal) or browse subscribable plugin catalogs
  (a single JSON list of plugins; the author's catalog is pre-subscribed and removable).
- Per-host access tokens stored in Obsidian's keychain, for private repos and catalogs.
- Checksum verification (`checksums.sha256`) of downloaded release assets before install;
  a mismatch aborts before anything is written.
- Store view (Browse/Installed/Updates) with release notes per update, plus manual and
  startup update checks — updates are never installed silently.
- Safety guards: a source that suddenly serves a different plugin id is rejected, and a
  first install never silently overwrites an existing plugin directory.

*(The git tag `0.0.1` exists without a release: it was an internal test fixture.)*
