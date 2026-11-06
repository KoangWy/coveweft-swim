import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth/guard";
import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";
import {
  loadCustomerSummaries,
  loadOrderDetail,
  loadOrderSummaries,
  mapAdminOrderDetail,
  mapAdminOrderSummary,
  type OrderRow,
} from "@/server/orders/repository";
import type { AdminOrderDetail, AdminOrderList } from "@/server/orders/types";
import { parseInput, runService } from "@/server/result";

import { isUuid, sanitizeOrTerm } from "./helpers";
import { AdminGetOrderInput, AdminListOrdersInput, AdminTransitionOrderInput } from "./schemas";

/** Lists orders for the admin table with optional status and search filters. */
export async function adminListOrders(input: unknown): Promise<Result<AdminOrderList>> {
  return runService(async () => {
    const parsed = parseInput(AdminListOrdersInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const from = (parsed.data.page - 1) * parsed.data.pageSize;
    const to = from + parsed.data.pageSize - 1;
    const term = parsed.data.q ? sanitizeOrTerm(parsed.data.q) : "";

    let query = supabase
      .from("orders")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (parsed.data.status) {
      query = query.eq("status", parsed.data.status);
    }

    if (parsed.data.paymentStatus) {
      query = query.eq("payment_status", parsed.data.paymentStatus);
    }

    if (parsed.data.paymentMethod) {
      query = query.eq("payment_method", parsed.data.paymentMethod);
    }

    if (term) {
      const parts = [`recipient_name.ilike.%${term}%`, `recipient_phone.ilike.%${term}%`];

      if (isUuid(term)) {
        parts.push(`id.eq.${term}`);
      }

      query = query.or(parts.join(","));
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    const rows = (data ?? []) as OrderRow[];
    const summaries = await loadOrderSummaries(supabase, rows);
    const customers = await loadCustomerSummaries(supabase, [
      ...new Set(rows.map((row) => row.user_id)),
    ]);
    const total = count ?? rows.length;

    return ok({
      items: summaries.map((summary, index) =>
        mapAdminOrderSummary(summary, customers.get(rows[index].user_id) ?? null),
      ),
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      pageCount: total === 0 ? 0 : Math.ceil(total / parsed.data.pageSize),
    });
  });
}

/** Returns one order with its items, payment attempts, events, and customer. */
export async function adminGetOrder(input: unknown): Promise<Result<AdminOrderDetail>> {
  return runService(async () => {
    const parsed = parseInput(AdminGetOrderInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("NOT_FOUND");
    }

    const row = data as OrderRow;
    const detail = await loadOrderDetail(supabase, row);
    const customers = await loadCustomerSummaries(supabase, [row.user_id]);

    return ok(mapAdminOrderDetail(detail, customers.get(row.user_id) ?? null));
  });
}

/** Applies confirm, ship, deliver, or cancel through the database function. */
export async function adminTransitionOrder(input: unknown): Promise<Result<AdminOrderDetail>> {
  return runService(async () => {
    const parsed = parseInput(AdminTransitionOrderInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { error } = await supabase.rpc("admin_transition_order", {
      p_order_id: parsed.data.orderId,
      p_action: parsed.data.action,
    });

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    return adminGetOrder({ id: parsed.data.orderId });
  });
}
