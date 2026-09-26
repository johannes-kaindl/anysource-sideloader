# AnySource Sideloader

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/LICENSE)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/anysource-sideloader)](https://github.com/johannes-kaindl/anysource-sideloader/releases/latest)
![Obsidian](https://img.shields.io/badge/obsidian-1.11.4%2B%20%C2%B7%20desktop%20%26%20mobile-7c3aed)

<p align="center"><img src="https://raw.githubusercontent.com/johannes-kaindl/anysource-sideloader/main/docs/images/hero.png" width="820" alt="The plugin's settings tab: two pending updates with Update and Release notes buttons, and a list of installed plugins with their versions and forge hosts"></p>

Obsidian-Plugins von jeder Git-Forge installieren und aktualisieren — GitHub, Forgejo, Gitea
oder rohe URLs — inklusive abonnierbarer Plugin-Kataloge, ohne auf den Community Store zu
warten.

*Also available in English: [`README.md`](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/README.md).*

## Warum es das gibt

Nicht jedes Plugin, das man nutzen will, steht im Community Store: eigene Plugins, interne Plugins einer Organisation in einem privaten Repository und Plugins auf einer selbst gehosteten Forge wie Forgejo oder Gitea. AnySource Sideloader installiert und aktualisiert sie direkt von ihren Release-Seiten und hält sie so aktuell, wie der Store es für seine eigenen Plugins tut — mit sichtbarer Prüfung, Release-Notes und einer Bestätigung, bevor etwas angewendet wird. Es ergänzt den Store, statt ihn zu ersetzen: Plugins, die man bereits aus dem Store hat, bleiben unangetastet, solange man sie nicht ausdrücklich verfolgen lässt.

Es nimmt außerdem einen einzelnen Ausfallpunkt heraus. Der Store hängt an GitHub, und wird das Konto eines Maintainers geflaggt, können seine Plugins über Nacht unauffindbar werden — ein solcher Flag hat an einem einzigen Tag 21 Plugins verschwinden lassen, keines davon mit einem Code-Problem. Ein Plugin, dessen Release auch auf einer anderen Forge liegt, bleibt installierbar.

Die vollständige Abwägung, samt dem Preis eines einzigen selbst gehosteten Kanals, steht in
[Warum es nur einen Vertriebsweg gibt](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/explanation/why-one-channel.md) (englisch).

## Funktionen

- **Jede Git-Forge als Quelle** — GitHub, Forgejo, Gitea oder eine rohe Datei-URL. Der
  Forge-Typ wird aus der eingefügten Repo-URL erkannt; pro Quelle ist nichts zu konfigurieren.
- **Abonnierbare Kataloge** — ein Katalog ist eine JSON-Datei, die Plugins auflistet. Versionen
  kommen immer live von der Forge des jeweiligen Plugins, nie aus dem Katalog.
- **Alles liegt im Einstellungs-Tab**, wo Obsidian Plugins ohnehin verwaltet — keine zusätzliche
  Seitenleiste, und das Layout ist Obsidians eigenes.
- **Erkennt Plugins, die schon da sind.** Installierte, aber unverwaltete Plugins werden erkannt
  und lassen sich mit einem Klick übernehmen, oder alle auf einmal — ohne Neuinstallation, ohne
  Versionsverlust.
- **Prüfsummen-Verifikation** jedes heruntergeladenen Release-Assets, bevor irgendetwas
  geschrieben wird.
- **Private Repositories** über Zugriffstokens pro Host, abgelegt in Obsidians Schlüsselbund.
- **Nichts passiert ohne Bestätigung** — jede Installation und jedes Update ist eine bewusste,
  sichtbare Handlung, und Updates werden nie automatisch angewendet.

## Voraussetzungen

- Obsidian **1.11.4** oder neuer (die Version, die die Schlüsselbund-API für Zugriffstokens
  eingeführt hat).
- Läuft auf **Desktop und Mobile**; kein Node, keine Laufzeit-Abhängigkeiten, keine externen
  Binaries.
- Eine Netzwerkverbindung zu der Forge, die die Plugins hostet. Sonst wird nirgendwohin etwas
  gesendet.

## Installation

Weil der ganze Zweck dieses Plugins darin besteht, ohne den Community Store auszukommen, ist
seine eigene Erstinstallation manuell. Es ist die einzige — ab dann installiert und
aktualisiert das Plugin alles andere, sich selbst eingeschlossen.

Die Schritte sind auf **macOS, Linux und Windows dieselben**. Du musst deinen Vault nicht auf
der Festplatte suchen und keine versteckten Ordner sichtbar machen.

1. **Community-Plugins erlauben.** Einstellungen → Community-Plugins; bietet die Seite
   **„Exit Restricted mode"** an, zuerst darauf klicken. Ein Plugin, das exakt richtig liegt,
   lädt im eingeschränkten Modus trotzdem nicht — ohne Fehlermeldung, die das sagen würde.
2. **Die drei Dateien herunterladen** vom [neuesten GitHub-Release](https://github.com/johannes-kaindl/anysource-sideloader/releases/latest): [`main.js`](https://github.com/johannes-kaindl/anysource-sideloader/releases/latest/download/main.js), [`manifest.json`](https://github.com/johannes-kaindl/anysource-sideloader/releases/latest/download/manifest.json) und [`styles.css`](https://github.com/johannes-kaindl/anysource-sideloader/releases/latest/download/styles.css). Diese Links zeigen immer auf das neueste Release.
3. **Den Plugin-Ordner aus Obsidian heraus öffnen** — weiterhin unter Community-Plugins auf das Ordner-Symbol neben *Installed plugins* klicken (*Open plugins folder*). Der Dateimanager öffnet sich direkt in `<vault>/.obsidian/plugins/`.
4. **Dort einen Ordner `anysource-sideloader` anlegen** und die drei Dateien direkt hineinlegen.
5. **Auf *Reload plugins* klicken** und **AnySource Sideloader** einschalten. Kein Neustart
   nötig.

Ausführlich, mit Ordner-Aufbau und Fehlersuche:
[Install by hand](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/how-to/manual-install.md) (englisch).

## Bedienung

**Ein Plugin hinzufügen.** Den Befehl **Install plugin from URL** ausführen und eine Repository-URL einfügen — die Startseite des Repos, nicht ein Link auf ein Release oder eine Datei:

```
https://github.com/user/repo
https://git.jkaindl.de/jkaindl/some-plugin
```

Der Forge-Typ wird automatisch erkannt. → [Add sources and
catalogs](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/how-to/add-sources-and-catalogs.md)

<a href="https://raw.githubusercontent.com/johannes-kaindl/anysource-sideloader/main/docs/images/install-url.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/anysource-sideloader/main/docs/images/thumbs/install-url.png" width="380" alt="Das Fenster Install plugin from URL mit eingetragener Repository-Adresse"></a><br><sub>Vorschau anklicken für die volle Größe</sub>


**Einen Katalog abonnieren.** Ein Katalog ist eine JSON-Datei, die mehrere Plugins auflistet und
sich per URL abonnieren lässt (Einstellungen des Plugins, Abschnitt **Catalogs**). Einer ist ab Werk abonniert, damit die Liste beim ersten Start
nicht leer ist; die vom Autor dieses Repos gepflegten Plugins erscheinen als:

```
https://git.jkaindl.de/jkaindl/obsidian-catalog/raw/branch/main/catalog.json
```

Er liegt in einem eigenen Repository statt in diesem: Ein Katalog listet, *was es gibt*, und das
hängt nicht am Release-Takt dieses Clients. → [Catalog
format](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/reference/catalog-format.md)

<img src="https://raw.githubusercontent.com/johannes-kaindl/anysource-sideloader/main/docs/images/catalog.png" width="820" alt="Die Sektion Browse catalogs: Einträge als installiert mit verfügbarem Update, installiert und aktuell, installiert aber nicht verfolgt und nicht installiert">


**Schon Plugins installiert?** Sie werden erkannt, nicht ignoriert. Ein Katalog-Eintrag, dessen
Plugin bereits vorhanden ist, bietet **Track for updates** statt Install an, und **Track all N
installed** erledigt den ganzen Satz. Das ist wichtig, weil Update-Prüfungen nur *verwaltete*
Plugins abdecken. → [Adopt existing plugins](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/how-to/adopt-existing-plugins.md)

**Prüfen und aktualisieren.** **Check now**, das Kommando `check-updates` oder einmal beim
Start. Jede Zeile trägt ihren eigenen Knopf — **Check**, solange nichts ansteht, **Update to
`<version>`**, sobald ein neueres Release bekannt ist. Vor dem Anwenden werden die Release-Notes
gezeigt, und ohne Bestätigung passiert nichts. Der Sideloader aktualisiert sich selbst auf
demselben Weg. → [Keep plugins up to date](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/how-to/update-plugins.md)

**Private Repositories.** Tokens liegen pro Forge-Host in Obsidians Schlüsselbund — nie in
`data.json`, nie im Klartext. → [Private repositories](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/how-to/private-repositories.md)

## Konfiguration

Konfigurierbar ist zweierlei, beides im Einstellungs-Tab des Plugins:

- **Zugriffstokens**, pro Forge-Host. Private Repos und private Kataloge brauchen einen. Tokens
  landen über den eingebauten `SecretComponent` in Obsidians eigenem Schlüsselbund — nie in
  `data.json`, nie im Klartext. Ein Token geht an jede Quelle auf dem Host, zu dem er gehört,
  und an keinen anderen Host. Genau das trägt den Organisations-Fall: eine private
  Forgejo-/Gitea-Instanz mit internen Plugins und einem Katalog, und Mitglieder authentifizieren
  sich mit einem Token, der auf diesen Host begrenzt ist.
- **Beim Start nach Updates suchen** (standardmäßig an). Führt kurz nach dem Start eine Prüfung
  aus. Sie liest nur; angewendet wird ohne Bestätigung nie etwas.

Vollständige Liste der Einstellungen, Kommandos und dessen, was in `data.json` steht: [Settings
and commands](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/reference/settings-and-commands.md).

## Wie es funktioniert

- Trägt ein Release eine Datei `checksums.sha256`, wird jedes heruntergeladene Asset vor der
  Installation dagegen geprüft; eine Abweichung blockiert die Installation.
- Keine stillen Auto-Updates: Jedes Update ist eine bewusste, sichtbare Handlung, der die
  Release-Notes der neuen Version vorausgehen.
- Ein ID-Wechsel-Schutz verhindert, dass ein bösartiges oder falsch konfiguriertes Release
  stillschweigend die Plugin-ID austauscht, an die eine Installation gebunden ist.

Was Prüfsummen belegen und was nicht, steht im [security
model](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/explanation/security-model.md) — lesenswert, bevor man etwas installiert, das man
nicht selbst geschrieben hat.

## Dokumentation

- **[Dokumentations-Index](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/README.md)** — Tutorial, How-to-Anleitungen, Referenz und Hintergrund (englisch, damit es nur eine Fassung gibt, die altern kann).
- **[Getting started](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/tutorial.md)** — von null zum ersten per Sideload installierten Plugin.
- **[Troubleshooting](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/how-to/troubleshooting.md)** — eine Meldung oder ein Symptom, die Ursache und was zu tun ist.

## Bekannte Grenzen

Ein Plugin zu installieren führt fremden Code mit vollem Zugriff auf die Obsidian-API aus, und
der Bestätigungsdialog ist die einzige Schranke; Prüfsummen belegen Übertragungsintegrität, nicht
Authentizität. Private GitHub-Quellen sind aus einem gemessenen Grund experimentell, und der
Raw-Fallback kennt nur die Branch-Namen `main` und `master`.

Die vollständige Liste — mit dem, was gemessen ist, und dem, was nicht — steht in [Known
limitations](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/explanation/limitations.md) und im [security
model](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/docs/explanation/security-model.md).

## Lizenz

- **Code:** AGPL-3.0-or-later ([`LICENSE`](https://github.com/johannes-kaindl/anysource-sideloader/blob/main/LICENSE)).
- **Keine Laufzeit-Abhängigkeiten.** Vendorierte Build-/Test-Helfer aus dem eigenen
  `obsidian-kit`/`code-kit` tragen ihre Herkunftsangaben in `src/vendor/`.
