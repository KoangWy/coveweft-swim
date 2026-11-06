import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";

import { SUPABASE_AUTH_COOKIE_NAME } from "./cookie";

export type SessionCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

/**
 * Refreshes the Supabase session for a proxy request.
 *
 * Updated cookies are written back to the request so the rendered request sees
 * the new session, and collected in `cookiesToSet` so the caller can attach
 * them to its final response. Cache headers supplied by `@supabase/ssr` are
 * collected in `headersToSet` for the same reason.
 *
 * Returns without doing anything when the Supabase environment is absent, so
 * builds and unit tests do not need a running Supabase instance.
 */
export async function refreshSupabaseSession(
  request: NextRequest,
  cookiesToSet: SessionCookie[],
  headersToSet: Record<string, string>,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: { name: SUPABASE_AUTH_COOKIE_NAME },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(newCookies, headers) {
        for (const { name, value } of newCookies) {
          request.cookies.set(name, value);
        }

        cookiesToSet.push(...newCookies);
        Object.assign(headersToSet, headers);
      },
    },
  });

  await supabase.auth.getClaims();
}
