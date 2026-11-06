import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";
import { runService } from "@/server/result";

import type { StoreSettings } from "./types";

type StoreSettingsRow = {
  standard_shipping_fee_vnd: number;
  express_shipping_fee_vnd: number;
  free_shipping_threshold_vnd: number;
  payment_window_minutes: number;
};

/**
 * Reads the single `store_settings` row. The database row is the source of
 * truth for shipping fees, the free-shipping threshold, and the payment
 * window; environment variables never carry these values.
 */
export async function getStoreSettings(): Promise<Result<StoreSettings>> {
  return runService(async () => {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("store_settings")
      .select(
        "standard_shipping_fee_vnd, express_shipping_fee_vnd, free_shipping_threshold_vnd, payment_window_minutes",
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      return fail(mapDatabaseError(error).code);
    }

    if (!data) {
      return fail("NOT_FOUND", { reason: "store_settings_missing" });
    }

    const row = data as StoreSettingsRow;

    return ok({
      standardShippingFeeVnd: row.standard_shipping_fee_vnd,
      expressShippingFeeVnd: row.express_shipping_fee_vnd,
      freeStandardShippingThresholdVnd: row.free_shipping_threshold_vnd,
      paymentWindowMinutes: row.payment_window_minutes,
    });
  });
}
