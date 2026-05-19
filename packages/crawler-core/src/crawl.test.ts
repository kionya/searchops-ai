import { describe, expect, it } from "vitest";

import { crawlSite } from "./crawl.js";
import type { FetchUrlInput, FetchUrlResult } from "./fetch.js";

const page = (title: string, links = "") => `
<!doctype html>
<html>
  <head><title>${title}</title></head>
  <body>
    <h1>${title}</h1>
    ${links}
  </body>
</html>
`;

function createFetchUrlFixture(responses: Record<string, FetchUrlResult>) {
  const requestedUrls: string[] = [];
  const fetchUrlImpl = async (input: FetchUrlInput) => {
    requestedUrls.push(input.url);
    const response = responses[input.url];
    if (response === undefined) {
      throw new Error(`Unexpected URL: ${input.url}`);
    }

    return response;
  };

  return { fetchUrlImpl, requestedUrls };
}

describe("crawlSite", () => {
  it("fetches the start page, sitemap URLs, and internal links within maxPages", async () => {
    const { fetchUrlImpl, requestedUrls } = createFetchUrlFixture({
      "https://example.com/robots.txt": {
        url: "https://example.com/robots.txt",
        finalUrl: "https://example.com/robots.txt",
        statusCode: 200,
        contentType: "text/plain",
        body: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
        truncated: false
      },
      "https://example.com/sitemap.xml": {
        url: "https://example.com/sitemap.xml",
        finalUrl: "https://example.com/sitemap.xml",
        statusCode: 200,
        contentType: "application/xml",
        body: `
          <urlset>
            <url><loc>https://example.com/from-sitemap</loc></url>
          </urlset>
        `,
        truncated: false
      },
      "https://example.com/": {
        url: "https://example.com/",
        finalUrl: "https://example.com/",
        statusCode: 200,
        contentType: "text/html",
        body: page("Home", '<a href="/from-link">From link</a>'),
        truncated: false
      },
      "https://example.com/from-sitemap": {
        url: "https://example.com/from-sitemap",
        finalUrl: "https://example.com/from-sitemap",
        statusCode: 200,
        contentType: "text/html",
        body: page("From sitemap"),
        truncated: false
      }
    });

    const pages = await crawlSite({
      fetchUrlImpl,
      maxPages: 2,
      startUrl: "https://example.com/"
    });

    expect(pages).toEqual([
      {
        url: "https://example.com/",
        html: page("Home", '<a href="/from-link">From link</a>'),
        statusCode: 200
      },
      {
        url: "https://example.com/from-sitemap",
        html: page("From sitemap"),
        statusCode: 200
      }
    ]);
    expect(requestedUrls).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/sitemap.xml",
      "https://example.com/",
      "https://example.com/from-sitemap"
    ]);
  });

  it("skips robots-blocked and non-HTML URLs", async () => {
    const { fetchUrlImpl, requestedUrls } = createFetchUrlFixture({
      "https://example.com/robots.txt": {
        url: "https://example.com/robots.txt",
        finalUrl: "https://example.com/robots.txt",
        statusCode: 200,
        contentType: "text/plain",
        body: "User-agent: *\nDisallow: /blocked",
        truncated: false
      },
      "https://example.com/": {
        url: "https://example.com/",
        finalUrl: "https://example.com/",
        statusCode: 200,
        contentType: "text/html",
        body: page(
          "Home",
          '<a href="/blocked/page">Blocked</a><a href="/asset.json">Asset</a>',
        ),
        truncated: false
      },
      "https://example.com/asset.json": {
        url: "https://example.com/asset.json",
        finalUrl: "https://example.com/asset.json",
        statusCode: 200,
        contentType: "application/json",
        body: "{}",
        truncated: false
      }
    });

    const pages = await crawlSite({
      fetchUrlImpl,
      maxPages: 3,
      startUrl: "https://example.com/"
    });

    expect(pages).toHaveLength(1);
    expect(requestedUrls).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/",
      "https://example.com/asset.json"
    ]);
  });
});
