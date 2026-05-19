import { describe, expect, it } from "vitest";

import { classifyInternalLink, normalizeUrl } from "./url.js";

const normalizationCases = [
  {
    name: "lowercases protocol and host",
    input: "HTTPS://Example.COM/About",
    expected: "https://example.com/About"
  },
  {
    name: "keeps the root slash",
    input: "https://example.com/",
    expected: "https://example.com/"
  },
  {
    name: "removes hash fragments",
    input: "https://example.com/path#section",
    expected: "https://example.com/path"
  },
  {
    name: "removes default https port",
    input: "https://example.com:443/path",
    expected: "https://example.com/path"
  },
  {
    name: "removes default http port",
    input: "http://example.com:80/path",
    expected: "http://example.com/path"
  },
  {
    name: "keeps non-default ports",
    input: "https://example.com:8443/path",
    expected: "https://example.com:8443/path"
  },
  {
    name: "resolves root-relative paths",
    input: "/services/",
    baseUrl: "https://example.com/base/page",
    expected: "https://example.com/services"
  },
  {
    name: "resolves child relative paths",
    input: "team/",
    baseUrl: "https://example.com/about/",
    expected: "https://example.com/about/team"
  },
  {
    name: "resolves parent relative paths",
    input: "../contact/",
    baseUrl: "https://example.com/about/team/",
    expected: "https://example.com/about/contact"
  },
  {
    name: "resolves protocol-relative URLs",
    input: "//cdn.example.com/image.png",
    baseUrl: "https://example.com/",
    expected: "https://cdn.example.com/image.png"
  },
  {
    name: "sorts query parameters",
    input: "https://example.com/path?z=2&a=1",
    expected: "https://example.com/path?a=1&z=2"
  },
  {
    name: "keeps duplicate query values stable within a key",
    input: "https://example.com/path?b=2&a=1&a=0",
    expected: "https://example.com/path?a=1&a=0&b=2"
  },
  {
    name: "encodes spaces in paths",
    input: "https://example.com/a b/",
    expected: "https://example.com/a%20b"
  },
  {
    name: "removes trailing slash before query",
    input: "https://example.com/path/?z=2&a=1",
    expected: "https://example.com/path?a=1&z=2"
  },
  {
    name: "collapses duplicate path slashes",
    input: "https://example.com//a///b/",
    expected: "https://example.com/a/b"
  },
  {
    name: "strips credentials",
    input: "https://user:pass@example.com/path",
    expected: "https://example.com/path"
  },
  {
    name: "resolves file-relative paths",
    input: "images/photo.png",
    baseUrl: "https://example.com/a/b/page.html",
    expected: "https://example.com/a/b/images/photo.png"
  },
  {
    name: "resolves current directory segments",
    input: "./pricing/",
    baseUrl: "https://example.com/services/",
    expected: "https://example.com/services/pricing"
  },
  {
    name: "keeps sorted query on hash-only links",
    input: "#intro",
    baseUrl: "https://example.com/path?b=2&a=1",
    expected: "https://example.com/path?a=1&b=2"
  },
  {
    name: "normalizes query-only links against base path",
    input: "?b=2&a=1",
    baseUrl: "https://example.com/path",
    expected: "https://example.com/path?a=1&b=2"
  },
  {
    name: "preserves percent-encoded path values",
    input: "https://example.com/%EC%84%9C%EB%B9%84%EC%8A%A4/",
    expected: "https://example.com/%EC%84%9C%EB%B9%84%EC%8A%A4"
  }
];

describe("normalizeUrl", () => {
  it.each(normalizationCases)("$name", ({ input, baseUrl, expected }) => {
    expect(normalizeUrl(input, baseUrl)).toBe(expected);
  });

  it("rejects empty URLs", () => {
    expect(() => normalizeUrl("   ")).toThrow(/must not be empty/);
  });

  it("rejects relative URLs without a base URL", () => {
    expect(() => normalizeUrl("/relative")).toThrow(/Invalid URL/);
  });

  it("rejects unsupported URL protocols", () => {
    expect(() => normalizeUrl("mailto:hello@example.com")).toThrow(/Only HTTP and HTTPS/);
  });
});

describe("classifyInternalLink", () => {
  it("classifies same-host links as internal", () => {
    expect(classifyInternalLink("/about", "https://example.com")).toBe("internal");
  });

  it("treats www and bare domains as the same site", () => {
    expect(classifyInternalLink("https://www.example.com/about", "https://example.com")).toBe(
      "internal",
    );
  });

  it("classifies subdomains as external", () => {
    expect(classifyInternalLink("https://blog.example.com/post", "https://example.com")).toBe(
      "external",
    );
  });

  it("classifies other hosts as external", () => {
    expect(classifyInternalLink("//cdn.example.net/app.js", "https://example.com")).toBe(
      "external",
    );
  });
});
