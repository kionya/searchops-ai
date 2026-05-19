import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CrawlerPageSnapshotSchema } from "@searchops/types";
import { describe, expect, it } from "vitest";

import { extractSeoSignals } from "./signals.js";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

function fixture(name: string): string {
  return readFileSync(resolve(fixtureRoot, name), "utf8");
}

describe("extractSeoSignals", () => {
  it("extracts deterministic signals from normal HTML", () => {
    const snapshot = extractSeoSignals({
      url: "https://example.com/services/",
      html: fixture("normal.html")
    });

    expect(CrawlerPageSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.title).toBe("SearchOps Services");
    expect(snapshot.metaDescription).toBe("SEO automation services for clinics.");
    expect(snapshot.robotsMeta).toBe("index, follow");
    expect(snapshot.canonicalUrl).toBe("https://example.com/services");
    expect(snapshot.h1Count).toBe(1);
    expect(snapshot.h2Count).toBe(2);
    expect(snapshot.links.internal.map((link) => link.url)).toEqual([
      "https://example.com/services/audit",
      "https://example.com/contact?a=1&b=2"
    ]);
    expect(snapshot.links.external.map((link) => link.url)).toEqual([
      "https://external.example/resource"
    ]);
    expect(snapshot.images).toEqual([
      {
        src: "/images/audit.png",
        url: "https://example.com/images/audit.png",
        alt: "Audit dashboard",
        hasAlt: true
      }
    ]);
    expect(snapshot.jsonLd).toHaveLength(1);
    expect(snapshot.jsonLd[0]?.parsed).toMatchObject({ "@type": "MedicalBusiness" });
    expect(snapshot.indexability).toEqual({
      noindex: false,
      nofollow: false,
      canonicalMismatch: false,
      robotsBlocked: null
    });
    expect(snapshot.content.wordCount).toBeGreaterThan(5);
    expect(snapshot.content.duplicateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns null title for documents without a title", () => {
    const snapshot = extractSeoSignals({
      url: "https://example.com/missing-title",
      html: fixture("missing-title.html")
    });

    expect(snapshot.title).toBeNull();
    expect(snapshot.metaDescription).toBe("Page without a title tag.");
  });

  it("counts multiple h1 tags and preserves heading text order", () => {
    const snapshot = extractSeoSignals({
      url: "https://example.com/multiple-h1",
      html: fixture("multiple-h1.html")
    });

    expect(snapshot.h1Count).toBe(2);
    expect(snapshot.headings.h1).toEqual(["Primary Heading", "Unexpected Second Heading"]);
  });

  it("detects noindex and nofollow from robots meta", () => {
    const snapshot = extractSeoSignals({
      url: "https://example.com/noindex",
      html: fixture("noindex.html")
    });

    expect(snapshot.robotsMeta).toBe("noindex, nofollow");
    expect(snapshot.indexability.noindex).toBe(true);
    expect(snapshot.indexability.nofollow).toBe(true);
  });

  it("detects canonical mismatch against the final page URL", () => {
    const snapshot = extractSeoSignals({
      url: "https://example.com/services",
      finalUrl: "https://example.com/services?utm=ignored#top",
      html: fixture("canonical.html")
    });

    expect(snapshot.finalUrl).toBe("https://example.com/services?utm=ignored");
    expect(snapshot.canonicalUrl).toBe("https://example.com/canonical-target");
    expect(snapshot.indexability.canonicalMismatch).toBe(true);
  });

  it("extracts valid and invalid JSON-LD blocks deterministically", () => {
    const snapshot = extractSeoSignals({
      url: "https://example.com/jsonld",
      html: fixture("jsonld.html")
    });

    expect(snapshot.jsonLd).toHaveLength(2);
    expect(snapshot.jsonLd[0]?.parsed).toMatchObject({ "@type": "Article" });
    expect(snapshot.jsonLd[1]?.parsed).toBeNull();
  });

  it("marks images without meaningful alt text", () => {
    const snapshot = extractSeoSignals({
      url: "https://example.com/images",
      html: fixture("images-alt.html")
    });

    expect(snapshot.images).toEqual([
      {
        src: "/missing-alt.jpg",
        url: "https://example.com/missing-alt.jpg",
        alt: null,
        hasAlt: false
      },
      {
        src: "/empty-alt.jpg",
        url: "https://example.com/empty-alt.jpg",
        alt: "",
        hasAlt: false
      },
      {
        src: "data:image/png;base64,abc",
        url: null,
        alt: "Inline image",
        hasAlt: true
      }
    ]);
  });
});
