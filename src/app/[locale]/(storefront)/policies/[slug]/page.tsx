import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ContactCard } from "@/features/policies/components/contact-card";
import { PolicyArticle } from "@/features/policies/components/policy-article";
import { ShippingRates } from "@/features/policies/components/shipping-rates";
import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import { isPolicySlug, POLICY_SLUGS } from "@/lib/site";
import { getStoreSettings } from "@/lib/store-settings";

export const dynamicParams = false;

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/policies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isPolicySlug(slug)) {
    return {};
  }
  const t = await getTranslations(`policies.${slug}`);
  return { title: t("title"), description: t("description") };
}

export default async function PolicyPage({ params }: PageProps<"/[locale]/policies/[slug]">) {
  const { slug } = await params;
  if (!isPolicySlug(slug)) {
    notFound();
  }

  const locale = (await getLocale()) as Locale;
  const settings = await getStoreSettings();
  const values = {
    standardFee: formatVnd(settings.standardShippingFeeVnd, locale),
    expressFee: formatVnd(settings.expressShippingFeeVnd, locale),
    threshold: formatVnd(settings.freeStandardShippingThresholdVnd, locale),
    minutes: String(settings.paymentWindowMinutes),
  };

  return (
    <PolicyArticle
      page={slug}
      values={values}
      beforeSections={
        slug === "shipping" ? <ShippingRates settings={settings} locale={locale} /> : undefined
      }
      afterSections={slug === "contact" || slug === "privacy" ? <ContactCard /> : undefined}
    />
  );
}
