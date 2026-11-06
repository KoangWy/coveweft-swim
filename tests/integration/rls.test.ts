import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAdmin,
  createAnonClient,
  createCustomer,
  createServiceClient,
  deleteUsers,
  type TestUser,
} from "./support/clients";
import {
  addToCart,
  createProductFixture,
  deleteProductFixture,
  placeOrder,
  uniqueKey,
  type ProductFixture,
} from "./support/fixtures";

describe("row level security", () => {
  const service = createServiceClient();
  const users: TestUser[] = [];
  const products: ProductFixture[] = [];

  let customerA: TestUser;
  let customerB: TestUser;
  let admin: TestUser;
  let activeProduct: ProductFixture;
  let hiddenProduct: ProductFixture;
  let orderA: string;
  let orderB: string;

  beforeAll(async () => {
    customerA = await createCustomer(service, "rls-a");
    customerB = await createCustomer(service, "rls-b");
    admin = await createAdmin(service, "rls-admin");
    users.push(customerA, customerB, admin);

    activeProduct = await createProductFixture(service, { stock: 10 });
    hiddenProduct = await createProductFixture(service, { stock: 10, isActive: false });
    products.push(activeProduct, hiddenProduct);

    const hiddenTranslation = await service.from("product_translations").insert({
      product_id: hiddenProduct.productId,
      locale: "vi",
      description: "Sản phẩm ẩn",
      caption: "Ảnh sản phẩm ẩn",
    });

    if (hiddenTranslation.error) {
      throw hiddenTranslation.error;
    }

    const hiddenImage = await service.from("product_images").insert({
      product_id: hiddenProduct.productId,
      kind: "studio",
      source: "release",
      path: `studio/${hiddenProduct.sku}/01`,
      position: 1,
    });

    if (hiddenImage.error) {
      throw hiddenImage.error;
    }

    await addToCart(customerA, activeProduct.variantId);
    const placedA = await placeOrder(customerA.client, { idempotencyKey: uniqueKey("rls-a") });

    if (placedA.error) {
      throw placedA.error;
    }

    orderA = placedA.data.id;

    await addToCart(customerB, activeProduct.variantId);
    const placedB = await placeOrder(customerB.client, {
      idempotencyKey: uniqueKey("rls-b"),
      paymentMethod: "bank_transfer",
    });

    if (placedB.error) {
      throw placedB.error;
    }

    orderB = placedB.data.id;

    const paymentAttempt = await customerB.client.rpc("record_payment_attempt", {
      p_order_id: orderB,
      p_outcome: "failed",
    });

    if (paymentAttempt.error) {
      throw paymentAttempt.error;
    }
  });

  afterAll(async () => {
    await deleteUsers(service, users);
    await Promise.all(products.map((product) => deleteProductFixture(service, product.productId)));
  });

  it("hides another customer's profile", async () => {
    const read = await customerA.client.from("profiles").select("id").eq("id", customerB.id);

    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const update = await customerA.client
      .from("profiles")
      .update({ full_name: "Hijacked" })
      .eq("id", customerB.id)
      .select("id");

    expect(update.error).toBeNull();
    expect(update.data).toEqual([]);

    const profileB = await service
      .from("profiles")
      .select("full_name")
      .eq("id", customerB.id)
      .single();

    expect(profileB.data?.full_name).not.toBe("Hijacked");
  });

  it("hides another customer's cart and blocks writes to it", async () => {
    await addToCart(customerB, activeProduct.variantId, 2);

    const read = await customerA.client.from("cart_items").select("*").eq("user_id", customerB.id);

    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const update = await customerA.client
      .from("cart_items")
      .update({ quantity: 99 })
      .eq("user_id", customerB.id)
      .select("variant_id");

    expect(update.error).toBeNull();
    expect(update.data).toEqual([]);

    const insert = await customerA.client
      .from("cart_items")
      .insert({ user_id: customerB.id, variant_id: activeProduct.variantId, quantity: 1 });

    expect(insert.error).not.toBeNull();

    const cartB = await service
      .from("cart_items")
      .select("quantity")
      .eq("user_id", customerB.id)
      .eq("variant_id", activeProduct.variantId)
      .single();

    expect(cartB.data?.quantity).toBe(2);
  });

  it("hides another customer's orders and payment history", async () => {
    const orders = await customerA.client.from("orders").select("id").eq("id", orderB);

    expect(orders.error).toBeNull();
    expect(orders.data).toEqual([]);

    const items = await customerA.client.from("order_items").select("id").eq("order_id", orderB);

    expect(items.error).toBeNull();
    expect(items.data).toEqual([]);

    const events = await customerA.client.from("order_events").select("id").eq("order_id", orderB);

    expect(events.error).toBeNull();
    expect(events.data).toEqual([]);

    const payments = await customerA.client
      .from("payment_attempts")
      .select("id")
      .eq("order_id", orderB);

    expect(payments.error).toBeNull();
    expect(payments.data).toEqual([]);

    // The fixture has a real payment attempt, so the denial above is meaningful.
    const storedAttempts = await service
      .from("payment_attempts")
      .select("outcome")
      .eq("order_id", orderB);

    expect(storedAttempts.data).toEqual([{ outcome: "failed" }]);

    const own = await customerA.client.from("orders").select("id").eq("id", orderA);
    expect(own.data).toHaveLength(1);
  });

  it("blocks direct writes to orders and payment attempts", async () => {
    const insertOrder = await customerA.client.from("orders").insert({
      user_id: customerA.id,
      idempotency_key: uniqueKey("direct"),
      payment_method: "cod",
      payment_status: "unpaid",
      recipient_name: "Direct",
      recipient_phone: "0900000000",
      shipping_address: "1 Test Street",
      shipping_method: "standard",
      shipping_fee_vnd: 0,
      items_subtotal_vnd: 0,
      total_vnd: 0,
    });

    expect(insertOrder.error).not.toBeNull();

    const updateOrder = await customerA.client
      .from("orders")
      .update({ status: "delivered" })
      .eq("id", orderA);

    expect(updateOrder.error).not.toBeNull();

    const insertPayment = await customerA.client
      .from("payment_attempts")
      .insert({ order_id: orderA, outcome: "succeeded" });

    expect(insertPayment.error).not.toBeNull();

    const updatePayment = await customerA.client
      .from("payment_attempts")
      .update({ outcome: "failed" })
      .eq("order_id", orderA);

    expect(updatePayment.error).not.toBeNull();

    const deleteOrder = await customerA.client.from("orders").delete().eq("id", orderA);
    expect(deleteOrder.error).not.toBeNull();

    const deleteItems = await customerA.client.from("order_items").delete().eq("order_id", orderA);
    expect(deleteItems.error).not.toBeNull();

    const deleteEvents = await customerA.client
      .from("order_events")
      .delete()
      .eq("order_id", orderA);
    expect(deleteEvents.error).not.toBeNull();

    const deletePayments = await customerA.client
      .from("payment_attempts")
      .delete()
      .eq("order_id", orderB);
    expect(deletePayments.error).not.toBeNull();

    const deleteAdjustments = await customerA.client
      .from("stock_adjustments")
      .delete()
      .eq("variant_id", activeProduct.variantId);
    expect(deleteAdjustments.error).not.toBeNull();

    const insertItem = await customerA.client.from("order_items").insert({
      order_id: orderA,
      variant_id: activeProduct.variantId,
      product_id: activeProduct.productId,
      sku: activeProduct.sku,
      variant_sku: activeProduct.variantSku,
      product_name: "Direct item",
      option_label: "S",
      unit_price_vnd: 100000,
      quantity: 1,
    });
    expect(insertItem.error).not.toBeNull();

    const updateItem = await customerA.client
      .from("order_items")
      .update({ quantity: 99 })
      .eq("order_id", orderA);
    expect(updateItem.error).not.toBeNull();

    const insertEvent = await customerA.client.from("order_events").insert({
      order_id: orderA,
      to_status: "cancelled",
      actor_role: "customer",
    });
    expect(insertEvent.error).not.toBeNull();

    const updateEvent = await customerA.client
      .from("order_events")
      .update({ reason: "Direct" })
      .eq("order_id", orderA);
    expect(updateEvent.error).not.toBeNull();

    const order = await service.from("orders").select("status").eq("id", orderA).single();
    expect(order.data?.status).toBe("pending");
  });

  it("blocks direct stock updates and role escalation", async () => {
    const stockUpdate = await customerA.client
      .from("product_variants")
      .update({ stock: 999 })
      .eq("id", activeProduct.variantId);

    expect(stockUpdate.error).not.toBeNull();

    const roleUpdate = await customerA.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", customerA.id);

    expect(roleUpdate.error).not.toBeNull();

    const profile = await service.from("profiles").select("role").eq("id", customerA.id).single();
    expect(profile.data?.role).toBe("customer");

    const stock = await service
      .from("product_variants")
      .select("stock")
      .eq("id", activeProduct.variantId)
      .single();

    expect(stock.data?.stock).not.toBe(999);
  });

  it("lets an administrator read all orders and write catalog rows", async () => {
    const orders = await admin.client.from("orders").select("id").in("id", [orderA, orderB]);

    expect(orders.error).toBeNull();
    expect(orders.data).toHaveLength(2);

    const profiles = await admin.client
      .from("profiles")
      .select("id")
      .in("id", [customerA.id, customerB.id]);

    expect(profiles.data).toHaveLength(2);

    const update = await admin.client
      .from("products")
      .update({ name: "Admin renamed" })
      .eq("id", activeProduct.productId)
      .select("id");

    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(1);
  });

  it("shows only active products to anonymous visitors", async () => {
    const anon = createAnonClient();

    const active = await anon.from("products").select("id").eq("id", activeProduct.productId);

    expect(active.error).toBeNull();
    expect(active.data).toHaveLength(1);

    const hidden = await anon.from("products").select("id").eq("id", hiddenProduct.productId);
    expect(hidden.data).toEqual([]);

    const activeVariant = await anon
      .from("product_variants")
      .select("id")
      .eq("product_id", activeProduct.productId);
    expect(activeVariant.data).toHaveLength(1);

    const hiddenVariant = await anon
      .from("product_variants")
      .select("id")
      .eq("product_id", hiddenProduct.productId);
    expect(hiddenVariant.data).toEqual([]);

    const hiddenTranslation = await anon
      .from("product_translations")
      .select("product_id")
      .eq("product_id", hiddenProduct.productId);
    expect(hiddenTranslation.data).toEqual([]);

    const hiddenImage = await anon
      .from("product_images")
      .select("id")
      .eq("product_id", hiddenProduct.productId);
    expect(hiddenImage.data).toEqual([]);

    const settings = await anon.from("store_settings").select("id").single();
    expect(settings.error).toBeNull();
    expect(settings.data?.id).toBe(1);

    const profiles = await anon.from("profiles").select("id").limit(1);
    expect(profiles.error).not.toBeNull();

    const orders = await anon.from("orders").select("id").limit(1);
    expect(orders.error).not.toBeNull();

    const cart = await anon.from("cart_items").select("variant_id").limit(1);
    expect(cart.error).not.toBeNull();

    const payments = await anon.from("payment_attempts").select("id").limit(1);
    expect(payments.error).not.toBeNull();

    const items = await anon.from("order_items").select("id").limit(1);
    expect(items.error).not.toBeNull();

    const events = await anon.from("order_events").select("id").limit(1);
    expect(events.error).not.toBeNull();
  });
});
