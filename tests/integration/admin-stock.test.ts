import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mapDatabaseError } from "@/server/db/errors";

import {
  createAdmin,
  createCustomer,
  createServiceClient,
  deleteUsers,
  type TestUser,
} from "./support/clients";
import {
  createProductFixture,
  deleteProductFixture,
  getStock,
  type ProductFixture,
} from "./support/fixtures";

describe("administrator stock and catalog writes", () => {
  const service = createServiceClient();
  const users: TestUser[] = [];
  const products: ProductFixture[] = [];

  let admin: TestUser;
  let customer: TestUser;
  let product: ProductFixture;

  beforeAll(async () => {
    admin = await createAdmin(service, "stock-admin");
    customer = await createCustomer(service, "stock-customer");
    users.push(admin, customer);

    product = await createProductFixture(service, { stock: 5 });
    products.push(product);
  });

  afterAll(async () => {
    await deleteUsers(service, users);
    await Promise.all(products.map((fixture) => deleteProductFixture(service, fixture.productId)));
  });

  it("adjusts stock by delta and by absolute value with an audit trail", async () => {
    const delta = await admin.client.rpc("admin_adjust_stock", {
      p_variant_id: product.variantId,
      p_delta: 3,
      p_reason: "Restock delivery",
    });

    expect(delta.error).toBeNull();
    expect(delta.data?.stock).toBe(8);

    const set = await admin.client.rpc("admin_adjust_stock", {
      p_variant_id: product.variantId,
      p_stock: 2,
      p_reason: "Stock count",
    });

    expect(set.error).toBeNull();
    expect(set.data?.stock).toBe(2);
    expect(await getStock(service, product.variantId)).toBe(2);

    const audit = await admin.client
      .from("stock_adjustments")
      .select("delta, stock_before, stock_after, reason")
      .eq("variant_id", product.variantId)
      .order("id");

    expect(audit.error).toBeNull();
    expect(audit.data).toEqual([
      { delta: 3, stock_before: 5, stock_after: 8, reason: "Restock delivery" },
      { delta: -6, stock_before: 8, stock_after: 2, reason: "Stock count" },
    ]);
  });

  it("rejects invalid adjustments without changing stock", async () => {
    const negative = await admin.client.rpc("admin_adjust_stock", {
      p_variant_id: product.variantId,
      p_delta: -100,
      p_reason: "Impossible",
    });

    expect(mapDatabaseError(negative.error).code).toBe("VALIDATION_ERROR");

    const both = await admin.client.rpc("admin_adjust_stock", {
      p_variant_id: product.variantId,
      p_delta: 1,
      p_stock: 10,
      p_reason: "Ambiguous",
    });

    expect(mapDatabaseError(both.error).code).toBe("VALIDATION_ERROR");

    const noReason = await admin.client.rpc("admin_adjust_stock", {
      p_variant_id: product.variantId,
      p_delta: 1,
    });

    expect(mapDatabaseError(noReason.error).code).toBe("VALIDATION_ERROR");
    expect(await getStock(service, product.variantId)).toBe(2);
  });

  it("rejects stock writes from customers", async () => {
    const rpc = await customer.client.rpc("admin_adjust_stock", {
      p_variant_id: product.variantId,
      p_delta: 1,
      p_reason: "Not allowed",
    });

    expect(mapDatabaseError(rpc.error).code).toBe("FORBIDDEN");

    const direct = await customer.client
      .from("product_variants")
      .update({ stock: 999 })
      .eq("id", product.variantId);

    expect(direct.error).not.toBeNull();
    expect(await getStock(service, product.variantId)).toBe(2);

    const audit = await customer.client
      .from("stock_adjustments")
      .select("id")
      .eq("variant_id", product.variantId);

    expect(audit.data).toEqual([]);
  });

  it("lets administrators edit catalog rows and blocks customers", async () => {
    const adminUpdate = await admin.client
      .from("products")
      .update({ name: "Administrator name" })
      .eq("id", product.productId)
      .select("id");

    expect(adminUpdate.error).toBeNull();
    expect(adminUpdate.data).toHaveLength(1);

    const customerUpdate = await customer.client
      .from("products")
      .update({ name: "Customer name" })
      .eq("id", product.productId)
      .select("id");

    expect(customerUpdate.error).toBeNull();
    expect(customerUpdate.data).toEqual([]);

    const customerInsert = await customer.client.from("products").insert({
      sku: `CUSTOMER-${Date.now()}`,
      name: "Customer product",
      product_type: "Tops",
      category: "Tops",
      gender: "Women",
      price_vnd: 100000,
    });

    expect(customerInsert.error).not.toBeNull();

    const stored = await service
      .from("products")
      .select("name")
      .eq("id", product.productId)
      .single();

    expect(stored.data?.name).toBe("Administrator name");
  });

  it("starts new variants at zero stock and keeps stock changes audited", async () => {
    const stamp = `${Date.now()}-${process.pid}`;

    const withStock = await admin.client.from("product_variants").insert({
      product_id: product.productId,
      variant_sku: `ADMIN-STOCK-${stamp}-BAD`,
      option_label: "M",
      stock: 777,
      position: 2,
    });

    expect(withStock.error).not.toBeNull();

    const inserted = await admin.client
      .from("product_variants")
      .insert({
        product_id: product.productId,
        variant_sku: `ADMIN-STOCK-${stamp}-OK`,
        option_label: "L",
        position: 3,
      })
      .select("id, stock")
      .single();

    expect(inserted.error).toBeNull();
    expect(inserted.data?.stock).toBe(0);

    const adjusted = await admin.client.rpc("admin_adjust_stock", {
      p_variant_id: inserted.data?.id,
      p_stock: 4,
      p_reason: "Initial stock",
    });

    expect(adjusted.error).toBeNull();
    expect(adjusted.data?.stock).toBe(4);

    const audit = await admin.client
      .from("stock_adjustments")
      .select("delta, stock_before, stock_after, reason")
      .eq("variant_id", inserted.data?.id)
      .single();

    expect(audit.data).toMatchObject({
      delta: 4,
      stock_before: 0,
      stock_after: 4,
      reason: "Initial stock",
    });

    const directUpdate = await admin.client
      .from("product_variants")
      .update({ stock: 99 })
      .eq("id", inserted.data?.id);

    expect(directUpdate.error).not.toBeNull();

    const customerInsert = await customer.client.from("product_variants").insert({
      product_id: product.productId,
      variant_sku: `ADMIN-STOCK-${stamp}-CUSTOMER`,
      option_label: "XL",
    });

    expect(customerInsert.error).not.toBeNull();
  });
});
