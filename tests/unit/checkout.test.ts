import { describe, expect, it } from "vitest";

import { calculateShippingFee } from "@/server/checkout/shipping";
import type { StoreSettings } from "@/server/catalog/types";

const settings: StoreSettings = {
  standardShippingFeeVnd: 30_000,
  expressShippingFeeVnd: 50_000,
  freeStandardShippingThresholdVnd: 500_000,
  paymentWindowMinutes: 30,
};

describe("calculateShippingFee", () => {
  it("charges Standard below the free threshold", () => {
    expect(calculateShippingFee(499_999, "standard", settings)).toBe(30_000);
  });

  it("makes Standard free at the threshold", () => {
    expect(calculateShippingFee(500_000, "standard", settings)).toBe(0);
  });

  it("never makes Express free", () => {
    expect(calculateShippingFee(2_000_000, "express", settings)).toBe(50_000);
  });

  it("uses the database values rather than constants", () => {
    const changed = {
      ...settings,
      standardShippingFeeVnd: 12_000,
      expressShippingFeeVnd: 22_000,
      freeStandardShippingThresholdVnd: 100_000,
    };

    expect(calculateShippingFee(90_000, "standard", changed)).toBe(12_000);
    expect(calculateShippingFee(100_000, "standard", changed)).toBe(0);
    expect(calculateShippingFee(90_000, "express", changed)).toBe(22_000);
  });
});
