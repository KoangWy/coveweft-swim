import "server-only";

import { cache } from "react";

import { getStoreSettings as readStoreSettings } from "@/server/catalog/settings";
import type { StoreSettings } from "@/server/catalog/types";

export type { StoreSettings };

/** Anything that can load the current store settings for rendering. */
export interface StoreSettingsSource {
  getStoreSettings(): Promise<StoreSettings>;
}

/**
 * Documented demo defaults. They mirror the database seed and exist so tests
 * and tooling can reason about the starting values. The storefront reads the
 * database row through `databaseStoreSettingsSource`, not these constants.
 */
export const FALLBACK_STORE_SETTINGS: Readonly<StoreSettings> = Object.freeze({
  standardShippingFeeVnd: 30_000,
  expressShippingFeeVnd: 50_000,
  freeStandardShippingThresholdVnd: 500_000,
  paymentWindowMinutes: 30,
});

export const fallbackStoreSettingsSource: StoreSettingsSource = {
  async getStoreSettings() {
    return { ...FALLBACK_STORE_SETTINGS };
  },
};

/**
 * Reads the single `store_settings` row. The UI keeps its plain
 * `Promise<StoreSettings>` signature; a database failure surfaces as an error
 * page instead of silently showing stale prices.
 */
export const databaseStoreSettingsSource: StoreSettingsSource = {
  async getStoreSettings() {
    const result = await readStoreSettings();

    if (!result.ok) {
      throw new Error(`Could not read store settings (${result.error.code}).`);
    }

    return result.data;
  },
};

const activeSource: StoreSettingsSource = databaseStoreSettingsSource;

/**
 * Returns the store settings for the current render. The result is memoized
 * per request so several components can call it without extra queries.
 */
export const getStoreSettings = cache((): Promise<StoreSettings> =>
  activeSource.getStoreSettings(),
);
