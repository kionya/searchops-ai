import { describe, expect, it } from "vitest";

import { isBlockedHostname, isHostnameWithinDomain, isUrlAllowedForCrawl } from "./scope.js";

describe("crawl scope", () => {
  it("allows the site domain and subdomains", () => {
    expect(isHostnameWithinDomain("example.com", "example.com")).toBe(true);
    expect(isHostnameWithinDomain("www.example.com", "example.com")).toBe(true);
    expect(isHostnameWithinDomain("blog.example.com", "example.com")).toBe(true);
    expect(isHostnameWithinDomain("example.net", "example.com")).toBe(false);
    expect(isHostnameWithinDomain("badexample.com", "example.com")).toBe(false);
  });

  it("blocks localhost and private or link-local IP addresses", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("127.0.0.1")).toBe(true);
    expect(isBlockedHostname("10.0.0.5")).toBe(true);
    expect(isBlockedHostname("172.16.0.5")).toBe(true);
    expect(isBlockedHostname("192.168.0.5")).toBe(true);
    expect(isBlockedHostname("169.254.169.254")).toBe(true);
    expect(isBlockedHostname("::1")).toBe(true);
    expect(isBlockedHostname("fd00::1")).toBe(true);
    expect(isBlockedHostname("fe80::1")).toBe(true);
    expect(isBlockedHostname("93.184.216.34")).toBe(false);
  });

  it("validates crawl URLs against the allowed site domain", () => {
    expect(isUrlAllowedForCrawl("https://example.com/", "example.com")).toBe(true);
    expect(isUrlAllowedForCrawl("https://blog.example.com/post", "example.com")).toBe(true);
    expect(isUrlAllowedForCrawl("https://example.net/", "example.com")).toBe(false);
    expect(isUrlAllowedForCrawl("http://localhost:3000/", "example.com")).toBe(false);
    expect(isUrlAllowedForCrawl("http://169.254.169.254/latest/meta-data", "example.com")).toBe(
      false,
    );
  });
});
