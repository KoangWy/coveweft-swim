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

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reasoning effort sent to a provider. An unset variable uses the role
 * default; an empty value means the parameter is not sent at all, because
 * some models reject values they do not support.
 */
function reasoningEffort(defaultValue: string | null) {
  return z
    .string()
    .trim()
    .regex(/^[a-z_]*$/)
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === "" ? null : value));
}

const aiEnvSchema = z.object({
  AI_PRIMARY_BASE_URL: z.url().default("https://api.mistral.ai/v1"),
  AI_PRIMARY_MODEL: z.string().trim().min(1).default("deepseek-v4-1-flash-1017"),
  AI_PRIMARY_API_KEY: optionalString,
  AI_PRIMARY_REASONING_EFFORT: reasoningEffort("low"),
  AI_FALLBACK_BASE_URL: z.url().default("https://api.mistral.ai/v1"),
  AI_FALLBACK_MODEL: z.string().trim().min(1).default("mistral-small-2603"),
  AI_FALLBACK_API_KEY: optionalString,
  AI_FALLBACK_REASONING_EFFORT: reasoningEffort(null),

  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
  AI_MAX_TOKENS: z.coerce.number().int().min(256).max(32_768).default(4096),

  AI_QUOTA_PER_USER_PER_DAY: z.coerce.number().int().positive().default(30),
  AI_QUOTA_PER_USER_PER_MINUTE: z.coerce.number().int().positive().default(5),
  AI_QUOTA_GLOBAL_PER_DAY: z.coerce.number().int().positive().default(500),
  AI_QUOTA_TIME_ZONE: z
    .string()
    .trim()
    .refine(isTimeZone, { message: "Unknown IANA time zone" })
    .default("Asia/Ho_Chi_Minh"),

  AI_HISTORY_MAX_MESSAGES: z.coerce.number().int().min(0).max(50).default(10),
  AI_MESSAGE_MAX_CHARS: z.coerce.number().int().min(50).max(10_000).default(1000),
  AI_HISTORY_MAX_CHARS: z.coerce.number().int().min(100).max(100_000).default(8000),
  AI_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(10).default(4),
  AI_MAX_RESPONSE_CHARS: z.coerce.number().int().min(200).max(50_000).default(4000),
  AI_REQUEST_MAX_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(65_536),
});

const serverEnvSchema = aiEnvSchema.extend({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_URL_INTERNAL: z.url(),
  SUPABASE_SECRET_KEY: optionalString,

  MEDIA_VERSION: optionalString,
  MEDIA_BASE_URL: optionalUrl,
  MEDIA_ARCHIVE_SHA256: optionalSha256,
  GITHUB_TOKEN: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;
let cachedAiEnv: z.infer<typeof aiEnvSchema> | undefined;

function parseEnv<T>(schema: z.ZodType<T>): T {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

/**
 * Parses and caches the server environment. Missing or malformed values throw
 * a readable error instead of failing later with `undefined`.
 */
export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseEnv(serverEnvSchema);

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
  /** `null` means the `reasoning_effort` parameter is not sent. */
  reasoningEffort: string | null;
};

export type AiConfig = {
  primary: AiProviderConfig;
  fallback: AiProviderConfig | null;
  /** Abort a provider request after this many milliseconds without data. */
  timeoutMs: number;
  /** Completion budget per request, sized to leave room for reasoning tokens. */
  maxTokens: number;
  quotas: {
    perUserPerDay: number;
    perUserPerMinute: number;
    globalPerDay: number;
    /** IANA time zone that decides when a quota day starts. */
    timeZone: string;
  };
  limits: AssistantLimits;
};

/** Limits the assistant applies to each request and turn. */
export type AssistantLimits = {
  /** Earlier messages kept from the client history, newest first. */
  historyMaxMessages: number;
  /** Characters allowed in one message; a longer new question is rejected. */
  messageMaxChars: number;
  /** Characters allowed across the kept history and the new question. */
  historyMaxChars: number;
  /** Model requests per turn; the last one is sent without tools. */
  maxToolRounds: number;
  /** Characters of answer text streamed per turn. */
  maxResponseChars: number;
  /** Size of the `POST /api/chat` body. */
  requestMaxBytes: number;
};

/**
 * Returns the AI configuration, or `null` when no primary key is configured.
 * A missing key must not stop the app from starting; the assistant reports
 * that it is not configured instead. Only the AI variables are read, so the
 * provider can run without the Supabase settings. Malformed values throw.
 */
export function getAiConfig(): AiConfig | null {
  cachedAiEnv ??= parseEnv(aiEnvSchema);
  const env = cachedAiEnv;

  if (!env.AI_PRIMARY_API_KEY) {
    return null;
  }

  return {
    primary: {
      baseUrl: env.AI_PRIMARY_BASE_URL,
      model: env.AI_PRIMARY_MODEL,
      apiKey: env.AI_PRIMARY_API_KEY,
      reasoningEffort: env.AI_PRIMARY_REASONING_EFFORT,
    },
    fallback: env.AI_FALLBACK_API_KEY
      ? {
          baseUrl: env.AI_FALLBACK_BASE_URL,
          model: env.AI_FALLBACK_MODEL,
          apiKey: env.AI_FALLBACK_API_KEY,
          reasoningEffort: env.AI_FALLBACK_REASONING_EFFORT,
        }
      : null,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxTokens: env.AI_MAX_TOKENS,
    quotas: {
      perUserPerDay: env.AI_QUOTA_PER_USER_PER_DAY,
      perUserPerMinute: env.AI_QUOTA_PER_USER_PER_MINUTE,
      globalPerDay: env.AI_QUOTA_GLOBAL_PER_DAY,
      timeZone: env.AI_QUOTA_TIME_ZONE,
    },
    limits: {
      historyMaxMessages: env.AI_HISTORY_MAX_MESSAGES,
      messageMaxChars: env.AI_MESSAGE_MAX_CHARS,
      historyMaxChars: env.AI_HISTORY_MAX_CHARS,
      maxToolRounds: env.AI_MAX_TOOL_ROUNDS,
      maxResponseChars: env.AI_MAX_RESPONSE_CHARS,
      requestMaxBytes: env.AI_REQUEST_MAX_BYTES,
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
