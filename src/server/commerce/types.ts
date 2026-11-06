export const SHIPPING_METHODS = ["standard", "express"] as const;

export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export const PAYMENT_METHODS = ["cod", "bank_transfer"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipping",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_ACTIONS = ["confirm", "ship", "deliver", "cancel"] as const;

export type OrderAction = (typeof ORDER_ACTIONS)[number];

export const PAYMENT_OUTCOMES = ["succeeded", "failed"] as const;

export type PaymentOutcome = (typeof PAYMENT_OUTCOMES)[number];
