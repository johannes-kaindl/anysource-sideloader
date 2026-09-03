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

## Läuft der Lauf gegen den eigenen Stand? (Herkunfts-Guard)

Vor dem ersten Prüfpunkt steht seit dem 2026-09-02 `requireEigenerBuild`
(`tools/obsidian-cdp/vault.ts`, dritter Einbau im Workspace). Er beantwortet die Frage, gegen
die `manifest.version` **strukturell blind** ist: Arbeitsstand und zuletzt deployter Build
tragen dieselbe Nummer.

**Der Anlass ist in diesem Repo gemessen worden, nicht importiert.** `npm run smoke:gui`
deployt **nicht** — nur `--setup` tut das. Beim Bau von E9 trug der Vault noch das alte
`main.js`; der Prüfpunkt blieb rot, obwohl der Fix im Quelltext stand, und die Zeit ging für
die Suche nach einem Fehler drauf, den es nicht gab.

Der geprüfte Pfad kommt aus der **laufenden Instanz** (`app.vault.adapter.basePath` +
`app.vault.configDir`), nicht aus `stagingVaultDir(REPO_NAME)`: der Treiber dockt per
`--vault` an ein beliebiges Fenster an. Der Guard sitzt **vor** dem Plugin-Neuladen, damit ein
Abbruch den Vault unberührt lässt.

### Gegenprobe (2026-09-02, alle fünf Ausgänge gemessen)

Ein Guard ohne Gegenprobe ist eine Behauptung — und diese Sorte Prüfung versagt genau in dem
Fall, für den sie gebaut wurde.

| Ausgang | hergestellt durch | gemessen |
|---|---|---|
| `deployt` | Normalzustand | läuft, 2/2 grün |
| `fremd` | Byte an die Vault-`main.js` gehängt | **Abbruch**, exit 1 — „im Vault: 39.490 Bytes / gebaut: 39.455 Bytes" |
| `fehlt` | Vault-`main.js` beiseite | **Abbruch**, exit 1 |
| `store-installiert` | `nosourcemap`-Suffix **und** Repo-`main.js` beiseite | **Abbruch**, exit 1 |
| `ungeklaert` | nur Repo-`main.js` beiseite | **Warnung, exit 0** — der Lauf lief weiter (2/2) |

⚠️ Die letzten beiden sind nur erreichbar, wenn die **Repo**-`main.js` fehlt: solange sie da
ist, entscheidet der sha1-Vergleich und liefert ausschließlich `deployt`/`fremd`. Wer das
nicht weiß, prüft zwei Ausgänge und hält es für vier.

Die Warnung aus `ungeklaert` steht bewusst **hinter** der Bilanz, nicht oben im Protokoll —
oben scrollt sie aus dem Blick, genau wie die Meldung, die diesen Guard nötig machte.

## Prüfpunkte

### A — Der Store lebt im Einstellungs-Tab

| | Was gemessen wird |
|---|---|
| A1 | Alle fünf Sektionen sind gezeichnet (Updates · Installed · Browse · Catalogs · Access tokens) |
| A2 | **Keine selbstgebauten Überschriften** — §5 verlangt `setHeading()` statt `<h3>` |
| A3–A5 | Die Empty-States sind **sichtbar** und nennen den Ausweg |

A2 ist der Wächter für den Befund, der den Umbau ausgelöst hat: die alte Sidebar-Ansicht
baute Karten mit `<h3>` **ohne Größenregel**, was in Obsidian zu viel zu großer Schrift
führte. Im Einstellungs-Tab liefert die `Setting`-API die Typografie — ein eigenes Heading
wäre der Rückweg. Gegenprobe gemessen: ein eingebautes `<h3>` macht **genau A2** rot.

A3–A5 messen **Sichtbarkeit**, nicht Existenz: ein Item mit leerem `name` und nur `desc`
zeichnet Obsidian nicht (gemessen 2026-09-02) — die Sektion sah leer aus, während die
Definition korrekt dastand.

