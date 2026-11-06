import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadProductImages } from "@/server/catalog/repository";
import { throwDatabaseError } from "@/server/db/throw";

import type { Cart, CartIssue, CartIssueCode, CartLine } from "./types";

type CartRow = {
  variant_id: string;
  quantity: number;
};

type VariantRow = {
  id: string;
  product_id: string;
  variant_sku: string;
  option_label: string;
  size_guide_key: string | null;
  stock: number;
};

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  price_vnd: number;
  is_active: boolean;
};

/**
 * Loads the caller cart with product and stock context. Lines whose product or
 * variant is no longer visible are kept so the customer can remove them.
 */
export async function loadCart(supabase: SupabaseClient, userId: string): Promise<Cart> {
  const { data: cartRows, error: cartError } = await supabase
    .from("cart_items")
    .select("variant_id, quantity")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("variant_id", { ascending: true });

  if (cartError) {
    throwDatabaseError(cartError);
  }

  const rows = (cartRows ?? []) as CartRow[];

  if (rows.length === 0) {
    return { items: [], issues: [], itemCount: 0, subtotalVnd: 0 };
  }

  const variantIds = rows.map((row) => row.variant_id);
  const { data: variantRows, error: variantError } = await supabase
    .from("product_variants")
    .select("id, product_id, variant_sku, option_label, size_guide_key, stock")
    .in("id", variantIds);

  if (variantError) {
    throwDatabaseError(variantError);
  }

  const variants = new Map(
    ((variantRows ?? []) as VariantRow[]).map((row) => [row.id, row] as const),
  );
  const productIds = [...new Set([...variants.values()].map((variant) => variant.product_id))];

  const { data: productRows, error: productError } = await supabase
    .from("products")
    .select("id, sku, name, price_vnd, is_active")
    .in("id", productIds);

  if (productError) {
    throwDatabaseError(productError);
  }

  const products = new Map(
    ((productRows ?? []) as ProductRow[]).map((row) => [row.id, row] as const),
  );
  const images = await loadProductImages(supabase, productIds, { includeHidden: false });

  const issues: CartIssue[] = [];
  const items: CartLine[] = [];
  let itemCount = 0;
  let subtotalVnd = 0;

  for (const row of rows) {
    const variant = variants.get(row.variant_id);
    const product = variant ? products.get(variant.product_id) : undefined;
    const lineIssues: CartIssueCode[] = [];
    let availableStock: number | undefined;

    if (!variant || !product || !product.is_active) {
      lineIssues.push("PRODUCT_UNAVAILABLE");
      issues.push({ variantId: row.variant_id, code: "PRODUCT_UNAVAILABLE" });
    } else if (variant.stock < row.quantity) {
      lineIssues.push("OUT_OF_STOCK");
      availableStock = variant.stock;
      issues.push({ variantId: row.variant_id, code: "OUT_OF_STOCK", availableStock });
    }

    const unitPriceVnd = product?.price_vnd ?? null;
    const lineTotalVnd = unitPriceVnd === null ? 0 : unitPriceVnd * row.quantity;

    itemCount += row.quantity;
    subtotalVnd += lineTotalVnd;

    items.push({
      variantId: row.variant_id,
      quantity: row.quantity,
      productId: product?.id ?? null,
      sku: product?.sku ?? null,
      productName: product?.name ?? null,
      variantSku: variant?.variant_sku ?? null,
      optionLabel: variant?.option_label ?? null,
      sizeGuideKey: variant?.size_guide_key ?? null,
      unitPriceVnd,
      lineTotalVnd,
      stock: variant?.stock ?? null,
      image: product ? (images.get(product.id)?.[0] ?? null) : null,
      issues: lineIssues,
    });
  }

  return { items, issues, itemCount, subtotalVnd };
}
