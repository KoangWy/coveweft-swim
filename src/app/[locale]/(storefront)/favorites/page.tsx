import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Container } from "@/components/layout/container";
import { FavoritesGrid } from "@/features/favorites/components/favorites-grid";
import type { Locale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("favorites");
  return { title: t("title"), robots: { index: false, follow: true } };
}

export default async function FavoritesPage() {
  const t = await getTranslations("favorites");
  const locale = (await getLocale()) as Locale;
  return (
    <Container className="py-8 lg:py-12">
      <Breadcrumb items={[{ label: t("title") }]} />
      <h1 className="mt-6 text-title font-display md:text-display">{t("title")}</h1>
      <p className="mt-3 mb-10 max-w-[55ch] text-body text-neutral-600">{t("description")}</p>
      <FavoritesGrid locale={locale} />
    </Container>
  );
}
