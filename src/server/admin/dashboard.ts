import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth/guard";
import type { OrderStatus, PaymentStatus } from "@/server/commerce/types";
import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";
import { runService } from "@/server/result";

import type { AdminDashboard } from "./types";

type DashboardRow = {
  demo_data: boolean;
  revenue_vnd: number;
  order_count: number;
  orders_by_status: Record<OrderStatus, number>;
  orders_by_payment_status: Record<PaymentStatus, number>;
  top_products: Array<{
    product_id: string | null;
    sku: string;
    name: string;
    quantity: number;
    revenue_vnd: number;
  }>;
  low_stock_variants: Array<{
    variant_id: string;
    variant_sku: string;
    product_name: string;
    product_sku: string;
    option_label: string;
    stock: number;
  }>;
  low_stock_threshold: number;
};

/**
 * Returns the demo dashboard from the database aggregate. The function checks
 * the administrator role and computes every metric in one query, so the
 * PostgREST row cap cannot truncate the totals. Revenue counts delivered
 * orders whose payment is paid; cancelled and refunded orders are excluded.
 */
export async function adminDashboard(): Promise<Result<AdminDashboard>> {
  return runService(async () => {
    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { data, error } = await supabase.rpc("admin_dashboard");

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("INTERNAL");
    }

    const row = data as DashboardRow;

    return ok({
      demoData: true,
      revenueVnd: row.revenue_vnd,
      orderCount: row.order_count,
      ordersByStatus: row.orders_by_status,
      ordersByPaymentStatus: row.orders_by_payment_status,
      topProducts: row.top_products.map((item) => ({
        productId: item.product_id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        revenueVnd: item.revenue_vnd,
      })),
      lowStockVariants: row.low_stock_variants.map((variant) => ({
        variantId: variant.variant_id,
        variantSku: variant.variant_sku,
        productName: variant.product_name,
        productSku: variant.product_sku,
        optionLabel: variant.option_label,
        stock: variant.stock,
      })),
      lowStockThreshold: row.low_stock_threshold,
    });
  });
}
