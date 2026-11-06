import "server-only";

import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.url().optional(),
);

const optionalSha256 = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
);

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_URL_INTERNAL: z.url(),
  SUPABASE_SECRET_KEY: optionalString,

  AI_PRIMARY_BASE_URL: z.url().default("https://api.mistral.ai/v1"),
  AI_PRIMARY_MODEL: z.string().min(1).default("deepseek-v4-1-flash-1017"),
  AI_PRIMARY_API_KEY: optionalString,
  AI_FALLBACK_BASE_URL: z.url().default("https://api.mistral.ai/v1"),
  AI_FALLBACK_MODEL: z.string().min(1).default("mistral-small-2603"),
  AI_FALLBACK_API_KEY: optionalString,

  AI_QUOTA_PER_USER_PER_DAY: z.coerce.number().int().positive().default(30),
  AI_QUOTA_PER_USER_PER_MINUTE: z.coerce.number().int().positive().default(5),
  AI_QUOTA_GLOBAL_PER_DAY: z.coerce.number().int().positive().default(500),

  MEDIA_VERSION: optionalString,
  MEDIA_BASE_URL: optionalUrl,
  MEDIA_ARCHIVE_SHA256: optionalSha256,
  GITHUB_TOKEN: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

/**
 * Parses and caches the server environment. Missing or malformed values throw
 * a readable error instead of failing later with `undefined`.
 */
export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    const result = serverEnvSchema.safeParse(process.env);

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");

      throw new Error(`Invalid environment configuration:\n${issues}`);
    }

    cachedEnv = result.data;
  }

  return cachedEnv;
}

export function getSupabaseEnv() {
  const env = getServerEnv();

  return {
    url: env.SUPABASE_URL_INTERNAL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getAdminSupabaseEnv() {
  const env = getServerEnv();

  if (!env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is required for the admin Supabase client.");
  }

  return {
    url: env.SUPABASE_URL_INTERNAL,
    secretKey: env.SUPABASE_SECRET_KEY,
  };
}

export type AiProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type AiConfig = {
  primary: AiProviderConfig;
  fallback: AiProviderConfig | null;
  quotas: {
    perUserPerDay: number;
    perUserPerMinute: number;
    globalPerDay: number;
  };
};

/**
 * Returns the AI configuration, or `null` when no primary key is configured.
 * A missing key must not stop the app from starting; the assistant reports
 * that it is not configured instead.
 */
export function getAiConfig(): AiConfig | null {
  const env = getServerEnv();

  if (!env.AI_PRIMARY_API_KEY) {
    return null;
  }

  return {
    primary: {
      baseUrl: env.AI_PRIMARY_BASE_URL,
      model: env.AI_PRIMARY_MODEL,
      apiKey: env.AI_PRIMARY_API_KEY,
    },
    fallback: env.AI_FALLBACK_API_KEY
      ? {
          baseUrl: env.AI_FALLBACK_BASE_URL,
          model: env.AI_FALLBACK_MODEL,
          apiKey: env.AI_FALLBACK_API_KEY,
        }
      : null,
    quotas: {
      perUserPerDay: env.AI_QUOTA_PER_USER_PER_DAY,
      perUserPerMinute: env.AI_QUOTA_PER_USER_PER_MINUTE,
      globalPerDay: env.AI_QUOTA_GLOBAL_PER_DAY,
    },
  };
}

export type MediaConfig = {
  version: string;
  baseUrl: string;
  archiveSha256: string | null;
};

export function getMediaConfig(): MediaConfig | null {
  const env = getServerEnv();

  if (!env.MEDIA_VERSION || !env.MEDIA_BASE_URL) {
    return null;
  }

  return {
    version: env.MEDIA_VERSION,
    baseUrl: env.MEDIA_BASE_URL,
    archiveSha256: env.MEDIA_ARCHIVE_SHA256 ?? null,
  };
}
