"use server";

import {
  fieldErrorsFrom,
  formLocale,
  formValues,
  type FormState,
} from "@/components/ui/form-errors";
import { redirect } from "@/i18n/navigation";
import { placeOrder } from "@/server/checkout";

const FIELDS = [
  "recipientName",
  "recipientPhone",
  "shippingAddress",
  "shippingMethod",
  "paymentMethod",
];

/**
 * Places the order with the idempotency key the checkout page generated when
 * it opened. Submitting twice with the same key returns the same order.
 */
export async function placeOrderAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData, ["idempotencyKey", ...FIELDS]);
  const result = await placeOrder(values);
  const locale = formLocale(formData);

  if (!result.ok) {
    const { code, details } = result.error;
    if (code === "OUT_OF_STOCK" || code === "PRODUCT_UNAVAILABLE" || code === "CART_CHANGED") {
      redirect({ href: "/cart?notice=stock", locale });
    }
    if (code === "UNAUTHENTICATED") {
      redirect({ href: `/sign-in?next=${encodeURIComponent("/checkout")}`, locale });
    }
    if (code === "VALIDATION_ERROR" && (details as { reason?: string })?.reason === "empty_cart") {
      redirect({ href: "/cart", locale });
    }
    return {
      code,
      fieldErrors: code === "VALIDATION_ERROR" ? fieldErrorsFrom(details) : {},
      values,
    };
  }

  const order = result.data;
  redirect({
    href:
      order.paymentMethod === "bank_transfer"
        ? `/account/orders/${order.id}/pay`
        : `/checkout/confirmation/${order.id}`,
    locale,
  });
  return {};
}
