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
      siteDomain: "example.com",
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
      siteDomain: "example.com",
      startUrl: "https://example.com/"
    });

    expect(pages).toHaveLength(1);
    expect(requestedUrls).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/",
      "https://example.com/asset.json"
    ]);
  });

  it("rejects start URLs outside the site domain", async () => {
    await expect(
      crawlSite({
        fetchUrlImpl: async () => {
          throw new Error("Should not fetch");
        },
        maxPages: 1,
        siteDomain: "example.com",
        startUrl: "https://example.net/"
      }),
    ).rejects.toThrow(/outside the allowed crawl scope/);
  });

  it("allows subdomains but skips external robots sitemaps and external redirects", async () => {
    const { fetchUrlImpl, requestedUrls } = createFetchUrlFixture({
      "https://blog.example.com/robots.txt": {
        url: "https://blog.example.com/robots.txt",
        finalUrl: "https://blog.example.com/robots.txt",
        statusCode: 200,
        contentType: "text/plain",
        body: [
          "User-agent: *",
          "Allow: /",
          "Sitemap: https://example.net/sitemap.xml",
          "Sitemap: https://blog.example.com/sitemap.xml"
        ].join("\n"),
        truncated: false
      },
      "https://blog.example.com/sitemap.xml": {
        url: "https://blog.example.com/sitemap.xml",
        finalUrl: "https://blog.example.com/sitemap.xml",
        statusCode: 200,
        contentType: "application/xml",
        body: "<urlset><url><loc>https://blog.example.com/post</loc></url></urlset>",
        truncated: false
      },
      "https://blog.example.com/": {
        url: "https://blog.example.com/",
        finalUrl: "http://169.254.169.254/latest/meta-data",
        statusCode: 200,
        contentType: "text/html",
        body: page("Redirected away"),
        truncated: false
      },
      "https://blog.example.com/post": {
        url: "https://blog.example.com/post",
        finalUrl: "https://blog.example.com/post",
        statusCode: 200,
        contentType: "text/html",
        body: page("Post"),
        truncated: false
      }
    });

    const pages = await crawlSite({
      fetchUrlImpl,
      maxPages: 2,
      siteDomain: "example.com",
      startUrl: "https://blog.example.com/"
    });

    expect(pages).toEqual([
      {
        url: "https://blog.example.com/post",
        html: page("Post"),
        statusCode: 200
      }
    ]);
    expect(requestedUrls).toEqual([
      "https://blog.example.com/robots.txt",
      "https://blog.example.com/sitemap.xml",
      "https://blog.example.com/",
      "https://blog.example.com/post"
    ]);
  });
});

describe("crawlSite — 페이지 한 장의 응답 실패", () => {
  const html = (title: string, links = "") => ({
    body: page(title, links),
    contentType: "text/html",
    statusCode: 200,
    truncated: false
  });

  // 2026-11-17: 한 페이지가 10초 안에 응답하지 않아 25쪽 크롤 전체가 실패로 끝났다.
  it("한 번 다시 시도하고, 그래도 실패한 페이지만 빼고 나머지를 읽는다", async () => {
    const calls = new Map<string, number>();
    const fetchUrlImpl = async (input: FetchUrlInput): Promise<FetchUrlResult> => {
      const count = (calls.get(input.url) ?? 0) + 1;
      calls.set(input.url, count);
      if (input.url.endsWith("/robots.txt")) {
        return { ...html(""), contentType: "text/plain", statusCode: 404, url: input.url, finalUrl: input.url, body: "" };
      }
      if (input.url === "https://example.com/slow") {
        throw new DOMException("This operation was aborted", "AbortError");
      }
      if (input.url === "https://example.com/flaky" && count === 1) {
        throw new TypeError("fetch failed");
      }
      const links = input.url === "https://example.com/" ? '<a href="/slow">s</a><a href="/flaky">f</a><a href="/ok">o</a>' : "";
      return { ...html(input.url, links), url: input.url, finalUrl: input.url };
    };

    const pages = await crawlSite({ fetchUrlImpl, maxPages: 10, siteDomain: "example.com", startUrl: "https://example.com/" });

    expect(pages.map((p) => p.url)).toEqual(["https://example.com/", "https://example.com/flaky", "https://example.com/ok"]);
    expect(calls.get("https://example.com/slow")).toBe(2);
  });
});
