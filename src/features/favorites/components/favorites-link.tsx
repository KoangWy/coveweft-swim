"use client";

import { Heart } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { iconButtonClasses } from "@/components/ui/icon-button";
import { Link, usePathname } from "@/i18n/navigation";

import { useFavorites } from "../store";

export function FavoritesLink() {
  const t = useTranslations("favorites");
  const { ids } = useFavorites();
  const active = usePathname() === "/favorites";
  return (
    <Link
      href="/favorites"
      aria-label={t("withCount", { count: ids.length })}
      title={t("title")}
      aria-current={active ? "page" : undefined}
      className={iconButtonClasses()}
    >
      <Heart aria-hidden size={22} weight={active ? "fill" : "regular"} />
      {ids.length > 0 ? (
        <span
          aria-hidden
          className="absolute top-1 right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lime-400 px-1 text-caption font-bold text-navy-950 ring-2 ring-white"
        >
          {ids.length > 99 ? "99+" : ids.length}
        </span>
      ) : null}
    </Link>
  );
}
