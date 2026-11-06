import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAiModule() {
  vi.resetModules();

  return import("@/server/ai");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAiStatus", () => {
  it("reports not_configured without a primary key", async () => {
    vi.stubEnv("AI_PRIMARY_API_KEY", "");

    const { createAiProvider, getAiStatus } = await loadAiModule();

    expect(getAiStatus()).toEqual({ status: "not_configured", reason: "missing_key" });
    expect(createAiProvider()).toBeNull();
  });

  it("reports not_configured for malformed settings instead of throwing", async () => {
    vi.stubEnv("AI_PRIMARY_API_KEY", "test-key");
    vi.stubEnv("AI_MAX_TOKENS", "-1");

    const { createAiProvider, getAiStatus } = await loadAiModule();

    expect(getAiStatus()).toEqual({ status: "not_configured", reason: "invalid_config" });
    expect(createAiProvider()).toBeNull();
  });

  it("reports the configured models when ready", async () => {
    vi.stubEnv("AI_PRIMARY_API_KEY", "primary-key");
    vi.stubEnv("AI_FALLBACK_API_KEY", "fallback-key");

    const { createAiProvider, getAiStatus } = await loadAiModule();

    expect(getAiStatus()).toEqual({
      status: "ready",
      primaryModel: "deepseek-v4-1-flash-1017",
      fallbackModel: "mistral-small-2603",
    });
    expect(createAiProvider()?.model).toBe("deepseek-v4-1-flash-1017");
  });
});
