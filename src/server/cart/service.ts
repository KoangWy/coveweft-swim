import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthenticatedUser } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDatabaseError } from "@/server/db/errors";
import { throwDatabaseError } from "@/server/db/throw";
import { fail, ok, type Result } from "@/server/errors";
import { parseInput, runService, ServiceError } from "@/server/result";

import { loadCart } from "./repository";
import { AddToCartInput, RemoveCartItemInput, UpdateCartItemInput } from "./schemas";
import type { Cart } from "./types";

type VariantContext = {
  variant: { id: string; product_id: string; stock: number };
  product: { id: string; is_active: boolean };
};

async function loadVariantContext(
  supabase: SupabaseClient,
  variantId: string,
): Promise<VariantContext> {
  const { data: variant, error } = await supabase
    .from("product_variants")
    .select("id, product_id, stock")
    .eq("id", variantId)
    .maybeSingle();

  if (error) {
    throwDatabaseError(error);
  }

  if (!variant) {
    throw new ServiceError("NOT_FOUND", { variantId });
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, is_active")
    .eq("id", variant.product_id)
    .maybeSingle();

  if (productError) {
    throwDatabaseError(productError);
  }

  if (!product || !product.is_active) {
    throw new ServiceError("PRODUCT_UNAVAILABLE", { variantId });
  }

  return { variant, product };
}

/** Returns the signed-in customer cart with per-line stock and visibility issues. */
export async function getCart(): Promise<Result<Cart>> {
  return runService(async () => {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    return ok(await loadCart(supabase, user.data.id));
  });
}

/** Adds a quantity to a variant, accumulating with the existing cart line. */
export async function addToCart(input: unknown): Promise<Result<Cart>> {
  return runService(async () => {
    const parsed = parseInput(AddToCartInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const { error } = await supabase.rpc("add_cart_item", {
      p_variant_id: parsed.data.variantId,
      p_quantity: parsed.data.quantity,
    });

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    return ok(await loadCart(supabase, user.data.id));
  });
}

/** Replaces the quantity of an existing cart line. */
export async function updateCartItem(input: unknown): Promise<Result<Cart>> {
  return runService(async () => {
    const parsed = parseInput(UpdateCartItemInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const { variant } = await loadVariantContext(supabase, parsed.data.variantId);

    if (parsed.data.quantity > variant.stock) {
      return fail("OUT_OF_STOCK", {
        variantId: variant.id,
        availableStock: variant.stock,
        requestedQuantity: parsed.data.quantity,
      });
    }

    const { data, error } = await supabase
      .from("cart_items")
      .update({ quantity: parsed.data.quantity })
      .eq("user_id", user.data.id)
      .eq("variant_id", variant.id)
      .select("variant_id");

    if (error) {
      throwDatabaseError(error);
    }

    if (!data || data.length === 0) {
      return fail("NOT_FOUND", { variantId: variant.id });
    }

    return ok(await loadCart(supabase, user.data.id));
  });
}

/** Removes a cart line. Removing an already absent line is not an error. */
export async function removeCartItem(input: unknown): Promise<Result<Cart>> {
  return runService(async () => {
    const parsed = parseInput(RemoveCartItemInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", user.data.id)
      .eq("variant_id", parsed.data.variantId);

    if (error) {
      throwDatabaseError(error);
    }

    return ok(await loadCart(supabase, user.data.id));
  });
}
