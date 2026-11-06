import { afterEach, describe, expect, it, vi } from "vitest";

const REQUIRED_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local",
  SUPABASE_URL_INTERNAL: "http://127.0.0.1:54321",
} as const;

function stubRequiredEnv() {
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    vi.stubEnv(key, value);
  }
}

async function loadEnvModule() {
  vi.resetModules();

  return import("@/lib/config/env");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getServerEnv", () => {
  it("reports required variables that are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_URL_INTERNAL", "");

    const { getServerEnv } = await loadEnvModule();

    expect(() => getServerEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("applies local defaults for optional settings", async () => {
    stubRequiredEnv();

    const { getServerEnv } = await loadEnvModule();
    const env = getServerEnv();

    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.AI_QUOTA_PER_USER_PER_DAY).toBe(30);
    expect(env.AI_QUOTA_PER_USER_PER_MINUTE).toBe(5);
    expect(env.AI_QUOTA_GLOBAL_PER_DAY).toBe(500);
  });

  it("treats blank optional values as unset", async () => {
    stubRequiredEnv();
    vi.stubEnv("AI_PRIMARY_API_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");

    const { getAdminSupabaseEnv, getAiConfig, getMediaConfig } = await loadEnvModule();

    expect(getAiConfig()).toBeNull();
    expect(getMediaConfig()).toBeNull();
    expect(() => getAdminSupabaseEnv()).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("returns the AI configuration when a primary key is present", async () => {
    stubRequiredEnv();
    vi.stubEnv("AI_PRIMARY_API_KEY", "test-key");

    const { getAiConfig } = await loadEnvModule();

    expect(getAiConfig()).toMatchObject({
      primary: {
        baseUrl: "https://api.mistral.ai/v1",
        model: "deepseek-v4-1-flash-1017",
        apiKey: "test-key",
        reasoningEffort: "low",
      },
      fallback: null,
      timeoutMs: 30_000,
      maxTokens: 4096,
      quotas: {
        perUserPerDay: 30,
        perUserPerMinute: 5,
        globalPerDay: 500,
      },
    });
  });

  it("does not need the Supabase settings to read the AI configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("AI_PRIMARY_API_KEY", "test-key");

    const { getAiConfig } = await loadEnvModule();

    expect(getAiConfig()?.primary.apiKey).toBe("test-key");
  });

  it("omits reasoning effort for the fallback by default and when set to blank", async () => {
    vi.stubEnv("AI_PRIMARY_API_KEY", "primary-key");
    vi.stubEnv("AI_FALLBACK_API_KEY", "fallback-key");

    const { getAiConfig } = await loadEnvModule();

    expect(getAiConfig()?.fallback).toEqual({
      baseUrl: "https://api.mistral.ai/v1",
      model: "mistral-small-2603",
      apiKey: "fallback-key",
      reasoningEffort: null,
    });

    vi.stubEnv("AI_PRIMARY_REASONING_EFFORT", "");
    const reloaded = await loadEnvModule();

    expect(reloaded.getAiConfig()?.primary.reasoningEffort).toBeNull();
  });

  it("reads model, endpoint, and limits for each role from the environment", async () => {
    vi.stubEnv("AI_PRIMARY_API_KEY", "primary-key");
    vi.stubEnv("AI_PRIMARY_MODEL", "other-model");
    vi.stubEnv("AI_PRIMARY_REASONING_EFFORT", "high");
    vi.stubEnv("AI_FALLBACK_API_KEY", "fallback-key");
    vi.stubEnv("AI_FALLBACK_BASE_URL", "https://llm.example.test/v1");
    vi.stubEnv("AI_FALLBACK_REASONING_EFFORT", "none");
    vi.stubEnv("AI_TIMEOUT_MS", "15000");
    vi.stubEnv("AI_MAX_TOKENS", "2048");

    const { getAiConfig } = await loadEnvModule();

    expect(getAiConfig()).toMatchObject({
      primary: { model: "other-model", reasoningEffort: "high" },
      fallback: { baseUrl: "https://llm.example.test/v1", reasoningEffort: "none" },
      timeoutMs: 15_000,
      maxTokens: 2048,
    });
  });

  it("rejects malformed AI settings", async () => {
    vi.stubEnv("AI_PRIMARY_API_KEY", "test-key");
    vi.stubEnv("AI_TIMEOUT_MS", "soon");

    const { getAiConfig } = await loadEnvModule();

    expect(() => getAiConfig()).toThrow(/AI_TIMEOUT_MS/);
  });
});
