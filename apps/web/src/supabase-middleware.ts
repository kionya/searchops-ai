import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicSupabaseConfig } from "./supabase-server";

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/sites" ||
    pathname.startsWith("/sites/") ||
    pathname === "/ops/readiness" ||
    pathname.startsWith("/ops/readiness/") ||
    pathname === "/ops/integrations" ||
    pathname.startsWith("/ops/integrations/")
  );
}

function redirectWithSessionHeaders(
  request: NextRequest,
  pathname: string,
  sessionResponse: NextResponse,
): NextResponse {
  const response = NextResponse.redirect(new URL(pathname, request.url));

  sessionResponse.headers.forEach((value, key) => {
    if (key !== "set-cookie" && !key.startsWith("x-middleware-")) {
      response.headers.set(key, value);
    }
  });
  sessionResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));

  return response;
}

export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const config = getPublicSupabaseConfig();
  let authenticated = false;

  if (config !== null) {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          const responseHeaders = new Headers(response.headers);
          Object.entries(headersToSet).forEach(([name, value]) => {
            responseHeaders.set(name, value);
          });
          response = NextResponse.next({
            headers: responseHeaders,
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, options, value }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data, error } = await supabase.auth.getClaims();
    authenticated = error === null && data?.claims != null;
  }

  const { pathname, search } = request.nextUrl;
  if (!authenticated && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return redirectWithSessionHeaders(request, loginUrl.toString(), response);
  }

  if (authenticated && pathname === "/login") {
    return redirectWithSessionHeaders(request, "/sites", response);
  }

  return response;
}
