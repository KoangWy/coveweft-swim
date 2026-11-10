import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Mona_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { MotionProvider } from "@/components/ui/motion-provider";
import { ToastProvider } from "@/components/ui/toast";
import type { Locale } from "@/lib/locale";

// Self-hosted at build time by next/font; the Vietnamese subset covers the
// full set of diacritics. One variable file carries every weight and the
// width axis used by the wide display cut.
const monaSans = Mona_Sans({
  subsets: ["latin", "vietnamese"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-mona-sans",
});

/**
 * The `<html>` document with the font and client providers. Shared by the
 * locale layout and the global 404 page so both render the same frame.
 */
export async function AppDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = await getTranslations("common");

  return (
    <html lang={locale} className={monaSans.variable}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <MotionProvider>
            <ToastProvider regionLabel={t("notifications")} dismissLabel={t("dismiss")}>
              {children}
            </ToastProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
