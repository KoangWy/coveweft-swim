"use client";

import { List } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";

import { NavLink } from "./nav-link";

export type MobileNavProps = {
  links: Array<{ href: string; label: string }>;
  className?: string;
};

/** Menu button and navigation drawer for viewports below `lg`. */
export function MobileNav({ links, className }: MobileNavProps) {
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
        <nav aria-label={t("nav.primary")}>
          <ul className="-mx-2 flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                <NavLink
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center rounded-md px-3 text-body font-medium text-navy-900 hover:bg-neutral-100"
                  activeClassName="bg-neutral-100 font-semibold"
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </Drawer>
    </div>
  );
}
