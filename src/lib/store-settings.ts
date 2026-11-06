import "server-only";

import { cache } from "react";

/**
 * Storefront values owned by the database `store_settings` row. Amounts are
 * integer VND.
 */
export type StoreSettings = {
  standardShippingFeeVnd: number;
  expressShippingFeeVnd: number;
  /** Item subtotal (before shipping) at which Standard shipping becomes free. */
  freeStandardShippingThresholdVnd: number;
  /** Minutes a simulated bank transfer order stays payable after it is placed. */
  paymentWindowMinutes: number;
};

/** Anything that can load the current store settings for rendering. */
export interface StoreSettingsSource {
  getStoreSettings(): Promise<StoreSettings>;
}

/**
 * Fallback values used until the `store_settings` read service is available.
 * They match the documented demo defaults and must stay in sync with the
 * database seed. Do not read these values anywhere else.
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

// Replace this binding with the database-backed source once the
// `store_settings` service lands.
const activeSource: StoreSettingsSource = fallbackStoreSettingsSource;

/**
 * Returns the store settings for the current render. The result is memoized
 * per request so several components can call it without extra queries.
 */
export const getStoreSettings = cache((): Promise<StoreSettings> =>
  activeSource.getStoreSettings(),
);
