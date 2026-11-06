"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { cx } from "@/components/ui/cx";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALES, type Locale } from "@/lib/locale";

function SwitcherLinks({ query, tone }: { query: string; tone: "light" | "dark" }) {
  const t = useTranslations("nav");
  const current = useLocale() as Locale;
  const pathname = usePathname();
  const href = query ? `${pathname}?${query}` : pathname;

  return (
    <div role="group" aria-label={t("language")}>
      <ul className="flex items-center rounded-md border border-neutral-300 p-0.5">
        {LOCALES.map((locale) => {
          const active = locale === current;
          return (
            <li key={locale}>
              <Link
                href={href}
                locale={locale}
                hrefLang={locale}
                lang={locale}
                aria-current={active ? "true" : undefined}
                title={t(`languages.${locale}`)}
                className={cx(
                  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-caption font-semibold uppercase transition-colors duration-150",
                  active
                    ? "bg-navy-900 text-white"
                    : tone === "light"
                      ? "text-navy-900 hover:bg-neutral-100"
                      : "text-navy-900 hover:bg-white",
                )}
              >
                <span aria-hidden>{locale}</span>
                <span className="sr-only">{t(`languages.${locale}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Links to the current page in each locale, keeping the path and query. The
 * server renders the target page in that language; no cookie is involved.
 */
export function LocaleSwitcherLinks({ tone = "light" }: { tone?: "light" | "dark" }) {
  // The page renders per request (see LocaleSwitcher), so the search params
  // are known during server rendering and the links work before hydration.
  const searchParams = useSearchParams();
  return <SwitcherLinks query={searchParams.toString()} tone={tone} />;
}
