import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  noStore: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/cache", () => ({ unstable_noStore: mocks.noStore }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { getSupabaseServerClient } from "./supabase-server";

interface CookieAdapter {
  readonly getAll: () => unknown;
  readonly setAll: (
    cookies: readonly { name: string; value: string; options: Record<string, unknown> }[],
    headers: Record<string, string>,
  ) => void;
}

function getCookieAdapter(): CookieAdapter {
  const options = mocks.createServerClient.mock.calls[0]?.[2] as
    | { cookies?: CookieAdapter }
    | undefined;
  if (!options?.cookies) {
    throw new Error("cookie adapter was not configured");
  }
  return options.cookies;
}

describe("getSupabaseServerClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns null without a URL or public key and never reads a service key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-be-read");

    await expect(getSupabaseServerClient()).resolves.toBeNull();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("prefers the publishable key and creates a fresh client for each call", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon-key");
    const cookieStore = { getAll: vi.fn(() => []), set: vi.fn() };
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient
      .mockReturnValueOnce({ id: "client-1" })
      .mockReturnValueOnce({ id: "client-2" });

    await expect(getSupabaseServerClient()).resolves.toEqual({ id: "client-1" });
    await expect(getSupabaseServerClient()).resolves.toEqual({ id: "client-2" });

    expect(mocks.createServerClient).toHaveBeenCalledTimes(2);
    expect(mocks.createServerClient).toHaveBeenNthCalledWith(
      1,
      "https://project.supabase.test",
      "publishable-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });

  it("accepts the legacy anon key and adapts getAll/setAll cookies", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon-key");
    const cookieStore = {
      getAll: vi.fn(() => [{ name: "session", value: "old" }]),
      set: vi.fn(),
    };
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient.mockReturnValue({ id: "client" });

    await getSupabaseServerClient();
    const adapter = getCookieAdapter();
    expect(adapter.getAll()).toEqual([{ name: "session", value: "old" }]);
    adapter.setAll(
      [{ name: "session", value: "new", options: { httpOnly: true } }],
      { "cache-control": "private, no-store" },
    );

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.test",
      "legacy-anon-key",
      expect.any(Object),
    );
    expect(cookieStore.set).toHaveBeenCalledWith("session", "new", { httpOnly: true });
  });

  it("ignores only the known Server Component cookie write restriction", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    const cookieStore = {
      getAll: vi.fn(() => []),
      set: vi.fn(() => {
        throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
      }),
    };
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient.mockReturnValue({ id: "client" });

    await getSupabaseServerClient();
    expect(mocks.noStore).toHaveBeenCalledOnce();
    expect(mocks.noStore.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createServerClient.mock.invocationCallOrder[0]!,
    );
    expect(() =>
      getCookieAdapter().setAll([{ name: "session", value: "new", options: {} }], {}),
    ).not.toThrow();

    cookieStore.set.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() =>
      getCookieAdapter().setAll([{ name: "session", value: "new", options: {} }], {}),
    ).toThrow("storage unavailable");
  });
});
