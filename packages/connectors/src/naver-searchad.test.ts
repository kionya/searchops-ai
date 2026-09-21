import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  classifyKeywordVolumeTier,
  createFixtureNaverSearchAdClient,
  createNaverSearchAdClient,
  createNaverSearchAdClientFromEnv,
  createNaverSearchAdHeaders,
  createNaverSearchAdSignature,
  parseNaverKeywordToolResponse,
  parseNaverQcCount
} from "./naver-searchad.js";

const credentials = { accessLicense: "lic", customerId: "123", secretKey: "sec" };

describe("naver searchad (T5)", () => {
  it("signs `${timestamp}.${method}.${uri}` with HMAC-SHA256 base64 and builds headers", () => {
    const expected = createHmac("sha256", "sec").update("1700000000000.GET./keywordstool").digest("base64");
    expect(createNaverSearchAdSignature({ method: "GET", secretKey: "sec", timestamp: "1700000000000", uri: "/keywordstool" })).toBe(expected);
    expect(createNaverSearchAdHeaders(credentials, { method: "GET", timestamp: "1700000000000", uri: "/keywordstool" })).toEqual({
      "X-API-KEY": "lic",
      "X-Customer": "123",
      "X-Signature": expected,
      "X-Timestamp": "1700000000000"
    });
  });

  it("parses fixture payloads including the '< 10' sentinel", () => {
    expect(parseNaverQcCount("< 10")).toBe(9);
    expect(parseNaverQcCount("1,200")).toBe(1200);
    expect(parseNaverQcCount(42.4)).toBe(42);
    expect(parseNaverQcCount(null)).toBe(0);
    expect(
      parseNaverKeywordToolResponse({
        keywordList: [
          { relKeyword: "강남피부과", monthlyPcQcCnt: 1200, monthlyMobileQcCnt: "8,900" },
          { relKeyword: "희귀키워드", monthlyPcQcCnt: "< 10", monthlyMobileQcCnt: "< 10" },
          { relKeyword: "" }
        ]
      })
    ).toEqual([
      { keyword: "강남피부과", monthlyMobile: 8900, monthlyPc: 1200 },
      { keyword: "희귀키워드", monthlyMobile: 9, monthlyPc: 9 }
    ]);
    expect(parseNaverKeywordToolResponse({})).toEqual([]);
  });

  it("classifies the 100/month evidence threshold", () => {
    expect(classifyKeywordVolumeTier({ monthlyMobile: 60, monthlyPc: 40 })).toBe("evidence");
    expect(classifyKeywordVolumeTier({ monthlyMobile: 60, monthlyPc: 39 })).toBe("exploratory");
  });

  it("chunks hint keywords by 5, strips spaces, and surfaces HTTP failures", async () => {
    const urls: string[] = [];
    let status = 200;
    const fetchImpl = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ keywordList: [{ relKeyword: "k", monthlyPcQcCnt: 1, monthlyMobileQcCnt: 2 }] }), { status });
    }) as typeof fetch;
    const client = createNaverSearchAdClient({ credentials, fetchImpl, now: () => 1 });
    const volumes = await client.fetchKeywordVolumes(["a", "b c", "d", "e", "f", "g"]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe("https://api.searchad.naver.com/keywordstool?hintKeywords=a%2Cbc%2Cd%2Ce%2Cf&showDetail=1");
    expect(volumes).toHaveLength(2);
    status = 401;
    await expect(client.fetchKeywordVolumes(["x"])).rejects.toThrow("HTTP 401");
  });

  it("is deterministic in fixture mode and null without env keys", async () => {
    const fixture = createFixtureNaverSearchAdClient();
    expect(await fixture.fetchKeywordVolumes(["강남 피부과"])).toEqual(await fixture.fetchKeywordVolumes(["강남 피부과"]));
    expect(createNaverSearchAdClientFromEnv({})).toBeNull();
    expect(createNaverSearchAdClientFromEnv({
      SEARCHOPS_NAVER_SEARCHAD_ACCESS_LICENSE: "l", SEARCHOPS_NAVER_SEARCHAD_CUSTOMER_ID: "c", SEARCHOPS_NAVER_SEARCHAD_SECRET_KEY: "s"
    })?.mode).toBe("live");
  });
});
