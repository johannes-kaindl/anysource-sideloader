export type ForgeKind = "github" | "gitea" | "raw";
export interface RepoRef { kind: ForgeKind; baseUrl: string; owner: string; repo: string; }
export interface AssetRef { name: string; downloadUrl: string; apiUrl?: string; }
export interface ReleaseInfo {
  tagName: string; version: string;    // version = tagName ohne fuehrendes "v"
  notes: string;                       // Release-Body (Markdown, ggf. "")
  htmlUrl: string; assets: AssetRef[];
}
export interface HttpRequest { url: string; method?: string; headers?: Record<string, string>; }
export interface HttpResponse { status: number; text: string; arrayBuffer: ArrayBuffer; }
export type HttpPort = (req: HttpRequest) => Promise<HttpResponse>;
