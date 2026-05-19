import { ParsedSitemapSchema, type ParsedSitemap, type SitemapIndexEntry, type SitemapUrlEntry } from "@searchops/types";

import { parseHtml } from "./html.js";
import { normalizeUrl } from "./url.js";

export function parseSitemapXml(input: string): ParsedSitemap {
  const $ = parseHtml(input);
  const sitemapEntries = $("sitemap")
    .toArray()
    .map((element): SitemapIndexEntry | null => {
      const loc = tryNormalizeUrl($(element).find("loc").first().text());
      if (loc === null) {
        return null;
      }

      return {
        loc,
        lastmod: normalizeNullableText($(element).find("lastmod").first().text())
      };
    })
    .filter((entry): entry is SitemapIndexEntry => entry !== null);

  const urlEntries = $("url")
    .toArray()
    .map((element): SitemapUrlEntry | null => {
      const loc = tryNormalizeUrl($(element).find("loc").first().text());
      if (loc === null) {
        return null;
      }

      return {
        loc,
        lastmod: normalizeNullableText($(element).find("lastmod").first().text()),
        changefreq: normalizeNullableText($(element).find("changefreq").first().text()),
        priority: parsePriority($(element).find("priority").first().text())
      };
    })
    .filter((entry): entry is SitemapUrlEntry => entry !== null);

  return ParsedSitemapSchema.parse({
    type: sitemapEntries.length > 0 ? "sitemapindex" : "urlset",
    urls: urlEntries,
    sitemaps: sitemapEntries
  });
}

function normalizeNullableText(input: string): string | null {
  const normalized = input.replace(/\s+/gu, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function parsePriority(input: string): number | null {
  const normalized = normalizeNullableText(input);
  if (normalized === null) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function tryNormalizeUrl(input: string): string | null {
  try {
    return normalizeUrl(input.trim());
  } catch {
    return null;
  }
}
