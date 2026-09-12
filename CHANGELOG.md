# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Changed

- **Release notes before an update now cover the whole version delta, not just the latest
  release.** Updating from 0.3.1 to 0.5.0 used to show only 0.5.0's notes; it now shows 0.5.0,
  0.4.1 and 0.4.0, newest first, each under its own version heading — the same modal, just fed
  every release newer than the installed version instead of only the last one fetched.

## [0.4.2] — 2026-09-06

### Added

- **Releases now carry `anysource-sideloader.zip` — a one-download bootstrap for the manual
  first install.** The archive holds a correctly named `anysource-sideloader/` folder with
  `main.js`, `manifest.json` and `styles.css`, and is covered by `checksums.sha256` like every
  other asset. The link
  `.../releases/download/latest/anysource-sideloader.zip` is stable across versions, so
  documentation can name it once.
  The reason is measured: a forge serves the individual assets as `text/plain` with
  `content-disposition: inline`, so clicking `main.js` in a browser *opens* it as text instead
  of downloading it, and browsers then tend to append `.txt`. The resulting install looks like
  a broken plugin rather than a mis-saved file. The archive gets a real download dialog, turns
  three downloads into one, and removes the need to create a folder and type its name.
  (Built by the shared release tooling, so every plugin using it gets the same asset.)
