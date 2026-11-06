import { LOCALES } from "@/lib/locale";

/**
 * Validates a `next` return path. Only same-site paths are accepted, and a
 * locale prefix is removed because redirects add the current locale.
 */
export function safeNextPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value) || value.length > 500) {
    return fallback;
  }
  for (const locale of LOCALES) {
    if (value === `/${locale}`) return "/";
    if (value.startsWith(`/${locale}/`)) return value.slice(locale.length + 1);
  }
  return value;
}
