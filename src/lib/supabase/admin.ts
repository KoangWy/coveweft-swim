import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminSupabaseEnv } from "@/lib/config/env";

/**
 * Creates a client with the secret key. It bypasses RLS, so it must only be
 * used by server code and provisioning scripts, never by browser code.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const { url, secretKey } = getAdminSupabaseEnv();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
