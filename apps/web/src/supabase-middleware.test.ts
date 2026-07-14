import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { updateSupabaseSession } from "./supabase-middleware";

interface CookieAdapter {
  readonly setAll: (
    cookies: readonly { name: string; value: string; options: Record<string, unknown> }[],
    headers: Record<string, string>,
  ) => void;
}

function configureAuth(claims: Record<string, unknown> | null, refreshCookies = false) {
  const getClaims = vi.fn(async () => ({ data: { claims }, error: null }));
  const getSession = vi.fn();
  createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: CookieAdapter }) => ({
      auth: {
        getClaims: refreshCookies
          ? vi.fn(async () => {
              options.cookies.setAll(
                [{ name: "sb-session", value: "refreshed", options: { httpOnly: true } }],
                {
                  "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
                  expires: "0",
                  pragma: "no-cache",
                },
              );
              return { data: { claims }, error: null };
            })
          : getClaims,
        getSession,
      },
    }),
  );
  return { getClaims, getSession };
}

describe("updateSupabaseSession", () => {
  afterEach(() => {
    createServerClient.mockReset();
    vi.unstubAllEnvs();
  });

  it("redirects unauthenticated protected paths with a same-origin next path", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    const { getClaims, getSession } = configureAuth(null);
    const request = new NextRequest(
      "https://searchops.test/sites/site_1?next=https%3A%2F%2Fevil.example",
    );

    const response = await updateSupabaseSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://searchops.test/login?next=%2Fsites%2Fsite_1%3Fnext%3Dhttps%253A%252F%252Fevil.example",
    );
    expect(getClaims).toHaveBeenCalledOnce();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("protects the operational readiness route", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    configureAuth(null);

    const response = await updateSupabaseSession(
      new NextRequest("https://searchops.test/ops/readiness"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://searchops.test/login?next=%2Fops%2Freadiness",
    );
  });

  it("redirects authenticated login requests to sites using getClaims", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon-key");
    const { getClaims, getSession } = configureAuth({ sub: "user_1" });

    const response = await updateSupabaseSession(
      new NextRequest("https://searchops.test/login"),
    );

    expect(response.headers.get("location")).toBe("https://searchops.test/sites");
    expect(getClaims).toHaveBeenCalledOnce();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("keeps legal pages public when unauthenticated", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    configureAuth(null);

    const response = await updateSupabaseSession(
      new NextRequest("https://searchops.test/privacy"),
    );

    expect(response.headers.get("location")).toBeNull();
  });

  it("preserves refreshed cookies and cache-control headers", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    const { getSession } = configureAuth({ sub: "user_1" }, true);

    const response = await updateSupabaseSession(
      new NextRequest("https://searchops.test/sites"),
    );

    expect(response.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    expect(response.headers.get("set-cookie")).toContain("sb-session=refreshed");
    expect(getSession).not.toHaveBeenCalled();
  });
});