- **Documentation restructured after [Diátaxis](https://diataxis.fr/)** in `docs/`: a
  [tutorial](docs/tutorial.md), five [how-to guides](docs/how-to/index.md), three
  [reference](docs/reference/index.md) pages and three
  [explanation](docs/explanation/index.md) pages. The README shrank from 213 to ~140 lines and
  now links rather than retells — notably, the install instructions were on line 47 behind two
  explanatory sections.

### Fixed

- **A fresh install now subscribes to the same catalog the README tells you to subscribe to.**
  `DEFAULT_CATALOG_URL` still pointed at a predecessor repository: the README was moved to the
  current catalog in 0.4.1 and the code was left behind. Both URLs answered with HTTP 200, so
  no link check could see it — the visible effect was that following the README added a second,
  near-identical catalog to the browse list. The predecessor also carried no tags on any of its
  23 entries, and the browse filter searches name, description **or** tag, so searching by tag
  found nothing there.
  A test now checks the seam rather than the value: it reads both READMEs and asserts they name
  exactly the URL the code subscribes to. A test that merely repeated the string would have been
  edited along with the next move and confirmed nothing.

### Changed

- **The manual install instructions no longer mention a filesystem path.** They now use
  Obsidian's own *Open plugins folder* button, which makes the procedure identical on macOS,
  Linux and Windows and removes the need to unhide `.obsidian`. Exiting Restricted mode is now
  step 1 rather than an afterthought: a plugin sitting in exactly the right folder never loads
  while that mode is on, and every other indicator looks healthy, so the symptom reads as a
  broken plugin.
- The GUI smoke checklist moved from `docs/SMOKE.md` to `docs/internal/SMOKE.md`, keeping
  `docs/` user-facing. References in code and scripts were updated with it.

- **The button in each Installed plugins row now changes with the state.** It reads
  **Check** while nothing is pending and becomes **Update to `<version>`** once a newer
  release is known, so an update can be installed from the row that reports it. Until now
  the row displayed *"Update available: 0.4.1"* and offered only a re-check next to it —
  installing meant switching to the Updates section, which stays as the overview.
  The status indicator is dropped while an update is pending: the row states it once,
  through the button, instead of twice.

## [0.4.1] — 2026-09-02

### Fixed

- **Text you are typing in Settings is no longer discarded when the tab redraws.** The
  Settings tab redraws on several occasions — a catalog finished loading, the set of
  installed plugins changed on disk, after any flow. Until now the text of the two "Add"
  fields (catalog URL, token host) lived in a closure that is rebuilt empty on every
  redraw: type while a catalog is loading, press **Add**, and nothing was added. The
  window is as long as the catalog takes to load — seconds over a slow connection.
- **The cursor no longer jumps to the end of the field on a redraw.** Measured on Obsidian
  1.13.7: the input element is replaced and Obsidian restores the focus itself, but the
  caret position was lost (34 instead of 8). Correcting a URL in the middle of the text
  therefore continued at the end. The value, the focus and the caret now all survive.

### Documented

- **Both READMEs now say that a check takes a moment** and that a spinner shows while it
  runs. The measured numbers are in the CHANGELOG entry for 0.4.0; the README keeps it to
  what a user needs to expect.

## [0.4.0] — 2026-09-02

### Added

- **A loading indicator while checking for updates** (`is-checking`, UI-STANDARD §8). The
  reason is measured, not assumed: `checkAllUpdates` fetches sequentially, and with the 22
  plugins of the production vault that takes 1.8 s against a self-hosted Forgejo on the LAN
  and an extrapolated 6.7 s against GitHub (5 samples, 305 ms mean per request). Until now
  the click produced no visible response at all for that long. Deliberately a single state:
  the outcome is already reported as a Notice — what was missing was the time in between.
  Deliberately **not** `setDisabled` (see below).

### Fixed

- **GUI smoke: `E5` was not self-contained.** It was red in `--section settings` and green in
  a full run. Cause measured: between filling the field and clicking "Add host", the tab
  redraws (the catalog entered in E4 finishes loading and triggers `refresh()`), leaving a
  *different*, empty input for the click to hit. The check now re-applies the value until it
  stays put. ⚠️ The underlying product issue — a redraw discards a keystroke in progress —
  is tracked separately; it can hit a real user typing while the catalog loads.

### Documented

- **The freeze cause is no longer open.** The "Check now" freeze of 2026-09-01 was fixed by
  removing two suspects at once, leaving it unclear which one mattered. Seven runs in an
  isolated second Obsidian instance separated them: **neither suspect freezes on its own.**
  The trigger is the conjunction — `ButtonComponent.setDisabled()` called from the
  *microtask* of the flow promise, inside the settings window. Two variants differing from
  the defect in exactly one detail each (contents of the `finally`; timer instead of
  microtask) both run fine. Full table in `docs/internal/SMOKE.md` § Freeze.

- **German README added** (`README.de.md`, CORE-META-09), with a language toggle in both
  files. The English `README.md` stays canonical.
- **The README claimed the raw fallback only knows `main`.** It has known `master` as well
  since 0.3.1 — the CHANGELOG said so, the README did not. Corrected in both places it was
  stated ("Adding sources" and "Known limitations").

## [0.3.1] — 2026-09-01

### Fixed

- **A raw source on a `master` repository was unreachable.** The default branch was
  hard-coded to `main`; it now falls back to `master` when `main` returns 404, and the asset
  URLs follow whichever branch actually answered. The error message still names the `main`
  attempt — that is the expected name, and reporting `master` would send the search the
  wrong way.
- **A forge outage no longer buries the screen in notices.** With twenty tracked plugins, a
  failed check produced twenty identical notices and hid the actual result underneath. They
  are summarised into one line now, and "everything up to date" is no longer claimed when
  checks failed — that would be a statement about plugins that could not be checked.

### Removed

- Dead `github` branch in the raw URL builder. `detectForge` never routes github.com through
  the raw path, so it could not run — and dead code that builds a foreign URL shape is the
  kind that gets mistaken for proven.

## [0.3.0] — 2026-09-01

### Changed — the store moved into the settings tab

- **The sidebar view is gone.** Browsing catalogs, tracking installed plugins and applying
  updates all happen in the plugin's settings tab now — where Obsidian manages plugins
  anyway, and where BRAT and comparable plugins put it. The ribbon icon is removed; the
  "Open settings" command opens the tab.
- **Why this is more than a move:** the view carried its own card and row CSS, built beside
  Obsidian's own building blocks instead of on them. One consequence was visible — catalog
  titles used an `<h3>` with no size rule and rendered far too large in a sidebar. In the
  settings tab, Obsidian's `Setting` API supplies layout and typography, so `styles.css`
  shrank from 105 to ~30 lines and the whole class of problem is gone rather than patched.

### Fixed

- **The catalog cache survived a change of subscriptions** — removing a catalog left its
  entries on screen.
- **The on-disk state was only read when a catalog loaded** — installing a plugin outside
  this one (BRAT, by hand) left the entry showing "Install".
- **"Check now" did not refresh an open settings tab** — you pressed it, got a notice, and
  the list still showed the old state.

## [0.2.1] — 2026-09-01

### Fixed

- **Clicking "Check now" in the settings froze the whole app.** Not just the settings
  window — both renderers stopped responding, with no exception and no console message,
  and the state persisted until Obsidian was restarted. The check now runs through the
  registered command, which executes in the workspace context where the same flow is
  measured to work.

## [0.2.0] — 2026-09-01

### Added

- **Track already-installed plugins.** The Browse tab now reads what is *actually* in the
  vault instead of only what this plugin installed itself. A catalog entry whose plugin is
  present but untracked offers "Track for updates"; a "Track all N installed" button above
  the list does the whole set at once. Until now such plugins were invisible: Browse
  offered "Install" for something long installed, and the update check ran over an empty
  list — it never reported anything because it knew nothing.
- **"Check for updates" as a button**, in the Updates tab and in the settings. Both run the
  same flow as the existing command; the button in the Updates tab sits *above* the empty
  state, so it is there precisely when nothing was found and you want to know whether the
  check ran at all.
- Catalog cards now show the installed version and whether it is current — a checkmark
  state for "up to date", a warning state for "1.2.0 → 1.3.0 available".

### Changed

- An update check with nothing tracked now says so instead of reporting "all up to date",
  which looked like a result and was none.

## [0.1.1] — 2026-09-01

### Added

- GUI smoke driver (`npm run smoke:gui`) that runs the checklist in `docs/internal/SMOKE.md`
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
