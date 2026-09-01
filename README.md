# AnySource Sideloader

Install and update Obsidian plugins from any git forge — GitHub, Forgejo, Gitea, or raw
URLs — including subscribable plugin catalogs, without waiting on the Community Store.

This is an early scaffold. A full README (setup, catalog format, screenshots) follows once
the plugin has working features.

## Known limitations

- **Private GitHub sources are experimental.** Fetching releases/assets from a private
  GitHub repo with a token was not cleanly measurable with the currently available test
  account (flagged), so this path has not been proven end-to-end against a real private
  GitHub repo. Private **Forgejo/Gitea** sources, by contrast, are fully supported and are
  proven end-to-end (private repo + token, detect → latest release → asset download) in
  `tests/integration/live-forge.test.ts`.
