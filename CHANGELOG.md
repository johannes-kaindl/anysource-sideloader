# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

## [0.1.1] — 2026-09-01

### Added

- GUI smoke driver (`npm run smoke:gui`) that runs the checklist in `docs/SMOKE.md`
  against a **running** Obsidian over CDP — 36 checks across store view, hub tabs, empty
  states, catalog install/update/remove, install-from-URL, settings, and transport
  (CORE-TEST-02 b). Its network counterpart is local (`scripts/forge-server.ts`, three
  HTTP servers on 127.0.0.1), so the run needs neither network nor a token, and it can
  produce the two redirects a real forge cannot be asked for.

### Fixed

- **Catalogs and access tokens were not manageable on Obsidian 1.13.** Both settings
  rendered as empty rows — name and description, no controls — so neither catalog
  subscriptions nor per-host tokens could be edited. Cause: a single `render` hatch may
  only fill *its own* row; the extra rows it built next to itself were silently discarded
  by the native renderer (no exception, no console message). Each row is now its own
  definition inside a settings group. Found by the GUI smoke, not by the unit tests — the
  defect lived entirely in the seam to the host.

### Documented

- **Known limitation sharpened from guess to measurement:** `requestUrl` forwards the
  `Authorization` header across a redirect to a different host (measured for 302 and 303).
  This is the transport half of why private GitHub sources stay experimental.

## [0.1.0] — 2026-09-01

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
