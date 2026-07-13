import { createServerClient } from "@supabase/ssr";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";

export interface PublicSupabaseConfig {
  readonly key: string;
  readonly url: string;
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return url && key ? { key, url } : null;
}

function isServerComponentCookieWriteError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith(
      "Cookies can only be modified in a Server Action or Route Handler.",
    )
  );
}

export async function getSupabaseServerClient() {
  // Middleware owns SSR response headers; server callers disable caching here.
  noStore();

  const config = getPublicSupabaseConfig();
  if (config === null) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          if (!isServerComponentCookieWriteError(error)) {
            throw error;
          }
        }
      },
    },
  });
}
