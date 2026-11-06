#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const DEFAULTS = {
  customerEmail: "customer@demo.coveweft.local",
  customerPassword: "demo-customer-123",
  customerName: "Demo Customer",
  adminEmail: "admin@demo.coveweft.local",
  adminPassword: "demo-admin-123",
  adminName: "Demo Admin",
  policyVersion: "2026-11-06",
};

function parseEnv(contents) {
  const values = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function readEnvFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

function readSupabaseStatus(root) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const attempts = [
    ["supabase", ["status", "-o", "env"]],
    [pnpm, ["dlx", "supabase", "status", "-o", "env"]],
  ];

  for (const [command, args] of attempts) {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });

    if (result.status === 0) {
      return parseEnv(result.stdout);
    }
  }

  return {};
}

function isAlreadyRegistered(error) {
  return (
    error?.code === "email_exists" ||
    error?.code === "user_already_exists" ||
    /already registered|already exists/i.test(error?.message ?? "")
  );
}

async function findUserByEmail(client, email) {
  const normalized = email.toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalized);

    if (user) {
      return user;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }

  return null;
}

async function ensureAccount(client, { email, password, fullName, role, policyVersion }) {
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      privacy_policy_version: policyVersion,
    },
  });

  let user = created.data?.user ?? null;
  let wasCreated = Boolean(user);

  if (created.error) {
    if (!isAlreadyRegistered(created.error)) {
      throw created.error;
    }

    user = await findUserByEmail(client, email);
    wasCreated = false;

    if (!user) {
      throw new Error(`Could not find the existing account for ${email}.`);
    }
  }

  if (!user) {
    throw new Error(`The auth server did not return the account for ${email}.`);
  }

  if (!user.email_confirmed_at) {
    const confirmed = await client.auth.admin.updateUserById(user.id, { email_confirm: true });

    if (confirmed.error) {
      throw confirmed.error;
    }
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, privacy_consent_at, privacy_policy_version")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile) {
    const inserted = await client.from("profiles").insert({
      id: user.id,
      role,
      full_name: fullName,
      privacy_consent_at: new Date().toISOString(),
      privacy_policy_version: policyVersion,
    });

    if (inserted.error) {
      throw inserted.error;
    }
  } else {
    const patch = { role };

    if (!profile.privacy_consent_at || !profile.privacy_policy_version) {
      patch.privacy_consent_at = new Date().toISOString();
      patch.privacy_policy_version = policyVersion;
    }

    const updated = await client.from("profiles").update(patch).eq("id", user.id);

    if (updated.error) {
      throw updated.error;
    }
  }

  return {
    id: user.id,
    email: user.email ?? email,
    role,
    created: wasCreated,
  };
}

/**
 * Creates the demo customer and administrator through the Auth Admin API.
 * Re-running keeps existing passwords and does not duplicate accounts.
 */
export async function provisionDemoAccounts({ url, secretKey, customer, admin, policyVersion }) {
  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const customerAccount = await ensureAccount(client, {
    email: customer.email,
    password: customer.password,
    fullName: customer.fullName,
    role: "customer",
    policyVersion,
  });

  const adminAccount = await ensureAccount(client, {
    email: admin.email,
    password: admin.password,
    fullName: admin.fullName,
    role: "admin",
    policyVersion,
  });

  return { customer: customerAccount, admin: adminAccount };
}

export function resolveConfig(root = resolve(import.meta.dirname, ".."), env = process.env) {
  const fileEnv = readEnvFile(resolve(root, ".env.local"));
  const merged = { ...fileEnv, ...env };
  let url =
    merged.SUPABASE_URL_INTERNAL ?? merged.SUPABASE_URL ?? merged.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let secretKey = merged.SUPABASE_SECRET_KEY ?? "";

  if (!url || !secretKey) {
    const statusEnv = readSupabaseStatus(root);
    url = url || statusEnv.API_URL || "http://127.0.0.1:54321";
    secretKey = secretKey || statusEnv.SECRET_KEY || statusEnv.SERVICE_ROLE_KEY || "";
  }

  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is required. Run `supabase status` and copy the secret key into " +
        ".env.local, or export it before running `pnpm provision:demo`.",
    );
  }

  return {
    url,
    secretKey,
    policyVersion: merged.DEMO_POLICY_VERSION || DEFAULTS.policyVersion,
    customer: {
      email: merged.DEMO_CUSTOMER_EMAIL || DEFAULTS.customerEmail,
      password: merged.DEMO_CUSTOMER_PASSWORD || DEFAULTS.customerPassword,
      fullName: merged.DEMO_CUSTOMER_NAME || DEFAULTS.customerName,
    },
    admin: {
      email: merged.DEMO_ADMIN_EMAIL || DEFAULTS.adminEmail,
      password: merged.DEMO_ADMIN_PASSWORD || DEFAULTS.adminPassword,
      fullName: merged.DEMO_ADMIN_NAME || DEFAULTS.adminName,
    },
  };
}

async function main() {
  try {
    const config = resolveConfig();
    const result = await provisionDemoAccounts(config);

    console.log("Demo accounts ready.");
    console.log(
      `  customer  ${result.customer.email}  (${result.customer.created ? "created" : "existing"})`,
    );
    console.log(
      `  admin     ${result.admin.email}  (${result.admin.created ? "created" : "existing"})`,
    );
  } catch (error) {
    console.error(`Could not provision demo accounts: ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
