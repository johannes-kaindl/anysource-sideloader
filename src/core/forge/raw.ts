import type { RepoRef } from "./types";

export interface RawSource { ref: RepoRef; gitRef: string; }   // gitRef = Branch oder Tag, Default "HEAD" -> "main"

export function rawFileUrl(src: RawSource, file: string): string {
  if (src.ref.kind === "github") {
    return `https://raw.githubusercontent.com/${src.ref.owner}/${src.ref.repo}/${src.gitRef}/${file}`;
  }
  return `${src.ref.baseUrl}/${src.ref.owner}/${src.ref.repo}/raw/${src.gitRef}/${file}`;
}
