import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", async () => {
  const { serviceClientState } = await import("./support/service-context");

  return {
    createSupabaseServerClient: async () => {
      if (!serviceClientState.current) {
        throw new Error("No service client selected for this test.");
      }

      return serviceClientState.current;
    },
  };
});

import { getCurrentUser, signIn, signOut, signUp, updateProfile } from "@/server/auth";

import { createAnonClient, createServiceClient, uniqueEmail } from "./support/clients";
import { deleteTestUsers, findUserByEmail } from "./support/service-fixtures";
import { selectServiceClient } from "./support/service-context";

describe("auth service", () => {
  const service = createServiceClient();
  const email = uniqueEmail("auth-signup");
  const password = "password123";
  const fullName = "Auth Test Customer";
  const policyVersion = "2026-11-06";
  let userId: string | undefined;

  beforeAll(() => {
    selectServiceClient(createAnonClient());
  });

  afterAll(async () => {
    await deleteTestUsers(service, [userId]);
  });

  it("rejects a sign-up without consent before calling the auth server", async () => {
    const client = createAnonClient();
    selectServiceClient(client);

    const result = await signUp({
      email,
      password,
      fullName,
      consent: false,
      policyVersion,
    });

    expect(result).toEqual({ ok: false, error: { code: "CONSENT_REQUIRED" } });
    await expect(findUserByEmail(service, email)).resolves.toBeNull();
  });

  it("rejects a sign-up without a policy version", async () => {
    const client = createAnonClient();
    selectServiceClient(client);

    const result = await signUp({
      email,
      password,
      fullName,
      consent: true,
    });

    expect(result).toEqual({ ok: false, error: { code: "CONSENT_REQUIRED" } });
    await expect(findUserByEmail(service, email)).resolves.toBeNull();
  });

  it("creates an account and stores the consent evidence", async () => {
    const client = createAnonClient();
    selectServiceClient(client);

    const result = await signUp({
      email,
      password,
      fullName,
      consent: true,
      policyVersion,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.data.signedIn).toBe(true);
    expect(result.data.user.email).toBe(email);
    userId = result.data.user.id;

    const current = await getCurrentUser();

    expect(current.ok).toBe(true);

    if (current.ok) {
      expect(current.data?.id).toBe(userId);
      expect(current.data?.role).toBe("customer");
      expect(current.data?.fullName).toBe(fullName);
      expect(current.data?.privacyConsentAt).not.toBeNull();
      expect(current.data?.privacyPolicyVersion).toBe(policyVersion);
    }
  });

  it("maps a duplicate email to EMAIL_TAKEN", async () => {
    const client = createAnonClient();
    selectServiceClient(client);

    const result = await signUp({
      email,
      password,
      fullName,
      consent: true,
      policyVersion,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("EMAIL_TAKEN");
    }
  });

  it("maps a wrong password to INVALID_CREDENTIALS", async () => {
    const client = createAnonClient();
    selectServiceClient(client);

    const result = await signIn({ email, password: "wrong-password" });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CREDENTIALS");
    }
  });

  it("signs in with the correct password", async () => {
    const client = createAnonClient();
    selectServiceClient(client);

    const result = await signIn({ email, password });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.signedIn).toBe(true);
      expect(result.data.user.id).toBe(userId);
    }
  });

  it("updates the editable profile fields", async () => {
    const client = createAnonClient();
    selectServiceClient(client);
    await signIn({ email, password });

    const result = await updateProfile({
      fullName: "Updated Name",
      phone: "0900000000",
      defaultAddress: "1 Demo Street",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.fullName).toBe("Updated Name");
      expect(result.data.phone).toBe("0900000000");
      expect(result.data.defaultAddress).toBe("1 Demo Street");
    }

    const cleared = await updateProfile({ phone: "" });

    expect(cleared.ok && cleared.data.phone).toBeNull();
  });

  it("signs out and clears the current user", async () => {
    const client = createAnonClient();
    selectServiceClient(client);
    await signIn({ email, password });

    const result = await signOut();

    expect(result).toEqual({ ok: true, data: { signedOut: true } });
    await expect(getCurrentUser()).resolves.toEqual({ ok: true, data: null });
  });

  it("requires a session for profile updates", async () => {
    selectServiceClient(createAnonClient());

    const result = await updateProfile({ fullName: "Nobody" });

    expect(result).toEqual({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("validates the sign-up input", async () => {
    selectServiceClient(createAnonClient());

    const result = await signUp({
      email: "not-an-email",
      password,
      fullName,
      consent: true,
      policyVersion,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });
});
