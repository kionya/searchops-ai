import { describe, expect, it, vi } from "vitest";

import { createDnsCitationDomainResolver, filterUnresolvedCitations } from "./dns-citation.js";

const real = "https://banobagi.com/a";
const fake = "https://exampleclinic-kangnam.com/price";
const fakeOther = "https://exampleclinic-seocho.com/price";

function resolverFor(liveDomains: readonly string[]) {
  const lookup = vi.fn(async (domain: string) => {
    if (!liveDomains.includes(domain)) {
      throw new Error("ENOTFOUND");
    }
    return ["1.2.3.4"];
  });
  return { lookup, resolver: createDnsCitationDomainResolver({ lookup }) };
}

describe("dns citation verification", () => {
  it("환각 도메인만 인용에서 제거하고 답변 원문은 건드리지 않는다", async () => {
    const { resolver } = resolverFor(["banobagi.com"]);
    const observations = [
      { answerText: `강남X클리닉 ${fake} 를 확인하세요`, citedUrls: [real, fake] },
      { answerText: "다른 답변", citedUrls: [fakeOther] }
    ];

    const result = await filterUnresolvedCitations(observations, resolver);

    expect(result.observations[0]?.citedUrls).toEqual([real]);
    expect(result.observations[1]?.citedUrls).toEqual([]);
    expect(result.observations[0]?.answerText).toContain(fake);
    expect(result.unresolved).toBe(2);
  });

  it("전부 실재하면 관측 객체를 그대로 돌려주고 경고도 없다", async () => {
    const { resolver } = resolverFor(["banobagi.com"]);
    const observations = [{ answerText: "x", citedUrls: [real] }];

    const result = await filterUnresolvedCitations(observations, resolver);

    expect(result.unresolved).toBe(0);
    expect(result.observations[0]).toBe(observations[0]);
  });

  it("같은 도메인은 한 번만 조회한다", async () => {
    const { lookup, resolver } = resolverFor(["banobagi.com"]);

    await filterUnresolvedCitations(
      [
        { answerText: "a", citedUrls: ["https://banobagi.com/1", "https://banobagi.com/2"] },
        { answerText: "b", citedUrls: ["https://banobagi.com/3"] }
      ],
      resolver,
    );

    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("URL 로 파싱되지 않으면 DNS 로 판단하지 않고 남긴다", async () => {
    const { resolver } = resolverFor([]);

    const result = await filterUnresolvedCitations([{ answerText: "x", citedUrls: ["not a url"] }], resolver);

    expect(result.observations[0]?.citedUrls).toEqual(["not a url"]);
    expect(result.unresolved).toBe(0);
  });
});