### C — Katalog, Install, Update, Remove

| | Was gemessen wird |
|---|---|
| C1 | Katalog geladen: beide Einträge stehen als Zeilen im Tab |
| C2 | Ein nicht installierter Eintrag bietet **Install** |
| C3 | HTTP-Quelle warnt vor unverschlüsseltem Transport (protokollbasiert, Final-Review-Fix) |
| C4 | Install-Confirm nennt Quelle, id und Version |
| C5 | **„Cancel“ bricht wirklich ab** — nichts auf Platte, nichts in den Einstellungen |
| C6 | Install schreibt die Dateien und meldet es per Notice |
| C7 | Enable-Confirm erscheint, „Later“ aktiviert nichts |
| C8 | Installed-Zeile zeigt Version, Host und Status `is-ok` |
| C9 | „Check“ findet die neue Version — die Zeile bietet den **Update-CTA** statt eines Warn-Indikators |
| C13 | Der Zeilen-CTA öffnet denselben Confirm, **„Cancel“ schreibt nichts** |
| C10 | Updates-Sektion führt das Plugin mit „alt → neu“ |
| C11 | Update-Confirm nennt beide Versionen und schreibt die neue |
| C12 | Remove ist destruktiv markiert, Code verschwindet, **`data.json` bleibt** |

C12 prüft den Vertrag aus `installer.ts` (`removePlugin`) auf der Platte — genau die Sorte
Zusage, die ein Unit-Test bestätigt und ein Dateisystem widerlegen kann.

⚠️ **Diese Tabelle war bis 2026-09-03 abgedriftet** — sie beschrieb noch die Karten-UI von
vor dem Settings-Umbau (0.3.0), führte **zweimal C8** und verschob dadurch alle Nummern ab
C9 gegen den Treiber. Aufgefallen ist es erst, als ein neuer Prüfpunkt eingetragen werden
sollte. Die Tabelle steht jetzt in Laufreihenfolge; C13 läuft bewusst zwischen C9 und C10,
weil er denselben Zustand braucht wie C9 und vor dem Install von C11 abbrechen muss.

**C9 und C13 sind die Doppelspitze der Zeilen-Umstellung (2026-09-03).** Der Knopf einer
Installed-Zeile kippt bei einem Rückstand von `Check` auf `Update to <version>`, und der
Status-Indikator entfällt dabei — die Zeile sagt es einmal statt zweimal. C9 misst die
Form (CTA da, `Check` weg, kein Indikator, beide Versionen in der Beschreibung), C13 den
Weg (der CTA öffnet denselben Confirm wie die Updates-Sektion und schreibt bei „Cancel"
nichts). ⚠️ C9 hat vorher `status === "is-warning"` gemessen und ist mit der Änderung
**umgeschrieben** worden, nicht repariert — er war nicht kaputt, die Aussage hat sich
geändert.

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
| E7 | Der Klick auf „Check now" **friert die App nicht ein** |
| E8 | Der Klick zeigt einen **bewegten** `is-checking`-Indikator und räumt ihn wieder ab |
| E9 | Ein Neuzeichnen während der Eingabe verwirft weder **Wert** noch **Fokus** noch **Cursorposition** |

E2/E3 messen die **Bedienung**, nicht den Namen: ein Item mit Beschriftung und ohne Knopf
sieht auf einem Screenshot vollständig aus und ist es nicht. E4/E5 werden übersprungen,
wenn E2/E3 rot sind — ein Ablauf ohne Gegenstand wäre kein Prüfergebnis.

⚠️ **Ab Obsidian 1.13 sind die Einstellungen ein eigenes Fenster.** `app.setting.activeTab.id`
ist dann korrekt, aber ihr DOM liegt nicht im Workspace-Renderer, und
`document.querySelector(".modal.mod-settings")` bleibt `null` — wer daraus auf einen
Plugin-Defekt schließt, sucht am falschen Ende. Der Treiber hält beide Lagen offen
(`settingsStelle`) und verbindet sich im Fenster-Fall über `attachTo("settings", port)`.
Unterschieden wird an der Sache, nie am Fenstertitel: der ist lokalisiert.

