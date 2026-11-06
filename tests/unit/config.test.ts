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
    expect(env.SHIPPING_STANDARD_FEE_VND).toBe(30000);
    expect(env.SHIPPING_EXPRESS_FEE_VND).toBe(50000);
    expect(env.SHIPPING_FREE_THRESHOLD_VND).toBe(500000);
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
      },
      fallback: null,
      quotas: {
        perUserPerDay: 30,
        perUserPerMinute: 5,
        globalPerDay: 500,
      },
    });
  });

  it("returns the shipping configuration", async () => {
    stubRequiredEnv();

    const { getShippingConfig } = await loadEnvModule();

    expect(getShippingConfig()).toEqual({
      standardFeeVnd: 30000,
      expressFeeVnd: 50000,
      freeStandardThresholdVnd: 500000,
    });
  });
});
