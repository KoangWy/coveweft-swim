import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";
import { parseInput, runService } from "@/server/result";

import { mapAuthError } from "./errors";
import { getAuthenticatedUser } from "./guard";
import { SignInInput, SignUpInput, UpdateProfileInput } from "./schemas";
import type { AuthSession, CurrentUser, UserRole } from "./types";

type ProfileRow = {
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  default_address: string | null;
  privacy_consent_at: string | null;
  privacy_policy_version: string | null;
};

function normalizeNullable(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

async function loadCurrentUser(
  supabase: SupabaseClient,
  user: { id: string; email: string | null },
): Promise<Result<CurrentUser>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, full_name, phone, default_address, privacy_consent_at, privacy_policy_version")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    const mapped = mapDatabaseError(error);
    return fail(mapped.code, mapped.details);
  }

  const profile = data as ProfileRow | null;

  return ok({
    id: user.id,
    email: user.email ?? null,
    role: profile?.role === "admin" ? "admin" : "customer",
    fullName: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
    defaultAddress: profile?.default_address ?? null,
    privacyConsentAt: profile?.privacy_consent_at ?? null,
    privacyPolicyVersion: profile?.privacy_policy_version ?? null,
  });
}

/**
 * Returns the signed-in user with the profile role, or `null` when there is no
 * session. A missing profile is treated as a customer profile; the sign-up
 * trigger creates the row.
 */
export async function getCurrentUser(): Promise<Result<CurrentUser | null>> {
  return runService(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return ok(null);
    }

    return loadCurrentUser(supabase, { id: data.user.id, email: data.user.email ?? null });
  });
}

/**
 * Creates a customer account. Consent and the policy version are checked
 * before `signUp` because the auth server hides the trigger message; the
 * version is also stored in the user metadata for the profile trigger.
 */
export async function signUp(input: unknown): Promise<Result<AuthSession>> {
  return runService(async () => {
    const parsed = parseInput(SignUpInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    if (parsed.data.consent !== true || !parsed.data.policyVersion) {
      return fail("CONSENT_REQUIRED");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          full_name: parsed.data.fullName,
          privacy_policy_version: parsed.data.policyVersion,
        },
      },
    });

    if (error) {
      const mapped = mapAuthError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data.user) {
      return fail("INTERNAL");
    }

    return ok({
      user: { id: data.user.id, email: data.user.email ?? parsed.data.email },
      signedIn: Boolean(data.session),
    });
  });
}

/** Signs a customer or administrator in with email and password. */
export async function signIn(input: unknown): Promise<Result<AuthSession>> {
  return runService(async () => {
    const parsed = parseInput(SignInInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      const mapped = mapAuthError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data.user) {
      return fail("INTERNAL");
    }

    return ok({
      user: { id: data.user.id, email: data.user.email ?? parsed.data.email },
      signedIn: true,
    });
  });
}

/** Clears the current session. */
export async function signOut(): Promise<Result<{ signedOut: true }>> {
  return runService(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      const mapped = mapAuthError(error);
      return fail(mapped.code, mapped.details);
    }

    return ok({ signedOut: true });
  });
}

/** Updates the editable profile columns of the signed-in user. */
export async function updateProfile(input: unknown): Promise<Result<CurrentUser>> {
  return runService(async () => {
    const parsed = parseInput(UpdateProfileInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const patch: {
      full_name?: string | null;
      phone?: string | null;
      default_address?: string | null;
    } = {};

    if (parsed.data.fullName !== undefined) {
      patch.full_name = normalizeNullable(parsed.data.fullName);
    }

    if (parsed.data.phone !== undefined) {
      patch.phone = normalizeNullable(parsed.data.phone);
    }

    if (parsed.data.defaultAddress !== undefined) {
      patch.default_address = normalizeNullable(parsed.data.defaultAddress);
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.data.id)
      .select("id")
      .maybeSingle();

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("NOT_FOUND");
    }

    return loadCurrentUser(supabase, { id: user.data.id, email: user.data.email });
  });
}
