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

import { addToCart } from "@/server/cart";
import { placeOrder } from "@/server/checkout";
import { cancelMyOrder, getMyOrder, listMyOrders, simulatePayment } from "@/server/orders";

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

const recipient = {
  recipientName: "Demo Customer",
  recipientPhone: "0900000000",
  shippingAddress: "1 Demo Street, District 1",
};

describe("orders service", () => {
  const service = createServiceClient();
  const token = uniqueToken("orders");
  let customer: TestUser;
  let otherCustomer: TestUser;
  let product: ServiceProductFixture;
  let sequence = 0;

  function nextKey() {
    sequence += 1;
    return `orders-${token}-${sequence}`;
  }

  async function place(user: TestUser, quantity: number, paymentMethod: "cod" | "bank_transfer") {
    selectServiceClient(user.client);
    await addToCart({ variantId: product.variantIds[0], quantity });

    const result = await placeOrder({
      idempotencyKey: nextKey(),
      ...recipient,
      shippingMethod: "standard",
      paymentMethod,
    });

    if (!result.ok) {
      throw new Error(`Could not place the order: ${result.error.code}`);
    }

    return result.data;
  }

  beforeAll(async () => {
    customer = await createCustomer(service, "orders-customer");
    otherCustomer = await createCustomer(service, "orders-other");
    product = await createServiceProduct(service, {
      token,
      name: `Orders product ${token}`,
      priceVnd: 200_000,
      variants: [{ label: "S", stock: 20, sizeGuideKey: "women-S" }],
    });
  });

  afterAll(async () => {
    await deleteServiceProducts(service, [product?.productId]);
    await deleteTestUsers(service, [customer?.id, otherCustomer?.id]);
  });

  it("lists and filters the customer orders", async () => {
    const order = await place(customer, 1, "cod");

    selectServiceClient(customer.client);
    const all = await listMyOrders();
    const pending = await listMyOrders({ status: "pending" });
    const cancelled = await listMyOrders({ status: "cancelled" });
    const page = await listMyOrders({ page: 1, pageSize: 1 });

    expect(all.ok && all.data.items.some((item) => item.id === order.id)).toBe(true);
    expect(pending.ok && pending.data.items.some((item) => item.id === order.id)).toBe(true);
    expect(cancelled.ok && cancelled.data.items.some((item) => item.id === order.id)).toBe(false);
    expect(page.ok && page.data.pageSize).toBe(1);
    expect(page.ok && page.data.items).toHaveLength(1);
  });

  it("returns one owned order and hides it from another customer", async () => {
    const order = await place(customer, 1, "cod");

    selectServiceClient(customer.client);
    const detail = await getMyOrder({ id: order.id });

    expect(detail.ok).toBe(true);

    if (detail.ok) {
      expect(detail.data.id).toBe(order.id);
      expect(detail.data.items).toHaveLength(1);
      expect(detail.data.itemCount).toBe(1);
    }

    selectServiceClient(otherCustomer.client);
    const foreign = await getMyOrder({ id: order.id });

    expect(foreign).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("cancels a pending order, restores stock, and rejects a second cancel", async () => {
    const stockBefore = await service
      .from("product_variants")
      .select("stock")
      .eq("id", product.variantIds[0])
      .single();

    const order = await place(customer, 2, "cod");

    const before = await service
      .from("product_variants")
      .select("stock")
      .eq("id", product.variantIds[0])
      .single();

    expect(before.data?.stock).toBe((stockBefore.data?.stock ?? 0) - 2);

    selectServiceClient(customer.client);
    const cancelled = await cancelMyOrder({ id: order.id });

    expect(cancelled.ok).toBe(true);

    if (cancelled.ok) {
      expect(cancelled.data.status).toBe("cancelled");
      expect(cancelled.data.cancelledAt).not.toBeNull();
    }

    const after = await service
      .from("product_variants")
      .select("stock")
      .eq("id", product.variantIds[0])
      .single();

    expect(after.data?.stock).toBe(stockBefore.data?.stock);

    const again = await cancelMyOrder({ id: order.id });

    expect(again.ok).toBe(false);

    if (!again.ok) {
      expect(again.error.code).toBe("ORDER_NOT_CANCELLABLE");
    }
  });

  it("records a failed and then a successful simulated payment", async () => {
    const order = await place(customer, 1, "bank_transfer");

    expect(order.paymentDueAt).not.toBeNull();

    selectServiceClient(customer.client);
    const failed = await simulatePayment({ orderId: order.id, outcome: "failed" });

    expect(failed.ok).toBe(true);

    if (failed.ok) {
      expect(failed.data.status).toBe("pending");
      expect(failed.data.paymentStatus).toBe("unpaid");
      expect(failed.data.paymentAttempts).toHaveLength(1);
      expect(failed.data.paymentAttempts[0]?.outcome).toBe("failed");
    }

    const succeeded = await simulatePayment({ orderId: order.id, outcome: "succeeded" });

    expect(succeeded.ok).toBe(true);

    if (succeeded.ok) {
      expect(succeeded.data.paymentStatus).toBe("paid");
      expect(succeeded.data.paymentAttempts.map((attempt) => attempt.outcome)).toEqual([
        "failed",
        "succeeded",
      ]);
    }

    const again = await simulatePayment({ orderId: order.id, outcome: "succeeded" });

    expect(again.ok).toBe(false);

    if (!again.ok) {
      expect(again.error.code).toBe("PAYMENT_NOT_ALLOWED");
    }
  });

  it("rejects a simulated payment for a COD order", async () => {
    const order = await place(customer, 1, "cod");

    selectServiceClient(customer.client);
    const result = await simulatePayment({ orderId: order.id, outcome: "succeeded" });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("PAYMENT_NOT_ALLOWED");
    }
  });

  it("rejects a payment after the payment window", async () => {
    const order = await place(customer, 1, "bank_transfer");

    await service
      .from("orders")
      .update({ payment_due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", order.id);

    selectServiceClient(customer.client);
    const result = await simulatePayment({ orderId: order.id, outcome: "succeeded" });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("PAYMENT_EXPIRED");
    }
  });

  it("requires a signed-in customer", async () => {
    selectServiceClient(createAnonClient());

    const result = await listMyOrders();

    expect(result).toEqual({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });
});
