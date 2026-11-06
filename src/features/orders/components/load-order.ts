import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { getMyOrder } from "@/server/orders";

const fetchOrder = cache((id: string) => getMyOrder({ id }));

/**
 * Loads one of the signed-in customer's orders. An unknown id, an invalid id,
 * or someone else's order all end in the 404 page.
 */
export async function loadOrderOr404(id: string) {
  const result = await fetchOrder(id);
  if (!result.ok) {
    if (["NOT_FOUND", "VALIDATION_ERROR", "FORBIDDEN"].includes(result.error.code)) {
      notFound();
    }
    throw new Error(`Could not load order (${result.error.code}).`);
  }
  return result.data;
}

/** Short reference shown to customers, from the first block of the order id. */
export function orderReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
