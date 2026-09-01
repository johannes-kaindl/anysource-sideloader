# Fixture-Vault für den GUI-Smoke

Getrackte Quelle des Staging-Vaults, den `scripts/gui-smoke.ts` per `buildVault`
(`tools/obsidian-cdp/vault.ts`) unter `$STAGING_VAULTS_DIR/anysource-sideloader` herstellt.

- `notes/` — Vault-Inhalt. Bewusst minimal: dieses Plugin misst nichts am Notiztext,
  aber ein leerer Vault lässt Obsidian den Willkommens-Dialog zeigen.
- `obsidian/` — Vault-Konfiguration. Nur `anysource-sideloader` ist aktiv, damit kein
  fremdes Plugin in den gemessenen DOM malt.

Der Vault ist Wegwerfware: verloren heißt neu gebaut, nicht rekonstruiert. Er ist der
Grund, warum der Smoke **nicht** gegen einen Arbeits-Vault fährt — dort läge ein fremder
Build des Prüflings und fremdes Prüfmaterial (Dach-`AGENTS.md` § Staging-Vaults).

Die Netzwerk-Gegenstelle ist **kein** Teil dieses Fixtures: sie entsteht zur Laufzeit in
`scripts/forge-server.ts` (drei lokale HTTP-Server), damit der Smoke ohne Internet läuft
und Redirects gezielt herstellen kann.
