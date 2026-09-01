# GUI-Smoke — anysource-sideloader

Die Prüfliste, die `scripts/gui-smoke.ts` gegen ein **laufendes** Obsidian fährt
(CORE-TEST-02 b). Was gegen einen Mock geprüft ist, ist spezifiziert, nicht getestet —
dieses Dokument sagt, was hier tatsächlich am echten Wirt gemessen wird und was nicht.

## Wie er läuft

```bash
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label anysource-sideloader \
  --intent "GUI-Smoke" --exclusive focus

npm run build
npm run smoke:gui -- --setup                      # Staging-Vault aus fixtures/vault/
open "obsidian://open?vault=anysource-sideloader"  # Vault als Fenster derselben Instanz
npm run smoke:gui -- --vault anysource-sideloader

python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```

`STAGING_VAULTS_DIR` muss gesetzt sein (Dach-`AGENTS.md` § Staging-Vaults). Der Smoke
bricht ab, wenn er in einem anderen Vault landet als seinem Staging-Vault: gegen einen
Arbeitsvault gemessen wäre das Ergebnis unbelegt (dort liegt der Store-Build statt des
Repo-Stands).

Weitere Schalter: `--port` (Default 9222), `--section <key>`, `--keep` (Testartefakte
stehen lassen).

⚠️ **Vor dem Lauf prüfen, wer sonst an Obsidian hängt** — Obsidian ist Single-Instance,
ein Quit trifft fremde Sessions. Der Lock beantwortet diese Frage *nicht* (er ist frei,
solange niemand misst, auch bei offenen fremden Vaults):

```bash
curl -s http://127.0.0.1:9222/json/list | python3 -c "import json,sys; [print(' ·', t.get('title')) for t in json.load(sys.stdin) if t.get('type')=='page']"
```

## Die Gegenstelle ist lokal — und warum

`scripts/forge-server.ts` startet drei HTTP-Server auf 127.0.0.1: eine Gitea-artige Forge,
einen Host **ohne** API (dort greift der Raw-Pfad) und einen fremden Host als Ziel eines
Redirects. Damit braucht der Lauf weder Netz noch Token — und er kann zwei Dinge
herstellen, die an einer echten Forge nicht herstellbar sind:

- einen **303** auf dem Raw-Pfad,
- einen Redirect über eine **Host-Grenze** (zwei Ports auf 127.0.0.1 sind für
  `new URL(...).host` zwei Hosts).

Beides sind die Pflicht-Messpunkte aus dem Final-Review vom 2026-09-01. Abschnitt `L`
fährt zusätzlich gegen die echte Forge und ist der einzige netzabhängige Teil; ohne Netz
meldet er `übersprungen`, nicht rot.

Der installierte Prüfling heißt `asl-smoke-target` — eine id, die kein echtes Plugin
trägt. Was der Smoke installiert, landet als echter Ordner unter `.obsidian/plugins/`,
und ein Namenszusammenstoß wäre ein Löschvorgang am falschen Ort.

## Prüfpunkte

### A — Store-View und Hub-Tab-Leiste

| | Was gemessen wird |
|---|---|
| A1 | Der registrierte Befehl „Open store“ öffnet die View (nicht die Methode dahinter) |
| A2 | Drei Tabs mit den Labels Browse/Installed/Updates, Browse initial aktiv |
| A3 | Ein **echter Mausklick** auf „Installed“ blendet genau ein Panel ein |
| A4 | Roving tabindex: genau ein Tab fokussierbar, `aria-selected` passend |
| A5 | Pfeil rechts wechselt den Tab (ARIA-Vertrag der Kit-Leiste) |

A4/A5 messen den Kit-Vertrag aus `hub.ts` (Falle 6 dort): inaktive Tabs sind bewusst nicht
per Tab-Taste erreichbar. Bricht das, fällt es sonst nirgends auf.

### B — Empty-States (UI-STANDARD §8, verbindlicher Baustein)

