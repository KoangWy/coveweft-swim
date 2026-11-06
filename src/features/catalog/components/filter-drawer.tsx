"use client";

import { Faders } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";

import { ShopFilters, type ShopFiltersProps } from "./shop-filters";

/** Filter button and drawer for viewports below `lg`. */
export function FilterDrawer({
  activeCount,
  ...props
}: Omit<ShopFiltersProps, "idPrefix" | "onApplied"> & { activeCount: number }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Faders aria-hidden size={18} />
        {t("catalog.filters.title")}
        {activeCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-lime-400 px-1 text-caption font-bold text-navy-950 tabular-nums">
            {activeCount}
          </span>
        ) : null}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("catalog.filters.title")}
        closeLabel={t("common.close")}
        side="right"
      >
        <ShopFilters {...props} idPrefix="drawer-filters" />
      </Drawer>
    </>
  );
}
