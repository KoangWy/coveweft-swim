import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";

import { routing } from "./routing";

export default getRequestConfig(async ({ locale, requestLocale }) => {
  if (!locale) {
    // Pages under [locale] read the root param. The global 404 page renders
    // outside that segment and sets the locale with setRequestLocale instead.
    const paramValue = (await rootParams.locale()) ?? (await requestLocale);

    if (hasLocale(routing.locales, paramValue)) {
      locale = paramValue;
    } else {
      notFound();
    }
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
