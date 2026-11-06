import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { TestUser } from "./clients";

export type QueryResult<T> = { data: T | null; error: PostgrestError | null };

export function requireData<T>(result: QueryResult<T>): T {
  if (result.error) {
    throw result.error;
  }

  if (result.data === null) {
    throw new Error("Expected the query to return a row.");
  }

  return result.data;
}

export type ProductFixture = {
  productId: string;
  variantId: string;
  sku: string;
  variantSku: string;
};

let sequence = 0;

export async function createProductFixture(
  service: SupabaseClient,
  options: { priceVnd?: number; stock?: number; isActive?: boolean } = {},
): Promise<ProductFixture> {
  sequence += 1;
  const stamp = `${Date.now()}-${process.pid}-${sequence}`;
  const sku = `TEST-${stamp}`;
  const variantSku = `${sku}-S`;

  const product = requireData<{ id: string }>(
    await service
      .from("products")
      .insert({
        sku,
        name: `Test product ${stamp}`,
        product_type: "Tops",
        category: "Tops",
        gender: "Women",
        price_vnd: options.priceVnd ?? 200000,
        is_active: options.isActive ?? true,
      })
      .select("id")
      .single(),
  );

  const variant = requireData<{ id: string }>(
    await service
      .from("product_variants")
      .insert({
        product_id: product.id,
        variant_sku: variantSku,
        option_label: "S",
        stock: options.stock ?? 5,
        position: 1,
      })
      .select("id")
      .single(),
  );

  return { productId: product.id, variantId: variant.id, sku, variantSku };
}

export async function deleteProductFixture(
  service: SupabaseClient,
  productId: string,
): Promise<void> {
  const result = await service.from("products").delete().eq("id", productId);

  if (result.error) {
    throw result.error;
  }
}

export async function addToCart(user: TestUser, variantId: string, quantity = 1): Promise<void> {
  const result = await user.client
    .from("cart_items")
    .insert({ user_id: user.id, variant_id: variantId, quantity });

  if (result.error) {
    throw result.error;
  }
}

export type PlaceOrderInput = {
  idempotencyKey: string;
  shippingMethod?: "standard" | "express";
  paymentMethod?: "cod" | "bank_transfer";
  recipientName?: string;
  recipientPhone?: string;
  shippingAddress?: string;
};

export function placeOrder(client: SupabaseClient, input: PlaceOrderInput) {
  return client.rpc("place_order", {
    p_idempotency_key: input.idempotencyKey,
    p_recipient_name: input.recipientName ?? "Test Recipient",
    p_recipient_phone: input.recipientPhone ?? "0900000000",
    p_shipping_address: input.shippingAddress ?? "1 Test Street, District 1",
    p_shipping_method: input.shippingMethod ?? "standard",
    p_payment_method: input.paymentMethod ?? "cod",
  });
}

export async function getStock(service: SupabaseClient, variantId: string): Promise<number> {
  const result = await service
    .from("product_variants")
    .select("stock")
    .eq("id", variantId)
    .single();

  return requireData<{ stock: number }>(result).stock;
}

export type OrderRow = {
  id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  shipping_method: string;
  shipping_fee_vnd: number;
  items_subtotal_vnd: number;
  total_vnd: number;
  payment_due_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
};

export async function getOrder(service: SupabaseClient, orderId: string): Promise<OrderRow> {
  const result = await service.from("orders").select("*").eq("id", orderId).single();

  return requireData<OrderRow>(result);
}

let keySequence = 0;

export function uniqueKey(prefix: string): string {
  keySequence += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${keySequence}`;
}
