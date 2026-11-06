import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { refreshSupabaseSession, type SessionCookie } from "@/lib/supabase/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("refreshSupabaseSession", () => {
  it("does nothing when the Supabase environment is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    const request = new NextRequest("http://localhost:3000/en");
    const cookies: SessionCookie[] = [];
    const headers: Record<string, string> = {};

    await expect(refreshSupabaseSession(request, cookies, headers)).resolves.toBeUndefined();

    expect(cookies).toEqual([]);
    expect(headers).toEqual({});
  });
});
