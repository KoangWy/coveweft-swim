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

import { addToCart, getCart, updateCartItem } from "@/server/cart";
import { placeOrder, quoteCheckout } from "@/server/checkout";

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

type StoreSettingsRow = {
  standard_shipping_fee_vnd: number;
  express_shipping_fee_vnd: number;
  free_shipping_threshold_vnd: number;
  payment_window_minutes: number;
};

const recipient = {
  recipientName: "Demo Customer",
  recipientPhone: "0900000000",
  shippingAddress: "1 Demo Street, District 1",
};

describe("checkout service", () => {
  const service = createServiceClient();
  const token = uniqueToken("checkout");
  let customer: TestUser;
  let product: ServiceProductFixture;
  let originalSettings: StoreSettingsRow;
  let idempotencySequence = 0;

  function nextKey() {
    idempotencySequence += 1;
    return `checkout-${token}-${idempotencySequence}`;
  }

  beforeAll(async () => {
    customer = await createCustomer(service, "checkout-customer");
    product = await createServiceProduct(service, {
      token,
      name: `Checkout product ${token}`,
      priceVnd: 200_000,
      variants: [{ label: "S", stock: 5, sizeGuideKey: "women-S" }],
    });

    const settings = await service.from("store_settings").select("*").eq("id", 1).single();

    if (settings.error || !settings.data) {
      throw settings.error ?? new Error("Missing store settings row.");
    }

    originalSettings = settings.data as StoreSettingsRow;

    await service
      .from("store_settings")
      .update({
        standard_shipping_fee_vnd: 30_000,
        express_shipping_fee_vnd: 50_000,
        free_shipping_threshold_vnd: 500_000,
        payment_window_minutes: 30,
      })
      .eq("id", 1);
  });

  afterAll(async () => {
    await deleteServiceProducts(service, [product?.productId]);
    await deleteTestUsers(service, [customer?.id]);

    if (originalSettings) {
      await service.from("store_settings").update(originalSettings).eq("id", 1);
    }
  });

  it("quotes from the database prices and store settings", async () => {
    selectServiceClient(customer.client);
    await addToCart({ variantId: product.variantIds[0], quantity: 2 });

    const standard = await quoteCheckout({ shippingMethod: "standard" });

    expect(standard.ok).toBe(true);

    if (standard.ok) {
      expect(standard.data.items).toHaveLength(1);
      expect(standard.data.subtotalVnd).toBe(400_000);
      expect(standard.data.shippingMethod).toBe("standard");
      expect(standard.data.shippingFeeVnd).toBe(30_000);
      expect(standard.data.totalVnd).toBe(430_000);
      expect(standard.data.freeShippingThresholdVnd).toBe(500_000);
      expect(standard.data.paymentWindowMinutes).toBe(30);
    }

    await updateCartItem({ variantId: product.variantIds[0], quantity: 3 });
    const freeStandard = await quoteCheckout({ shippingMethod: "standard" });
    const express = await quoteCheckout({ shippingMethod: "express" });

    expect(freeStandard.ok && freeStandard.data.shippingFeeVnd).toBe(0);
    expect(freeStandard.ok && freeStandard.data.totalVnd).toBe(600_000);
    expect(express.ok && express.data.shippingFeeVnd).toBe(50_000);
    expect(express.ok && express.data.totalVnd).toBe(650_000);

    await updateCartItem({ variantId: product.variantIds[0], quantity: 2 });
  });

  it("rejects an empty cart and an unauthenticated request", async () => {
    selectServiceClient(customer.client);
    await service.from("cart_items").delete().eq("user_id", customer.id);

    const empty = await quoteCheckout({ shippingMethod: "standard" });

    expect(empty).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", details: { reason: "empty_cart" } },
    });

    selectServiceClient(createAnonClient());
    const anonymous = await quoteCheckout({ shippingMethod: "standard" });

    expect(anonymous).toEqual({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("places a COD order, clears the cart, deducts stock, and is idempotent", async () => {
    selectServiceClient(customer.client);
    await addToCart({ variantId: product.variantIds[0], quantity: 2 });

    const key = nextKey();
    const placed = await placeOrder({
      idempotencyKey: key,
      ...recipient,
      shippingMethod: "standard",
      paymentMethod: "cod",
    });

    expect(placed.ok).toBe(true);

    if (!placed.ok) {
      return;
    }

    expect(placed.data.status).toBe("pending");
    expect(placed.data.paymentStatus).toBe("unpaid");
    expect(placed.data.itemsSubtotalVnd).toBe(400_000);
    expect(placed.data.shippingFeeVnd).toBe(30_000);
    expect(placed.data.totalVnd).toBe(430_000);
    expect(placed.data.items).toHaveLength(1);
    expect(placed.data.items[0]?.quantity).toBe(2);
    expect(placed.data.paymentDueAt).toBeNull();

    const cart = await getCart();
    expect(cart.ok && cart.data.items).toEqual([]);

    const stock = await service
      .from("product_variants")
      .select("stock")
      .eq("id", product.variantIds[0])
      .single();

    expect(stock.data?.stock).toBe(3);

    const repeated = await placeOrder({
      idempotencyKey: key,
      ...recipient,
      shippingMethod: "standard",
      paymentMethod: "cod",
    });

    expect(repeated.ok && repeated.data.id).toBe(placed.data.id);

    const stockAfterRepeat = await service
      .from("product_variants")
      .select("stock")
      .eq("id", product.variantIds[0])
      .single();

    expect(stockAfterRepeat.data?.stock).toBe(3);
  });

  it("reports OUT_OF_STOCK when stock changed after the cart was filled", async () => {
    selectServiceClient(customer.client);
    await addToCart({ variantId: product.variantIds[0], quantity: 1 });
    await service.from("product_variants").update({ stock: 0 }).eq("id", product.variantIds[0]);

    const quote = await quoteCheckout({ shippingMethod: "standard" });
    const placed = await placeOrder({
      idempotencyKey: nextKey(),
      ...recipient,
      shippingMethod: "standard",
      paymentMethod: "cod",
    });

    expect(quote.ok).toBe(false);

    if (!quote.ok) {
      expect(quote.error.code).toBe("OUT_OF_STOCK");
    }

    expect(placed.ok).toBe(false);

    if (!placed.ok) {
      expect(placed.error.code).toBe("OUT_OF_STOCK");
      expect(placed.error.details).toEqual({ variantIds: [product.variantIds[0]] });
    }

    await service.from("product_variants").update({ stock: 3 }).eq("id", product.variantIds[0]);
    await service.from("cart_items").delete().eq("user_id", customer.id);
  });

  it("reports CART_CHANGED for an empty cart at placement time", async () => {
    selectServiceClient(customer.client);
    await service.from("cart_items").delete().eq("user_id", customer.id);

    const placed = await placeOrder({
      idempotencyKey: nextKey(),
      ...recipient,
      shippingMethod: "standard",
      paymentMethod: "cod",
    });

    expect(placed).toEqual({
      ok: false,
      error: { code: "CART_CHANGED", details: { reason: "empty" } },
    });
  });

  it("rejects an unauthenticated placement", async () => {
    selectServiceClient(createAnonClient());

    const placed = await placeOrder({
      idempotencyKey: nextKey(),
      ...recipient,
      shippingMethod: "standard",
      paymentMethod: "cod",
    });

    expect(placed).toEqual({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });
});
