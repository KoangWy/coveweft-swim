import type { CartLine } from "@/server/cart/types";
import type { ShippingMethod } from "@/server/commerce/types";

export type CheckoutQuote = {
  items: CartLine[];
  subtotalVnd: number;
  shippingMethod: ShippingMethod;
  shippingFeeVnd: number;
  totalVnd: number;
  freeShippingThresholdVnd: number;
  paymentWindowMinutes: number;
};
