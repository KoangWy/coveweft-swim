import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";

import { AppDocument } from "@/components/layout/app-document";
import { NotFoundView } from "@/components/layout/not-found-view";
import { StorefrontFrame } from "@/components/layout/storefront-frame";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";

import "./globals.css";

/**
 * Locale of the requested URL. The locale middleware resolves it from the
 * path prefix and forwards it as a request header, so this works without
 * cookies.
 */
async function requestedLocale(): Promise<Locale> {
  const value = (await headers()).get("x-next-intl-locale");
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestedLocale();
  const t = await getTranslations({ locale, namespace: "notFound" });
  const tMeta = await getTranslations({ locale, namespace: "Metadata" });

  return { title: `${t("title")} | ${tMeta("title")}`, description: t("description") };
}

/**
 * Served with HTTP 404 for every URL that matches no route. It renders the
 * full storefront frame in the URL's language on the server, so the page is
 * complete without JavaScript.
 */
export default async function GlobalNotFound() {
  const locale = await requestedLocale();
  setRequestLocale(locale);

  return (
    <AppDocument locale={locale}>
      <StorefrontFrame>
        <NotFoundView />
      </StorefrontFrame>
    </AppDocument>
  );
}
