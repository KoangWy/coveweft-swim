import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { POLICY_SLUGS, SHOP_CATEGORIES } from "@/lib/site";

import { Container } from "./container";
import { LocaleSwitcher } from "./locale-switcher";
import { Wordmark } from "./wordmark";

const linkClasses =
  "rounded-md text-small text-neutral-300 underline-offset-4 transition-colors duration-150 hover:text-white hover:underline focus-visible:outline-white";

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-small font-semibold text-white">{heading}</h2>
      <ul className="flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={linkClasses}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const HELP_SLUGS = POLICY_SLUGS.filter((slug) => slug !== "privacy" && slug !== "terms");

/**
 * Dark footer: brand, link columns, the study-project explanation with a link
 * to the About this demo page, and the language switch.
 */
export function SiteFooter() {
  const t = useTranslations();

  return (
    <footer className="relative mt-auto overflow-hidden bg-navy-950 text-white">
      <Container className="grid gap-12 pt-16 pb-12 md:grid-cols-12 md:gap-8">
        <div className="flex flex-col gap-5 md:col-span-5">
          <Wordmark tone="light" />
          <p className="text-heading font-display text-white">{t("common.tagline")}</p>
          <div className="max-w-[46ch] rounded-lg border border-navy-700 p-4">
            <h2 className="text-small font-semibold text-lime-300">{t("footer.aboutTitle")}</h2>
            <p className="mt-1.5 text-small text-neutral-300">{t("footer.about")}</p>
            <Link
              href="/about"
              className="mt-3 inline-flex rounded-md text-small font-semibold text-white underline underline-offset-4 hover:text-lime-300 focus-visible:outline-white"
            >
              {t("footer.aboutLink")}
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
          <FooterColumn
            heading={t("footer.shopHeading")}
            links={[
              { href: "/shop", label: t("nav.shop") },
              ...SHOP_CATEGORIES.map((category) => ({
                href: `/shop?group=${category}`,
                label: t(`nav.categories.${category}`),
              })),
            ]}
          />
          <FooterColumn
            heading={t("footer.helpHeading")}
            links={HELP_SLUGS.map((slug) => ({
              href: `/policies/${slug}`,
              label: t(`policies.names.${slug}`),
            }))}
          />
          <FooterColumn
            heading={t("footer.legalHeading")}
            links={[
              { href: "/policies/privacy", label: t("policies.names.privacy") },
              { href: "/policies/terms", label: t("policies.names.terms") },
            ]}
          />
        </div>
      </Container>
      <div className="border-t border-navy-800">
        <Container className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-neutral-300">{t("footer.notice")}</p>
          <div className="flex items-center gap-3">
            <span className="text-caption text-neutral-300">{t("footer.language")}</span>
            <LocaleSwitcher tone="inverse" />
          </div>
        </Container>
      </div>
      <p
        aria-hidden
        className="pointer-events-none -mb-[0.18em] text-center text-[clamp(4rem,17vw,15rem)] leading-[0.8] font-display text-navy-900 select-none"
      >
        {t("common.brand")}
      </p>
    </footer>
  );
}