| | Was gemessen wird |
|---|---|
| B1 | Browse ohne Katalog nennt den Ausweg („Add one in the plugin settings“) |
| B2 | Installed ohne Plugins zeigt seinen Text |
| B3 | Updates ohne Rückstand zeigt seinen Text |
| B4 | Der Empty-State nutzt `.asl-empty` **und hat Fläche** |

Gemessen wird `getClientRects()`, nicht `querySelector`: der Hub versteckt Panels per
`is-hidden` und lässt sie im DOM — ein Existenz-Test wäre für alle drei gleichzeitig wahr.

### C — Katalog, Install, Update, Remove

| | Was gemessen wird |
|---|---|
| C1 | Katalog geladen: zwei Karten mit Name, Autor, Tags |
| C2 | Suchfeld filtert die Kartenliste (2 → 1) |
| C3 | HTTP-Quelle warnt vor unverschlüsseltem Transport (protokollbasiert, Final-Review-Fix) |
| C4 | Install-Confirm nennt Quelle, id und Version |
| C5 | **„Cancel“ bricht wirklich ab** — nichts auf Platte, nichts in den Einstellungen |
| C6 | Install schreibt `manifest.json` und meldet es per Notice |
| C7 | Alle drei Code-Dateien liegen im Plugin-Ordner |
| C8 | Enable-Confirm erscheint, „Later“ aktiviert nichts |
| C9 | Installed-Zeile zeigt Name/Version/Host und Status `is-ok` „Up to date“ |
| C10 | „Check“ findet die neue Version, Status wird `is-warning` |
| C11 | Updates-Tab zeigt „alt → neu“ |
| C12 | Update-Confirm nennt beide Versionen und schreibt die neue |
| C13 | Remove ist destruktiv markiert, Code verschwindet, **`data.json` bleibt** |

C13 prüft den Vertrag aus `installer.ts` (`removePlugin`) auf der Platte — genau die Sorte
Zusage, die ein Unit-Test bestätigt und ein Dateisystem widerlegen kann.

### D — Install per URL und Sicherheitskanten

| | Was gemessen wird |
|---|---|
| D1 | Der Befehl „Install plugin from URL“ öffnet ein Modal mit Eingabefeld |
| D2 | Unbrauchbare Adresse meldet „no supported source“, statt stumm zu schlucken |
| D3 | Fremder Plugin-Ordner: destruktives Overwrite-Confirm, das die id nennt |
| D4 | Abbruch am Overwrite-Confirm lässt das fremde Plugin unangetastet |
| D5 | Falsche Prüfsumme bricht ab, **bevor** irgendetwas geschrieben wird |
| D6 | Release ohne `checksums.sha256` sagt das im Confirm (statt es zu verschweigen) |

D1 und D3 sind die beiden Criticals aus dem Final-Review vom 2026-09-01 — das Kommando,
das dreifach dokumentiert war und nicht existierte, und der Erst-Install, der ein fremdes
Plugin still überschreiben konnte.

### E — Settings-Tab

| | Was gemessen wird |
|---|---|
| E1 | Alle drei Einstellungen sind gezeichnet |
| E2 | „Catalogs“ ist **bedienbar** (Eingabefeld + „Add catalog URL“) |
| E3 | „Access tokens“ ist **bedienbar** (Host-Feld + „Add host“) |
| E4 | „Add catalog URL“ trägt den Katalog ein (über die echte Bedienung, nicht per `push()`) |
| E5 | Token-Host wird auf `host[:port]` normalisiert; die Zeile zeigt **kein Klartext-Token** |
| E6 | Der Toggle landet in `data.json`, nicht nur im Speicher |

E2/E3 messen die **Bedienung**, nicht den Namen: ein Item mit Beschriftung und ohne Knopf
sieht auf einem Screenshot vollständig aus und ist es nicht. E4/E5 werden übersprungen,
wenn E2/E3 rot sind — ein Ablauf ohne Gegenstand wäre kein Prüfergebnis.

