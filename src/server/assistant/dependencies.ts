import "server-only";

import { getAiConfig, getAdminSupabaseEnv } from "@/lib/config/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAiProvider } from "@/server/ai";
import { getAuthenticatedUser } from "@/server/auth/guard";
import { getProductBySku, getStoreSettings, listProducts } from "@/server/catalog";
import { imageUrl } from "@/server/media";

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
