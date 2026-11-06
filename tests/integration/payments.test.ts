import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mapDatabaseError } from "@/server/db/errors";

import {
  createAdmin,
  createAnonClient,
  createCustomer,
  createServiceClient,
  deleteUsers,
  type TestUser,
} from "./support/clients";
import {
  runSql,
  sleep,
  startSqlSession,
  waitForActiveQuery,
  waitForBlockedQuery,
  waitForExit,
} from "./support/database";
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

function pastDate(minutes = 1): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

describe("payments, expiry, and administrator transitions", () => {
  const service = createServiceClient();
  const users: TestUser[] = [];
  const products: ProductFixture[] = [];

  let customer: TestUser;
  let admin: TestUser;
  let product: ProductFixture;

  beforeAll(async () => {
    customer = await createCustomer(service, "payment-customer");
    admin = await createAdmin(service, "payment-admin");
    users.push(customer, admin);

    product = await createProductFixture(service, { priceVnd: 100000, stock: 50 });
    products.push(product);
  });

  afterAll(async () => {
    await deleteUsers(service, users);
    await Promise.all(products.map((fixture) => deleteProductFixture(service, fixture.productId)));
  });

  async function newOrder(
    paymentMethod: "cod" | "bank_transfer",
    keyPrefix: string,
  ): Promise<OrderRow> {
    await addToCart(customer, product.variantId);
    const placed = await placeOrder(customer.client, {
      idempotencyKey: uniqueKey(keyPrefix),
      paymentMethod,
    });

    if (placed.error) {
      throw placed.error;
    }

    return requireData<OrderRow>(placed);
  }

  it("records a failed attempt, allows a retry, and marks a success as paid", async () => {
    const order = await newOrder("bank_transfer", "attempts");

    const failed = await customer.client.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_outcome: "failed",
    });

    expect(failed.error).toBeNull();
    expect(failed.data?.payment_status).toBe("unpaid");

    const succeeded = await customer.client.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_outcome: "succeeded",
    });

    expect(succeeded.error).toBeNull();
    expect(succeeded.data?.payment_status).toBe("paid");

    const attempts = await service
      .from("payment_attempts")
      .select("outcome")
      .eq("order_id", order.id)
      .order("created_at");

    expect(attempts.data?.map((attempt) => attempt.outcome)).toEqual(["failed", "succeeded"]);

    const again = await customer.client.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_outcome: "succeeded",
    });

    expect(mapDatabaseError(again.error).code).toBe("PAYMENT_NOT_ALLOWED");
  });

  it("rejects a payment attempt for a COD order", async () => {
    const order = await newOrder("cod", "cod-payment");

    const result = await customer.client.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_outcome: "succeeded",
    });

    expect(mapDatabaseError(result.error).code).toBe("PAYMENT_NOT_ALLOWED");
  });

  it("rejects a payment attempt after the payment window has passed", async () => {
    const order = await newOrder("bank_transfer", "expired-payment");

    await service.from("orders").update({ payment_due_at: pastDate() }).eq("id", order.id);

    const result = await customer.client.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_outcome: "succeeded",
    });

    expect(mapDatabaseError(result.error).code).toBe("PAYMENT_EXPIRED");

    const attempts = await service.from("payment_attempts").select("id").eq("order_id", order.id);

    expect(attempts.data).toEqual([]);

    // Clean up the expired order so later expiry counts stay deterministic.
    const expired = await service.rpc("expire_unpaid_orders");
    expect(expired.error).toBeNull();
  });

  it("rejects a payment that waited on the order lock past the deadline", async () => {
    const order = await newOrder("bank_transfer", "deadline-lock");

    await runSql(
      `update public.orders set payment_due_at = clock_timestamp() + interval '2 seconds' where id = '${order.id}'`,
    );

    // Hold the order row across the deadline. The payment request starts
    // before the deadline and waits on this lock until after it.
    const lock = await startSqlSession(
      `begin; select 1 from public.orders where id = '${order.id}' for update; select pg_sleep(6); commit;`,
    );

    await waitForActiveQuery("pg_sleep");

    const payment = Promise.resolve(
      customer.client.rpc("record_payment_attempt", {
        p_order_id: order.id,
        p_outcome: "succeeded",
      }),
    );

    await waitForBlockedQuery("record_payment_attempt");

    await sleep(3000);
    await waitForExit(lock);

    const result = await payment;

    expect(mapDatabaseError(result.error).code).toBe("PAYMENT_EXPIRED");
    expect((await getOrder(service, order.id)).payment_status).toBe("unpaid");

    const attempts = await service.from("payment_attempts").select("id").eq("order_id", order.id);

    expect(attempts.data).toEqual([]);

    // Clean up the expired order so later expiry counts stay deterministic.
    const expired = await service.rpc("expire_unpaid_orders");
    expect(expired.error).toBeNull();
  });

  it("requires a paid bank transfer before confirmation and follows the state machine", async () => {
    const order = await newOrder("bank_transfer", "admin-transitions");

    const unpaidConfirm = await admin.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "confirm",
    });

    expect(mapDatabaseError(unpaidConfirm.error).code).toBe("PAYMENT_NOT_ALLOWED");

    await customer.client.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_outcome: "succeeded",
    });

    const confirmed = await admin.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "confirm",
    });

    expect(confirmed.error).toBeNull();
    expect(confirmed.data?.status).toBe("confirmed");

    const shipped = await admin.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "ship",
    });

    expect(shipped.data?.status).toBe("shipping");

    const delivered = await admin.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "deliver",
    });

    expect(delivered.data?.status).toBe("delivered");
    expect(delivered.data?.payment_status).toBe("paid");

    const invalid = await admin.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "ship",
    });

    expect(mapDatabaseError(invalid.error).code).toBe("ORDER_STATE_CONFLICT");
  });

  it("marks a delivered COD order as paid", async () => {
    const order = await newOrder("cod", "cod-delivery");

    const confirmed = await admin.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "confirm",
    });

    expect(confirmed.data?.status).toBe("confirmed");

    const shipped = await admin.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "ship",
    });

    expect(shipped.data?.status).toBe("shipping");

    const delivered = await admin.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "deliver",
    });

    expect(delivered.data?.status).toBe("delivered");
    expect(delivered.data?.payment_status).toBe("paid");
  });

  it("refunds a paid order when an administrator cancels it", async () => {
    const order = await newOrder("bank_transfer", "admin-cancel-paid");

    await customer.client.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_outcome: "succeeded",
    });

    const stockBefore = await getStock(service, product.variantId);

    const cancelled = await admin.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "cancel",
    });

    expect(cancelled.error).toBeNull();
    expect(cancelled.data).toMatchObject({ status: "cancelled", payment_status: "refunded" });
    expect(await getStock(service, product.variantId)).toBe(stockBefore + 1);
  });

  it("refunds a paid order when the customer cancels it", async () => {
    const order = await newOrder("bank_transfer", "customer-cancel-paid");

    await customer.client.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_outcome: "succeeded",
    });

    const stockBefore = await getStock(service, product.variantId);

    const cancelled = await customer.client.rpc("cancel_order", { p_order_id: order.id });

    expect(cancelled.error).toBeNull();
    expect(cancelled.data).toMatchObject({ status: "cancelled", payment_status: "refunded" });
    expect(await getStock(service, product.variantId)).toBe(stockBefore + 1);
  });

  it("expires an unpaid bank transfer exactly once and never expires COD", async () => {
    const order = await newOrder("bank_transfer", "expiry");
    const stockAfterOrder = await getStock(service, product.variantId);

    await service.from("orders").update({ payment_due_at: pastDate() }).eq("id", order.id);

    const first = await service.rpc("expire_unpaid_orders");

    expect(first.error).toBeNull();
    expect(first.data).toBe(1);

    const expired = await getOrder(service, order.id);

    expect(expired.status).toBe("cancelled");
    expect(expired.payment_status).toBe("unpaid");
    expect(expired.cancelled_by).toBeNull();
    expect(await getStock(service, product.variantId)).toBe(stockAfterOrder + 1);

    const second = await service.rpc("expire_unpaid_orders");

    expect(second.data).toBe(0);
    expect(await getStock(service, product.variantId)).toBe(stockAfterOrder + 1);

    const event = await service
      .from("order_events")
      .select("reason")
      .eq("order_id", order.id)
      .eq("to_status", "cancelled")
      .single();

    expect(event.data?.reason).toBe("payment_window_expired");

    const cod = await newOrder("cod", "expiry-cod");
    const stockAfterCod = await getStock(service, product.variantId);

    await service
      .from("orders")
      .update({ created_at: pastDate(60) })
      .eq("id", cod.id);

    const codOrderExpiry = await service.rpc("expire_unpaid_orders");

    expect(codOrderExpiry.data).toBe(0);
    expect((await getOrder(service, cod.id)).status).toBe("pending");
    expect(await getStock(service, product.variantId)).toBe(stockAfterCod);
  });

  it("keeps the final state consistent when cancellation and expiry race", async () => {
    const order = await newOrder("bank_transfer", "race-cancel-expire");
    const stockAfterOrder = await getStock(service, product.variantId);

    await service.from("orders").update({ payment_due_at: pastDate() }).eq("id", order.id);

    const [cancel, expire] = await Promise.all([
      customer.client.rpc("cancel_order", { p_order_id: order.id }),
      service.rpc("expire_unpaid_orders"),
    ]);

    expect(expire.error).toBeNull();

    if (cancel.error) {
      expect(mapDatabaseError(cancel.error).code).toBe("ORDER_NOT_CANCELLABLE");
    }

    const final = await getOrder(service, order.id);

    expect(final.status).toBe("cancelled");
    expect(await getStock(service, product.variantId)).toBe(stockAfterOrder + 1);
  });

  it("keeps the final state consistent when payment and cancellation race", async () => {
    const order = await newOrder("bank_transfer", "race-payment-cancel");
    const stockAfterOrder = await getStock(service, product.variantId);

    const [payment, cancellation] = await Promise.all([
      customer.client.rpc("record_payment_attempt", {
        p_order_id: order.id,
        p_outcome: "succeeded",
      }),
      customer.client.rpc("cancel_order", { p_order_id: order.id }),
    ]);

    expect(cancellation.error).toBeNull();

    if (payment.error) {
      expect(mapDatabaseError(payment.error).code).toBe("PAYMENT_NOT_ALLOWED");
    }

    const final = await getOrder(service, order.id);

    expect(final.status).toBe("cancelled");
    expect(["refunded", "unpaid"]).toContain(final.payment_status);
    expect(await getStock(service, product.variantId)).toBe(stockAfterOrder + 1);

    const attempts = await service
      .from("payment_attempts")
      .select("outcome")
      .eq("order_id", order.id);

    expect(attempts.data).toHaveLength(final.payment_status === "refunded" ? 1 : 0);
  });

  it("keeps the final state consistent when payment, cancellation, and expiry race", async () => {
    const order = await newOrder("bank_transfer", "race-three-way");
    const stockAfterOrder = await getStock(service, product.variantId);

    await service.from("orders").update({ payment_due_at: pastDate() }).eq("id", order.id);

    const [payment, cancellation, expiry] = await Promise.all([
      customer.client.rpc("record_payment_attempt", {
        p_order_id: order.id,
        p_outcome: "succeeded",
      }),
      customer.client.rpc("cancel_order", { p_order_id: order.id }),
      service.rpc("expire_unpaid_orders"),
    ]);

    expect(expiry.error).toBeNull();

    if (payment.error) {
      expect(["PAYMENT_EXPIRED", "PAYMENT_NOT_ALLOWED"]).toContain(
        mapDatabaseError(payment.error).code,
      );
    }

    if (cancellation.error) {
      expect(mapDatabaseError(cancellation.error).code).toBe("ORDER_NOT_CANCELLABLE");
    }

    const final = await getOrder(service, order.id);

    expect(final.status).toBe("cancelled");
    expect(await getStock(service, product.variantId)).toBe(stockAfterOrder + 1);
  });

  it("rejects administrator functions for customers and the expiry job for clients", async () => {
    const order = await newOrder("bank_transfer", "permissions");

    const adminAttempt = await customer.client.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "confirm",
    });

    expect(mapDatabaseError(adminAttempt.error).code).toBe("FORBIDDEN");

    const expireAttempt = await customer.client.rpc("expire_unpaid_orders");

    expect(mapDatabaseError(expireAttempt.error).code).toBe("FORBIDDEN");

    const anon = createAnonClient();
    const anonOrder = await anon.rpc("place_order", {
      p_idempotency_key: uniqueKey("anon"),
      p_recipient_name: "Anonymous",
      p_recipient_phone: "0900000000",
      p_shipping_address: "1 Test Street",
      p_shipping_method: "standard",
      p_payment_method: "cod",
    });

    expect(mapDatabaseError(anonOrder.error).code).toBe("UNAUTHENTICATED");

    const anonTransition = await anon.rpc("admin_transition_order", {
      p_order_id: order.id,
      p_action: "confirm",
    });

    expect(mapDatabaseError(anonTransition.error).code).toBe("UNAUTHENTICATED");
  });
});
