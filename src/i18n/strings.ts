// English UI strings (Store-Publikum, PROF-OBS-07). Kein Fachbegriff ohne Auflösung
// in `desc` (Dach-AGENTS.md §10). Jeder nutzersichtbare Text der Tasks 12-13 kommt
// hierher — nichts wird an der Aufrufstelle formuliert.
export const STRINGS = {
  settings: {
    checkOnStartup: {
      name: "Check for updates on startup",
      desc: "Compares installed versions against the newest release of each source when Obsidian starts. Updates are never installed automatically.",
    },
    catalogs: {
      name: "Catalogs",
      desc: "Catalog URLs this vault subscribes to. A catalog is a JSON list of plugins; versions always come live from each plugin's own forge.",
    },
    catalogAdd: "Add catalog URL",
    catalogRemove: "Remove this catalog",
    tokens: {
      name: "Access tokens",
      desc: "One token per forge host, stored in the Obsidian keychain (not synced with the vault). Needed for private repositories and private catalogs.",
    },
    tokenHost: "Host, e.g. git.example.com",
    tokenAdd: "Add host",
    tokenRemove: "Remove this host (the keychain entry itself is kept by Obsidian)",
    tokenFallbackPlaceholder: "Token (kept for this session only, no keychain available)",
  },
  notices: {
    updatesAvailable: (n: number) => `${n} plugin update${n === 1 ? "" : "s"} available — open AnySource Sideloader`,
    upToDate: "All sideloaded plugins are up to date.",
    installed: (name: string, v: string) => `Installed ${name} ${v}.`,
    checksumMismatch: "Checksum mismatch — installation aborted.",
  },
  confirm: {
    installTitle: (name: string) => `Install ${name}?`,
    updateTitle: (name: string, from: string, to: string) => `Update ${name} ${from} → ${to}?`,
    checksumAbsent: "This release carries no checksum file; the download cannot be verified.",
    httpSource: "This source uses plain HTTP; the download is not encrypted in transit.",
    idChanged: (oldId: string, newId: string) => `The source now serves a plugin with id "${newId}" instead of "${oldId}". This would overwrite a different plugin — aborted.`,
    install: "Install", update: "Update", cancel: "Cancel",
    enableNow: "Enable the plugin now?", enable: "Enable", later: "Later",
  },
} as const;
