import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/server/auth/guard";
import { loadCart } from "@/server/cart/repository";
import { getStoreSettings } from "@/server/catalog/settings";
import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";
import { loadOrderDetail, type OrderRow } from "@/server/orders/repository";
import type { OrderDetail } from "@/server/orders/types";
import { parseInput, runService } from "@/server/result";

import { PlaceOrderInput, QuoteCheckoutInput } from "./schemas";
import { calculateShippingFee } from "./shipping";
import type { CheckoutQuote } from "./types";

export { calculateShippingFee } from "./shipping";

/**
 * Quotes a checkout from the current cart and the database store settings.
 * The client never supplies prices or totals.
 */
export async function quoteCheckout(input: unknown): Promise<Result<CheckoutQuote>> {
  return runService(async () => {
    const parsed = parseInput(QuoteCheckoutInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const cart = await loadCart(supabase, user.data.id);

    if (cart.items.length === 0) {
      return fail("VALIDATION_ERROR", { reason: "empty_cart" });
    }

    if (cart.issues.length > 0) {
      const code = cart.issues.some((issue) => issue.code === "PRODUCT_UNAVAILABLE")
        ? "PRODUCT_UNAVAILABLE"
        : "OUT_OF_STOCK";

      return fail(code, { issues: cart.issues });
    }

    const settings = await getStoreSettings();

    if (!settings.ok) {
      return settings;
    }

    const shippingFeeVnd = calculateShippingFee(
      cart.subtotalVnd,
      parsed.data.shippingMethod,
      settings.data,
    );

    return ok({
      items: cart.items,
      subtotalVnd: cart.subtotalVnd,
      shippingMethod: parsed.data.shippingMethod,
      shippingFeeVnd,
      totalVnd: cart.subtotalVnd + shippingFeeVnd,
      freeShippingThresholdVnd: settings.data.freeStandardShippingThresholdVnd,
      paymentWindowMinutes: settings.data.paymentWindowMinutes,
    });
  });
}

/**
 * Places an order through `place_order`. The database function recalculates
 * prices and fees, checks stock, deducts it, and clears the cart in one
 * transaction. A repeated idempotency key returns the existing order.
 */
export async function placeOrder(input: unknown): Promise<Result<OrderDetail>> {
  return runService(async () => {
    const parsed = parseInput(PlaceOrderInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const { data, error } = await supabase.rpc("place_order", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_recipient_name: parsed.data.recipientName,
      p_recipient_phone: parsed.data.recipientPhone,
      p_shipping_address: parsed.data.shippingAddress,
      p_shipping_method: parsed.data.shippingMethod,
      p_payment_method: parsed.data.paymentMethod,
    });

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("INTERNAL");
    }

    return ok(await loadOrderDetail(supabase, data as OrderRow));
  });
}
