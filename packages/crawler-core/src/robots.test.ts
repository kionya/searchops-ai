import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isPathAllowedByRobots, parseRobotsTxt } from "./robots.js";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

function fixture(name: string): string {
  return readFileSync(resolve(fixtureRoot, name), "utf8");
}

describe("parseRobotsTxt", () => {
  it("parses user-agent groups, rules, crawl delay, and sitemap URLs", () => {
    const parsed = parseRobotsTxt(fixture("robots.txt"));

    expect(parsed.rules).toEqual([
      {
        userAgents: ["*"],
        allow: ["/public"],
        disallow: ["/private"],
        crawlDelay: 2
      },
      {
        userAgents: ["searchbot"],
        allow: ["/internal/public"],
        disallow: ["/internal"],
        crawlDelay: null
      }
    ]);
    expect(parsed.sitemaps).toEqual([
      "https://example.com/sitemap.xml",
      "https://example.com/sitemap-news.xml"
    ]);
  });

  it("uses longest matching allow/disallow rule for path checks", () => {
    const parsed = parseRobotsTxt(fixture("robots.txt"));

    expect(isPathAllowedByRobots(parsed, "/private/page")).toBe(false);
    expect(isPathAllowedByRobots(parsed, "/public/page")).toBe(true);
    expect(isPathAllowedByRobots(parsed, "/internal/secret", "SearchBot")).toBe(false);
    expect(isPathAllowedByRobots(parsed, "/internal/public/page", "SearchBot")).toBe(true);
  });

  it("ignores comments, unknown directives, and invalid sitemap URLs", () => {
    const parsed = parseRobotsTxt(`
      # comment
      User-agent: *
      Disallow: /tmp # inline comment
      Unknown: value
      Sitemap: mailto:bad@example.com
    `);

    expect(parsed.rules).toEqual([
      {
        userAgents: ["*"],
        allow: [],
        disallow: ["/tmp"],
        crawlDelay: null
      }
    ]);
    expect(parsed.sitemaps).toEqual([]);
  });
});
