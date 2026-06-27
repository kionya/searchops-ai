import { NextResponse } from "next/server";

import { getApiBaseUrl } from "../../../../../../../src/api-base-url";
import { apiFetch } from "../../../../../../../src/api-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Google OAuth 연결 시작 — 브라우저가 직접 열 수 있는 웹 엔드포인트.
 *
 * API의 `/sites/:id/connectors/google/oauth/start` 는 IdP 인증 게이트 뒤에 있어,
 * 브라우저가 직접 열면 401("Authentication is required.")이 난다. 이 핸들러가
 * 서버사이드에서 owner 서비스 토큰(apiFetch)으로 `?format=json` 인증 URL을 받아
 * 브라우저를 Google 동의 화면으로 리다이렉트한다. (OAuth 콜백은 공개 라우트.)
 */
export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly siteId: string }> },
) {
  const { siteId } = await context.params;
  const requestUrl = new URL(request.url);
  const providers = requestUrl.searchParams.get("providers") ?? "gsc,ga4";
  const returnTo = requestUrl.searchParams.get("returnTo");
  const connectorsUrl = new URL(`/sites/${siteId}/connectors`, requestUrl.origin);

  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    connectorsUrl.searchParams.set("oauth", "not_configured");
    return NextResponse.redirect(connectorsUrl);
  }

  try {
    const startUrl = new URL(
      `${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/connectors/google/oauth/start`,
    );
    startUrl.searchParams.set("providers", providers);
    startUrl.searchParams.set("format", "json");
    if (returnTo !== null && returnTo.length > 0) {
      startUrl.searchParams.set("returnTo", returnTo);
    }

    const response = await apiFetch(startUrl.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`OAuth start failed: ${response.status}`);
    }

    const payload = (await response.json()) as { readonly authorizationUrl?: unknown };
    const authorizationUrl =
      typeof payload.authorizationUrl === "string" ? payload.authorizationUrl : "";
    if (authorizationUrl.length === 0) {
      throw new Error("OAuth start returned no authorizationUrl");
    }

    return NextResponse.redirect(authorizationUrl);
  } catch {
    connectorsUrl.searchParams.set("oauth", "failed");
    return NextResponse.redirect(connectorsUrl);
  }
}
