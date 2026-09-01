# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

## 0.0.1

- Forge adapters for GitHub, Forgejo/Gitea, and plain raw-file sources, with
  auto-detection from a pasted repo URL.
- Subscribable plugin catalogs (a single JSON list of plugins, refreshed together).
- Per-host access tokens stored in Obsidian's keychain, for private repos and catalogs.
- Checksum verification (`checksums.sha256`) of downloaded release assets before install.
- Store view (Browse/Installed/Updates) plus manual and startup update checks.
