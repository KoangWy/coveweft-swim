import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShippingMethod,
} from "@/server/commerce/types";
import { throwDatabaseError } from "@/server/db/throw";

import type {
  AdminOrderDetail,
  AdminOrderSummary,
  CustomerSummary,
  OrderDetail,
  OrderEvent,
  OrderItem,
  OrderSummary,
  PaymentAttempt,
} from "./types";

export type OrderRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  recipient_name: string;
  recipient_phone: string;
  shipping_address: string;
  shipping_method: ShippingMethod;
  shipping_fee_vnd: number;
  items_subtotal_vnd: number;
  total_vnd: number;
  payment_due_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  variant_id: string | null;
  product_id: string | null;
  sku: string;
  variant_sku: string;
  product_name: string;
  option_label: string;
  unit_price_vnd: number;
  quantity: number;
  line_total_vnd: number;
};

type PaymentAttemptRow = {
  id: string;
  order_id: string;
  outcome: "succeeded" | "failed";
  created_at: string;
};

type OrderEventRow = {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  from_payment_status: PaymentStatus | null;
  to_payment_status: PaymentStatus;
  actor_role: "customer" | "admin" | "system";
  reason: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  default_address: string | null;
};

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    variantId: row.variant_id,
    productId: row.product_id,
    sku: row.sku,
    variantSku: row.variant_sku,
    productName: row.product_name,
    optionLabel: row.option_label,
    unitPriceVnd: row.unit_price_vnd,
    quantity: row.quantity,
    lineTotalVnd: row.line_total_vnd,
  };
}

function mapPaymentAttempt(row: PaymentAttemptRow): PaymentAttempt {
  return { id: row.id, outcome: row.outcome, createdAt: row.created_at };
}

function mapOrderEvent(row: OrderEventRow): OrderEvent {
  return {
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    fromPaymentStatus: row.from_payment_status,
    toPaymentStatus: row.to_payment_status,
    actorRole: row.actor_role,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function mapCustomer(row: ProfileRow): CustomerSummary {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    defaultAddress: row.default_address,
  };
}

export function mapOrderSummary(row: OrderRow, items: OrderItem[]): OrderSummary {
  return {
    id: row.id,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    shippingAddress: row.shipping_address,
    shippingMethod: row.shipping_method,
    shippingFeeVnd: row.shipping_fee_vnd,
    itemsSubtotalVnd: row.items_subtotal_vnd,
    totalVnd: row.total_vnd,
    paymentDueAt: row.payment_due_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
  };
}

export async function loadOrderItems(
  supabase: SupabaseClient,
  orderIds: string[],
): Promise<Map<string, OrderItem[]>> {
  const grouped = new Map<string, OrderItem[]>();

  if (orderIds.length === 0) {
    return grouped;
  }

  const { data, error } = await supabase
    .from("order_items")
    .select(
      "id, order_id, variant_id, product_id, sku, variant_sku, product_name, option_label, unit_price_vnd, quantity, line_total_vnd",
    )
    .in("order_id", orderIds)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throwDatabaseError(error);
  }

  for (const row of (data ?? []) as OrderItemRow[]) {
    const list = grouped.get(row.order_id) ?? [];
    list.push(mapOrderItem(row));
    grouped.set(row.order_id, list);
  }

  return grouped;
}

export async function loadOrderSummaries(
  supabase: SupabaseClient,
  rows: OrderRow[],
): Promise<OrderSummary[]> {
  const items = await loadOrderItems(
    supabase,
    rows.map((row) => row.id),
  );

  return rows.map((row) => mapOrderSummary(row, items.get(row.id) ?? []));
}

export async function loadOrderDetail(
  supabase: SupabaseClient,
  row: OrderRow,
): Promise<OrderDetail> {
  const [items, attempts, events] = await Promise.all([
    loadOrderItems(supabase, [row.id]),
    supabase
      .from("payment_attempts")
      .select("id, order_id, outcome, created_at")
      .eq("order_id", row.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("order_events")
      .select(
        "id, order_id, from_status, to_status, from_payment_status, to_payment_status, actor_role, reason, created_at",
      )
      .eq("order_id", row.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (attempts.error) {
    throwDatabaseError(attempts.error);
  }

  if (events.error) {
    throwDatabaseError(events.error);
  }

  return {
    ...mapOrderSummary(row, items.get(row.id) ?? []),
    cancelledBy: row.cancelled_by,
    paymentAttempts: ((attempts.data ?? []) as PaymentAttemptRow[]).map(mapPaymentAttempt),
    events: ((events.data ?? []) as OrderEventRow[]).map(mapOrderEvent),
  };
}

export async function loadCustomerSummaries(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, CustomerSummary>> {
  const customers = new Map<string, CustomerSummary>();

  if (userIds.length === 0) {
    return customers;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, default_address")
    .in("id", userIds);

  if (error) {
    throwDatabaseError(error);
  }

  for (const row of (data ?? []) as ProfileRow[]) {
    customers.set(row.id, mapCustomer(row));
  }

  return customers;
}

export function mapAdminOrderSummary(
  summary: OrderSummary,
  customer: CustomerSummary | null,
): AdminOrderSummary {
  return { ...summary, customer };
}

export function mapAdminOrderDetail(
  detail: OrderDetail,
  customer: CustomerSummary | null,
): AdminOrderDetail {
  return { ...detail, customer };
}
