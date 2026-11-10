import { MagnifyingGlass, ShoppingBag, User } from "@phosphor-icons/react/ssr";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

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
  "inline-flex h-10 items-center rounded-full px-4 text-small font-medium text-navy-900 transition-colors duration-150 hover:bg-neutral-100";
// The current page is exposed through aria-current as well as the fill.
const navLinkActiveClasses = "bg-navy-900 font-semibold text-white hover:bg-navy-800";

function SearchForm({ id, className }: { id: string; className?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();

  return (
    <form action={`/${locale}/shop`} method="get" role="search" className={className}>
      <label htmlFor={id} className="sr-only">
        {t("search")}
      </label>
      <div className="relative">
        <MagnifyingGlass
          aria-hidden
          size={18}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-neutral-600"
        />
        <input
          id={id}
          name="q"
          type="search"
          placeholder={t("searchPlaceholder")}
          className="h-10 w-full rounded-full border border-neutral-500 bg-white pr-24 pl-10 text-small text-navy-900 transition-colors duration-150 hover:border-navy-900"
        />
        <button
          type="submit"
          className="absolute top-1 right-1 inline-flex h-8 items-center rounded-full bg-navy-900 px-3.5 text-caption font-semibold text-white transition-colors duration-150 hover:bg-navy-800"
        >
          {t("searchSubmit")}
        </button>
      </div>
    </form>
  );
}

export type HeaderActionsProps = {
  /** Number of items in the signed-in customer's cart. */
  cartCount?: number;
  /**
   * Whether a customer is signed in; visitors get a sign-in link instead.
   * Undefined while the session is still loading.
   */
  signedIn?: boolean;
};

/** Account and cart links on the right of the header. */
export function HeaderActions({ cartCount = 0, signedIn }: HeaderActionsProps) {
  const t = useTranslations("nav");
  const accountLabel = signedIn === false ? t("signIn") : t("account");

  return (
    <>
      <Link
        href={signedIn === false ? "/sign-in" : "/account"}
        aria-label={accountLabel}
        title={accountLabel}
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
            className="absolute top-1 right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lime-400 px-1 text-caption font-bold text-navy-950 ring-2 ring-white"
          >
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        ) : null}
      </Link>
    </>
  );
}

export type SiteHeaderProps = {
  /** Account and cart links; streamed in once the session is known. */
  actions: ReactNode;
};

export function SiteHeader({ actions }: SiteHeaderProps) {
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
      <DemoBanner />
      <header className="sticky top-0 z-(--z-header) border-b border-neutral-200/80 bg-white/85 backdrop-blur-lg">
        <Container className="flex h-16 items-center gap-2 lg:h-[4.5rem] lg:gap-6">
          <MobileNav links={links} footer={<LocaleSwitcher />} className="-ml-2 lg:hidden" />
          <Wordmark />
          <nav aria-label={t("primary")} className="hidden lg:block">
            <ul className="flex items-center gap-0.5">
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
            <SearchForm id="header-search" className="hidden w-64 lg:block xl:w-80" />
            <div className="hidden sm:block">
              <LocaleSwitcher />
            </div>
            {actions}
          </div>
        </Container>
      </header>
      <div className="border-b border-neutral-200 bg-white lg:hidden">
        <Container className="py-2.5">
          <SearchForm id="header-search-mobile" />
        </Container>
      </div>
    </>
  );
}
