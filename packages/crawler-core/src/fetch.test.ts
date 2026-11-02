import { createCipheriv } from "node:crypto";

import { describe, expect, it } from "vitest";

import { fetchUrl, isHtmlFetchResult, solveTestCookieChallenge } from "./fetch.js";

// 2026-11-02 해외 IP 에서 받은 testcookie(암호화 모드) 확인 페이지와 같은 모양. 값만 테스트용으로 만든다.
function challengePage(plainHex: string) {
  const key = "02137f82f1b724f0d4e44d32d7b58c12";
  const iv = "f223b62f894fbcea7fc53eddd2ba2b17";
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(key, "hex"), Buffer.from(iv, "hex")).setAutoPadding(false);
  const data = Buffer.concat([cipher.update(Buffer.from(plainHex, "hex")), cipher.final()]).toString("hex");
  return `<html><body><script type="text/javascript" src="/cupid.js" ></script><script>function toNumbers(d){var e=[];d.replace(/(..)/g,function(d){e.push(parseInt(d,16))});return e}var a=toNumbers("${key}"),b=toNumbers("${iv}"),c=toNumbers("${data}");document.cookie="CUPID="+toHex(slowAES.decrypt(c,2,a,b))+"; expires="+now.toUTCString()+"; path=/";location.href="https://example.com/?ckattempt=1";</script></body></html>`;
}

describe("solveTestCookieChallenge", () => {
  it("decrypts the cookie from a testcookie challenge page", () => {
    expect(solveTestCookieChallenge(challengePage("00112233445566778899aabbccddeeff"))).toBe(
      "CUPID=00112233445566778899aabbccddeeff"
    );
  });

  it("ignores normal pages", () => {
    expect(solveTestCookieChallenge("<html><title>Normal</title></html>")).toBeNull();
  });
});

describe("fetchUrl", () => {
  it("passes a testcookie challenge once and reuses the cookie for later pages on www and apex", async () => {
    const plain = "aabbccddeeff00112233445566778899";
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const cookie = new Headers(init?.headers).get("cookie");
      seen.push(`${String(url)} ${cookie ?? "-"}`);
      return cookie === `CUPID=${plain}`
        ? new Response("<html><title>Real</title></html>", { headers: { "content-type": "text/html" }, status: 200 })
        : new Response(challengePage(plain), { headers: { "content-type": "text/html" }, status: 200 });
    };

    const first = await fetchUrl({ fetchImpl, url: "https://challenge.example/" });
    const second = await fetchUrl({ fetchImpl, url: "https://www.challenge.example/about" });

    expect(first.body).toBe("<html><title>Real</title></html>");
    expect(second.body).toBe("<html><title>Real</title></html>");
    expect(seen).toEqual([
      "https://challenge.example/ -",
      `https://challenge.example/ CUPID=${plain}`,
      `https://www.challenge.example/about CUPID=${plain}`
    ]);
  });

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
