import { CaretRight } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";

import { NavLink } from "@/components/layout/nav-link";
import { POLICY_SLUGS } from "@/lib/site";

import type { PolicyPageKey } from "./policy-article";

const PAGES: Array<{ key: PolicyPageKey; href: string }> = [
  { key: "about", href: "/about" },
  ...POLICY_SLUGS.map((slug) => ({ key: slug, href: `/policies/${slug}` })),
];

/** List of every store page, shown beside the policy text. */
export function PolicyNav({ current }: { current: PolicyPageKey }) {
  const t = useTranslations("policies");

  return (
    <nav
      aria-label={t("related")}
      className="rounded-md border border-neutral-200 p-2 lg:sticky lg:top-36"
    >
      <h2 className="px-3 pt-2 pb-3 text-small font-semibold text-navy-900">{t("related")}</h2>
      <ul className="flex flex-col">
        {PAGES.map((page) => (
          <li key={page.key}>
            <NavLink
              href={page.href}
              className="group flex h-11 items-center justify-between gap-3 rounded-md px-3 text-small text-neutral-700 transition-colors duration-150 hover:bg-neutral-100 hover:text-navy-900"
              activeClassName="bg-neutral-100 font-semibold text-navy-900 shadow-[inset_3px_0_0_var(--color-lime-500)]"
            >
              {t(`names.${page.key}`)}
              <CaretRight
                aria-hidden
                size={14}
                className={
                  page.key === current
                    ? "text-navy-900"
                    : "text-neutral-500 transition-transform duration-150 group-hover:translate-x-0.5"
                }
              />
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
