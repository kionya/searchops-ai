import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 운영 알림 어댑터(API의 SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL)가 POST 하는
 *   { alerts, kind: "searchops.operational_alerts", payload }
 * 페이로드를 수신하는 인증된 테스트 sink.
 *
 * Authorization: Bearer <token> 을 SEARCHOPS_OPS_ALERT_SINK_TOKEN 과 상수시간 비교한 뒤
 * 수신 내용을 Vercel 함수 로그에 기록하고 200 을 반환한다(어댑터가 non-2xx 에 throw 하여
 * /ops/metrics-export 를 500 으로 만들지 않도록). 추후 Slack/Discord 릴레이로 확장 지점.
 *
 * 본인 인프라(기존 Vercel 웹앱) 내부에만 데이터가 남으며, 공개 request-bin 으로의 유출이 없다.
 */

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.SEARCHOPS_OPS_ALERT_SINK_TOKEN?.trim();
  if (!expected) {
    console.error("[ops-alert-sink] SEARCHOPS_OPS_ALERT_SINK_TOKEN 미설정 — sink 비활성");
    return NextResponse.json({ error: "sink_not_configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || !constantTimeEquals(token, expected)) {
    console.warn("[ops-alert-sink] 인증 실패 (authorization header present=%s)", header ? "yes" : "no");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const record = body as { kind?: unknown; alerts?: unknown } | null;
  const kind = typeof record?.kind === "string" ? record.kind : "unknown";
  const alertCount = Array.isArray(record?.alerts) ? record.alerts.length : 0;

  console.log(
    "[ops-alert-sink] received kind=%s alerts=%d payload=%s",
    kind,
    alertCount,
    JSON.stringify(body),
  );

  return NextResponse.json({ ok: true, kind, received: alertCount }, { status: 200 });
}

/** 라우트 존재/배포 확인용 비민감 liveness 프로브. */
export function GET(): Response {
  return NextResponse.json({ ok: true, sink: "ops-alert-sink" }, { status: 200 });
}
