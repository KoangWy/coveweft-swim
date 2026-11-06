import type { Locale } from "@/lib/locale";

const formatters: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }),
  vi: new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }),
};

/**
 * Formats an integer VND amount for display. Prices are stored and calculated
 * as integers, so a fractional amount is a programming error.
 */
export function formatVnd(amount: number, locale: Locale = "en"): string {
  if (!Number.isInteger(amount)) {
    throw new RangeError(`VND amounts must be integers, received ${amount}.`);
  }

  return formatters[locale].format(amount);
}
