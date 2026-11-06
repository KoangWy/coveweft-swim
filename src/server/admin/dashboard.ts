import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth/guard";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type OrderStatus,
  type PaymentStatus,
} from "@/server/commerce/types";
import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";
import { runService } from "@/server/result";

import { ADMIN_LOW_STOCK_THRESHOLD } from "./helpers";
import type {
  AdminDashboard,
  AdminDashboardLowStockVariant,
  AdminDashboardTopProduct,
} from "./types";

type DashboardOrderRow = {
  id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_vnd: number;
};

type DashboardOrderItemRow = {
  product_id: string | null;
  sku: string;
  product_name: string;
  quantity: number;
  line_total_vnd: number;
};

type LowStockRow = {
  id: string;
  variant_sku: string;
  option_label: string;
  stock: number;
  product_id: string;
  products: { name: string; sku: string } | null;
};

function emptyCounts<TStatus extends string>(
  statuses: readonly TStatus[],
): Record<TStatus, number> {
  return Object.fromEntries(statuses.map((status) => [status, 0])) as Record<TStatus, number>;
}

/**
 * Builds the demo dashboard from real orders. Revenue counts delivered orders
 * whose payment is paid; cancelled and refunded orders are excluded. The UI
 * shows the demo-data label from the `demoData` flag.
 */
export async function adminDashboard(): Promise<Result<AdminDashboard>> {
  return runService(async () => {
    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { data: orderRows, error: orderError } = await supabase
      .from("orders")
      .select("id, status, payment_status, total_vnd");

    if (orderError) {
      const mapped = mapDatabaseError(orderError);
      return fail(mapped.code, mapped.details);
    }

    const orders = (orderRows ?? []) as DashboardOrderRow[];
    const ordersByStatus = emptyCounts(ORDER_STATUSES);
    const ordersByPaymentStatus = emptyCounts(PAYMENT_STATUSES);
    const paidDeliveredOrderIds: string[] = [];
    let revenueVnd = 0;

    for (const order of orders) {
      ordersByStatus[order.status] += 1;
      ordersByPaymentStatus[order.payment_status] += 1;

      if (order.status === "delivered" && order.payment_status === "paid") {
        revenueVnd += order.total_vnd;
        paidDeliveredOrderIds.push(order.id);
      }
    }

    let topProducts: AdminDashboardTopProduct[] = [];

    if (paidDeliveredOrderIds.length > 0) {
      const { data: itemRows, error: itemError } = await supabase
        .from("order_items")
        .select("product_id, sku, product_name, quantity, line_total_vnd")
        .in("order_id", paidDeliveredOrderIds);

      if (itemError) {
        const mapped = mapDatabaseError(itemError);
        return fail(mapped.code, mapped.details);
      }

      const aggregate = new Map<string, AdminDashboardTopProduct>();

      for (const item of (itemRows ?? []) as DashboardOrderItemRow[]) {
        const key = item.product_id ?? item.sku;
        const current = aggregate.get(key) ?? {
          productId: item.product_id,
          sku: item.sku,
          name: item.product_name,
          quantity: 0,
          revenueVnd: 0,
        };

        current.quantity += item.quantity;
        current.revenueVnd += item.line_total_vnd;
        aggregate.set(key, current);
      }

      topProducts = [...aggregate.values()]
        .sort(
          (left, right) =>
            right.revenueVnd - left.revenueVnd ||
            right.quantity - left.quantity ||
            left.sku.localeCompare(right.sku),
        )
        .slice(0, 5);
    }

    const { data: lowStockRows, error: lowStockError } = await supabase
      .from("product_variants")
      .select("id, variant_sku, option_label, stock, product_id, products(name, sku)")
      .lte("stock", ADMIN_LOW_STOCK_THRESHOLD)
      .order("stock", { ascending: true })
      .order("id", { ascending: true })
      .limit(10);

    if (lowStockError) {
      const mapped = mapDatabaseError(lowStockError);
      return fail(mapped.code, mapped.details);
    }

    const lowStockVariants: AdminDashboardLowStockVariant[] = (
      (lowStockRows ?? []) as unknown as LowStockRow[]
    ).map((row) => ({
      variantId: row.id,
      variantSku: row.variant_sku,
      productName: row.products?.name ?? "",
      productSku: row.products?.sku ?? "",
      optionLabel: row.option_label,
      stock: row.stock,
    }));

    return ok({
      demoData: true,
      revenueVnd,
      orderCount: orders.length,
      ordersByStatus,
      ordersByPaymentStatus,
      topProducts,
      lowStockVariants,
      lowStockThreshold: ADMIN_LOW_STOCK_THRESHOLD,
    });
  });
}
