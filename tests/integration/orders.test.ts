import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { mapDatabaseError } from "@/server/db/errors";

import { createCustomer, createServiceClient, deleteUsers, type TestUser } from "./support/clients";
import {
  addToCart,
  createProductFixture,
  deleteProductFixture,
  getOrder,
  getStock,
  placeOrder,
  requireData,
  uniqueKey,
  type OrderRow,
  type ProductFixture,
} from "./support/fixtures";

type StoreSettings = {
  standard_shipping_fee_vnd: number;
  express_shipping_fee_vnd: number;
  free_shipping_threshold_vnd: number;
  payment_window_minutes: number;
};

describe("place order", () => {
  const service = createServiceClient();
  const users: TestUser[] = [];
  const products: ProductFixture[] = [];

  let customer: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    customer = await createCustomer(service, "order-customer");
    other = await createCustomer(service, "order-other");
    users.push(customer, other);
  });

  beforeEach(async () => {
    await customer.client.from("cart_items").delete().eq("user_id", customer.id);
    await other.client.from("cart_items").delete().eq("user_id", other.id);
  });

  afterAll(async () => {
    await deleteUsers(service, users);
    await Promise.all(products.map((product) => deleteProductFixture(service, product.productId)));
  });

  async function newProduct(
    options: { priceVnd?: number; stock?: number; isActive?: boolean } = {},
  ): Promise<ProductFixture> {
    const product = await createProductFixture(service, options);
    products.push(product);
    return product;
  }

  it("calculates shipping and totals from store settings", async () => {
    const product = await newProduct({ priceVnd: 200000, stock: 5 });
    await addToCart(customer, product.variantId);

    const placed = await placeOrder(customer.client, { idempotencyKey: uniqueKey("totals") });

    expect(placed.error).toBeNull();
    expect(placed.data).toMatchObject({
      status: "pending",
      payment_method: "cod",
      payment_status: "unpaid",
      shipping_method: "standard",
      shipping_fee_vnd: 30000,
      items_subtotal_vnd: 200000,
      total_vnd: 230000,
      payment_due_at: null,
    });
    expect(await getStock(service, product.variantId)).toBe(4);
  });

  it("waives the standard fee at the threshold and always charges express", async () => {
    const product = await newProduct({ priceVnd: 500000, stock: 5 });

    await addToCart(customer, product.variantId);
    const standard = await placeOrder(customer.client, {
      idempotencyKey: uniqueKey("free-shipping"),
    });

    expect(standard.error).toBeNull();
    expect(standard.data?.shipping_fee_vnd).toBe(0);
    expect(standard.data?.total_vnd).toBe(500000);

    await addToCart(customer, product.variantId);
    const express = await placeOrder(customer.client, {
      idempotencyKey: uniqueKey("express"),
      shippingMethod: "express",
    });

    expect(express.error).toBeNull();
    expect(express.data?.shipping_fee_vnd).toBe(50000);
    expect(express.data?.total_vnd).toBe(550000);
  });

  it("reads fees and the payment window from store_settings", async () => {
    const original = requireData<StoreSettings>(
      await service.from("store_settings").select("*").eq("id", 1).single(),
    );

    try {
      const updated = await service
        .from("store_settings")
        .update({
          standard_shipping_fee_vnd: 12345,
          express_shipping_fee_vnd: 23456,
          free_shipping_threshold_vnd: 1000000,
          payment_window_minutes: 5,
        })
        .eq("id", 1);

      expect(updated.error).toBeNull();

      const product = await newProduct({ priceVnd: 100000, stock: 5 });
      await addToCart(customer, product.variantId);

      const placed = await placeOrder(customer.client, {
        idempotencyKey: uniqueKey("settings"),
        paymentMethod: "bank_transfer",
      });

      expect(placed.error).toBeNull();
      expect(placed.data?.shipping_fee_vnd).toBe(12345);
      expect(placed.data?.total_vnd).toBe(112345);

      const order = requireData<OrderRow>(placed);
      const due = new Date(order.payment_due_at ?? "").getTime();
      const created = new Date(order.created_at).getTime();

      expect(due - created).toBe(5 * 60 * 1000);
    } finally {
      await service
        .from("store_settings")
        .update({
          standard_shipping_fee_vnd: original.standard_shipping_fee_vnd,
          express_shipping_fee_vnd: original.express_shipping_fee_vnd,
          free_shipping_threshold_vnd: original.free_shipping_threshold_vnd,
          payment_window_minutes: original.payment_window_minutes,
        })
        .eq("id", 1);
    }
  });

  it("returns the same order for a repeated idempotency key", async () => {
    const product = await newProduct({ priceVnd: 100000, stock: 5 });
    await addToCart(customer, product.variantId);

    const key = uniqueKey("idempotent");
    const first = await placeOrder(customer.client, { idempotencyKey: key });
    const second = await placeOrder(customer.client, { idempotencyKey: key });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data?.id).toBe(first.data?.id);
    expect(await getStock(service, product.variantId)).toBe(4);

    const count = await service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("idempotency_key", key);

    expect(count.count).toBe(1);
  });

  it("serialises two concurrent requests with the same key", async () => {
    const product = await newProduct({ priceVnd: 100000, stock: 5 });
    await addToCart(customer, product.variantId);

    const key = uniqueKey("idempotent-parallel");
    const [first, second] = await Promise.all([
      placeOrder(customer.client, { idempotencyKey: key }),
      placeOrder(customer.client, { idempotencyKey: key }),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data?.id).toBe(second.data?.id);
    expect(await getStock(service, product.variantId)).toBe(4);
  });

  it("lets exactly one of two customers buy the last item", async () => {
    const product = await newProduct({ priceVnd: 100000, stock: 1 });
    await addToCart(customer, product.variantId);
    await addToCart(other, product.variantId);

    const [first, second] = await Promise.all([
      placeOrder(customer.client, { idempotencyKey: uniqueKey("race-a") }),
      placeOrder(other.client, { idempotencyKey: uniqueKey("race-b") }),
    ]);

    const failures = [first, second].filter((result) => result.error !== null);

    expect([first, second].filter((result) => result.error === null)).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const mapped = mapDatabaseError(failures[0].error);

    expect(mapped.code).toBe("OUT_OF_STOCK");
    expect(mapped.details).toEqual({ variantIds: [product.variantId] });
    expect(await getStock(service, product.variantId)).toBe(0);

    const loser = first.error ? customer : other;
    const loserCart = await loser.client
      .from("cart_items")
      .select("variant_id")
      .eq("user_id", loser.id);

    expect(loserCart.data).toEqual([{ variant_id: product.variantId }]);
  });

  it("rejects an empty cart", async () => {
    const result = await placeOrder(customer.client, { idempotencyKey: uniqueKey("empty") });

    expect(mapDatabaseError(result.error).code).toBe("CART_CHANGED");
  });

  it("rejects an inactive product and an insufficient quantity", async () => {
    const hidden = await newProduct({ priceVnd: 100000, stock: 10, isActive: false });
    await addToCart(customer, hidden.variantId);

    const inactive = await placeOrder(customer.client, {
      idempotencyKey: uniqueKey("inactive"),
    });

    expect(mapDatabaseError(inactive.error).code).toBe("OUT_OF_STOCK");
    expect(mapDatabaseError(inactive.error).details).toEqual({
      variantIds: [hidden.variantId],
    });

    await customer.client.from("cart_items").delete().eq("user_id", customer.id);

    const scarce = await newProduct({ priceVnd: 100000, stock: 1 });
    await addToCart(customer, scarce.variantId, 2);

    const insufficient = await placeOrder(customer.client, {
      idempotencyKey: uniqueKey("scarce"),
    });

    expect(mapDatabaseError(insufficient.error).code).toBe("OUT_OF_STOCK");
    expect(mapDatabaseError(insufficient.error).details).toEqual({
      variantIds: [scarce.variantId],
    });
    expect(await getStock(service, scarce.variantId)).toBe(1);
  });

  it("snapshots order items and restores stock exactly once on cancellation", async () => {
    const product = await newProduct({ priceVnd: 150000, stock: 3 });
    await addToCart(customer, product.variantId, 2);

    const placed = await placeOrder(customer.client, { idempotencyKey: uniqueKey("cancel") });

    expect(placed.error).toBeNull();

    const orderId = placed.data?.id;

    if (!orderId) {
      throw new Error("Expected the order id.");
    }

    expect(placed.data).toMatchObject({
      recipient_name: "Test Recipient",
      recipient_phone: "0900000000",
      shipping_address: "1 Test Street, District 1",
      shipping_method: "standard",
    });

    const items = await customer.client.from("order_items").select("*").eq("order_id", orderId);

    expect(items.data).toHaveLength(1);
    expect(items.data?.[0]).toMatchObject({
      sku: product.sku,
      variant_sku: product.variantSku,
      option_label: "S",
      unit_price_vnd: 150000,
      quantity: 2,
      line_total_vnd: 300000,
    });

    await service.from("products").update({ price_vnd: 999000 }).eq("id", product.productId);

    const snapshot = await customer.client
      .from("order_items")
      .select("unit_price_vnd")
      .eq("order_id", orderId)
      .single();

    expect(snapshot.data?.unit_price_vnd).toBe(150000);
    expect(await getStock(service, product.variantId)).toBe(1);

    const cancelled = await customer.client.rpc("cancel_order", { p_order_id: orderId });

    expect(cancelled.error).toBeNull();
    expect(cancelled.data).toMatchObject({ status: "cancelled", payment_status: "unpaid" });
    expect(await getStock(service, product.variantId)).toBe(3);

    const again = await customer.client.rpc("cancel_order", { p_order_id: orderId });

    expect(mapDatabaseError(again.error).code).toBe("ORDER_NOT_CANCELLABLE");
    expect(await getStock(service, product.variantId)).toBe(3);

    const events = await customer.client
      .from("order_events")
      .select("to_status")
      .eq("order_id", orderId)
      .order("id");

    expect(events.data?.map((event) => event.to_status)).toEqual(["pending", "cancelled"]);
  });

  it("does not let a customer cancel another customer's order", async () => {
    const product = await newProduct({ priceVnd: 100000, stock: 5 });
    await addToCart(other, product.variantId);

    const placed = await placeOrder(other.client, { idempotencyKey: uniqueKey("other") });

    expect(placed.error).toBeNull();

    const result = await customer.client.rpc("cancel_order", { p_order_id: placed.data?.id });

    expect(mapDatabaseError(result.error).code).toBe("NOT_FOUND");
    expect(await getStock(service, product.variantId)).toBe(4);
    expect((await getOrder(service, placed.data?.id)).status).toBe("pending");
  });

  it("does not waive the standard fee when only the total would reach the threshold", async () => {
    const product = await newProduct({ priceVnd: 499000, stock: 5 });
    await addToCart(customer, product.variantId);

    const placed = await placeOrder(customer.client, {
      idempotencyKey: uniqueKey("threshold-edge"),
    });

    expect(placed.error).toBeNull();
    expect(placed.data).toMatchObject({
      items_subtotal_vnd: 499000,
      shipping_fee_vnd: 30000,
      total_vnd: 529000,
    });
  });

  it("rolls back the whole order when one line is unavailable", async () => {
    const available = await newProduct({ priceVnd: 100000, stock: 5 });
    const unavailable = await newProduct({ priceVnd: 100000, stock: 0 });

    await addToCart(customer, available.variantId);
    await addToCart(customer, unavailable.variantId);

    const result = await placeOrder(customer.client, {
      idempotencyKey: uniqueKey("rollback"),
    });

    expect(mapDatabaseError(result.error).code).toBe("OUT_OF_STOCK");
    expect(mapDatabaseError(result.error).details).toEqual({
      variantIds: [unavailable.variantId],
    });
    expect(await getStock(service, available.variantId)).toBe(5);
    expect(await getStock(service, unavailable.variantId)).toBe(0);

    const cart = await customer.client
      .from("cart_items")
      .select("variant_id")
      .eq("user_id", customer.id)
      .order("variant_id");

    expect(cart.data).toHaveLength(2);
  });

  it("keeps idempotency keys independent per customer", async () => {
    const product = await newProduct({ priceVnd: 100000, stock: 5 });
    const key = uniqueKey("shared-key");

    await addToCart(customer, product.variantId);
    const first = await placeOrder(customer.client, { idempotencyKey: key });

    await addToCart(other, product.variantId);
    const second = await placeOrder(other.client, { idempotencyKey: key });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data?.id).not.toBe(second.data?.id);
    expect(await getStock(service, product.variantId)).toBe(3);
  });
});