⚠️ **Ab Obsidian 1.13 sind die Einstellungen ein eigenes Fenster.** `app.setting.activeTab.id`
ist dann korrekt, aber ihr DOM liegt nicht im Workspace-Renderer, und
`document.querySelector(".modal.mod-settings")` bleibt `null` — wer daraus auf einen
Plugin-Defekt schließt, sucht am falschen Ende. Der Treiber hält beide Lagen offen
(`settingsStelle`) und verbindet sich im Fenster-Fall über `attachTo("settings", port)`.
Unterschieden wird an der Sache, nie am Fenstertitel: der ist lokalisiert.

Der Schlüsselbund wird **nicht** beschrieben: `app.secretStorage.setSecret` schriebe in den
Schlüsselbund des Rechners, und ein Messwerkzeug, das dort etwas hinterlässt, ändert seinen
Wirt. Gemessen wird die UI-Seite (kein Klartext, richtiger Zustand) und in F2 der
injizierte Port.

### F — Transport (die zwei Pflicht-Messpunkte)

| | Was gemessen wird |
|---|---|
| F1 | Folgt `requestUrl` dem **303** der Gitea/Forgejo-Raw-Form? Gemessen über einen echten Install, nicht über einen nackten Aufruf |
| F2 | Reicht `requestUrl` `Authorization` über einen **Cross-Host-Redirect** weiter — für **303 und 302 getrennt**? |

F2 ist eine **Messung, kein Soll/Ist**: beide Ausgänge sind zulässige Antworten, sie stehen
nur für verschiedene Sätze in den README Known limitations. Der Prüfpunkt ist rot, wenn der
fremde Host gar nicht erreicht wurde — dann ist die Frage unbeantwortet geblieben; das
Ergebnis selbst steht als `◆ gemessen` im Protokoll.

Beide Redirect-Codes werden **einzeln** gemessen, und das ist kein Übereifer: 303 schreibt
die Methode auf GET um, 302 nicht — aus dem einen folgt für den anderen nichts. Forgejo
schickt auf dem Raw-Pfad 303, GitHub auf Release-Assets 302, und die offene Frage aus
`forge/github.ts::assetRequest` hängt am **302**. Aus einer 303-Messung darauf zu schließen
hieße, den Nachbarzweig zu belegen statt den Fall.

**Gemessen 2026-09-01 (Obsidian 1.13.7): beide Codes reichen den Header weiter** — 4/4
Zugriffe auf den fremden Host trugen `Authorization`. Referenzwert zum Vergleich:
node-`fetch` reicht ihn gegen dieselbe Gegenstelle **nicht** weiter (0 von 4). Das
Weiterreichen ist also eine Eigenschaft von `requestUrl`, nicht des Testaufbaus.

### L — echte Forge (netzabhängig, darf fehlen)

| | Was gemessen wird |
|---|---|
| L1 | Die Gitea-API der echten Forge antwortet in der angenommenen Form |
| L2 | Die Raw-Form der echten Forgejo-Instanz liefert über `requestUrl` den Katalog |

Die Gegenprobe zur lokalen Forge: dass deren Annahmen nicht nur für den eigenen Server
gelten. Ohne Netz `übersprungen`.

## Was der Smoke bewusst NICHT misst

- **Aussehen.** „Sieht gut aus“, „fühlt sich flüssig an“ bleibt die Hand-Runde.
- **Wo ein Knopf sitzt.** Der Treiber greift Elemente über plugin-eigene Anker; ob die
  Anordnung bedienbar ist, sagt er nicht (Dach-`AGENTS.md`: die Bedienung ist eine dritte
  Hälfte, die auch `ui_adoption_check.py` nicht sieht).
