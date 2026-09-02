#!/bin/sh
# Vendort Kit-Module byte-identisch aus den Schwester-Repos (Dach-AGENTS.md, Kit-first).
# Nie von Hand editieren — Skript neu laufen lassen.
#
# Gelesen wird aus FESTEN REFS, nicht aus dem Arbeitsstand der Nachbar-Repos. Ein `cat` aus
# deren Arbeitsverzeichnis liefert je nach deren HEAD etwas anderes oder gar nichts, und es
# stoert eine parallele Session dort. `git show <ref>:<pfad>` ist reproduzierbar.
#
# Zwei Refs, weil die Module aus zwei Repos kommen: seit obsidian-kit 0.28.0 liegen die
# pure-Teile in `code-kit`. Genau an dieser Verschiebung sind anderswo Vendor-Ordner
# zerbrochen (CORE-META-22) — hier nicht, weil die code-kit-Quelle schon vorher stimmte.
#
# ⚠️ Ein zweiter Lauf darf KEINEN Diff erzeugen. Das ist die Probe darauf, dass Header und
# VENDOR.json deterministisch sind — deshalb steht in VENDOR.json bewusst KEIN Datum (es
# erzeugte jeden Lauf einen Diff, und wann vendoriert wurde, weiss git besser).
set -e
KIT=${KIT_DIR:-../obsidian-kit}
CODEKIT=${CODEKIT_DIR:-/Users/Shared/code/code-kit}
KIT_REF=${KIT_REF:-0.30.0}
CODEKIT_REF=${CODEKIT_REF:-0.5.0}

# Der TAG-Commit, nicht der HEAD des Nachbar-Repos: HEAD steht oft auf einem spaeteren Stand,
# und ein daraus gelesener SHA widerspraeche der gestempelten Version. (Gemessen 2026-09-02:
# code-kit-HEAD lag 8 Dateien vor 0.5.0, der alte Stempel nannte trotzdem eine Version.)
# Die Ref zuerst AUFLOESEN, mit eigener Meldung: `rev-parse` auf eine unbekannte Ref gibt
# sonst nur Gits rohes "Use '--' to separate paths from revisions", was wie ein Tippfehler im
# Skript aussieht statt wie eine falsche Ref.
loese_ref() { # $1 repo-dir $2 ref $3 name
  git -C "$1" rev-parse --verify --quiet "$2^{commit}" || {
    echo "FEHLER: $3 kennt die Ref '$2' nicht. Nichts geschrieben." >&2
    echo "        Vorhandene Tags: $(git -C "$1" tag --sort=-v:refname | head -5 | tr '\n' ' ')" >&2
    exit 1
  }
}
K_SHA=$(loese_ref "$KIT" "$KIT_REF" obsidian-kit)
CK_SHA=$(loese_ref "$CODEKIT" "$CODEKIT_REF" code-kit)

# VORPRUEFUNG, bevor irgendetwas geschrieben wird.
#
# Ein Abbruch mitten im Lauf ist zu spaet: `set -e` bricht zwar ab, aber die bis dahin
# geschriebenen Dateien bleiben auf dem neuen Stand und die uebrigen auf dem alten — ein halb
# zerstoerter Vendor-Ordner, der wie ein gueltiges Vendoring aussieht. Ein Schutz, der nur die
# Datei rettet, an der er ausloest, laesst alle vorherigen kaputt.
pruefe_quellen() { # $1 repo-dir $2 ref $3 name; danach die Pfade
  repo="$1"; ref="$2"; name="$3"; shift 3
  fehlend=""
  for pfad in "$@"; do
    git -C "$repo" cat-file -e "$ref:$pfad" 2>/dev/null || fehlend="$fehlend $pfad"
  done
  if [ -n "$fehlend" ]; then
    echo "FEHLER: in $name@$ref fehlen:$fehlend" >&2
    echo "        Nichts geschrieben. Eine fehlende Quelle heisst meist, dass das Modul" >&2
    echo "        umgezogen ist — die Ref zu heben verlangt dann eine Entscheidung ueber die" >&2
    echo "        QUELLE, nicht nur ueber die Version." >&2
    exit 1
  fi
}

# vendor <zielpfad> <repo-dir> <ref> <name> <version> <quellpfad>
#
# Schreibt ERST nach .tmp und verschiebt NUR bei Erfolg. Die naheliegende Form
# `{ printf header; git show ...; } > ziel` legt die Zieldatei an, BEVOR `git show` laeuft —
# fehlt die Quelle, bleibt ein Stummel aus nur der Stempelzeile zurueck, der wie ein gueltiges
# Vendoring aussieht (CORE-META-22, Beleg finance-ledger 2026-08-27).
vendor() {
  tmp="$1.tmp"
  { printf '%s\n' "// vendored from $4@$5, $6 — do not hand-edit; re-vendor via tools/sync-kit.sh"
    git -C "$2" show "$3:$6"; } > "$tmp" || {
      rm -f "$tmp"
      echo "FEHLER: $6 fehlt in $4@$3 — nichts geschrieben." >&2
      exit 1
    }
  mv "$tmp" "$1"
}

write_vendor_json() { # $1 zielverzeichnis $2 source $3 version $4 sha $5 modulliste
  printf '{\n  "source": "%s",\n  "version": "%s",\n  "sha": "%s",\n  "modules": "%s",\n  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh."\n}\n' \
    "$2" "$3" "$4" "$5" > "$1/VENDOR.json"
}

# `num` wird von settings_schema importiert (clampInt), `folder-suggest` von settings_walker —
# beide mitgenommen, statt den Vendor-Stand von Hand zu editieren.
PURE="settings settings_schema sha256 i18n num"
OBS="confirm hub settings_walker folder-suggest"

mkdir -p src/vendor/code-kit src/vendor/kit-obsidian tests/vendor/kit

CK_QUELLEN=""; for f in $PURE; do CK_QUELLEN="$CK_QUELLEN src/ts/pure/$f.ts"; done
K_QUELLEN="src/testing/obsidian-mock.ts"; for f in $OBS; do K_QUELLEN="$K_QUELLEN src/obsidian/$f.ts"; done
pruefe_quellen "$CODEKIT" "$CODEKIT_REF" code-kit $CK_QUELLEN
pruefe_quellen "$KIT" "$KIT_REF" obsidian-kit $K_QUELLEN

for f in $PURE; do
  vendor "src/vendor/code-kit/$f.ts" "$CODEKIT" "$CODEKIT_REF" code-kit "$CODEKIT_REF" "src/ts/pure/$f.ts"
done
write_vendor_json src/vendor/code-kit code-kit "$CODEKIT_REF" "$CK_SHA" "$(printf '%s.ts, ' $PURE | sed 's/, $//')"

vendor tests/vendor/kit/obsidian-mock.ts "$KIT" "$KIT_REF" obsidian-kit "$KIT_REF" src/testing/obsidian-mock.ts
write_vendor_json tests/vendor/kit obsidian-kit "$KIT_REF" "$K_SHA" "obsidian-mock.ts"

for f in $OBS; do
  vendor "src/vendor/kit-obsidian/$f.ts" "$KIT" "$KIT_REF" obsidian-kit "$KIT_REF" "src/obsidian/$f.ts"
done
write_vendor_json src/vendor/kit-obsidian obsidian-kit "$KIT_REF" "$K_SHA" "$(printf '%s.ts, ' $OBS | sed 's/, $//')"

echo "vendored: code-kit@$CODEKIT_REF ($PURE) | obsidian-kit@$KIT_REF ($OBS obsidian-mock)"
