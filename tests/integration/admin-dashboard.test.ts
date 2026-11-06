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

import { adminDashboard } from "@/server/admin";

import { createAdmin, createCustomer, createServiceClient, type TestUser } from "./support/clients";
import {
  createServiceProduct,
  deleteServiceProducts,
  deleteTestUsers,
  uniqueToken,
  type ServiceProductFixture,
} from "./support/service-fixtures";
import { selectServiceClient } from "./support/service-context";

const BULK_ORDER_COUNT = 1_001;
const BULK_ORDER_TOTAL_VND = 1_000_000;

describe("admin dashboard aggregates", () => {
  const service = createServiceClient();
  const token = uniqueToken("dashboard");
  let admin: TestUser;
  let customer: TestUser;
  let product: ServiceProductFixture;

  beforeAll(async () => {
    admin = await createAdmin(service, "dashboard-admin");
    customer = await createCustomer(service, "dashboard-customer");
    product = await createServiceProduct(service, {
      token,
      name: `Dashboard product ${token}`,
      priceVnd: BULK_ORDER_TOTAL_VND,
      variants: [{ label: "S", stock: 100_000 }],
    });

    const orders = Array.from({ length: BULK_ORDER_COUNT }, (_, index) => ({
      id: crypto.randomUUID(),
      user_id: customer.id,
      idempotency_key: `bulk-${token}-${index}`,
      status: "delivered",
      payment_method: "cod",
      payment_status: "paid",
      recipient_name: "Bulk Customer",
      recipient_phone: "0900000000",
      shipping_address: "1 Bulk Street, District 1",
      shipping_method: "standard",
      shipping_fee_vnd: 0,
      items_subtotal_vnd: BULK_ORDER_TOTAL_VND,
      total_vnd: BULK_ORDER_TOTAL_VND,
    }));

    const insertedOrders = await service.from("orders").insert(orders);

    if (insertedOrders.error) {
      throw insertedOrders.error;
    }

    const items = orders.map((order) => ({
      order_id: order.id,
      variant_id: product.variantIds[0],
      product_id: product.productId,
      sku: product.sku,
      variant_sku: `${product.sku}-S`,
      product_name: `Dashboard product ${token}`,
      option_label: "S",
      unit_price_vnd: BULK_ORDER_TOTAL_VND,
      quantity: 1,
    }));

    const insertedItems = await service.from("order_items").insert(items);

    if (insertedItems.error) {
      throw insertedItems.error;
    }
  });

  afterAll(async () => {
    await deleteServiceProducts(service, [product?.productId]);
    await deleteTestUsers(service, [admin?.id, customer?.id]);
  });

  it("counts and sums beyond the PostgREST row cap", async () => {
    selectServiceClient(admin.client);

    const result = await adminDashboard();

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.data.orderCount).toBeGreaterThanOrEqual(BULK_ORDER_COUNT);
    expect(result.data.ordersByStatus.delivered).toBeGreaterThanOrEqual(BULK_ORDER_COUNT);
    expect(result.data.ordersByPaymentStatus.paid).toBeGreaterThanOrEqual(BULK_ORDER_COUNT);
    expect(result.data.revenueVnd).toBeGreaterThanOrEqual(BULK_ORDER_COUNT * BULK_ORDER_TOTAL_VND);

    const topProduct = result.data.topProducts.find((item) => item.sku === product.sku);

    expect(topProduct?.quantity).toBeGreaterThanOrEqual(BULK_ORDER_COUNT);
    expect(topProduct?.revenueVnd).toBeGreaterThanOrEqual(BULK_ORDER_COUNT * BULK_ORDER_TOTAL_VND);
  });
});
