import { MagnifyingGlass, ShoppingBag, User } from "@phosphor-icons/react/ssr";
import { useLocale, useTranslations } from "next-intl";

import { iconButtonClasses } from "@/components/ui/icon-button";
import { Link } from "@/i18n/navigation";
import { SHOP_CATEGORIES } from "@/lib/site";

import { Container } from "./container";
import { DemoBanner } from "./demo-banner";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav } from "./mobile-nav";
import { NavLink } from "./nav-link";
import { Wordmark } from "./wordmark";

const navLinkClasses =
  "relative inline-flex h-10 items-center rounded-md px-3 text-small font-medium text-navy-900 transition-colors duration-150 hover:bg-neutral-100 after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-md after:bg-transparent";
// The lime line is an extra cue; the current page is also exposed through
// aria-current and a heavier font weight.
const navLinkActiveClasses = "font-semibold after:bg-lime-500";

function SearchForm({ id, className }: { id: string; className?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();

  return (
    <form action={`/${locale}/shop`} method="get" role="search" className={className}>
      <label htmlFor={id} className="sr-only">
        {t("search")}
      </label>
      <div className="relative">
        <input
          id={id}
          name="q"
          type="search"
          placeholder={t("searchPlaceholder")}
          className="h-10 w-full rounded-md border border-neutral-500 bg-white pr-11 pl-3 text-small text-navy-900 transition-colors duration-150 hover:border-navy-900"
        />
        <button
          type="submit"
          aria-label={t("searchSubmit")}
          className="absolute top-0 right-0 inline-flex size-10 items-center justify-center rounded-md text-navy-900 hover:bg-neutral-100"
        >
          <MagnifyingGlass aria-hidden size={20} />
        </button>
      </div>
    </form>
  );
}

export type SiteHeaderProps = {
  /** Number of items in the signed-in customer's cart. */
  cartCount?: number;
};

export function SiteHeader({ cartCount = 0 }: SiteHeaderProps) {
  const t = useTranslations("nav");
  const links = [
    { href: "/shop", label: t("shop") },
    ...SHOP_CATEGORIES.map((category) => ({
      href: `/shop?group=${category}`,
      label: t(`categories.${category}`),
    })),
  ];

  return (
    <>
      <div className="sticky top-0 z-(--z-header)">
        <DemoBanner />
        <header className="border-b border-neutral-200 bg-white">
          <Container className="flex h-16 items-center gap-2 lg:gap-6">
            <MobileNav links={links} className="-ml-2 lg:hidden" />
            <Wordmark />
            <nav aria-label={t("primary")} className="hidden lg:block">
              <ul className="flex items-center gap-1">
                {links.map((link) => (
                  <li key={link.href}>
                    <NavLink
                      href={link.href}
                      className={navLinkClasses}
                      activeClassName={navLinkActiveClasses}
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <SearchForm id="header-search" className="hidden w-56 lg:block xl:w-72" />
              <LocaleSwitcher />
              <Link
                href="/account"
                aria-label={t("account")}
                title={t("account")}
                className={iconButtonClasses()}
              >
                <User aria-hidden size={22} />
              </Link>
              <Link
                href="/cart"
                aria-label={t("cartWithCount", { count: cartCount })}
                title={t("cart")}
                className={iconButtonClasses("md", "-mr-2")}
              >
                <ShoppingBag aria-hidden size={22} />
                {cartCount > 0 ? (
                  <span
                    aria-hidden
                    className="absolute top-1 right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lime-400 px-1 text-caption font-bold text-navy-950 tabular-nums ring-2 ring-white"
                  >
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                ) : null}
              </Link>
            </div>
          </Container>
        </header>
      </div>
      <div className="border-b border-neutral-200 bg-white lg:hidden">
        <Container className="py-2">
          <SearchForm id="header-search-mobile" />
        </Container>
      </div>
    </>
  );
}
