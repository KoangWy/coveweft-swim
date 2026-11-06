import type { ReactNode } from "react";

import { loadCartCount, loadCurrentUser } from "@/features/account/components/session";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { SkipLink } from "./skip-link";

/** Storefront frame: demo banner, header, page content, and footer. */
export async function StorefrontFrame({ children }: { children: ReactNode }) {
  const [user, cartCount] = await Promise.all([loadCurrentUser(), loadCartCount()]);

  return (
    <>
      <SkipLink />
      <SiteHeader cartCount={cartCount} signedIn={user !== null} />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
