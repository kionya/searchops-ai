import { createHash } from "node:crypto";

import {
  CrawlerPageSnapshotSchema,
  type CrawlerPageSnapshot,
  type ImageSignal,
  type JsonLdBlock,
  type JsonLdParsed,
  type LinkSignal
} from "@searchops/types";
import type { CheerioAPI } from "cheerio";

import { parseHtml } from "./html.js";
import { classifyInternalLink, normalizeUrl } from "./url.js";

export interface ExtractSeoSignalsInput {
  url: string;
  html: string;
  finalUrl?: string;
  robotsBlocked?: boolean | null;
}

export function extractSeoSignals(input: ExtractSeoSignalsInput): CrawlerPageSnapshot {
  const pageUrl = normalizeUrl(input.url);
  const finalUrl = input.finalUrl === undefined ? null : normalizeUrl(input.finalUrl, pageUrl);
  const comparisonUrl = finalUrl ?? pageUrl;
  const $ = parseHtml(input.html);
  const title = firstText($, "title");
  const metaDescription = findMetaContent($, "description");
  const robotsMeta = findMetaContent($, "robots");
  const canonicalUrl = extractCanonicalUrl($, comparisonUrl);
  const h1 = collectTexts($, "h1");
  const h2 = collectTexts($, "h2");
  const robotTokens = parseRobotsTokens(robotsMeta);
  const visibleText = extractVisibleText($);
  const snapshot: CrawlerPageSnapshot = {
    url: pageUrl,
    finalUrl,
    title,
    metaDescription,
    robotsMeta,
    canonicalUrl,
    h1Count: h1.length,
    h2Count: h2.length,
    headings: { h1, h2 },
    links: extractLinks($, comparisonUrl),
    images: extractImages($, comparisonUrl),
    jsonLd: extractJsonLd($),
    indexability: {
      noindex: robotTokens.has("noindex"),
      nofollow: robotTokens.has("nofollow"),
      canonicalMismatch: canonicalUrl !== null && canonicalUrl !== comparisonUrl,
      robotsBlocked: input.robotsBlocked ?? null
    },
    content: {
      textLength: visibleText.length,
      wordCount: countWords(visibleText),
      duplicateHash: hashContent(visibleText)
    }
  };

  return CrawlerPageSnapshotSchema.parse(snapshot);
}

function firstText($: CheerioAPI, selector: string): string | null {
  const value = normalizeWhitespace($(selector).first().text());
  return value.length > 0 ? value : null;
}

function collectTexts($: CheerioAPI, selector: string): string[] {
  return $(selector)
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter((value) => value.length > 0);
}

function findMetaContent($: CheerioAPI, name: string): string | null {
  let content: string | null = null;
  $("meta").each((_index, element) => {
    if (content !== null) {
      return;
    }

    const metaName = ($(element).attr("name") ?? "").trim().toLowerCase();
    if (metaName === name) {
      const value = normalizeWhitespace($(element).attr("content") ?? "");
      content = value.length > 0 ? value : null;
    }
  });

  return content;
}

function extractCanonicalUrl($: CheerioAPI, baseUrl: string): string | null {
  for (const element of $("link[rel]").toArray()) {
    const rel = ($(element).attr("rel") ?? "").toLowerCase().split(/\s+/u);
    if (!rel.includes("canonical")) {
      continue;
    }

    const href = ($(element).attr("href") ?? "").trim();
    if (!href) {
      return null;
    }

    return tryNormalizeUrl(href, baseUrl);
  }

  return null;
}

function extractLinks($: CheerioAPI, baseUrl: string): { internal: LinkSignal[]; external: LinkSignal[] } {
  const internal: LinkSignal[] = [];
  const external: LinkSignal[] = [];

  $("a[href]").each((_index, element) => {
    const href = ($(element).attr("href") ?? "").trim();
    if (!href) {
      return;
    }

    const normalized = tryNormalizeUrl(href, baseUrl);
    if (normalized === null) {
      return;
    }

    const classification = classifyInternalLink(href, baseUrl);
    const signal: LinkSignal = {
      href,
      url: normalized,
      text: normalizeWhitespace($(element).text()),
      rel: normalizeNullableAttribute($(element).attr("rel")),
      target: normalizeNullableAttribute($(element).attr("target")),
      classification
    };

    if (classification === "internal") {
      internal.push(signal);
    } else {
      external.push(signal);
    }
  });

  return { internal, external };
}

function extractImages($: CheerioAPI, baseUrl: string): ImageSignal[] {
  return $("img[src]")
    .toArray()
    .map((element) => {
      const src = ($(element).attr("src") ?? "").trim();
      const altAttribute = $(element).attr("alt");
      const alt = altAttribute === undefined ? null : normalizeWhitespace(altAttribute);
      return {
        src,
        url: src.length > 0 ? tryNormalizeUrl(src, baseUrl) : null,
        alt,
        hasAlt: alt !== null && alt.length > 0
      };
    })
    .filter((image) => image.src.length > 0);
}

function extractJsonLd($: CheerioAPI): JsonLdBlock[] {
  return $("script[type]")
    .toArray()
    .filter((element) => {
      const type = ($(element).attr("type") ?? "").toLowerCase().split(";")[0]?.trim();
      return type === "application/ld+json";
    })
    .map((element) => {
      const raw = normalizeWhitespace($(element).text());
      return raw.length > 0 ? { raw, parsed: parseJson(raw) } : null;
    })
    .filter((block): block is JsonLdBlock => block !== null);
}

function extractVisibleText($: CheerioAPI): string {
  if ($("body").length > 0) {
    const root = $("body").first().clone();
    root.find("script, style, noscript, template").remove();
    return normalizeWhitespace(root.text());
  }

  const root = $.root().clone();
  root.find("script, style, noscript, template").remove();
  return normalizeWhitespace(root.text());
}

function parseRobotsTokens(robotsMeta: string | null): Set<string> {
  if (robotsMeta === null) {
    return new Set();
  }

  return new Set(
    robotsMeta
      .toLowerCase()
      .split(/[\s,]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  );
}

function normalizeNullableAttribute(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function tryNormalizeUrl(input: string, baseUrl: string): string | null {
  try {
    return normalizeUrl(input, baseUrl);
  } catch {
    return null;
  }
}

function countWords(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return text.split(/\s+/u).length;
}

function hashContent(text: string): string {
  return createHash("sha256").update(text.toLowerCase(), "utf8").digest("hex");
}

function parseJson(raw: string): JsonLdParsed {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isJsonLdParsed(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isJsonLdParsed(value: unknown): value is Exclude<JsonLdParsed, null> {
  return typeof value === "object" && value !== null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
