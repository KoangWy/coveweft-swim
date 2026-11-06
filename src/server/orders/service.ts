import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/server/auth/guard";
import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";
import { parseInput, runService } from "@/server/result";

import { loadOrderDetail, loadOrderSummaries, type OrderRow } from "./repository";
import {
  CancelMyOrderInput,
  GetMyOrderInput,
  ListMyOrdersInput,
  SimulatePaymentInput,
} from "./schemas";
import type { OrderDetail, OrderList } from "./types";

/** Lists the signed-in customer's orders, newest first. */
export async function listMyOrders(input: unknown = {}): Promise<Result<OrderList>> {
  return runService(async () => {
    const parsed = parseInput(ListMyOrdersInput, input ?? {});

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const from = (parsed.data.page - 1) * parsed.data.pageSize;
    const to = from + parsed.data.pageSize - 1;

    let query = supabase
      .from("orders")
      .select("*", { count: "exact" })
      .eq("user_id", user.data.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (parsed.data.status) {
      query = query.eq("status", parsed.data.status);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    const rows = (data ?? []) as OrderRow[];
    const total = count ?? rows.length;

    return ok({
      items: await loadOrderSummaries(supabase, rows),
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      pageCount: total === 0 ? 0 : Math.ceil(total / parsed.data.pageSize),
    });
  });
}

/** Returns one owned order with its immutable item snapshot and history. */
export async function getMyOrder(input: unknown): Promise<Result<OrderDetail>> {
  return runService(async () => {
    const parsed = parseInput(GetMyOrderInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
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

    return ok(await loadOrderDetail(supabase, data as OrderRow));
  });
}

/** Cancels an owned pending order through the database function. */
export async function cancelMyOrder(input: unknown): Promise<Result<OrderDetail>> {
  return runService(async () => {
    const parsed = parseInput(CancelMyOrderInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const { error } = await supabase.rpc("cancel_order", { p_order_id: parsed.data.id });

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    const { data, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (fetchError) {
      const mapped = mapDatabaseError(fetchError);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("NOT_FOUND");
    }

    return ok(await loadOrderDetail(supabase, data as OrderRow));
  });
}

/** Records a simulated bank transfer attempt and returns the updated order. */
export async function simulatePayment(input: unknown): Promise<Result<OrderDetail>> {
  return runService(async () => {
    const parsed = parseInput(SimulatePaymentInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user.ok) {
      return user;
    }

    const { error } = await supabase.rpc("record_payment_attempt", {
      p_order_id: parsed.data.orderId,
      p_outcome: parsed.data.outcome,
    });

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    const { data, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", parsed.data.orderId)
      .maybeSingle();

    if (fetchError) {
      const mapped = mapDatabaseError(fetchError);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("NOT_FOUND");
    }

    return ok(await loadOrderDetail(supabase, data as OrderRow));
  });
}
