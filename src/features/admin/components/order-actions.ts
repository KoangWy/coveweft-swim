import type {
  OrderAction,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/server/commerce/types";

export type AdminOrderState = {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
};

/**
 * Actions the transition table allows from the current order state. A bank
 * transfer is confirmed only after its simulated payment succeeded; COD can
 * be confirmed while it is still unpaid.
 */
export function availableOrderActions(order: AdminOrderState): OrderAction[] {
  const actions: OrderAction[] = [];

  if (
    order.status === "pending" &&
    (order.paymentMethod === "cod" || order.paymentStatus === "paid")
  ) {
    actions.push("confirm");
  }

  if (order.status === "confirmed") {
    actions.push("ship");
  }

  if (order.status === "shipping") {
    actions.push("deliver");
  }

  if (order.status === "pending" || order.status === "confirmed") {
    actions.push("cancel");
  }

  return actions;
}

/** True when an unpaid bank transfer is waiting for its payment window. */
export function isWaitingForTransfer(order: AdminOrderState): boolean {
  return (
    order.status === "pending" &&
    order.paymentMethod === "bank_transfer" &&
    order.paymentStatus === "unpaid"
  );
}
