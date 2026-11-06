import { describe, expect, it } from "vitest";

import { AdminAdjustStockInput, AdminUpsertProductInput } from "@/server/admin/schemas";
import { ListProductsInput } from "@/server/catalog/schemas";
import { PlaceOrderInput } from "@/server/checkout/schemas";

describe("service input schemas", () => {
  it("applies list defaults and rejects an inverted price range", () => {
    const defaults = ListProductsInput.parse({ locale: "en" });

    expect(defaults.page).toBe(1);
    expect(defaults.pageSize).toBe(12);
    expect(ListProductsInput.safeParse({ priceMin: 200_000, priceMax: 100_000 }).success).toBe(
      false,
    );
  });

  it("requires exactly one of delta or stock", () => {
    const base = { variantId: "7f3d9e2a-1b2c-4d5e-8f90-123456789abc", reason: "restock" };

    expect(AdminAdjustStockInput.safeParse({ ...base, delta: 5 }).success).toBe(true);
    expect(AdminAdjustStockInput.safeParse({ ...base, stock: 5 }).success).toBe(true);
    expect(AdminAdjustStockInput.safeParse({ ...base, delta: 5, stock: 5 }).success).toBe(false);
    expect(AdminAdjustStockInput.safeParse(base).success).toBe(false);
  });

  it("requires the create fields for a new product", () => {
    expect(AdminUpsertProductInput.safeParse({ name: "Only a name" }).success).toBe(false);
    expect(
      AdminUpsertProductInput.safeParse({
        sku: "SKU-1",
        name: "Product",
        productType: "Bikini top",
        category: "Tops",
        gender: "Women",
        priceVnd: 100_000,
      }).success,
    ).toBe(true);
    expect(
      AdminUpsertProductInput.safeParse({
        id: "7f3d9e2a-1b2c-4d5e-8f90-123456789abc",
        priceVnd: 120_000,
      }).success,
    ).toBe(true);
  });

  it("validates the checkout input", () => {
    expect(
      PlaceOrderInput.safeParse({
        idempotencyKey: "key-1",
        recipientName: "Demo Customer",
        recipientPhone: "0900000000",
        shippingAddress: "1 Demo Street",
        shippingMethod: "standard",
        paymentMethod: "cod",
      }).success,
    ).toBe(true);
    expect(
      PlaceOrderInput.safeParse({
        idempotencyKey: "",
        recipientName: "Demo Customer",
        recipientPhone: "0900000000",
        shippingAddress: "1 Demo Street",
        shippingMethod: "standard",
        paymentMethod: "cod",
      }).success,
    ).toBe(false);
  });
});
