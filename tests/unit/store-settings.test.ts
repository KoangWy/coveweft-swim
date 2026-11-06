import { describe, expect, it } from "vitest";

import {
  FALLBACK_STORE_SETTINGS,
  fallbackStoreSettingsSource,
  getStoreSettings,
} from "@/lib/store-settings";

describe("store settings", () => {
  it("falls back to the documented demo defaults", () => {
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

  it("reads through the active source", async () => {
    await expect(getStoreSettings()).resolves.toEqual(FALLBACK_STORE_SETTINGS);
  });
});
