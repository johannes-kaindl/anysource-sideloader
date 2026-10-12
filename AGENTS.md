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

## Release-Notes: fremder Text im Modal

Das Modal `ReleaseNotesModal` rendert Release-Notes aus dem Katalog, also fremden Text, mit `MarkdownRenderer.render`. Davor läuft ausschließlich `neutralizeModelMarkdown` (code-kit `safe-markdown`): Es entfernt Code-Elemente, macht `<` zu `&lt;` und Bilder zu Text.

Ein zweiter DOM-Durchgang (`neutralizeRemoteResourcesInTree`, code-kit `web/remote-resources`) ist hier nicht nötig und nicht eingebaut. Gemessen am 2026-10-12 in einer Zweitinstanz (Obsidian 1.14.4) gegen einen lokalen HTTP-Server, der jeden Abruf zählt: Der neutralisierte Text lädt in sieben Schreibweisen (Markdown-Bild, `<img>`, Referenz-Definition, Referenz über Zeilenumbruch, `style="…url(…)"`, `<picture><source srcset>`, `//`-Adresse) null Fernbilder, der rohe Text lädt in fünf davon (Gegenprobe, die Messung kann also finden). Dieselben Eingaben ergeben in `neutralizeModelMarkdown` vor und nach der Hebung auf code-kit 0.24.0 bytegleiche Ausgaben, das Plugin ruft `neutralizeRemoteResources` (die Funktion mit den Fernbild-Fixes 0.20.0) nicht auf.

Die Linearitätsprobe `tests/obsidian/release-notes-modal-render.test.ts` misst mit `pruefeLinear` den Quotienten statt einer absoluten Zeitgrenze, weil eine feste Grenze unter Last kippt (7 s bei Load 320). Ändert sich die Ausgabe der Neutralisierung oder ruft ein Aufrufer `neutralizeRemoteResources` auf, gehört die Messung wiederholt.

## UI-Abweichungen

Deklarationspflicht nach `../UI-STANDARD.md` §1a: abweichen ist erlaubt, stillschweigend
abweichen nicht.

### Listen im Settings-Tab als Gruppe statt über `settingBodyHost`

**Abweichung:** Kataloge und Token-Hosts werden als `type: "group"` mit **je einer
Definition pro Zeile** gezeichnet (`catalogItems()`/`tokenItems()`), nicht über
`settingBodyHost(setting)` aus dem Kit-Walker — den nutzen die fünf Nachbar-Repos mit
demselben Walker (`paperless-storage`, `calendar-notes`, `koda-agent`, `llm-lab`,
`mailstone`), und er ist hier sogar schon vendored.

**Grund:** Eine Liste aus echten Setting-Zeilen ist das, wofür Obsidian 1.13
`SettingDefinitionGroup.items` eingeführt hat — sie erbt natives Styling und wird von der
Settings-Suche gefunden. `settingBodyHost` leert die Zeile und nimmt ihr die
`setting-item`-Klasse; für die Suche ist der Inhalt danach ein blinder Fleck.

**Was NICHT der Grund ist:** die ursprüngliche Bauart (mehrere Zeilen aus einer einzigen
`render`-Hatch an `settingEl.parentElement`) war schlicht kaputt — sie zeichnete in
Obsidian 1.13 lautlos nichts. Beide Alternativen hier beheben das; die Wahl zwischen ihnen
ist die Abweichung, nicht der Fix.

`gilt-solange:` Obsidian `SettingDefinitionGroup.items` unterstützt **und** die
Settings-Suche Gruppen-Items indiziert. Fällt eines davon weg, ist
`settingBodyHost(setting)` der Rückweg; der Umbau ist auf die beiden `*Items()`-Methoden
begrenzt.

## Verweise

- Dach-Regeln: `../AGENTS.md` (Kit-first, Zuständigkeits-Zuschnitt, REGISTRY,
  UI-STANDARD, Release-/Store-Prozess).
- Lösungs-Registry: `../REGISTRY.md`.
- UI-Bausteine (Hub-Tabs, Confirm-Modal, SecretComponent-Zeile): `../UI-STANDARD.md`.
