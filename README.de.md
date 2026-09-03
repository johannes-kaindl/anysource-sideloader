# AnySource Sideloader

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
![Obsidian](https://img.shields.io/badge/obsidian-1.11.4%2B%20%C2%B7%20desktop%20%26%20mobile-7c3aed)

Obsidian-Plugins von jeder git-Forge installieren und aktualisieren — GitHub, Forgejo, Gitea
oder rohe URLs — inklusive abonnierbarer Plugin-Kataloge, ohne auf den Community Store zu
warten.

> **Hinweis:** Diese Übersetzung folgt der englischen [`README.md`](README.md).
> Bei Abweichungen gilt die englische Fassung.

## Warum es das gibt

Der Community Store hängt an GitHub als einzelnem Ausfallpunkt: Wird ein Account markiert,
sind über Nacht alle Plugins nicht mehr installierbar, deren Betreuer in die Sperre gerät.
Eine solche Markierung ließ an einem einzigen Tag 21 Plugins aus dem Store verschwinden —
keines davon hatte ein Code-Problem, sie verloren nur ihren einzigen Vertriebsweg. AnySource
Sideloader beseitigt diesen einzelnen Ausfallpunkt: Ein Plugin-Release darf auf *irgendeiner*
Forge liegen (GitHub, Forgejo, Gitea oder auch nur einer schlichten HTTP(S)-URL), und
installiert wird direkt von dort — unabhängig davon, ob der Community Store das Plugin
überhaupt führt.

## Funktionen

- **Jede git-Forge als Quelle** — GitHub, Forgejo, Gitea oder eine schlichte Raw-Datei-URL.
  Der Forge-Typ wird aus der eingefügten Repo-URL erkannt; pro Quelle ist nichts zu
  konfigurieren.
- **Abonnierbare Kataloge** — ein Katalog ist eine JSON-Datei, die Plugins auflistet. Die
  Versionen kommen immer live von der jeweils eigenen Forge des Plugins, nie aus dem Katalog.
- **Alles lebt im Einstellungs-Tab**, dort, wo Obsidian Plugins ohnehin verwaltet — keine
  zusätzliche Seitenleisten-Ansicht, und das Layout ist Obsidians eigenes.
- **Kennt Plugins, die du schon hast.** Installierte, aber nicht verwaltete Plugins werden
  erkannt und lassen sich mit einem Klick übernehmen, auch alle auf einmal — ohne
  Neuinstallation, ohne Versionsverlust.
- **Prüfsummen-Verifikation** jedes heruntergeladenen Release-Assets, bevor irgendetwas
  geschrieben wird.
- **Private Repositories** über Zugriffstokens pro Host, aufbewahrt in Obsidians Schlüsselbund.
- **Nichts passiert ohne Bestätigung** — jede Installation und jedes Update ist eine bewusste,
  sichtbare Handlung, und Updates werden nie automatisch angewandt.

## Voraussetzungen

- Obsidian **1.11.4** oder neuer (die Version, die die für Zugriffstokens genutzte
  Schlüsselbund-API eingeführt hat).
- Läuft auf **Desktop und Mobil**; kein Node, keine Laufzeit-Abhängigkeiten, keine externen
  Programme.
- Eine Netzverbindung zu der Forge, die die Plugins hostet, die du installierst. Sonst wird
  nirgendwohin etwas gesendet.

## Installation

Weil der ganze Zweck dieses Plugins darin besteht, ohne den Community Store auszukommen, ist
seine eigene Erstinstallation manuell:

1. `main.js`, `manifest.json` und `styles.css` aus einem Release herunterladen.
2. Alle drei nach `<vault>/.obsidian/plugins/anysource-sideloader/` kopieren (den Ordner
   anlegen, falls er nicht existiert).
3. Das Plugin in Obsidians Einstellungen unter „Community-Plugins" aktivieren.

Ab dann kann sich das Plugin **selbst** genauso aktualisieren wie jedes andere per Sideload
installierte Plugin — nach dem einmaligen Start ist kein Kopieren von Hand mehr nötig.

## Bedienung

### Quellen hinzufügen

Eine Quelle wird durch Einfügen einer Repo-URL hinzugefügt (z. B.
`https://github.com/user/repo`, `https://git.jkaindl.de/jkaindl/some-plugin` oder die URL
einer Gitea-Instanz). Die Forge wird an der Form der URL erkannt — GitHub, Forgejo und Gitea
bieten jeweils eine etwas andere Release-/Asset-API, und das Plugin wählt den passenden
Adapter selbst. Für eine Forge ohne Gitea-kompatible API weicht das Plugin auf rohe Dateien
aus: Es nimmt weiterhin eine **Repo-URL** (keine direkte Asset-URL) und leitet daraus
`<basis>/<owner>/<repo>/raw/<branch>/<datei>` für `manifest.json`, `main.js` und `styles.css`
ab — eine Auswahl von Branch oder Tag gibt es noch nicht, dieser Ausweichweg funktioniert also
nur gegen den Standard-Branch des Repos, und nur wenn der `main` oder `master` heißt (in
dieser Reihenfolge versucht; die Fehlermeldung nennt immer den `main`-Versuch, weil das der
erwartete Name ist).

### Kataloge

Ein Katalog ist eine kleine JSON-Datei, die mehrere Plugins auf einmal auflistet — nützlich,
um „das sind die Plugins, die ich betreue" oder „das sind die für diese Organisation
freigegebenen Plugins" als eine einzige abonnierbare URL zu veröffentlichen. Ein abonnierter
Katalog stellt alle darin gelisteten Plugins zur Installation mit einem Klick bereit und
aktualisiert sie gemeinsam.

Katalog-Format:

```json
{ "catalogVersion": 1, "name": "Order from Traces — Obsidian Plugins",
  "plugins": [{ "id": "vault-rag", "name": "Vault RAG", "description": "…",
    "repo": "https://git.jkaindl.de/jkaindl/vault-rag", "author": "Johannes Kaindl", "tags": ["ai"] }] }
```

### Updates

- Eine Startprüfung (in den Einstellungen umschaltbar) sucht über alle eingerichteten Quellen
  hinweg nach neuen Releases und meldet, wenn Updates bereitstehen.
- Updates werden von Hand angewandt — es gibt kein stilles, unbeaufsichtigtes Auto-Update.
- Vor dem Anwenden zeigt das Plugin die Release-Notes der neuen Version, damit du weißt, was
  du installierst.
- **Jede Zeile unter „Installed plugins" trägt ihren eigenen Knopf, und der wechselt mit dem
  Zustand:** **Check**, solange nichts ansteht, und **Update to `<Version>`**, sobald ein
  neueres Release bekannt ist. Du installierst also aus der Zeile heraus, die es meldet; die
  Sektion **Updates** bleibt als Überblick über alles Fällige bestehen.

Das Plugin aktualisiert sich über dieselbe Zeile auch selbst (end-to-end gemessen an Obsidian
1.13.7): die Dateien werden ersetzt, der neue Code wird geladen, die Einstellungen überleben.
Eine sichtbare Eigenheit — die Einstellungsseite, auf die du gerade schaust, wird in diesem
Moment leer, weil sich das Plugin, dem sie gehört, kurz selbst abmeldet. Das Fenster bleibt
offen; klicke das Plugin links noch einmal an, dann ist alles wieder da.

### Ein Kanal, mit Absicht

Die Verteilung läuft vollständig über **`git.jkaindl.de`** — der Katalog, jedes
Plugin-Release und der Bootstrap-Download dieses Plugins selbst. Einen zweiten Weg gibt es
nicht: diese Plugins stehen nicht im Obsidian Community Store, und die GitHub-Spiegel sind
weg.

Das ist ein bewusster Tausch, und er schneidet in beide Richtungen. Er beseitigt den
Single Point of Failure, der dieses Projekt ausgelöst hat — ein geflaggtes GitHub-Konto
machte 21 Plugins über Nacht uninstallierbar, ohne dass eines davon ein Code-Problem hatte.
Er heißt aber auch: antwortet `git.jkaindl.de` nicht, installiert und aktualisiert sich
nichts, bis es wieder antwortet. Bereits installierte Plugins laufen weiter — die liegen in
deinem Vault, nicht auf einem Server.

Scheitert eine Prüfung, nennt das Plugin die Quelle und den Grund, statt zu melden, alles
sei aktuell.

### Schon Plugins installiert?

Der Abschnitt **Browse catalogs** in den Einstellungen liest, was tatsächlich in deinem Vault
liegt — nicht nur das, was das Plugin selbst installiert hat. Ein Katalog-Eintrag, dessen
Plugin schon vorhanden ist, zeigt **Track for updates** statt Install — ein Klick, keine
Neuinstallation, und die vorhandene Version bleibt erhalten. Über der Liste erledigt
**Track all N installed** den ganzen Satz auf einmal.

Das ist wichtig, weil Update-Prüfungen nur *verfolgte* Plugins abdecken. Ist nichts verfolgt,
hat eine Prüfung nichts anzusehen — und sie sagt das dann, statt zu melden, alles sei aktuell.

Geprüft wird standardmäßig von Hand: Der Knopf **Check now** sitzt oben in den Einstellungen
des Plugins, und dieselbe Aktion steht in der Befehlspalette (lässt sich also auf ein Tastenkürzel
legen). Ist „Check for updates on startup" aktiv, läuft sie zusätzlich einmal kurz nach dem
Start von Obsidian. Updates werden nie ohne deine Bestätigung installiert.

Die Quellen werden nacheinander abgefragt, eine Prüfung dauert bei vielen verwalteten Plugins
also einen Moment — gegen eine selbst gehostete Forgejo im lokalen Netz gemessen: 22 Plugins
brauchen rund zwei Sekunden, eine entfernte Forge ist langsamer. Solange die Prüfung läuft,
dreht sich ein Symbol neben dem Knopf; das Ergebnis kommt als Meldung.

## Konfiguration

### Zugriffstokens

Private Repos und private Kataloge brauchen eine Authentifizierung. Tokens werden pro
Forge-Host in Obsidians eigenem Schlüsselbund abgelegt (über die eingebaute
`SecretComponent` im Einstellungs-Tab) — nie in `data.json`, nie im Klartext. Das ist der
Mechanismus, der den Organisations-Anwendungsfall trägt: Eine Organisation kann eine private
Forgejo-/Gitea-Instanz mit internen Plugins und Katalogen betreiben, und die Mitglieder
authentifizieren sich mit einem Token, das nur für diesen Host gilt.

## Wie es funktioniert

- Trägt ein Release eine Datei `checksums.sha256`, wird das heruntergeladene Asset vor der
  Installation dagegen geprüft; eine Abweichung blockiert die Installation.
- Keine stillen Auto-Updates: Jedes Update ist eine bewusste, sichtbare Handlung.
- Ein Schutz gegen id-Wechsel verhindert, dass ein bösartiges oder falsch konfiguriertes
  Release die Plugin-id, an die eine Installation gebunden ist, unbemerkt austauscht.

Noch keine Screenshots — ein späterer Durchgang ergänzt sie über den `readme-shots`-Ablauf.

## Bekannte Grenzen

- **Private GitHub-Quellen sind experimentell — und die eine Hälfte des Warum ist inzwischen
  gemessen.** Obsidians `requestUrl` **reicht den `Authorization`-Header über eine Umleitung
  auf einen anderen Host weiter** (gemessen am 2026-09-01 auf Obsidian 1.13.7 gegen einen
  lokalen Server, für 302 und 303, 4 von 4 Anfragen; Nodes `fetch` entfernt ihn im selben
  Aufbau). Asset-Downloads aus privaten GitHub-Repos laufen über genau so eine Umleitung — die
  Asset-URL der API antwortet mit 302 und einer vorsignierten S3-URL —, also geht das
  Bearer-Token an S3 weiter, und S3 lehnt Anfragen mit zwei Authentifizierungs-Mechanismen
  üblicherweise ab. **Nicht** gemessen ist diese zweite Hälfte: wie S3 tatsächlich antwortet.
  Dafür braucht es ein echtes privates GitHub-Repo, das der verfügbare Testaccount (gesperrt)
  nicht bereitstellen konnte. Private **Forgejo-/Gitea**-Quellen sind dagegen vollständig
  unterstützt und Ende-zu-Ende belegt (privates Repo + Token, Erkennung → letztes Release →
  Asset-Download) in `tests/integration/live-forge.test.ts`.
- **Prüfsummen belegen nur Übertragungs-Integrität, keine Echtheit.** Eine Datei
  `checksums.sha256` wird von derselben Forge geholt wie die Nutzlast, die sie prüft, und ist
  nicht signiert. Sie fängt Beschädigung und versehentliche Abweichung ab; sie fängt **nicht**
  eine kompromittierte Forge ab, die passende Summen zu einem manipulierten Release ausliefert.
- **Ein Plugin zu installieren führt fremden Code mit vollem Zugriff auf die Obsidian-API
  aus.** Der Bestätigungsdialog beim Installieren/Aktualisieren ist die einzige Schranke — es
  gibt keine Sandbox, kein Berechtigungsmodell und keine Code-Prüfung über das hinaus, was du
  selbst vor dem Bestätigen tust.
- **Der Raw-Ausweichweg kennt nur `main` und `master`.** Eine Auswahl von Branch oder Tag gibt
  es noch nicht; ein Repo, dessen Standard-Branch anders heißt, lässt sich über den Raw-Weg
  nicht installieren (siehe „Quellen hinzufügen" oben).
- **Plugin-ids sind auf `^[a-z0-9][a-z0-9-_]{0,63}$` beschränkt**, was strenger ist als
  Obsidian selbst — keine Großbuchstaben, keine Punkte. Ein Manifest mit einer sonst gültigen,
  aber nicht passenden id wird abgelehnt.
- **Eine vollständig private Forgejo-/Gitea-Instanz kann als Raw-Quelle fehlerkannt werden.**
  Die Forge-Erkennung fragt `/api/v1/version` ohne Token ab; auf einer Instanz, die diesen
  Endpunkt hinter eine Authentifizierung stellt, sieht die Abfrage aus wie „hier gibt es keine
  Gitea-API", und das Plugin weicht auf rohe Dateien aus — die dann ebenfalls ohne Token
  scheitern.
- **Release-Notes rendern fremdes Markdown**, einschließlich der darin eingebetteten Bilder —
  wer die Release-Notes eines Plugins öffnet, lädt Bilder von dessen eigener Quelle.

## Lizenz

- **Code:** AGPL-3.0-or-later ([`LICENSE`](LICENSE)).
- **Keine Laufzeit-Abhängigkeiten.** Übernommene Build-/Test-Helfer aus den eigenen Repos
  `obsidian-kit`/`code-kit` tragen ihre Herkunftsstempel in `src/vendor/`.
