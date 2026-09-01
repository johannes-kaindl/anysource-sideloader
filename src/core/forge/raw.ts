import type { RepoRef } from "./types";

export interface RawSource { ref: RepoRef; gitRef: string; }   // gitRef = Branch oder Tag, Default "HEAD" -> "main"

/** Raw-Datei-URL in der Gitea/Forgejo-Form `/{owner}/{repo}/raw/{ref}/{datei}`.
 *
 *  ⚠️ Kein github-Sonderfall mehr: `detectForge` routet `github.com` nie in den Raw-Pfad
 *  (dort greift immer die Release-API), der Zweig war also tot — und toter Code, der eine
 *  fremde URL-Form baut, ist die Sorte, die beim naechsten Anfassen fuer erprobt gehalten
 *  wird. Kaeme github je hierher, faellt es sofort auf, statt still eine
 *  raw.githubusercontent.com-URL zu erzeugen. */
export function rawFileUrl(src: RawSource, file: string): string {
  return `${src.ref.baseUrl}/${src.ref.owner}/${src.ref.repo}/raw/${src.gitRef}/${file}`;
}
