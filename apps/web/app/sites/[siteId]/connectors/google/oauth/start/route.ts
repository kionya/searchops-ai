import { NextResponse } from "next/server";
import { StartConnectorOAuthResponseSchema } from "@searchops/types";

import { getApiBaseUrl } from "../../../../../../../src/api-base-url";
import { apiFetchAsUser } from "../../../../../../../src/api-client";
import { getSupabaseServerClient } from "../../../../../../../src/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly siteId: string }> },
) {
  const { siteId } = await context.params;
  const requestUrl = new URL(request.url);
  const providers = requestUrl.searchParams.get("providers") ?? "gsc,ga4";
  const returnTo = requestUrl.searchParams.get("returnTo");
  const connectorsUrl = new URL(`/sites/${siteId}/connectors`, requestUrl.origin);

  const supabase = await getSupabaseServerClient();
  const accessToken =
    supabase === null ? null : (await supabase.auth.getSession()).data.session?.access_token;
  if (!accessToken) {
    connectorsUrl.searchParams.set("oauth", "authentication_required");
    return NextResponse.redirect(connectorsUrl);
  }

  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    connectorsUrl.searchParams.set("oauth", "not_configured");
    return NextResponse.redirect(connectorsUrl);
  }

  // 이 catch 가 이유를 통째로 삼켜서 화면에 oauth=failed 만 남았다. API 가 왜 거절했는지
  // (OAuth 미구성 503, 권한 403, state 저장소 503 …) 는 사용자도 운영자도 볼 방법이
  // 없었다. 실패 코드를 그대로 들고 나간다 — 값이 아니라 코드라 노출해도 안전하다.
  let reason = "api_unreachable";
  try {
    const startUrl = new URL(
      `${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/connectors/google/oauth/start`,
    );
    startUrl.searchParams.set("providers", providers);
    startUrl.searchParams.set("format", "json");
    if (returnTo !== null && returnTo.length > 0) {
      startUrl.searchParams.set("returnTo", returnTo);
    }

    const response = await apiFetchAsUser(startUrl.toString(), accessToken, {
      cache: "no-store",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
      const code = typeof body?.error === "string" ? body.error : "";
      // 에러 코드만 통과시킨다. 본문을 그대로 실어 나르면 언젠가 값이 섞여 나간다.
      reason = /^[a-z_]{1,40}$/.test(code) ? code : `http_${response.status}`;
      throw new Error(reason);
    }

    reason = "invalid_response";
    const payload = StartConnectorOAuthResponseSchema.parse(await response.json());

    return NextResponse.redirect(payload.authorizationUrl);
  } catch {
    connectorsUrl.searchParams.set("oauth", "failed");
    connectorsUrl.searchParams.set("oauthReason", reason);
    return NextResponse.redirect(connectorsUrl);
  }
}
