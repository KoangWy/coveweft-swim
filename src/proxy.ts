import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { routing } from "./i18n/routing";
import { refreshSupabaseSession, type SessionCookie } from "./lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const sessionCookies: SessionCookie[] = [];
  const sessionHeaders: Record<string, string> = {};

  // Refresh before the locale middleware builds its response so the updated
  // request cookies are visible to the rendered request. The refreshed
  // cookies and cache headers are then attached to the final response.
  await refreshSupabaseSession(request, sessionCookies, sessionHeaders);

  const response = handleI18nRouting(request);

  for (const { name, value, options } of sessionCookies) {
    response.cookies.set(name, value, options);
  }

  for (const [name, value] of Object.entries(sessionHeaders)) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  // Match every pathname except API routes, Next.js internals, and files with
  // an extension (for example /favicon.ico).
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
