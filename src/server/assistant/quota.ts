import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiConfig } from "@/lib/config/env";
import { mapDatabaseError } from "@/server/db/errors";
import { ServiceError } from "@/server/result";

export type QuotaRejection = "AI_QUOTA_USER_DAY" | "AI_QUOTA_USER_MINUTE" | "AI_QUOTA_GLOBAL";

export type QuotaDecision =
  | { allowed: true; remainingToday: number }
  | { allowed: false; code: QuotaRejection; remainingToday: number };

export type QuotaStatus = { remainingToday: number; globalPaused: boolean };

/** Counts accepted assistant questions. One question is one unit. */
export interface QuotaStore {
  consume(userId: string): Promise<QuotaDecision>;
  status(userId: string): Promise<QuotaStatus>;
}

const REJECTIONS: Readonly<Record<string, QuotaRejection>> = {
  user_day: "AI_QUOTA_USER_DAY",
  user_minute: "AI_QUOTA_USER_MINUTE",
  global: "AI_QUOTA_GLOBAL",
};

/**
 * Quota store backed by the `consume_ai_quota` and `get_ai_quota` Postgres
 * functions. Both run with the service role because the limits come from the
 * server configuration; the user id comes from the verified session.
 */
export function createDatabaseQuotaStore(
  client: SupabaseClient,
  quotas: AiConfig["quotas"],
): QuotaStore {
  const limits = {
    p_user_day_limit: quotas.perUserPerDay,
    p_user_minute_limit: quotas.perUserPerMinute,
    p_global_day_limit: quotas.globalPerDay,
    p_time_zone: quotas.timeZone,
  };

  async function call(name: string, userId: string): Promise<Record<string, unknown>> {
    const { data, error } = await client.rpc(name, { p_user_id: userId, ...limits });

    if (error || !data || typeof data !== "object") {
      const mapped = mapDatabaseError(error);
      throw new ServiceError(mapped.code, mapped.details);
    }

    return data as Record<string, unknown>;
  }

  return {
    async consume(userId) {
      const data = await call("consume_ai_quota", userId);
      const remainingToday = Number(data.remainingToday ?? 0);

      if (data.allowed === true) {
        return { allowed: true, remainingToday };
      }

      return {
        allowed: false,
        code: REJECTIONS[String(data.reason)] ?? "AI_QUOTA_USER_DAY",
        remainingToday,
      };
    },
    async status(userId) {
      const data = await call("get_ai_quota", userId);

      return {
        remainingToday: Number(data.remainingToday ?? 0),
        globalPaused: data.globalPaused === true,
      };
    },
  };
}