- **Echte private GitHub-Quellen.** Dafür fehlt weiter ein unflagged Konto (eigene
  Cockpit-Task). F2 beantwortet nur die Transport-Hälfte der Frage.
- **Den Schlüsselbund.** Siehe E.

## Durchläufe

| Datum | Obsidian | Ergebnis | Gegenprobe |
|---|---|---|---|
| 2026-09-01 | 1.13.7 | **34/36** — rot: E2, E3 (Befund unten) · F2 für 303 **und** 302 gemessen | bestanden: Overwrite-Guard (`src/obsidian/flows.ts:121`) ausgebaut → **genau D3** rot, sonst keiner mitgefallen |

Die Gegenprobe traf eine vorher aufgeschriebene Vorhersage: D3 rot, D4 **grün**, weil D4 nur
den Abbruch misst und „Cancel“ auch am Install-Confirm abbricht. Der rote Punkt nannte, was
stattdessen dastand — „Install ASL Smoke Target?“ mit `mod-cta` statt Overwrite-Confirm mit
`mod-destructive`.

### Was der erste Lauf gefunden hat

**Befund (offen): die Listen-Einstellungen sind in Obsidian 1.13 nicht bedienbar.**
„Catalogs“ und „Access tokens“ erscheinen im Einstellungen-Fenster als Items mit Namen und
Beschreibung, aber **ohne jedes Bedienelement** — keine Zeilen, keine Knöpfe. Beide werden
über eine `render`-Hatch gezeichnet (`SettingDefinitionRender`, seit 1.13.0); der Toggle
daneben, der über den deklarativen Pfad läuft, funktioniert einwandfrei (E6 grün). Praktisch
heißt das: **in Obsidian 1.13 lassen sich weder Kataloge noch Token-Hosts verwalten**, außer
über den `display()`-Fallback älterer Versionen.

Was gemessen ist: `getSettingDefinitions()` liefert für beide korrekt eine `render`-Funktion;
im DOM entsteht daraus nichts; keine Exception, keine Konsolenmeldung. Was **nicht** geklärt
ist: ob Obsidian `render` gar nicht ruft, oder ob unser Callback seine Zeilen an
`setting.settingEl.parentElement` hängt und dieser Elternteil im nativen Pfad ein anderer
ist. Der naheliegende Instrumentierungs-Weg trägt nicht — Obsidian ruft
`getSettingDefinitions()` **einmal bei der Registrierung** und cacht das Ergebnis, ein
nachträglich gesetzter Wrapper greift also nie (`defsRufe: 0`, auch nach Plugin-Neuladen).

### Zwei Werkzeugfehler, die der erste Lauf ans Licht brachte

Beide sind Belege für die json_viewer-Regel: *sind mehr Prüfpunkte rot als der Prüfling
Defekte hat, misst wahrscheinlich das Werkzeug etwas anderes, als es behauptet.*

- **`mod-warning` vs. `mod-destructive`.** Der Prüfpunkt suchte die Klasse, die
  `setWarning()` setzt. Obsidian 1.13.7 nimmt `setDestructive()` und schreibt
  `mod-destructive`. C13 und D3 waren rot, der Prüfling war in Ordnung. Der Punkt kennt
  jetzt die **Menge** der zulässigen Ergebnisse (`DESTRUKTIV_KLASSEN`) und protokolliert
  alle Button-Klassen mit — eine rote Zeile, die nur „destruktiv: false“ sagt, verschweigt
  genau das, was man braucht.
- **ASI in einem mehrzeiligen Element-Ausdruck.** `return` + Zeilenumbruch ist `return;`;
  der Ausdruck dahinter wurde toter Code, `clickReal` bekam `undefined` und meldete „nicht
  getroffen“, obwohl das Element sichtbar 44×20 px groß dastand. Klammern um den Ausdruck
  beheben es. Gefunden nur, weil der Prüfpunkt seine drei Stufen getrennt meldet (Klick
  getroffen / Speicher / Platte) statt nur „rot“.
