import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCustomer, createServiceClient, deleteUsers, type TestUser } from "./support/clients";
import {
  startSqlSession,
  waitForActiveQuery,
  waitForBlockedQuery,
  waitForExit,
} from "./support/database";
import { getStock } from "./support/fixtures";

describe("expiry batch locking", () => {
  const service = createServiceClient();
  const users: TestUser[] = [];

  let customer: TestUser;
  let productId = "";
  let lowVariantId: string;
  let highVariantId: string;
  let expiredOrderA: string;
  let expiredOrderB: string;
  let pendingOrderC: string;

  beforeAll(async () => {
    customer = await createCustomer(service, "expiry-locking");
    users.push(customer);

    const stamp = `${Date.now()}-${process.pid}`;
    const [lowId, highId] = [randomUUID(), randomUUID()].sort();
    const [orderA, orderB, orderC] = [randomUUID(), randomUUID(), randomUUID()].sort();

    lowVariantId = lowId;
    highVariantId = highId;
    expiredOrderA = orderA;
    expiredOrderB = orderB;
    pendingOrderC = orderC;
    productId = randomUUID();

    const sku = `EXPIRY-LOCK-${stamp}`;

    const product = await service.from("products").insert({
      id: productId,
      sku,
      name: "Expiry locking product",
      product_type: "Tops",
      category: "Tops",
      gender: "Women",
      price_vnd: 100000,
    });

    if (product.error) {
      throw product.error;
    }

    const variants = await service.from("product_variants").insert([
      {
        id: lowVariantId,
        product_id: productId,
        variant_sku: `${sku}-LOW`,
        option_label: "S",
        stock: 0,
        position: 1,
      },
      {
        id: highVariantId,
        product_id: productId,
        variant_sku: `${sku}-HIGH`,
        option_label: "M",
        stock: 0,
        position: 2,
      },
    ]);

    if (variants.error) {
      throw variants.error;
    }

    const baseOrder = {
      user_id: customer.id,
      recipient_name: "Buyer",
      recipient_phone: "0900000000",
      shipping_address: "1 Test Street",
      shipping_method: "standard",
      shipping_fee_vnd: 0,
      items_subtotal_vnd: 100000,
      total_vnd: 100000,
    };
    const past = new Date(Date.now() - 60000).toISOString();

    const orders = await service.from("orders").insert([
      {
        ...baseOrder,
        id: expiredOrderA,
        idempotency_key: `expiry-a-${stamp}`,
        status: "pending",
        payment_method: "bank_transfer",
        payment_status: "unpaid",
        payment_due_at: past,
      },
      {
        ...baseOrder,
        id: expiredOrderB,
        idempotency_key: `expiry-b-${stamp}`,
        status: "pending",
        payment_method: "bank_transfer",
        payment_status: "unpaid",
        payment_due_at: past,
      },
      {
        ...baseOrder,
        id: pendingOrderC,
        idempotency_key: `expiry-c-${stamp}`,
        status: "pending",
        payment_method: "cod",
        payment_status: "unpaid",
        payment_due_at: null,
        items_subtotal_vnd: 200000,
        total_vnd: 200000,
      },
    ]);

    if (orders.error) {
      throw orders.error;
    }

    const orderItem = (orderId: string, variantId: string, optionLabel: string) => ({
      order_id: orderId,
      variant_id: variantId,
      product_id: productId,
      sku,
      variant_sku: variantId === lowVariantId ? `${sku}-LOW` : `${sku}-HIGH`,
      product_name: "Expiry locking product",
      option_label: optionLabel,
      unit_price_vnd: 100000,
      quantity: 1,
    });

    const items = await service
      .from("order_items")
      .insert([
        orderItem(expiredOrderA, highVariantId, "M"),
        orderItem(expiredOrderB, lowVariantId, "S"),
        orderItem(pendingOrderC, lowVariantId, "S"),
        orderItem(pendingOrderC, highVariantId, "M"),
      ]);

    if (items.error) {
      throw items.error;
    }
  });

  afterAll(async () => {
    await deleteUsers(service, users);

    if (productId) {
      await service.from("products").delete().eq("id", productId);
    }
  });

  it("locks the expiry variant union in ascending order without deadlocking cancellation", async () => {
    // Pause expiry at its first order_events insert. By then the fixed function
    // has already locked the eligible orders and the union of their variants.
    const lock = await startSqlSession(
      "begin; lock table public.order_events in share mode; select pg_sleep(6); commit;",
    );

    await waitForActiveQuery("pg_sleep");

    const expiry = Promise.resolve(service.rpc("expire_unpaid_orders"));

    await waitForBlockedQuery("expire_unpaid_orders");

    const cancellation = Promise.resolve(
      customer.client.rpc("cancel_order", { p_order_id: pendingOrderC }),
    );

    await waitForBlockedQuery("cancel_order");

    await waitForExit(lock);

    const [expiryResult, cancellationResult] = await Promise.all([expiry, cancellation]);

    expect(expiryResult.error).toBeNull();
    expect(expiryResult.data).toBe(2);

    expect(cancellationResult.error).toBeNull();
    expect(cancellationResult.data?.status).toBe("cancelled");

    const orders = await service
      .from("orders")
      .select("id, status")
      .in("id", [expiredOrderA, expiredOrderB, pendingOrderC])
      .order("id");

    expect(orders.data).toEqual([
      { id: expiredOrderA, status: "cancelled" },
      { id: expiredOrderB, status: "cancelled" },
      { id: pendingOrderC, status: "cancelled" },
    ]);

    expect(await getStock(service, lowVariantId)).toBe(2);
    expect(await getStock(service, highVariantId)).toBe(2);
  });
});
