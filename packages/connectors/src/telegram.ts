// 텔레그램 봇 sendMessage 최소 클라이언트. 운영 알림(api)과 제품 알림(worker 주간 요약)이 같이 쓴다.
// 토큰·chat_id 가 없으면 createTelegramNotifier 가 null 을 돌려주고 호출자는 no-op 한다.

export interface TelegramNotifierOptions {
  readonly botToken: string;
  readonly chatId: string;
  readonly fetchImpl?: typeof fetch | undefined;
}

export interface TelegramNotifier {
  readonly chatId: string;
  sendMessage(text: string): Promise<void>;
}

export function createTelegramNotifier(
  options: { readonly botToken?: string | undefined; readonly chatId?: string | undefined; readonly fetchImpl?: typeof fetch | undefined }
): TelegramNotifier | null {
  const { botToken, chatId, fetchImpl } = options;
  if (!botToken || !chatId) {
    return null;
  }
  const fetchFn = fetchImpl ?? fetch;
  return {
    chatId,
    async sendMessage(text) {
      // ponytail: 4096자 상한은 텔레그램 쪽 제한. 넘기면 잘라 보낸다 — 분할 전송은 요약이 길어질 때.
      const response = await fetchFn(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        body: JSON.stringify({ chat_id: chatId, disable_web_page_preview: true, text: text.slice(0, 4096) }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      if (!response.ok) {
        // 400 은 대개 chat_id 오류(채널은 -100 접두, 봇이 채팅에 없음). 본문의 description 을 남긴다.
        const body = await response.text().catch(() => "");
        throw new Error(`Telegram sendMessage failed with HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
    }
  };
}
