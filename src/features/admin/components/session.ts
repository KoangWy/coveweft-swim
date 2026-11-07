import "server-only";

import { getLocale } from "next-intl/server";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { getCurrentUser, type CurrentUser } from "@/server/auth";

/** The signed-in account for this request, or null. Memoized per request. */
export const loadAdminAccount = cache(async (): Promise<CurrentUser | null> => {
  const result = await getCurrentUser();
  return result.ok ? result.data : null;
});

/**
 * Server-side gate for every admin route. A visitor is sent to sign in and
 * back to the admin area; a signed-in customer is sent to their account page.
 * The check runs before the admin layout renders, so the admin pages and
 * services never run for a non-administrator.
 */
export async function requireAdminPage(next = "/admin"): Promise<CurrentUser> {
  const locale = (await getLocale()) as Locale;
  const user = await loadAdminAccount();

  if (!user) {
    return redirect({
      href: `/sign-in?next=${encodeURIComponent(next)}`,
      locale,
    });
  }

  if (user.role !== "admin") {
    return redirect({ href: "/account", locale });
  }

  return user;
}
