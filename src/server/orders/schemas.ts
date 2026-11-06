import { z } from "zod";

import { ORDER_STATUSES, PAYMENT_OUTCOMES } from "@/server/commerce/types";

export const ListMyOrdersInput = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
});

export type ListMyOrdersInput = z.infer<typeof ListMyOrdersInput>;

export const GetMyOrderInput = z.object({
  id: z.uuid(),
});

export type GetMyOrderInput = z.infer<typeof GetMyOrderInput>;

export const CancelMyOrderInput = z.object({
  id: z.uuid(),
});

export type CancelMyOrderInput = z.infer<typeof CancelMyOrderInput>;

export const SimulatePaymentInput = z.object({
  orderId: z.uuid(),
  outcome: z.enum(PAYMENT_OUTCOMES),
});

export type SimulatePaymentInput = z.infer<typeof SimulatePaymentInput>;
