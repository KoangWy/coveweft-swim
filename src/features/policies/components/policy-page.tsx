import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import type { PolicySlug } from "@/lib/site";
import { getStoreSettings } from "@/lib/store-settings";

import { ContactCard } from "./contact-card";
import { PolicyArticle } from "./policy-article";
import { ShippingRates } from "./shipping-rates";

export async function policyMetadata(slug: PolicySlug): Promise<Metadata> {
  const t = await getTranslations(`policies.${slug}`);
  return { title: t("title"), description: t("description") };
}

/**
 * A store policy page. Each slug has its own route file, so unknown slugs
 * match no route and get the server-rendered global 404.
 */
export async function PolicyPage({ slug }: { slug: PolicySlug }) {
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
