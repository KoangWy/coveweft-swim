import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

/** Returns the signed-in user or `UNAUTHENTICATED` when there is no session. */
export async function getAuthenticatedUser(
  supabase: SupabaseClient,
): Promise<Result<AuthenticatedUser>> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return fail("UNAUTHENTICATED");
  }

  return ok({ id: data.user.id, email: data.user.email ?? null });
}

/**
 * Requires a signed-in administrator. The role is read through the caller's
 * own session, so a customer always receives `FORBIDDEN`.
 */
export async function requireAdmin(supabase: SupabaseClient): Promise<Result<AuthenticatedUser>> {
  const user = await getAuthenticatedUser(supabase);

  if (!user.ok) {
    return user;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.data.id)
    .maybeSingle();

  if (error) {
    return fail(mapDatabaseError(error).code);
  }

  if (data?.role !== "admin") {
    return fail("FORBIDDEN");
  }

  return user;
}
