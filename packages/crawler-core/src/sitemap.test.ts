import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseSitemapXml } from "./sitemap.js";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

function fixture(name: string): string {
  return readFileSync(resolve(fixtureRoot, name), "utf8");
}

describe("parseSitemapXml", () => {
  it("parses urlset sitemaps and skips invalid loc entries", () => {
    const parsed = parseSitemapXml(fixture("sitemap.xml"));

    expect(parsed).toEqual({
      type: "urlset",
      urls: [
        {
          loc: "https://example.com/",
          lastmod: "2026-05-19",
          changefreq: "daily",
          priority: 1
        },
        {
          loc: "https://example.com/services",
          lastmod: "2026-05-18",
          changefreq: null,
          priority: null
        }
      ],
      sitemaps: []
    });
  });

  it("parses sitemap index files", () => {
    const parsed = parseSitemapXml(fixture("sitemap-index.xml"));

    expect(parsed).toEqual({
      type: "sitemapindex",
      urls: [],
      sitemaps: [
        {
          loc: "https://example.com/sitemap-pages.xml",
          lastmod: "2026-05-19"
        },
        {
          loc: "https://example.com/sitemap-posts.xml",
          lastmod: null
        }
      ]
    });
  });

  it("returns an empty urlset for malformed XML without loc entries", () => {
    expect(parseSitemapXml("<not-xml>")).toEqual({
      type: "urlset",
      urls: [],
      sitemaps: []
    });
  });
});
