import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type IntegrationEnv = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

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

function readLocalEnv(): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(resolve(process.cwd(), ".env.local"), "utf8"));
  } catch {
    return {};
  }
}

const fileEnv = readLocalEnv();

function read(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key] ?? fileEnv[key];

    if (value) {
      return value;
    }
  }

  return undefined;
}

export const integrationEnv: IntegrationEnv = {
  url: read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") ?? "http://127.0.0.1:54321",
  publishableKey: read("SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? "",
  secretKey: read("SUPABASE_SECRET_KEY") ?? "",
};

if (!integrationEnv.publishableKey || !integrationEnv.secretKey) {
  throw new Error(
    "Integration tests need SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY. " +
      "Run `supabase status` and copy the publishable and secret keys into .env.local, " +
      "or export them before running `pnpm test:integration`.",
  );
}
