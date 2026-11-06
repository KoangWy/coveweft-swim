#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

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

function readSupabaseStatus() {
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

const fileEnv = readEnvFile(resolve(root, ".env.local"));
const env = {
  ...process.env,
  SUPABASE_URL:
    process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL_INTERNAL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY:
    process.env.SUPABASE_PUBLISHABLE_KEY ?? fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? fileEnv.SUPABASE_SECRET_KEY,
};

if (!env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY) {
  const statusEnv = readSupabaseStatus();
  env.SUPABASE_URL = env.SUPABASE_URL ?? statusEnv.API_URL ?? "http://127.0.0.1:54321";
  env.SUPABASE_PUBLISHABLE_KEY =
    env.SUPABASE_PUBLISHABLE_KEY ?? statusEnv.PUBLISHABLE_KEY ?? statusEnv.ANON_KEY;
  env.SUPABASE_SECRET_KEY =
    env.SUPABASE_SECRET_KEY ?? statusEnv.SECRET_KEY ?? statusEnv.SERVICE_ROLE_KEY;
}

if (!env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY) {
  console.error(
    "Could not resolve the local Supabase keys. Start the stack with `supabase start` " +
      "and copy the publishable and secret keys into .env.local.",
  );
  process.exit(1);
}

const result = spawnSync(
  pnpm,
  ["exec", "vitest", "run", "--config", "vitest.integration.config.mts", ...process.argv.slice(2)],
  { cwd: root, env, stdio: "inherit" },
);

process.exit(result.status ?? 1);
