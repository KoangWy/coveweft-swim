import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { integrationEnv } from "./env";

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
} as const;

export function createAnonClient(): SupabaseClient {
  return createClient(integrationEnv.url, integrationEnv.publishableKey, clientOptions);
}

export function createServiceClient(): SupabaseClient {
  return createClient(integrationEnv.url, integrationEnv.secretKey, clientOptions);
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

let sequence = 0;

export function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${sequence}@example.com`;
}

export async function createCustomer(
  service: SupabaseClient,
  prefix = "customer",
): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const password = "password123";

  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: `Test ${prefix}`,
      privacy_policy_version: "2026-11-14",
    },
  });

  if (created.error) {
    throw created.error;
  }

  if (!created.data.user) {
    throw new Error("Auth did not return the created user.");
  }

  const client = createAnonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });

  if (signIn.error) {
    throw signIn.error;
  }

  return { id: created.data.user.id, email, password, client };
}

export async function createAdmin(service: SupabaseClient, prefix = "admin"): Promise<TestUser> {
  const user = await createCustomer(service, prefix);

  const updated = await service.from("profiles").update({ role: "admin" }).eq("id", user.id);

  if (updated.error) {
    throw updated.error;
  }

  return user;
}

export async function deleteUsers(
  service: SupabaseClient,
  users: readonly TestUser[],
): Promise<void> {
  await Promise.all(
    users.map(async (user) => {
      const result = await service.auth.admin.deleteUser(user.id);

      if (result.error && result.error.status !== 404) {
        throw result.error;
      }
    }),
  );
}
