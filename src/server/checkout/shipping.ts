import type { StoreSettings } from "@/server/catalog/types";
import type { ShippingMethod } from "@/server/commerce/types";

/**
 * Applies the store settings to a server-calculated subtotal. Standard
 * shipping is free at or above the threshold; Express is never free.
 */
export function calculateShippingFee(
  subtotalVnd: number,
  shippingMethod: ShippingMethod,
  settings: StoreSettings,
): number {
  if (shippingMethod === "express") {
    return settings.expressShippingFeeVnd;
  }

  return subtotalVnd >= settings.freeStandardShippingThresholdVnd
    ? 0
    : settings.standardShippingFeeVnd;
}
