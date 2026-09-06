# Reference — forge support

> **Diátaxis: Reference.** Information-oriented.

The forge type is detected from a pasted repository URL; nothing is configured per source.

## Supported kinds

| Kind | Detected from | Releases read via | Private repos |
|---|---|---|---|
| `github` | `github.com` URLs | GitHub releases API | **Experimental** — see [Limitations](../explanation/limitations.md) |
| `gitea` | any host answering `/api/v1/version` (Forgejo and Gitea both) | Gitea-compatible releases API | Supported, covered by an integration test against a real private repo |
| `raw` | fallback when no Gitea-compatible API answers | files read from the default branch | Needs a token like any other source |

## What to paste

The **repository URL** — the front page. Not a release page, not a tag, not a direct link to
an asset.

```
https://github.com/user/repo
https://git.example.org/team/plugin
```

## The raw fallback

When a host exposes no Gitea-compatible API, files are read straight from the repository's
default branch:

```
<base>/<owner>/<repo>/raw/<branch>/<file>
```

for each of `manifest.json`, `main.js` and `styles.css`.

Constraints of this path:

- **Branch names**: only `main` and `master` are tried, in that order. There is no branch or
  tag selection. The error message always names the `main` attempt, because that is the
  expected name.
- **No releases**: you get whatever is on the default branch right now, which may be
  unreleased work.
- **No checksums**: `checksums.sha256` is a release asset, so the raw path has nothing to
  verify against.

## Detection pitfall

The probe for `/api/v1/version` is sent **without** a token. An instance that requires
authentication for that endpoint is therefore detected as `raw` rather than `gitea`, and the
raw path then fails too, for the same reason. See
[Private repositories](../how-to/private-repositories.md).

## Release assets

A release is usable when it carries at least `main.js` and `manifest.json`. Asset names are
matched **exactly**:

| Asset | Required | Purpose |
|---|---|---|
| `main.js` | yes | Plugin code. |
| `manifest.json` | yes | Id, version, `minAppVersion`. |
| `styles.css` | no | Missing (404) is accepted; any other failure is an error. |
| `checksums.sha256` | no | When present, every downloaded asset is verified against it before anything is written. |
| `<id>.zip` | no | Bootstrap archive for manual installation. Ignored by the plugin itself. |
