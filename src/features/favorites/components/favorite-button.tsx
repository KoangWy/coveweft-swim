"use client";

import { Heart } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { toggleFavorite, useFavorites } from "../store";

export function FavoriteButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("favorites");
  const { ids } = useFavorites();
  const saved = ids.includes(id);
  return (
    <button
      type="button"
      aria-label={t(saved ? "remove" : "add", { name })}
      aria-pressed={saved}
      onClick={() => toggleFavorite(id)}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-navy-900 shadow-raised transition-transform hover:scale-105 active:scale-95"
    >
      <Heart aria-hidden size={21} weight={saved ? "fill" : "regular"} />
    </button>
  );
}
