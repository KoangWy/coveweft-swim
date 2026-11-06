import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALES } from "@/lib/locale";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Every page lives under /en or /vi, including the home page.
  localePrefix: "always",
  // The locale comes only from the URL. Without this, a request to / with
  // `Accept-Language: vi` would redirect to /vi instead of /en.
  localeDetection: false,
});
