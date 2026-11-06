import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseQuotaStore } from "@/server/assistant/quota";

import {
  createAnonClient,
  createCustomer,
  createServiceClient,
  deleteUsers,
  type TestUser,
} from "./support/clients";

const service = createServiceClient();

function store(limits: { day: number; minute: number; global: number }) {
  return createDatabaseQuotaStore(service, {
    perUserPerDay: limits.day,
    perUserPerMinute: limits.minute,
    globalPerDay: limits.global,
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

async function globalUsedToday(): Promise<number> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );
  const { data, error } = await service
    .from("ai_usage_global")
    .select("questions")
    .eq("day", today)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Number(data?.questions ?? 0);
}

const users: TestUser[] = [];

describe("assistant quota functions", () => {
  beforeAll(async () => {
    users.push(await createCustomer(service, "quota-a"));
    users.push(await createCustomer(service, "quota-b"));
    users.push(await createCustomer(service, "quota-c"));
  });

  afterAll(async () => {
    await deleteUsers(service, users);
  });

  it("consumes one unit per accepted question and stops at the daily limit", async () => {
    const quota = store({ day: 3, minute: 10, global: 1_000_000 });
    const user = users[0]!.id;

    expect(await quota.consume(user)).toEqual({ allowed: true, remainingToday: 2 });
    expect(await quota.consume(user)).toEqual({ allowed: true, remainingToday: 1 });
    expect(await quota.consume(user)).toEqual({ allowed: true, remainingToday: 0 });
    expect(await quota.consume(user)).toEqual({
      allowed: false,
      code: "AI_QUOTA_USER_DAY",
      remainingToday: 0,
    });
    expect(await quota.status(user)).toEqual({ remainingToday: 0, globalPaused: false });
  });

  it("limits questions per minute without consuming rejected requests", async () => {
    const quota = store({ day: 30, minute: 2, global: 1_000_000 });
    const user = users[1]!.id;

    await quota.consume(user);
    await quota.consume(user);

    expect(await quota.consume(user)).toEqual({
      allowed: false,
      code: "AI_QUOTA_USER_MINUTE",
      remainingToday: 28,
    });
    expect(await quota.status(user)).toMatchObject({ remainingToday: 28 });
  });

  it("pauses everyone at the global limit and never passes it under concurrency", async () => {
    const used = await globalUsedToday();
    const quota = store({ day: 30, minute: 30, global: used + 4 });
    const user = users[2]!.id;

    const results = await Promise.all(Array.from({ length: 10 }, () => quota.consume(user)));

    expect(results.filter((result) => result.allowed)).toHaveLength(4);
    expect(
      results.filter((result) => !result.allowed).map((result) => !result.allowed && result.code),
    ).toEqual(Array(6).fill("AI_QUOTA_GLOBAL"));
    expect(await quota.status(user)).toEqual({ remainingToday: 26, globalPaused: true });
    expect(await globalUsedToday()).toBe(used + 4);
  });

  it("is not callable by customers or visitors, and the counters are not readable", async () => {
    const args = {
      p_user_id: users[0]!.id,
      p_user_day_limit: 1_000_000,
      p_user_minute_limit: 1_000_000,
      p_global_day_limit: 1_000_000,
      p_time_zone: "Asia/Ho_Chi_Minh",
    };

    for (const client of [users[0]!.client, createAnonClient()]) {
      const consumed = await client.rpc("consume_ai_quota", args);
      expect(consumed.error?.code).toBe("42501");

      const read = await client.rpc("get_ai_quota", args);
      expect(read.error?.code).toBe("42501");

      const rows = await client.from("ai_usage_daily").select("*");
      expect(rows.data ?? []).toEqual([]);
    }
  });

  it("rejects invalid limits and time zones", async () => {
    const result = await service.rpc("consume_ai_quota", {
      p_user_id: users[0]!.id,
      p_user_day_limit: 0,
      p_user_minute_limit: 5,
      p_global_day_limit: 500,
      p_time_zone: "Mars/Olympus",
    });

    expect(result.error?.message).toBe("VALIDATION_ERROR");
  });
});
