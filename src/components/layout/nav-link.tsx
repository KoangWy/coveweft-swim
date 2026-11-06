"use client";

import type { ComponentProps } from "react";

import { cx } from "@/components/ui/cx";
import { Link, usePathname } from "@/i18n/navigation";

type NavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  /** Match nested paths too, for example /admin/products/123. */
  matchNested?: boolean;
  activeClassName?: string;
};

/** Link that marks itself with `aria-current="page"` when it is the current page. */
export function NavLink({
  href,
  matchNested = false,
  className,
  activeClassName,
  ...props
}: NavLinkProps) {
  const pathname = usePathname();
  // Links with a query string (filters) are never marked current, because the
  // query is not part of the matched path.
  const active =
    !href.includes("?") && (pathname === href || (matchNested && pathname.startsWith(`${href}/`)));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(className, active && activeClassName)}
      {...props}
    />
  );
}
