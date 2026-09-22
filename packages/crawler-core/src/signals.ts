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

export function extractVisibleText($: CheerioAPI): string {
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

/**
 * 블록 경계로 볼 태그. 사이트 구조(클래스명)에 기대지 않고 HTML 의미론만 쓴다.
 * 내비게이션이 ul/li 든 div 든 같은 방식으로 쪼개진다.
 */
const BLOCK_BOUNDARY_SELECTOR =
  "address,article,aside,blockquote,br,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,td,th,tr,ul";

/** 페이지를 블록 단위 텍스트로 쪼갠다. 순서·내용은 입력에만 의존한다(결정적). */
export function extractTextBlocks($: CheerioAPI): string[] {
  // extractVisibleText 와 같은 이유로 분기를 복제한다 — body/root 의 Cheerio 제네릭이 다르다.
  if ($("body").length > 0) {
    const root = $("body").first().clone();
    root.find("script, style, noscript, template").remove();
    // 블록 요소 앞뒤에 개행을 심어 .text() 가 블록 경계를 잃지 않게 한다. after 만 심으면
    // 블록 '앞'의 인라인 텍스트(브레드크럼·서브타이틀)가 첫 블록과 한 덩어리로 붙어,
    // 페이지마다 달라진 그 덩어리가 공통 블록 판정을 빠져나간다.
    root.find(BLOCK_BOUNDARY_SELECTOR).before("\n").after("\n");
    return splitTextBlocks(root.text());
  }

  const root = $.root().clone();
  root.find("script, style, noscript, template").remove();
  root.find(BLOCK_BOUNDARY_SELECTOR).before("\n").after("\n");
  return splitTextBlocks(root.text());
}

function splitTextBlocks(text: string): string[] {
  return text
    .split("\n")
    .map((block) => normalizeWhitespace(block))
    .filter((block) => block.length > 0);
}

/**
 * 같은 크롤런의 여러 페이지에 반복되는 블록 = 사이트 공통 요소(내비·푸터·사이드바).
 * 임계값 근거: 25페이지 사이트에서 내비는 100%, 본문은 1페이지(4%)에만 나온다.
 * 0.6 은 그 사이가 넓어 안전하고, 일부 섹션에만 붙는 서브메뉴도 걸러낸다.
 */
export const BOILERPLATE_PAGE_RATIO = 0.6;

/** 페이지가 적으면 "반복"의 근거가 없다. 3페이지 미만이면 아무것도 지우지 않는다. */
export const BOILERPLATE_MIN_PAGES = 3;

export interface StripBoilerplateResult {
  /** 페이지별 본문 텍스트(원문 형태 유지 — evidence.excerpt 가 읽혀야 한다). */
  texts: string[];
  /** 제외한 블록 수(페이지별 합계). 0 이면 제거가 일어나지 않았다는 뜻이다. */
  removedBlockCount: number;
  /**
   * 제외한 공통 블록(중복 제거, 첫 등장 순서). 버리지 않고 호출자가 따로 1회 검수한다 —
   * 전 페이지 푸터·배너에 박힌 위반은 반복될수록(=위험할수록) 사라지면 안 된다.
   */
  removedBlocks: string[];
}

/**
 * 페이지별 블록 배열에서 사이트 공통 블록을 빼고 페이지 고유 본문만 남긴다.
 * 대조는 소문자 정규화 키로 하고, 반환은 원문 블록을 그대로 이어붙인다.
 * 제거한 블록은 removedBlocks 로 돌려준다 — 버리는 것이 아니라 검수 단위를 옮기는 것이다.
 */
export function stripBoilerplateBlocks(pageBlocks: readonly (readonly string[])[]): StripBoilerplateResult {
  if (pageBlocks.length < BOILERPLATE_MIN_PAGES) {
    return {
      texts: pageBlocks.map((blocks) => blocks.join(" ")),
      removedBlockCount: 0,
      removedBlocks: []
    };
  }

  const pageCounts = new Map<string, number>();
  for (const blocks of pageBlocks) {
    for (const key of new Set(blocks.map((block) => block.toLowerCase()))) {
      pageCounts.set(key, (pageCounts.get(key) ?? 0) + 1);
    }
  }

  const threshold = Math.ceil(pageBlocks.length * BOILERPLATE_PAGE_RATIO);
  const removed = new Map<string, string>();
  let removedBlockCount = 0;
  const texts = pageBlocks.map((blocks) => {
    const kept: string[] = [];
    for (const block of blocks) {
      const key = block.toLowerCase();
      if ((pageCounts.get(key) ?? 0) >= threshold) {
        removedBlockCount += 1;
        if (!removed.has(key)) {
          removed.set(key, block);
        }
        continue;
      }
      kept.push(block);
    }
    return kept.join(" ");
  });

  return { texts, removedBlockCount, removedBlocks: [...removed.values()] };
}
