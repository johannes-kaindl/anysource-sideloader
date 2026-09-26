# Aufnahme-Vertrag — README-Bilder

Dieser Ordner hält die Bilder, die `README.md` und `README.de.md` einbetten. Diese Datei ist der **Vertrag** dafür: welche Bilder es gibt, was jedes zeigen muss, in welcher Klasse es steht und wie man sie reproduzierbar neu aufnimmt.

Geprüft wird der Vertrag automatisch: `readme_lint.py` (Workspace-Werkzeug, aufgerufen über `npm run shots:check`) gleicht Vertrag, Dateien und README-Einbettungen ab.

## Status

**Stand 2026-09-26: alle drei Aufnahmen stehen.** Aufgenommen in einer Zweitinstanz (eigenes `--user-data-dir`, Debug-Port 9326, Oberfläche Englisch, helles Theme), die reguläre Instanz auf 9222 wurde nicht berührt. Jedes Bild wurde nach dem Lauf angesehen.

Ein Motiv wurde bewusst **nicht** aufgenommen: die Bestätigungsdialoge für Installation und Update. Sie erscheinen erst nach einem Netzzugriff auf eine Forge und würden dort einen echten Plugin-Namen zeigen; der Aufnahme-Treiber hat absichtlich keine Gegenstelle außer dem lokalen Katalog.

## Klassen

| Klasse | Einbettung | Grenze |
|---|---|---|
| `hero` | `width="820"`, zentriert, direkt nach den Badges | Querformat (H ≤ B) |
| `feature` | `width="820"` | H/B ≤ 1.6 |
| `detail` | Vorschaubild `width="380"`, verlinkt auf die Vollauflösung | keine Höhengrenze |

## Bilder

| Datei | Klasse | Referenziert von | Muss zeigen |
|---|---|---|---|
| `hero.png` | hero | `README.md`, `README.de.md` (Kopf) | Den Kopf des Einstellungs-Tabs: **Check for updates on startup**, **Check for updates now** mit **Check now**, darunter **Updates** mit zwei fälligen Plugins (**Update**, **Release notes**) und **Installed plugins** mit drei Zeilen (zwei mit **Update to …**, eine mit **Up to date**). Endet vor der Überschrift **Browse catalogs**. |
| `catalog.png` | feature | `README.md`, `README.de.md` (Usage) | Die Sektion **Browse catalogs** mit allen vier Zuständen einer Katalog-Zeile: **Installed 1.2.0 — 1.3.0 available**, **Installed 0.9.4**, **Installed 0.3.0 — not tracked** mit **Track for updates**, und zweimal **Install**. Oben **Track all 1 installed**. |
| `install-url.png` | detail | `README.md`, `README.de.md` (Usage) | Das Fenster des Befehls **Install plugin from URL** mit eingetragener Repository-Adresse und dem Knopf **Install**. |

## Beispieldaten

Alles Sichtbare ist erfunden und englisch: Plugins *Acme Timeline*, *Quick Tables*, *Vault Weather*, *Reading Queue*, *Citation Picker*, *Daily Recap*, Autoren *Acme Labs* und *Jane Doe*, Forge `forge.example.com`. Der Katalog liegt in `fixture/demo/catalog.json` und wird vom Treiber über einen lokalen HTTP-Server ausgeliefert; die verfolgten Plugins stehen in `fixture/demo/state.json`. Keines der Bilder zeigt die Katalog-URL (`http://127.0.0.1:<port>/…`), weil es sie beim Leser nicht gibt.

## Reproduzieren

```bash
npm run build && npm run shots -- --setup
```

Danach Obsidian in einer Zweitinstanz starten (eigenes `--user-data-dir`, eigener Debug-Port), in `obsidian.json` und im `localStorage` `language` auf `en` setzen, den Restricted Mode aufheben und den CDP-Lock für den Port halten. Aufnehmen mit `npm run shots -- --port <port>`, ein einzelnes Bild mit `--only <datei>`, den Vertrag anzeigen mit `--list`. Der Treiber bricht ab, wenn die Sprache nicht Englisch ist oder das Plugin nicht geladen wurde.

Zwei Eigenheiten des Treibers, beide gemessen: Der Einstellungs-Tab wird vor jedem Bild neu gezeichnet, weil er sonst den Aufbau vom letzten Öffnen zeigt und die frisch geschriebenen Einstellungen ignoriert. Und das Einstellungs-Fenster ist durch die Bildschirmhöhe begrenzt (rund 950 px); ein Ausschnitt darüber hinaus wird schwarz statt abgeschnitten, deshalb holt der Treiber die jeweilige Überschrift vor der Aufnahme nach oben.
