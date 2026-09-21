import { describe, expect, it } from "vitest";

import { classifyGeoCitationDomain } from "./domain-taxonomy.js";

const targetDomain = "example.com";

describe("domain-taxonomy (T1)", () => {
  it("classifies owned, platform, community, competitor, other", () => {
    expect(classifyGeoCitationDomain("example.com", { targetDomain })).toBe("owned");
    expect(classifyGeoCitationDomain("blog.example.com", { targetDomain })).toBe("owned");
    expect(classifyGeoCitationDomain("www.gangnamunni.com", { targetDomain })).toBe("platform");
    expect(classifyGeoCitationDomain("m.blog.naver.com", { targetDomain })).toBe("community");
    expect(classifyGeoCitationDomain("clinic.tistory.com", { targetDomain })).toBe("community");
    expect(
      classifyGeoCitationDomain("rival.com", { targetDomain, competitorDomains: ["rival.com"] })
    ).toBe("competitor");
    expect(classifyGeoCitationDomain("unknown-site.net", { targetDomain })).toBe("other");
  });

  it("competitor beats platform, owned beats competitor", () => {
    expect(
      classifyGeoCitationDomain("gangnamunni.com", { targetDomain, competitorDomains: ["gangnamunni.com"] })
    ).toBe("competitor");
    expect(
      classifyGeoCitationDomain("example.com", { targetDomain, competitorDomains: ["example.com"] })
    ).toBe("owned");
  });
});
