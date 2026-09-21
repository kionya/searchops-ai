import { describe, expect, it } from "vitest";

import { createTelegramNotifier } from "./telegram.js";

describe("telegram notifier (T7)", () => {
  it("is a no-op (null) without token or chat id", () => {
    expect(createTelegramNotifier({ botToken: undefined, chatId: "1" })).toBeNull();
    expect(createTelegramNotifier({ botToken: "t", chatId: undefined })).toBeNull();
  });

  it("posts sendMessage with the expected payload and surfaces HTTP failures", async () => {
    const calls: { url: string; body: unknown }[] = [];
    let status = 200;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(status === 200 ? "{}" : '{"description":"Bad Request: chat not found"}', { status });
    }) as typeof fetch;
    const notifier = createTelegramNotifier({ botToken: "tok", chatId: "-100", fetchImpl });
    await notifier?.sendMessage("hello");
    expect(calls).toEqual([
      {
        url: "https://api.telegram.org/bottok/sendMessage",
        body: { chat_id: "-100", disable_web_page_preview: true, text: "hello" }
      }
    ]);
    status = 500;
    await expect(notifier?.sendMessage("x")).rejects.toThrow("HTTP 500: {\"description\":\"Bad Request: chat not found\"}");
  });
});
