import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabaseEnv } from "@/lib/config/env";

/**
 * Creates a Supabase client bound to the current request cookies. Use it in
 * server components, server actions, and route handlers so queries run with
 * the signed-in user's permissions and RLS applies.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot write cookies. The proxy refreshes the
          // session and writes updated cookies on the response instead.
        }
      },
    },
  });
}
