import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { POLICY_SLUGS, SHOP_CATEGORIES } from "@/lib/site";

import { Container } from "./container";
import { LocaleSwitcher } from "./locale-switcher";
import { Wordmark } from "./wordmark";

const linkClasses =
  "rounded-md text-small text-neutral-700 underline-offset-2 hover:text-navy-900 hover:underline";

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-small font-semibold text-navy-900">{heading}</h2>
      <ul className="flex flex-col gap-2">
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

export function SiteFooter() {
  const t = useTranslations();

  return (
    <footer className="mt-auto border-t border-neutral-200 bg-neutral-50">
      <Container className="grid gap-10 py-12 md:grid-cols-12 md:gap-8">
        <div className="flex flex-col gap-4 md:col-span-5">
          <Wordmark />
          <p className="text-small font-medium text-navy-900">{t("common.tagline")}</p>
          <p className="max-w-[46ch] text-small text-neutral-600">{t("footer.about")}</p>
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
              { href: "/about", label: t("policies.names.about") },
            ]}
          />
        </div>
      </Container>
      <div className="border-t border-neutral-200">
        <Container className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-neutral-600">{t("footer.notice")}</p>
          <div className="flex items-center gap-3">
            <span className="text-caption text-neutral-600">{t("footer.language")}</span>
            <LocaleSwitcher tone="dark" />
          </div>
        </Container>
      </div>
    </footer>
  );
}
