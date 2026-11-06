"use server";

import { refresh } from "next/cache";

import { addToCart, removeCartItem, updateCartItem, type Cart } from "@/server/cart";
import type { ErrorCode, Result } from "@/server/errors";

export type CartActionResult =
  { ok: true; itemCount: number } | { ok: false; code: ErrorCode; availableStock?: number };

function toActionResult(result: Result<Cart>): CartActionResult {
  if (result.ok) {
    refresh();
    return { ok: true, itemCount: result.data.itemCount };
  }

  const details = result.error.details as { availableStock?: unknown } | undefined;
  return {
    ok: false,
    code: result.error.code,
    availableStock:
      typeof details?.availableStock === "number" ? details.availableStock : undefined,
  };
}

export async function addToCartAction(input: {
  variantId: string;
  quantity: number;
}): Promise<CartActionResult> {
  return toActionResult(await addToCart(input));
}

export async function updateCartItemAction(input: {
  variantId: string;
  quantity: number;
}): Promise<CartActionResult> {
  return toActionResult(await updateCartItem(input));
}

export async function removeCartItemAction(input: {
  variantId: string;
}): Promise<CartActionResult> {
  return toActionResult(await removeCartItem(input));
}
