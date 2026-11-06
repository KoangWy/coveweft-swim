"use server";

import { refresh } from "next/cache";

import type { ErrorCode } from "@/server/errors";
import { cancelMyOrder, simulatePayment } from "@/server/orders";
import type { PaymentOutcome } from "@/server/commerce/types";

export type OrderActionResult =
  | { ok: true; paymentStatus: string; status: string; lastOutcome: PaymentOutcome | null }
  | { ok: false; code: ErrorCode };

export async function cancelOrderAction(orderId: string): Promise<OrderActionResult> {
  const result = await cancelMyOrder({ id: orderId });
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  return {
    ok: true,
    status: result.data.status,
    paymentStatus: result.data.paymentStatus,
    lastOutcome: null,
  };
}

export async function simulatePaymentAction(
  orderId: string,
  outcome: PaymentOutcome,
): Promise<OrderActionResult> {
  const result = await simulatePayment({ orderId, outcome });
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  const attempts = [...result.data.paymentAttempts].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return {
    ok: true,
    status: result.data.status,
    paymentStatus: result.data.paymentStatus,
    lastOutcome: attempts.at(-1)?.outcome ?? null,
  };
}
