import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Holds the Supabase client that the mocked `createSupabaseServerClient`
 * returns. Each test selects the client for the user whose request it is
 * simulating; the mock itself lives in the test file so Vitest can hoist it.
 */
export const serviceClientState: { current: SupabaseClient | null } = {
  current: null,
};

export function selectServiceClient(client: SupabaseClient | null): void {
  serviceClientState.current = client;
}
