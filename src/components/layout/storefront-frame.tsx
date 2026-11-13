import { Suspense, type ReactNode } from "react";

import { loadCartCount, loadCurrentUser } from "@/features/account/components/session";
import {
  AssistantProvider,
  AssistantSession,
} from "@/features/assistant/components/assistant-session";

import { NavigationProgress } from "./navigation-progress";
import { SiteFooter } from "./site-footer";
import { HeaderActions, SiteHeader } from "./site-header";
import { SkipLink } from "./skip-link";

async function HeaderSession() {
  const [user, cartCount] = await Promise.all([loadCurrentUser(), loadCartCount()]);
  return <HeaderActions cartCount={cartCount} signedIn={user !== null} />;
}

async function SessionAssistant() {
  const user = await loadCurrentUser();
  return <AssistantSession key={user?.id ?? "visitor"} userId={user?.id ?? null} />;
}

/**
 * Storefront frame: demo notice, header, page content, and footer. The
 * session-dependent parts (account and cart links, assistant) stream in, so
 * the frame and the page do not wait for the session lookup.
 */
export function StorefrontFrame({ children }: { children: ReactNode }) {
  return (
    <AssistantProvider>
      <SkipLink />
      <NavigationProgress />
      <SiteHeader
        actions={
          <Suspense fallback={<HeaderActions />}>
            <HeaderSession />
          </Suspense>
        }
      />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
      <Suspense fallback={null}>
        <SessionAssistant />
      </Suspense>
    </AssistantProvider>
  );
}
