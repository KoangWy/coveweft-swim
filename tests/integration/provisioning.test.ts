import { execFileSync } from "node:child_process";

import { afterAll, describe, expect, it } from "vitest";

import { createAnonClient, createServiceClient, uniqueEmail } from "./support/clients";
import { deleteTestUsers, findUserByEmail } from "./support/service-fixtures";

function runProvisioning(overrides: Record<string, string>): string {
  return execFileSync("node", ["scripts/provision-demo.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, ...overrides },
    encoding: "utf8",
  });
}

describe("demo account provisioning", () => {
  const service = createServiceClient();
  const customerEmail = uniqueEmail("provision-customer");
  const adminEmail = uniqueEmail("provision-admin");
  const customerPassword = "demo-customer-123";
  const adminPassword = "demo-admin-123";
  const overrides = {
    DEMO_CUSTOMER_EMAIL: customerEmail,
    DEMO_CUSTOMER_PASSWORD: customerPassword,
    DEMO_CUSTOMER_NAME: "Provisioned Customer",
    DEMO_ADMIN_EMAIL: adminEmail,
    DEMO_ADMIN_PASSWORD: adminPassword,
    DEMO_ADMIN_NAME: "Provisioned Admin",
    DEMO_POLICY_VERSION: "2026-11-14",
  };
  let customerId: string | undefined;
  let adminId: string | undefined;

  afterAll(async () => {
    await deleteTestUsers(service, [customerId, adminId]);
  });

  it("creates both accounts and is idempotent", async () => {
    const first = runProvisioning(overrides);

    expect(first).toContain("Demo accounts ready.");
    expect(first).toContain(customerEmail);
    expect(first).toContain(adminEmail);
    expect(first).toContain("(created)");

    const customer = await findUserByEmail(service, customerEmail);
    const admin = await findUserByEmail(service, adminEmail);

    expect(customer).not.toBeNull();
    expect(admin).not.toBeNull();

    customerId = customer?.id;
    adminId = admin?.id;

    const customerProfile = await service
      .from("profiles")
      .select("role, privacy_consent_at, privacy_policy_version")
      .eq("id", customerId)
      .single();
    const adminProfile = await service
      .from("profiles")
      .select("role, privacy_consent_at, privacy_policy_version")
      .eq("id", adminId)
      .single();

    expect(customerProfile.data?.role).toBe("customer");
    expect(customerProfile.data?.privacy_consent_at).not.toBeNull();
    expect(customerProfile.data?.privacy_policy_version).toBe("2026-11-14");
    expect(adminProfile.data?.role).toBe("admin");
    expect(adminProfile.data?.privacy_policy_version).toBe("2026-11-14");

    const second = runProvisioning(overrides);

    expect(second).toContain("(existing)");

    const customerAfter = await findUserByEmail(service, customerEmail);
    const adminAfter = await findUserByEmail(service, adminEmail);

    expect(customerAfter?.id).toBe(customerId);
    expect(adminAfter?.id).toBe(adminId);
  });

  it("keeps an existing password on a rerun", async () => {
    if (!customerId) {
      throw new Error("The first run did not create the customer account.");
    }

    const changedPassword = "changed-password-123";
    const changed = await service.auth.admin.updateUserById(customerId, {
      password: changedPassword,
    });

    expect(changed.error).toBeNull();

    runProvisioning(overrides);

    const newPasswordClient = createAnonClient();
    const newPasswordSignIn = await newPasswordClient.auth.signInWithPassword({
      email: customerEmail,
      password: changedPassword,
    });

    expect(newPasswordSignIn.error).toBeNull();

    const oldPasswordClient = createAnonClient();
    const oldPasswordSignIn = await oldPasswordClient.auth.signInWithPassword({
      email: customerEmail,
      password: customerPassword,
    });

    expect(oldPasswordSignIn.error).not.toBeNull();
  });
});
