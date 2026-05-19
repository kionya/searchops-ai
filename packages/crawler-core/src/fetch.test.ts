import { describe, expect, it } from "vitest";

import { fetchUrl, isHtmlFetchResult } from "./fetch.js";

describe("fetchUrl", () => {
  it("fetches text responses with status, final URL, and content type", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("<html><title>Fetched</title></html>", {
        headers: {
          "content-type": "text/html; charset=utf-8"
        },
        status: 200
      });

    const result = await fetchUrl({
      fetchImpl,
      url: "https://example.com/"
    });

    expect(result).toMatchObject({
      url: "https://example.com/",
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      body: "<html><title>Fetched</title></html>",
      truncated: false
    });
    expect(isHtmlFetchResult(result)).toBe(true);
  });

  it("truncates bodies above the configured byte limit", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("abcdef", {
        headers: {
          "content-type": "text/html"
        },
        status: 200
      });

    const result = await fetchUrl({
      fetchImpl,
      maxBodyBytes: 3,
      url: "https://example.com/"
    });

    expect(result.body).toBe("abc");
    expect(result.truncated).toBe(true);
  });

  it("classifies non-HTML responses", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("{}", {
        headers: {
          "content-type": "application/json"
        },
        status: 200
      });

    const result = await fetchUrl({
      fetchImpl,
      url: "https://example.com/api"
    });

    expect(isHtmlFetchResult(result)).toBe(false);
  });

  it("blocks redirects outside the allowed crawl scope", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("", {
        headers: {
          location: "http://169.254.169.254/latest/meta-data"
        },
        status: 302
      });

    await expect(
      fetchUrl({
        fetchImpl,
        isRedirectAllowed: (url) => url.startsWith("https://example.com/"),
        url: "https://example.com/"
      }),
    ).rejects.toThrow(/outside the allowed crawl scope/);
  });
});
