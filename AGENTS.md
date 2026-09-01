# AGENTS — anysource-sideloader

Beschaffung und Update von Plugin-Artefakten aus Git-Forges (GitHub, Forgejo, Gitea,
raw URLs), inklusive subscribable Kataloge. Spec:
`../docs/superpowers/specs/2026-09-01-anysource-sideloader-design.md` (Dach).

## Zuschnitt

Dieses Plugin **besitzt** Beschaffung & Update von Plugin-Artefakten — Erkennung des
Forge-Typs, Release-/Asset-Abfrage, Checksummen-Prüfung, Installation. Es **bewertet
keine Plugin-Inhalte** (kein Code-Review, kein Ranking, kein Store-Ersatz) und besitzt
**kein Retrieval/keine Abläufe anderer Plugins** — es liefert nur das Artefakt.

## Architektur

- `src/core/**` ist obsidian-/DOM-/node-frei; Netzwerk läuft ausschließlich über einen
  injizierten `HttpPort`, Forge-Adapter (`src/core/forge/`) sind pure URL-Bau-/
  Parse-Funktionen.
- `src/obsidian/**` ist die dünne Schale: `requestUrl`-Transport, `SecretComponent` für
  Tokens im Schlüsselbund (`secrets.ts`, übernommen aus `calendar-notes`), Settings-Tab,
  Hub-UI.

## Kit-Vendoring

Kit-Module kommen ausschließlich über `tools/sync-kit.sh`, nie von Hand kopiert oder
editiert.

## Verweise

- Dach-Regeln: `../AGENTS.md` (Kit-first, Zuständigkeits-Zuschnitt, REGISTRY,
  UI-STANDARD, Release-/Store-Prozess).
- Lösungs-Registry: `../REGISTRY.md`.
- UI-Bausteine (Hub-Tabs, Confirm-Modal, SecretComponent-Zeile): `../UI-STANDARD.md`.
