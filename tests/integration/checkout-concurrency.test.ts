import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCustomer, createServiceClient, deleteUsers, type TestUser } from "./support/clients";
import {
  startSqlSession,
  waitForActiveQuery,
  waitForBlockedQuery,
  waitForExit,
} from "./support/database";
import { addToCart, getStock, placeOrder, uniqueKey } from "./support/fixtures";

describe("checkout cart snapshot", () => {
  const service = createServiceClient();
  const users: TestUser[] = [];

  let customer: TestUser;
  let productId = "";
  let cheapVariantId: string;
  let expensiveVariantId: string;

  beforeAll(async () => {
    customer = await createCustomer(service, "checkout-snapshot");
    users.push(customer);

    const stamp = `${Date.now()}-${process.pid}`;
    const product = await service
      .from("products")
      .insert({
        sku: `SNAPSHOT-${stamp}`,
        name: "Snapshot product",
        product_type: "Tops",
        category: "Tops",
        gender: "Women",
        price_vnd: 100000,
      })
      .select("id")
      .single();

    if (product.error) {
      throw product.error;
    }

    productId = product.data.id;

    const cheap = await service
      .from("product_variants")
      .insert({
        product_id: productId,
        variant_sku: `SNAPSHOT-${stamp}-CHEAP`,
        option_label: "S",
        stock: 10,
        position: 1,
      })
      .select("id")
      .single();

    if (cheap.error) {
      throw cheap.error;
    }

    cheapVariantId = cheap.data.id;

    const expensive = await service
      .from("product_variants")
      .insert({
        product_id: productId,
        variant_sku: `SNAPSHOT-${stamp}-EXPENSIVE`,
        option_label: "M",
        stock: 10,
        position: 2,
      })
      .select("id")
      .single();

    if (expensive.error) {
      throw expensive.error;
    }

    expensiveVariantId = expensive.data.id;
  });

  afterAll(async () => {
    await deleteUsers(service, users);

    if (productId) {
      await service.from("products").delete().eq("id", productId);
    }
  });

  it("does not charge or deduct a cart row inserted mid-checkout", async () => {
    await addToCart(customer, cheapVariantId);

    // Hold a table lock that pauses checkout at its INSERT into orders, after
    // the cart snapshot was materialized. This is a test scheduling seam, not
    // a privilege available to API clients.
    const lock = await startSqlSession(
      "begin; lock table public.orders in share mode; select pg_sleep(5); commit;",
    );

    await waitForActiveQuery("pg_sleep");

    // Promise.resolve starts the request immediately; awaiting the builder
    // later would delay the fetch until the assertion.
    const checkout = Promise.resolve(
      placeOrder(customer.client, { idempotencyKey: uniqueKey("snapshot") }),
    );

    await waitForBlockedQuery("place_order");

    const lateCart = await customer.client
      .from("cart_items")
      .insert({ user_id: customer.id, variant_id: expensiveVariantId, quantity: 1 });

    expect(lateCart.error).toBeNull();

    await waitForExit(lock);

    const placed = await checkout;

    expect(placed.error).toBeNull();
    expect(placed.data).toMatchObject({
      items_subtotal_vnd: 100000,
      shipping_fee_vnd: 30000,
      total_vnd: 130000,
    });

    const items = await service
      .from("order_items")
      .select("variant_id, unit_price_vnd, quantity")
      .eq("order_id", placed.data.id);

    expect(items.data).toEqual([
      { variant_id: cheapVariantId, unit_price_vnd: 100000, quantity: 1 },
    ]);

    expect(await getStock(service, cheapVariantId)).toBe(9);
    expect(await getStock(service, expensiveVariantId)).toBe(10);

    const cart = await customer.client
      .from("cart_items")
      .select("variant_id")
      .eq("user_id", customer.id);

    expect(cart.data).toEqual([{ variant_id: expensiveVariantId }]);
  });
});