**E9 misst einen Produktfehler, den E5 zwei Tage lang als Werkzeugfehler auslegte.** Der
Tab zeichnet sich während des Tippens neu (Katalog fertig geladen, Platten-Bestand geändert,
nach jedem Flow); danach war das Eingabefeld ein anderes DOM-Element. E5 war dagegen
abgesichert — es setzte den Wert, bis er stehen blieb — und wäre deshalb **nicht** rot
geworden, wenn der Fehler zurückkommt. Genau dafür gibt es E9.

Drei Größen, getrennt gemessen, weil sie an drei Enden schicken. Der Lauf vor dem Fix
(2026-09-02) zeigt, warum das nötig war — die Annahme, es sei „alles drei kaputt", war
falsch:

| | vor dem Fix | nach dem Fix |
|---|---|---|
| Wert | ✅ bleibt (seit der Wert im Tab liegt, nicht in einer Closure) | ✅ |
| Fokus | ✅ Obsidians natives `update()` setzt ihn selbst aufs neue Element | ✅ |
| Cursor | ❌ **34 statt 8** — sprang ans Ende | ✅ 8 |

Der Cursor war also der ganze Rest. Wer eine URL in der **Mitte** korrigiert, tippt danach
am Ende weiter. Deshalb steht der Cursor im Prüfpunkt bei 8 und nicht am Ende: eine Prüfung
auf „Cursor ist irgendwo im Feld" hätte das Ende mitgezählt und wäre grün geblieben.

