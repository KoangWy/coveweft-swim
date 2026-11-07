"use client";

import { useLocale, useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

import { Select } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";

import { SHOP_SORTS, shopHref, shopSearchParams, type ShopQuery } from "./shop-query";

/** Sort control. Changing it reloads the listing from page 1. */
export function SortSelect({ query }: { query: ShopQuery }) {
  const t = useTranslations("catalog.sort");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  // The URL owns the selection, so Back and Forward update it. While a new
  // sort loads, the optimistic value keeps the chosen option selected.
  const [sort, setSort] = useOptimistic(query.sort);

  return (
    <form method="get" action={`/${locale}/shop`} className="flex items-end gap-2">
      {[...shopSearchParams({ ...query, page: 1 }).entries()]
        .filter(([key]) => key !== "sort")
        .map(([key, value], index) => (
          <input key={`${key}-${index}`} type="hidden" name={key} value={value} />
        ))}
      <Select
        id="shop-sort"
        name="sort"
        label={t("label")}
        value={sort}
        options={SHOP_SORTS.map((sort) => ({ value: sort, label: t(sort) }))}
        containerClassName="w-48"
        className="h-10 text-small"
        onChange={(event) => {
          const next = event.currentTarget.value as ShopQuery["sort"];
          startTransition(() => {
            setSort(next);
            router.push(shopHref(query, { sort: next }), { scroll: false });
          });
        }}
      />
      <noscript>
        <button type="submit" className="h-10 rounded-md border border-navy-900 px-3 text-small">
          {t("apply")}
        </button>
      </noscript>
    </form>
  );
}
