import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Breadcrumb, type BreadcrumbItem } from "@/components/layout/breadcrumb";
import { Container } from "@/components/layout/container";
import { NavLink } from "@/components/layout/nav-link";

/** Account pages: breadcrumb, title, and the Profile and Orders tabs. */
export function AccountShell({
  title,
  crumbs,
  actions,
  children,
}: {
  title: string;
  crumbs: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("account");
  const tabs = [
    { href: "/account", label: t("profileTab"), nested: false },
    { href: "/account/orders", label: t("ordersTab"), nested: true },
  ];

  return (
    <Container className="py-8 lg:py-10">
      <Breadcrumb items={crumbs} />
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-title font-display text-navy-900">{title}</h1>
        {actions}
      </div>
      <nav aria-label={t("nav")} className="mt-6 border-b border-neutral-200">
        <ul className="-mb-px flex gap-1">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <NavLink
                href={tab.href}
                matchNested={tab.nested}
                className="inline-flex h-11 items-center border-b-2 border-transparent px-3 text-small font-medium text-navy-900 hover:border-neutral-300"
                activeClassName="border-lime-500 font-semibold"
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-8">{children}</div>
    </Container>
  );
}
