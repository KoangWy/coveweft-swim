import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", async () => {
  const { serviceClientState } = await import("./support/service-context");

  return {
    createSupabaseServerClient: async () => {
      if (!serviceClientState.current) {
        throw new Error("No service client selected for this test.");
      }

      return serviceClientState.current;
    },
  };
});

import { addToCart, getCart, removeCartItem, updateCartItem } from "@/server/cart";

import {
  createAnonClient,
  createCustomer,
  createServiceClient,
  type TestUser,
} from "./support/clients";
import {
  createServiceProduct,
  deleteServiceProducts,
  deleteTestUsers,
  uniqueToken,
  type ServiceProductFixture,
} from "./support/service-fixtures";
import { selectServiceClient } from "./support/service-context";

describe("cart service", () => {
  const service = createServiceClient();
  const token = uniqueToken("cart");
  let customer: TestUser;
  let otherCustomer: TestUser;
  let product: ServiceProductFixture;
  let hiddenProduct: ServiceProductFixture;

  beforeAll(async () => {
    customer = await createCustomer(service, "cart-customer");
    otherCustomer = await createCustomer(service, "cart-other");
    product = await createServiceProduct(service, {
      token,
      name: `Cart product ${token}`,
      priceVnd: 200_000,
      variants: [{ label: "S", stock: 2, sizeGuideKey: "women-S" }],
    });
    hiddenProduct = await createServiceProduct(service, {
      token,
      name: `Hidden cart product ${token}`,
      isActive: false,
      variants: [{ label: "S", stock: 5 }],
    });
  });

  afterAll(async () => {
    await deleteServiceProducts(service, [product?.productId, hiddenProduct?.productId]);
    await deleteTestUsers(service, [customer?.id, otherCustomer?.id]);
  });

  it("requires a signed-in customer", async () => {
    selectServiceClient(createAnonClient());

    const result = await getCart();

    expect(result).toEqual({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("adds, accumulates, updates, and removes a line", async () => {
    selectServiceClient(customer.client);

    const first = await addToCart({ variantId: product.variantIds[0], quantity: 1 });

    expect(first.ok).toBe(true);

    if (first.ok) {
      expect(first.data.itemCount).toBe(1);
      expect(first.data.items[0]?.quantity).toBe(1);
      expect(first.data.subtotalVnd).toBe(200_000);
    }

    const second = await addToCart({ variantId: product.variantIds[0], quantity: 1 });

    expect(second.ok && second.data.items[0]?.quantity).toBe(2);

    const tooMany = await addToCart({ variantId: product.variantIds[0], quantity: 1 });

    expect(tooMany).toEqual({
      ok: false,
      error: {
        code: "OUT_OF_STOCK",
        details: { variantId: product.variantIds[0], availableStock: 2, requestedQuantity: 3 },
      },
    });

    const updated = await updateCartItem({ variantId: product.variantIds[0], quantity: 1 });

    expect(updated.ok && updated.data.items[0]?.quantity).toBe(1);

    const overStock = await updateCartItem({ variantId: product.variantIds[0], quantity: 3 });

    expect(overStock.ok).toBe(false);

    if (!overStock.ok) {
      expect(overStock.error.code).toBe("OUT_OF_STOCK");
    }

    const removed = await removeCartItem({ variantId: product.variantIds[0] });

    expect(removed.ok && removed.data.items).toEqual([]);
  });

  it("reports stock and visibility issues per line", async () => {
    selectServiceClient(customer.client);

    await addToCart({ variantId: product.variantIds[0], quantity: 2 });
    await service.from("product_variants").update({ stock: 1 }).eq("id", product.variantIds[0]);

    const shortage = await getCart();

    expect(shortage.ok).toBe(true);

    if (shortage.ok) {
      expect(shortage.data.issues).toEqual([
        { variantId: product.variantIds[0], code: "OUT_OF_STOCK", availableStock: 1 },
      ]);
      expect(shortage.data.items[0]?.issues).toEqual(["OUT_OF_STOCK"]);
    }

    await service.from("products").update({ is_active: false }).eq("id", product.productId);

    const hidden = await getCart();

    expect(hidden.ok).toBe(true);

    if (hidden.ok) {
      expect(hidden.data.issues).toEqual([
        { variantId: product.variantIds[0], code: "PRODUCT_UNAVAILABLE" },
      ]);
      expect(hidden.data.items[0]?.productName).toBeNull();
    }

    await service.from("products").update({ is_active: true }).eq("id", product.productId);
    await service.from("product_variants").update({ stock: 2 }).eq("id", product.variantIds[0]);
    await removeCartItem({ variantId: product.variantIds[0] });
  });

  it("keeps carts isolated between customers", async () => {
    selectServiceClient(customer.client);
    await addToCart({ variantId: product.variantIds[0], quantity: 1 });

    selectServiceClient(otherCustomer.client);
    const otherCart = await getCart();

    expect(otherCart.ok && otherCart.data.items).toEqual([]);

    selectServiceClient(customer.client);
    await removeCartItem({ variantId: product.variantIds[0] });
  });

  it("rejects hidden products and unknown variants", async () => {
    selectServiceClient(customer.client);

    const hidden = await addToCart({ variantId: hiddenProduct.variantIds[0], quantity: 1 });
    const missing = await addToCart({
      variantId: "7f3d9e2a-1b2c-4d5e-8f90-123456789abc",
      quantity: 1,
    });

    expect(hidden).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", details: { variantId: hiddenProduct.variantIds[0] } },
    });
    expect(missing.ok).toBe(false);

    if (!missing.ok) {
      expect(missing.error.code).toBe("NOT_FOUND");
    }
  });

  it("validates quantities", async () => {
    selectServiceClient(customer.client);

    const result = await addToCart({ variantId: product.variantIds[0], quantity: 0 });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });
});
