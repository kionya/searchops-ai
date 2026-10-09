import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CrawlerPageSnapshotSchema } from "@searchops/types";
import { describe, expect, it } from "vitest";

import { parseHtml } from "./html.js";
import {
  extractSeoSignals,
  extractTextBlocks,
  stripBoilerplateBlocks
} from "./signals.js";

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

describe("본문 블록 추출·보일러플레이트 제거", () => {
  it("블록 태그 경계로 텍스트를 쪼갠다", () => {
    const $ = parseHtml("<body><nav><ul><li>메뉴</li></ul></nav><p>본문 한 줄</p></body>");
    expect(extractTextBlocks($)).toEqual(["메뉴", "본문 한 줄"]);
  });

  it("블록 요소 '앞'의 인라인 텍스트를 첫 블록에 붙이지 않는다", () => {
    // 브레드크럼이 메뉴 첫 항목과 한 덩어리가 되면 페이지마다 달라져 공통 블록 판정을 빠져나간다.
    const $ = parseHtml(
      "<body><div class=\"gnb\">HOME &gt; 서브페이지 1<ul><li>시술후기</li><li>전후사진</li></ul></div><p>본문</p></body>",
    );
    expect(extractTextBlocks($)).toEqual(["HOME > 서브페이지 1", "시술후기", "전후사진", "본문"]);
  });

  it("최소 페이지 수 미만이면 아무것도 제거하지 않는다", () => {
    const pages = [["공통"], ["공통"]];
    expect(stripBoilerplateBlocks(pages)).toEqual({
      texts: ["공통", "공통"],
      removedBlockCount: 0,
      removedBlocks: []
    });
  });

  it("임계 비율 이상 반복된 블록만 제거하고 원문 형태를 유지한다", () => {
    const result = stripBoilerplateBlocks([
      ["Keep Your Beauty", "첫 페이지"],
      ["Keep Your Beauty", "둘째 페이지"],
      ["Keep Your Beauty", "셋째 페이지"]
    ]);
    expect(result).toEqual({
      texts: ["첫 페이지", "둘째 페이지", "셋째 페이지"],
      removedBlockCount: 3,
      removedBlocks: ["Keep Your Beauty"]
    });
  });

  it("제거한 공통 블록을 중복 없이 첫 등장 순서로 돌려준다", () => {
    // 버려지면 전 페이지 푸터의 진짜 위반이 반복될수록 사라진다. 호출자가 1회 검수할 수 있어야 한다.
    const result = stripBoilerplateBlocks([
      ["메뉴", "100% 효과 보장", "첫 페이지"],
      ["메뉴", "100% 효과 보장", "둘째 페이지"],
      ["메뉴", "100% 효과 보장", "셋째 페이지"]
    ]);
    expect(result.removedBlocks).toEqual(["메뉴", "100% 효과 보장"]);
    expect(result.removedBlockCount).toBe(6);
    expect(result.texts).toEqual(["첫 페이지", "둘째 페이지", "셋째 페이지"]);
  });

  it("대조는 대소문자를 무시하지만 같은 입력이면 항상 같은 출력이다", () => {
    const pages = [["Login", "a 본문"], ["login", "b 본문"], ["LOGIN", "c 본문"]];
    const first = stripBoilerplateBlocks(pages);
    expect(first.texts).toEqual(["a 본문", "b 본문", "c 본문"]);
    expect(stripBoilerplateBlocks(pages)).toEqual(first);
  });
});
