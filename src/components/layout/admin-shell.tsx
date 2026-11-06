import { ArrowLeft, ChartBar, Package, Receipt } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";

import { LocaleSwitcher } from "./locale-switcher";
import { NavLink } from "./nav-link";
import { SkipLink } from "./skip-link";
import { Wordmark } from "./wordmark";

const ADMIN_LINKS = [
  { href: "/admin", key: "overview", icon: ChartBar, nested: false },
  { href: "/admin/products", key: "products", icon: Package, nested: true },
  { href: "/admin/orders", key: "orders", icon: Receipt, nested: true },
] as const;

/**
 * Frame for the admin area: sidebar navigation on large screens and a
 * scrollable tab row on small screens. Separate from the storefront shell.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");

  const links = ADMIN_LINKS.map(({ href, key, icon: Icon, nested }) => (
    <li key={href} className="shrink-0">
      <NavLink
        href={href}
        matchNested={nested}
        className="flex h-10 items-center gap-3 rounded-md px-3 text-small font-medium whitespace-nowrap text-navy-900 transition-colors duration-150 hover:bg-neutral-100"
        activeClassName="bg-neutral-100 font-semibold shadow-[inset_3px_0_0_var(--color-lime-500)]"
      >
        <Icon aria-hidden size={20} />
        {t(key)}
      </NavLink>
    </li>
  ));

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 lg:flex-row">
      <SkipLink />
      <aside className="border-b border-neutral-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-5">
          <Wordmark href="/admin" />
          <Badge tone="accent">{t("badge")}</Badge>
        </div>
        <nav aria-label={t("nav")} className="px-2 pb-2 lg:flex-1 lg:px-3 lg:pt-4">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">{links}</ul>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md text-small font-medium text-navy-900 hover:underline"
          >
            <ArrowLeft aria-hidden size={18} />
            {t("backToStore")}
          </Link>
          <LocaleSwitcher />
        </div>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
