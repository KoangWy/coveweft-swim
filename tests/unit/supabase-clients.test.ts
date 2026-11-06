import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}));

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { SUPABASE_AUTH_COOKIE_NAME } from "@/lib/supabase/cookie";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function storageKeyOf(client: SupabaseClient): string {
  // `storageKey` is protected on the auth client; the test reads the resolved
  // value to prove both factories share the same cookie.
  return (client.auth as unknown as { storageKey: string }).storageKey;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_local");
  vi.stubEnv("SUPABASE_URL_INTERNAL", "http://kong:8000");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase auth storage", () => {
  it("uses the same storage key in the browser and server clients", async () => {
    const browserClient = createSupabaseBrowserClient();
    const serverClient = await createSupabaseServerClient();

    expect(storageKeyOf(browserClient)).toBe(SUPABASE_AUTH_COOKIE_NAME);
    expect(storageKeyOf(serverClient)).toBe(SUPABASE_AUTH_COOKIE_NAME);
    expect(storageKeyOf(browserClient)).toBe(storageKeyOf(serverClient));
  });
});
