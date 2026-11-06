import { z } from "zod";

import { PAYMENT_METHODS, SHIPPING_METHODS } from "@/server/commerce/types";

export const QuoteCheckoutInput = z.object({
  shippingMethod: z.enum(SHIPPING_METHODS),
});

export type QuoteCheckoutInput = z.infer<typeof QuoteCheckoutInput>;

export const PlaceOrderInput = z.object({
  idempotencyKey: z.string().trim().min(1).max(100),
  recipientName: z.string().trim().min(1).max(200),
  recipientPhone: z.string().trim().min(1).max(30),
  shippingAddress: z.string().trim().min(1).max(500),
  shippingMethod: z.enum(SHIPPING_METHODS),
  paymentMethod: z.enum(PAYMENT_METHODS),
});

export type PlaceOrderInput = z.infer<typeof PlaceOrderInput>;
