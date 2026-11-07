import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { adminGetOrder, adminGetProduct } from "@/server/admin";

const fetchProduct = cache((id: string) => adminGetProduct({ id }));

/**
 * Loads one product for the editor. An unknown or malformed id ends in the
 * localized 404; other failures surface through the route error boundary.
 */
export async function loadAdminProductOr404(id: string) {
  const result = await fetchProduct(id);

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND" || result.error.code === "VALIDATION_ERROR") {
      notFound();
    }
    throw new Error(`Could not load product (${result.error.code}).`);
  }

  return result.data;
}

const fetchOrder = cache((id: string) => adminGetOrder({ id }));

/** Loads one order for the detail page, or ends the request with a 404. */
export async function loadAdminOrderOr404(id: string) {
  const result = await fetchOrder(id);

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND" || result.error.code === "VALIDATION_ERROR") {
      notFound();
    }
    throw new Error(`Could not load order (${result.error.code}).`);
  }

  return result.data;
}
