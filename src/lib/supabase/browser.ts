import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_AUTH_COOKIE_NAME } from "./cookie";

let browserClient: SupabaseClient | undefined;

/**
 * Returns the singleton browser client. It only uses public environment
 * values and the signed-in user's session; privileged access belongs on the
 * server.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.",
    );
  }

  browserClient ??= createBrowserClient(url, publishableKey, {
    cookieOptions: { name: SUPABASE_AUTH_COOKIE_NAME },
  });

  return browserClient;
}
