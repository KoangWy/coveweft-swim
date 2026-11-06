import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AppDocument } from "@/components/layout/app-document";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/locale";

import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");

  return {
    title: { default: t("title"), template: `%s | ${t("title")}` },
    description: t("description"),
  };
}

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = (await getLocale()) as Locale;

  return <AppDocument locale={locale}>{children}</AppDocument>;
}
