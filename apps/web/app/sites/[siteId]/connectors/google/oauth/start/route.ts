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
      throw new Error(`OAuth start failed: ${response.status}`);
    }

    const payload = StartConnectorOAuthResponseSchema.parse(await response.json());

    return NextResponse.redirect(payload.authorizationUrl);
  } catch {
    connectorsUrl.searchParams.set("oauth", "failed");
    return NextResponse.redirect(connectorsUrl);
  }
}
