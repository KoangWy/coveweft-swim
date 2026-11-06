import "server-only";

import { getAiConfig, getAdminSupabaseEnv } from "@/lib/config/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAiProvider } from "@/server/ai";
import { getAuthenticatedUser } from "@/server/auth/guard";
import { getProductBySku, getStoreSettings, listProducts } from "@/server/catalog";
import { imageUrl } from "@/server/media";

import type { PrivacyProfile } from "./privacy";
import { createDatabaseQuotaStore } from "./quota";
import type { ChatDependencies } from "./service";

function hasAdminKey(): boolean {
  try {
    getAdminSupabaseEnv();
    return true;
  } catch {
    return false;
  }
}

/**
 * Production wiring: the request session decides the user, catalog tools read
 * with the caller's own permissions, and quotas use the service role.
 */
export const chatDependencies: ChatDependencies = {
  config: getAiConfig,
  createProvider: () => createAiProvider(),
  async getUser() {
    const user = await getAuthenticatedUser(await createSupabaseServerClient());

    return user.ok ? { id: user.data.id } : null;
  },
  async getPrivacyProfile(userId): Promise<PrivacyProfile | null> {
    // Read with the customer's own session; RLS limits it to their profile.
    const supabase = await createSupabaseServerClient();
    const [{ data: auth }, profile] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("profiles")
        .select("full_name, phone, default_address")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    if (profile.error) {
      throw profile.error;
    }

    const row = profile.data as {
      full_name: string | null;
      phone: string | null;
      default_address: string | null;
    } | null;

    return {
      email: auth.user?.id === userId ? (auth.user.email ?? null) : null,
      fullName: row?.full_name ?? null,
      phone: row?.phone ?? null,
      defaultAddress: row?.default_address ?? null,
    };
  },
  quota(config) {
    return hasAdminKey()
      ? createDatabaseQuotaStore(createSupabaseAdminClient(), config.quotas)
      : null;
  },
  catalog: {
    listProducts,
    getProductBySku,
    getStoreSettings,
    imageUrl: (image) => imageUrl(image, 480),
  },
};
