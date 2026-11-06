import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readStoreSettings: vi.fn(),
}));

vi.mock("@/server/catalog/settings", () => ({
  getStoreSettings: mocks.readStoreSettings,
}));

import {
  FALLBACK_STORE_SETTINGS,
  databaseStoreSettingsSource,
  fallbackStoreSettingsSource,
  getStoreSettings,
} from "@/lib/store-settings";

const databaseSettings = {
  standardShippingFeeVnd: 31_000,
  expressShippingFeeVnd: 51_000,
  freeStandardShippingThresholdVnd: 510_000,
  paymentWindowMinutes: 31,
};

describe("store settings", () => {
  it("documents the demo defaults", () => {
    expect(FALLBACK_STORE_SETTINGS).toEqual({
      standardShippingFeeVnd: 30_000,
      expressShippingFeeVnd: 50_000,
      freeStandardShippingThresholdVnd: 500_000,
      paymentWindowMinutes: 30,
    });
  });

  it("stores integer VND amounts", () => {
    for (const value of Object.values(FALLBACK_STORE_SETTINGS)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("returns a copy so callers cannot change the fallback", async () => {
    const settings = await fallbackStoreSettingsSource.getStoreSettings();
    settings.standardShippingFeeVnd = 1;

    expect(FALLBACK_STORE_SETTINGS.standardShippingFeeVnd).toBe(30_000);
  });

  it("reads the database source", async () => {
    mocks.readStoreSettings.mockResolvedValue({ ok: true, data: databaseSettings });

    await expect(databaseStoreSettingsSource.getStoreSettings()).resolves.toEqual(databaseSettings);
  });

  it("surfaces a database failure instead of stale prices", async () => {
    mocks.readStoreSettings.mockResolvedValue({
      ok: false,
      error: { code: "INTERNAL" },
    });

    await expect(databaseStoreSettingsSource.getStoreSettings()).rejects.toThrow(
      "Could not read store settings (INTERNAL).",
    );
  });

  it("reads through the active database source", async () => {
    mocks.readStoreSettings.mockResolvedValue({ ok: true, data: databaseSettings });

    await expect(getStoreSettings()).resolves.toEqual(databaseSettings);
  });
});