⚠️ **E9 misst in ZWEI Renderern, und das ist kein Umweg.** Das Einstellungs-Fenster hat
kein `app` (erster Lauf: „app is not defined"). Das Neuzeichnen wird deshalb über die
Workspace-Verbindung ausgelöst (`app.setting.activeTab.aktualisieren()`), gemessen wird im
Fenster, in dem das Feld steht.

**Was der Fix am Treiber selbst gelehrt hat — eine Wartephase, die niemand geschrieben
hatte.** Nach dem Fix war E5 in drei von drei Läufen rot, und die Spur schloss das Produkt
aus: `pendingHost` stand korrekt im Tab, `hostSecrets` blieb leer — der Klick erreichte den
Knopf nie. Ursache war E5s eigene Schleife: sie setzte den Wert neu, *solange ein
Neuzeichnen ihn verwarf*, und war damit unbeabsichtigt auch die Wartephase auf ein ruhiges
Fenster. Seit der Wert das Neuzeichnen überlebt, bricht sie sofort ab (`versuche: 0`) — und
`clickReal` traf einen Knopf, den der laufende Aufbau unter der Maus austauschte. E5 wartet
jetzt ausdrücklich, bis dasselbe Knopf-Element 300 ms übersteht.

Die allgemeine Form davon ist teuer, wenn man sie übersieht: **ein Prüfpunkt, der ein
Symptom umgeht, wartet dabei oft auf etwas — und wenn das Symptom verschwindet, verschwindet
die Wartephase mit.** Der Fix sieht dann aus, als hätte er etwas kaputt gemacht.

E7 ist der Prüfpunkt, den es ohne einen echten Ausfall nicht gäbe: E1–E6 messen alle, dass
die Bedienelemente **da** sind — keiner drückte je einen. Am 2026-09-01 fror ein Klick auf
„Check now" die gesamte App ein (beide Renderer, ohne Exception, ohne Konsolenmeldung), und
der Smoke lief grün durch. ⚠️ Gemessen wird **9 Sekunden nach** dem Klick und auf der
Node-Seite: der Freeze trat erst ein, als der Netzabruf zurückkam, und die erste Fassung des
Punkts maß sofort — sie blieb im Defektzustand grün. Gefunden hat das die Gegenprobe, nicht
der Lauf.

**E8 misst den Lade-Zustand — und misst ihn als Verlauf, nicht als Blick.** Gegen die
lokale Gegenstelle ist eine Prüfung in Millisekunden durch; ein einzelner Blick „während des
Laufs" trifft entweder den Zustand davor oder den danach und meldet in beiden Fällen etwas,
das er nicht gesehen hat. Deshalb läuft ein 5-ms-Sampler über den ganzen Vorgang, und der
Punkt trennt vier Fragen, die an vier verschiedene Enden schicken: **war** der Indikator da,
trug er die **Form** (`loader`), **bewegte** er sich (`animation-name`), und ist er danach
wieder **weg**. Die letzte Frage ist kein Detail — ein Spinner, der stehen bleibt, behauptet
dauerhaft einen laufenden Abruf und ist schlechter als gar keine Anzeige.

⚠️ Damit der Punkt etwas misst, trägt er zwölf Plugins ein, bevor er klickt: ohne getrackte
Plugins kehrt der Flow ohne einen einzigen Netzabruf zurück („nothing tracked"), und der
Indikator existierte für den Bruchteil eines Frames. Mit dreien waren es gemessen 2 Frames —
genug, aber von der Tagesform der Maschine abhängig; mit zwölfen sind es 3–5.

⚠️ **`setIcon` setzt im echten Obsidian kein `data-icon`** — das tut nur der Test-Mock. Die
erste Fassung von E8 las genau dieses Attribut und meldete `loader: 0`, während das richtige
Symbol dastand. Gemessen wird die Lucide-Klasse des `<svg>`.

Der Schlüsselbund wird **nicht** beschrieben: `app.secretStorage.setSecret` schriebe in den
Schlüsselbund des Rechners, und ein Messwerkzeug, das dort etwas hinterlässt, ändert seinen
Wirt. Gemessen wird die UI-Seite (kein Klartext, richtiger Zustand) und in F2 der
injizierte Port.

### G — Adoption: installierte Plugins sichtbar machen und übernehmen

| | Was gemessen wird |
|---|---|
| G1 | Ein installiertes, **nicht verwaltetes** Plugin wird als solches erkannt (nicht als „Install") |
| G2 | „Alle verwalten" erscheint und nennt die Anzahl |
| G3 | „Verwalten" trägt es mit der Version **von der Platte** ein |
| G4 | Der Prüf-Knopf im Updates-Tab findet danach den Rückstand |
| G5 | Die Katalog-Karte zeigt „installiert + verfügbar" statt „Install" |

Der Abschnitt bildet den Fall nach, der das Plugin bis 0.1.1 blind machte: im Vault liegt
ein Plugin, das der Katalog kennt, aber `settings.plugins` ist leer. Gemessen an zwei
produktiven Vaults: ~20 installiert, **0** verwaltet — der Update-Lauf lief über eine leere
Liste und meldete nie einen Rückstand, weil er keinen kannte.

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
| 2026-09-01 | 1.13.7 | **34/36** — rot: E2, E3 (Befund unten) · F2 für 303 **und** 302 gemessen |
| 2026-09-03 (Zeilen-CTA) | 1.13.7 | **42/42** — C13 neu, C9 umgeschrieben | Zwei Mutationen am Prüfling, jede von genau EINEM Unit-Test gefangen: `setCta()` entfernt → „CTA nennt die Zielversion" rot · Indikator zusätzlich gezeichnet → „sagt es genau einmal" rot. Dabei fiel auf, dass die C-Tabelle dieser Datei seit 0.3.0 abgedriftet war |
| 2026-09-02 (Eingabe/Neuzeichnen) | 1.13.7 | **41/41** — E9 neu | A/B am selben Treiber: ohne die Cursor-Rettung **genau E9** rot (`Cursor: 34`, erwartet 8), Wert und Fokus dabei grün — die Gegenprobe hat die Aufgabe zugleich korrigiert, die von drei kaputten Größen ausging. E5 nach dem Fix 3/3 rot → als Treiber-Wettrennen belegt (`pendingHost` korrekt, Klick verfehlt) und behoben, danach 3/3 grün |
| 2026-09-02 (is-checking) | 1.13.7 | **40/40** — E8 neu; E5 war im `--section settings`-Lauf rot und im vollen grün, jetzt eigenständig | Zwei Gegenproben, sauber getrennt: Icon verfälscht → E8 rot über `loader: 0` (animiert blieb 4) · CSS-Animation entfernt → E8 rot über `animiert: 0` (loader blieb 5); sonst kein Punkt mitgefallen |
| 2026-09-02 (0.3.0) | 1.13.7 | **39/39** — Hub aufgelöst, A/C/G messen jetzt im Einstellungs-Tab | Gegenprobe: ein eigenes `<h3>` eingebaut → **genau A2** rot, sonst keiner |
| 2026-09-01 (0.2.1) | 1.13.7 | **44/44** — E7 neu | Gegenprobe: alter Knopf-Code zurück → **E7 rot**, sonst keiner; die erste Fassung von E7 blieb dabei grün und musste korrigiert werden |
| 2026-09-01 (0.2.0) | 1.13.7 | **43/43** — Abschnitt G neu | Gegenprobe: Platte-Blick ausgebaut → **G1–G5 rot (0/5)**, Abschnitt C unverändert 13/13; Vorhersage traf exakt |
| 2026-09-01 (nach dem Settings-Fix) | 1.13.7 | **38/38** — E2/E3 grün, E4/E5 laufen jetzt statt übersprungen zu werden | Fix belegt: derselbe Treiber war vorher rot, und die A/B-Messung zeigt die Ursache | bestanden: Overwrite-Guard (`src/obsidian/flows.ts:121`) ausgebaut → **genau D3** rot, sonst keiner mitgefallen |

Die Gegenprobe traf eine vorher aufgeschriebene Vorhersage: D3 rot, D4 **grün**, weil D4 nur
den Abbruch misst und „Cancel“ auch am Install-Confirm abbricht. Der rote Punkt nannte, was
stattdessen dastand — „Install ASL Smoke Target?“ mit `mod-cta` statt Overwrite-Confirm mit
`mod-destructive`.

### Was der erste Lauf gefunden hat

**Befund (BEHOBEN in 0.1.1): die Listen-Einstellungen waren in Obsidian 1.13 nicht
bedienbar.** „Catalogs" und „Access tokens" erschienen im Einstellungen-Fenster als Items
mit Namen und Beschreibung, aber **ohne jedes Bedienelement**. Praktisch: weder
Katalog-Abos noch Token-Hosts waren dort verwaltbar. 65 grüne Unit-Tests sahen es nicht —
der Defekt lebte vollständig in der Naht zum Host.

**Die Ursache, per A/B im selben Build gemessen:** eine `render`-Hatch darf **genau ihre
eigene Zeile** befüllen. Was sie daneben baut, überlebt im nativen 1.13-Pfad nicht — weder
über `settingEl.parentElement` (das Element hängt beim Aufruf noch nicht im Dokument,
`imDOM=false`) noch über `group.addSetting()`. Beides **lautlos**, ohne Exception und ohne
Konsolenmeldung.

| Bauweise | erscheint? |
|---|---|
| `setting.addText(…)` direkt in der übergebenen Zeile | **ja** |
| Zusatzzeile über `group.addSetting(…)` | nein |
| Zusatzzeile an `settingEl.parentElement` | nein |

**Der Fix:** jede Zeile ist eine eigene Definition in einer `type: "group"`. Das trägt in
beiden Renderpfaden — der Kit-Walker iteriert `items` genauso. Gegen den Rückweg in den
Defekt steht seit 0.1.1 `tests/obsidian/settings-tab.test.ts` (im Defektzustand 5 von 7
rot gemessen); dass Obsidian die Definitionen auch *zeichnet*, kann nur dieser Smoke sagen.

⚠️ **Der Irrweg, den die Instrumentierung selbst erzeugt hat, ist die eigentliche Lehre:**
Obsidian ruft `getSettingDefinitions()` **einmal bei der Registrierung** und cacht das
Ergebnis. Ein nachträglich gesetzter Wrapper greift deshalb nie — die erste Messung meldete
`renderRufe: []` und legte „Obsidian ruft `render` gar nicht" nahe. Das war ein Artefakt der
Messung, nicht der Befund: mit einer Instrumentierung **im Plugin selbst** zeigte sich, dass
`render` sehr wohl gerufen wird. Eine Messung, deren Nullresultat auch von ihrem eigenen
Aufbau kommen kann, ist kein Nullresultat.

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


## Freeze: die Ursache, getrennt (2026-09-02)

Der „Check now"-Knopf fror am 2026-09-01 die gesamte App ein. Der Fix entfernte **zwei**
Verdächtige gleichzeitig, weil der Knopf produktiv beim Nutzer stand — welcher es war, blieb
offen. Sieben Läufe in einer isolierten Zweitinstanz haben es getrennt.

**Der Messaufbau zuerst, weil ohne ihn nichts davon gilt.** Ein Freeze-Test tötet die ganze
Obsidian-Instanz; an derselben hängen aber regelmäßig fremde Sessions. Gemessen wurde deshalb
in einer **zweiten Obsidian-Instanz mit eigenem `--user-data-dir` und eigenem Debug-Port**
(9333). Sie läuft parallel zur normalen Instanz, und ein App-weiter Freeze bleibt in ihr
eingesperrt — belegt: während die Testinstanz tot war, antworteten alle drei Fenster der
regulären Instanz auf `Runtime.evaluate` in Millisekunden.

**Positivkontrolle vor der Trennung.** Zwei Varianten, die beide „läuft" melden, sind
wertlos, wenn der Aufbau den Defekt gar nicht herstellen kann. Der Defektstand wurde deshalb
zuerst reproduziert — **zweimal**, mit identischem Bild (beide Renderer ohne Antwort).

| Variante | `setDisabled(true)` beim Klick | Flow läuft im | `setDisabled(false)` steht in | Ergebnis |
|---|---|---|---|---|
| **P** (Defektstand) | ja | Einstellungs-Fenster | **`.finally()` des Promise** | **friert ein (2×)** |
| A | ja | Workspace (über den Befehl) | `setTimeout` | läuft |
| B | nein | Einstellungs-Fenster | — | läuft |
| E | ja | Einstellungs-Fenster | — | läuft |
| F | ja | Einstellungs-Fenster | `.finally()`, aber `toggleClass` statt `setDisabled` | läuft |
| G | ja | Einstellungs-Fenster | `setTimeout` | läuft |

**Das Ergebnis widerlegt die Frage, mit der die Aufgabe gestellt war.** Sie lautete „welcher
der beiden Verdächtigen war es" und setzte voraus, dass es einer ist. Keiner der beiden
friert allein ein: weder der Flow im Fenster-Kontext (B, E) noch `setDisabled` als solches
(A, G).

Die Ursache benennen F und G gemeinsam, weil sie sich vom Defektstand in **je genau einem**
Detail unterscheiden: F nur im **Inhalt** des `finally` (`toggleClass` statt `setDisabled`),
G nur im **Zeitpunkt** (Timer statt Microtask). Beide laufen. Auslöser ist damit die
Konjunktion — **`ButtonComponent.setDisabled()`, aufgerufen im Microtask des Flow-Promise,
im Einstellungs-Fenster.**

**Folge für den Code:** Der Knopf bleibt beim registrierten Befehl, und die Rückmeldung ist
der `is-checking`-Indikator (E8) statt einer gesperrten Schaltfläche. Eine DOM-Änderung aus
dem `finally` heraus ist erlaubt und gemessen unbedenklich (F) — `setDisabled` in dieser
Position ist es nicht.

⚠️ **Was NICHT gemessen ist:** warum. Der Aufbau sagt, welche Kombination den Zustand
herstellt, nicht was unterhalb von JS dabei blockiert (`Debugger.pause` lieferte schon 2026-09-01
keinen laufenden Stack). Für die Praxis reicht die Regel; für eine Meldung an Obsidian wäre
das der nächste Schritt.

**Für das Nachbar-Repo — und was ein Blick in dessen Code korrigiert hat.** Die Aufgabe war
mit dem Stand gestellt, `koda-agent` habe seinen Freeze vom 2026-08-06 „nie reproduzieren
können". Am Code nachgelesen (`koda-agent/src/obsidian/settings.ts:456`) ist man dort weiter:
die Regel „`setDisabled()` aus dem Settings-Fenster friert ein" wurde am **2026-08-08
widerlegt** — derselbe Aufruf lief dort und in `vault-rag` folgenlos —, und gemessen ist ein
**anderes** engeres Muster: die Kombination mit `setIcon`/`setTooltip` auf einem Span
derselben Zeile.

Beide Messungen zeigen damit dasselbe Bauprinzip und **verschiedene** zweite Zutaten:

- `koda-agent`: `setDisabled` **+ `setIcon`/`setTooltip` auf einem Span derselben Zeile**
- hier: `setDisabled` **+ Aufruf im Microtask des Flow-Promise**

Der belastbare gemeinsame Satz ist deshalb nicht „`setDisabled` friert ein" (das ist in
beiden Repos widerlegt: E hier, die Gegenprobe vom 08.08. dort), sondern: **`setDisabled` ist
an App-Freezes in Obsidian 1.13 beteiligt, ist aber nie allein hinreichend — die jeweils
zweite Bedingung ist gemessen und in beiden Fällen eine andere.** Das ist n=2 für das Prinzip
und n=1 für jede der beiden konkreten Konjunktionen.

Praktische Folge, die beide Repos teilen: als Rückmeldung auf einen Klick ist `setDisabled`
die teuerste Form. `koda-agent` nutzt `buttonEl.disabled`, hier ist es der
`is-checking`-Indikator.

---

## Was der Umbau auf den Einstellungs-Tab gelehrt hat (2026-09-02)

Der Umbau war die Antwort auf Johannes' Einwand, dass hier UI neu gebaut wurde, die es
längst gibt — mit sichtbarer Folge (zu große Schrift). Beim Umstellen des Treibers fielen
vier Dinge an, die über dieses Repo hinaus gelten:

- **Modals erscheinen dort, wo geklickt wurde.** Ein Confirm, das aus dem
  Einstellungs-**Fenster** ausgelöst wird, steht in dessen DOM — `waitForModal` gegen den
  Workspace-Renderer findet nichts und meldet „kein Modal". Elf Prüfpunkte waren deshalb
  rot, ohne dass am Prüfling etwas fehlte. Die Modal-Helfer nehmen deshalb das Handle der
  Stelle, an der geklickt wurde.
- **Obsidian cacht `getSettingDefinitions()`.** Wer die Einstellungen von außen ändert (ein
  Treiber tut das immer), sieht danach den alten Stand — bei leerer Abo-Liste standen noch
  22 Katalog-Einträge da. `writeSettings` stößt jetzt selbst ein `update()` an. ⚠️ Das ist
  ein **Messartefakt**: im echten Ablauf ändert der Nutzer die Einstellungen *durch* die UI,
  und die ruft ihr `refresh()` selbst.
- **Zwei echte Produktfehler fand erst dieser Umbau** — beide hätte die alte View genauso
  gehabt: der Katalog-Cache überlebte eine Änderung der Abos, und der Platten-Zustand wurde
  nur beim Katalog-Laden gelesen (wer außerhalb installiert, sah weiter „Install"). Dazu
  kam, dass „Check now" die offene Liste nicht aktualisierte — man drückte, bekam eine
  Notice und sah nichts.
- **`esbuild --bundle` prüft keine Typen.** Ein Lauf war grün, während `tsc` einen Fehler in
  derselben Datei meldete. Der Typecheck gehört vor den Lauf, nicht danach.
