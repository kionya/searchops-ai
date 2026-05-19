import { load, type CheerioAPI } from "cheerio";

export function parseHtml(html: string): CheerioAPI {
  return load(html, { scriptingEnabled: false });
}
