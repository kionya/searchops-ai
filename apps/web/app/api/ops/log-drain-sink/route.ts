import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 운영 메트릭 log drain 어댑터(API의 SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL)가 POST 하는
 *   { kind: "searchops.metrics_export", payload }
 * 페이로드를 수신하는 인증된 self-host sink. (alert-sink와 동일 패턴 — 본인 인프라 내부에만
 * 데이터가 남으며 공개 request-bin 유출이 없다.)
 *
 * Authorization: Bearer <token> 을 SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN 과 상수시간 비교한 뒤
 * 요약을 Vercel 함수 로그에 기록하고 200 을 반환한다(어댑터가 non-2xx 에 throw 하여
 * /ops/metrics-export 를 500 으로 만들지 않도록). 추후 실제 로그 집계기로 교체하는 지점.
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
  const expected = process.env.SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN?.trim();
  if (!expected) {
    console.error("[ops-log-drain-sink] SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN 미설정 — sink 비활성");
    return NextResponse.json({ error: "sink_not_configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || !constantTimeEquals(token, expected)) {
    console.warn("[ops-log-drain-sink] 인증 실패 (authorization header present=%s)", header ? "yes" : "no");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const record = body as { kind?: unknown; payload?: { service?: unknown; generatedAt?: unknown } } | null;
  const kind = typeof record?.kind === "string" ? record.kind : "unknown";
  const service = typeof record?.payload?.service === "string" ? record.payload.service : "unknown";
  const generatedAt =
    typeof record?.payload?.generatedAt === "string" ? record.payload.generatedAt : "unknown";

  console.log(
    "[ops-log-drain-sink] received kind=%s service=%s generatedAt=%s payload=%s",
    kind,
    service,
    generatedAt,
    JSON.stringify(body),
  );

  return NextResponse.json({ ok: true, kind, service }, { status: 200 });
}

/** 라우트 존재/배포 확인용 비민감 liveness 프로브. */
export function GET(): Response {
  return NextResponse.json({ ok: true, sink: "ops-log-drain-sink" }, { status: 200 });
}
