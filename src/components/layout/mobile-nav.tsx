"use client";

import { ArrowRight, List } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";

import { NavLink } from "./nav-link";

export type MobileNavProps = {
  links: Array<{ href: string; label: string }>;
  /** Rendered below the links, for example the language switch. */
  footer?: ReactNode;
  className?: string;
};

/** Menu button and navigation drawer for viewports below `lg`. */
export function MobileNav({ links, footer, className }: MobileNavProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <IconButton
        label={t("nav.openMenu")}
        icon={<List aria-hidden size={24} />}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("nav.menu")}
        closeLabel={t("common.close")}
      >
        <nav aria-label={t("nav.primary")} className="flex h-full flex-col gap-8">
          <ul className="-mx-2 flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                <NavLink
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="group flex h-14 items-center justify-between rounded-md px-3 text-heading-sm font-display text-navy-900 hover:bg-neutral-100"
                  activeClassName="bg-neutral-100"
                >
                  {link.label}
                  <ArrowRight
                    aria-hidden
                    size={20}
                    className="text-neutral-500 transition-transform duration-200 group-hover:translate-x-1"
                  />
                </NavLink>
              </li>
            ))}
          </ul>
          {footer ? <div className="mt-auto">{footer}</div> : null}
        </nav>
      </Drawer>
    </div>
  );
}
