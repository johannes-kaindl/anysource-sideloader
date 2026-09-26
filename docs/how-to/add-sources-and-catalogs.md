# How to add sources and catalogs

> **Diátaxis: How-to.** Task-oriented. Assumes the plugin is installed and enabled.

There are two ways to get a plugin into the list: point at one repository, or subscribe to
a catalog that lists many.

## Add a single repository

Run the command **Install plugin from URL** from the command palette and paste the repository
URL into the dialog. Use the front page of the repository — not a link to a release, a tag or
a file:

```
https://github.com/user/repo
https://git.jkaindl.de/jkaindl/some-plugin
https://gitea.example.org/team/plugin
```

The forge type is detected from the URL, so nothing has to be configured per source. GitHub,
Forgejo and Gitea each expose releases and assets slightly differently, and the right adapter
is chosen automatically. Which shapes work where is listed in
[Forge support](../reference/forge-support.md).

A repository whose forge has no Gitea-compatible API is still usable: the plugin then reads
the files straight from the default branch instead of from a release. This fallback has real
limits — it only knows the branch names `main` and `master`, and there is no tag selection.
See [Limitations](../explanation/limitations.md).

## Subscribe to a catalog

A catalog is a single JSON file listing several plugins. In the plugin's settings, paste its URL
under **Catalogs** and use **Add catalog URL**; the entries then appear under **Browse
catalogs**.

Subscribing gets you the whole list at once, with one-click install per entry, and refreshes
them together. What a catalog does *not* do is state versions: those are always read live from
each plugin's own forge. A catalog says what exists, never what version you should have — so a
stale catalog cannot hand you an outdated release.

One catalog is subscribed by default so that the browse list is not empty on a fresh install.
You can remove it in the settings like any other.

## Publish your own catalog

The format is deliberately small — one JSON file on any HTTP(S) URL. The full schema, including
which fields are required and what happens to entries that do not validate, is in
[Catalog format](../reference/catalog-format.md).

This is the mechanism an organisation uses to publish an internal, approved set of plugins:
host the catalog on a private Forgejo or Gitea instance and hand out a token scoped to that
host. See [Private repositories](private-repositories.md).
