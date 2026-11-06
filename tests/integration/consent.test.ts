import { afterAll, describe, expect, it } from "vitest";

import {
  createAnonClient,
  createServiceClient,
  deleteUsers,
  uniqueEmail,
  type TestUser,
} from "./support/clients";

const PASSWORD = "password123";
const POLICY_VERSION = "2026-11-06";

describe("privacy consent at sign-up", () => {
  const service = createServiceClient();
  const users: TestUser[] = [];

  afterAll(async () => {
    await deleteUsers(service, users);
  });

  it("rejects a sign-up without a privacy policy version", async () => {
    const client = createAnonClient();
    const email = uniqueEmail("no-consent");

    const signUp = await client.auth.signUp({ email, password: PASSWORD });

    expect(signUp.error).not.toBeNull();
    expect(signUp.data.user).toBeNull();

    const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    expect(signIn.error).not.toBeNull();
  });

  it("stores the consent timestamp and version for a valid sign-up", async () => {
    const client = createAnonClient();
    const email = uniqueEmail("consent");

    const signUp = await client.auth.signUp({
      email,
      password: PASSWORD,
      options: {
        data: {
          full_name: "Consent Tester",
          privacy_policy_version: POLICY_VERSION,
        },
      },
    });

    expect(signUp.error).toBeNull();

    const userId = signUp.data.user?.id;

    if (!userId) {
      throw new Error("Expected the sign-up to return a user.");
    }

    users.push({ id: userId, email, password: PASSWORD, client });

    const profile = await service.from("profiles").select("*").eq("id", userId).single();

    expect(profile.error).toBeNull();
    expect(profile.data).toMatchObject({
      id: userId,
      role: "customer",
      full_name: "Consent Tester",
      privacy_policy_version: POLICY_VERSION,
    });
    expect(profile.data?.privacy_consent_at).toBeTruthy();
  });

  it("does not let a customer change consent evidence", async () => {
    const client = createAnonClient();
    const email = uniqueEmail("consent-immutable");

    const signUp = await client.auth.signUp({
      email,
      password: PASSWORD,
      options: { data: { privacy_policy_version: POLICY_VERSION } },
    });

    expect(signUp.error).toBeNull();

    const userId = signUp.data.user?.id;

    if (!userId) {
      throw new Error("Expected the sign-up to return a user.");
    }

    users.push({ id: userId, email, password: PASSWORD, client });

    const update = await client
      .from("profiles")
      .update({ privacy_policy_version: "2099-01-01" })
      .eq("id", userId);

    expect(update.error).not.toBeNull();

    const profile = await service
      .from("profiles")
      .select("privacy_policy_version")
      .eq("id", userId)
      .single();

    expect(profile.data?.privacy_policy_version).toBe(POLICY_VERSION);
  });
});
