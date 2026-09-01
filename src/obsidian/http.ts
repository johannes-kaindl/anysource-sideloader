import { requestUrl } from "obsidian";
import type { HttpPort } from "../core/forge/types";

export function obsidianHttp(): HttpPort {
  return async (req) => {
    const res = await requestUrl({ url: req.url, method: req.method ?? "GET", headers: req.headers, throw: false });
    return { status: res.status, text: res.text, arrayBuffer: res.arrayBuffer };
  };
}
