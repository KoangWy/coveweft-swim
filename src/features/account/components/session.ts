import "server-only";

import { getLocale } from "next-intl/server";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { getCurrentUser } from "@/server/auth";
import { getCart } from "@/server/cart";

/** The signed-in user for this request, or null. Memoized per request. */
export const loadCurrentUser = cache(async () => {
  const result = await getCurrentUser();
  return result.ok ? result.data : null;
});

/** Item count of the signed-in customer's cart; 0 for visitors. */
export const loadCartCount = cache(async () => {
  const user = await loadCurrentUser();
  if (!user) {
    return 0;
  }
  const cart = await getCart();
  return cart.ok ? cart.data.itemCount : 0;
});

/**
 * Returns the signed-in user, or sends a visitor to sign in and back to
 * `next` afterwards, in the same language.
 */
export async function requireUser(next: string) {
  const user = await loadCurrentUser();
  if (!user) {
    const locale = (await getLocale()) as Locale;
    return redirect({ href: `/sign-in?next=${encodeURIComponent(next)}`, locale });
  }
  return user;
}
