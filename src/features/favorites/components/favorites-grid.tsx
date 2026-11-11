"use client";

import { Heart } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  ProductCardView,
  type ProductCardViewProps,
} from "@/features/catalog/components/product-card-view";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";

import { clearFavorites, useFavorites } from "../store";

type Listing = { items: ProductCardViewProps[]; pageCount: number; total: number };

function LoadingGrid() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="aspect-[2/3] rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function SavedProducts({ ids, locale }: { ids: string[]; locale: Locale }) {
  const t = useTranslations("favorites");
  const common = useTranslations("common");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{
    page: number;
    attempt: number;
    data?: Listing;
    error?: boolean;
  }>();
  const pending = response?.page !== page || response?.attempt !== attempt;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, locale, page }),
          signal: controller.signal,
        });
        if (!result.ok) throw new Error("Favorites unavailable");
        const data: Listing = await result.json();
        if (!controller.signal.aborted) setResponse({ page, attempt, data });
      } catch {
        if (!controller.signal.aborted) setResponse({ page, attempt, error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [ids, locale, page, attempt]);

  if (pending)
    return (
      <div role="status" aria-label={common("loading")}>
        <LoadingGrid />
      </div>
    );
  if (response?.error || !response?.data)
    return (
      <ErrorState
        title={t("errorTitle")}
        description={t("errorBody")}
        action={
          <button className={buttonClasses()} onClick={() => setAttempt(attempt + 1)}>
            {common("tryAgain")}
          </button>
        }
      />
    );
  const { items, pageCount, total } = response.data;
  if (total === 0)
    return (
      <EmptyState
        icon={<Heart aria-hidden size={24} />}
        title={t("unavailableTitle")}
        description={t("unavailableBody")}
        action={
          <div className="flex flex-wrap gap-3">
            <Link href="/shop" className={buttonClasses()}>
              {t("browse")}
            </Link>
            <button
              type="button"
              onClick={clearFavorites}
              className={buttonClasses({ variant: "secondary" })}
            >
              {t("clear")}
            </button>
          </div>
        }
      />
    );
  return (
    <>
      <p className="mb-6 text-small text-neutral-600" aria-live="polite">
        {t("count", { count: total })}
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
        {items.map((item, index) => (
          <li key={item.product.id}>
            <ProductCardView
              {...item}
              priority={index < 4}
              sizes="(min-width: 1280px) 23vw, (min-width: 768px) 30vw, 46vw"
            />
          </li>
        ))}
      </ul>
      {pageCount > 1 ? (
        <nav aria-label={t("pages")} className="mt-10 flex items-center justify-center gap-5">
          <button
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            {t("previous")}
          </button>
          <span className="text-small">{t("page", { page, pages: pageCount })}</span>
          <button
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            disabled={page === pageCount}
            onClick={() => setPage(page + 1)}
          >
            {t("next")}
          </button>
        </nav>
      ) : null}
    </>
  );
}

export function FavoritesGrid({ locale }: { locale: Locale }) {
  const t = useTranslations("favorites");
  const { ids, ready } = useFavorites();
  if (!ready) return <LoadingGrid />;
  if (!ids.length)
    return (
      <EmptyState
        icon={<Heart aria-hidden size={24} />}
        title={t("emptyTitle")}
        description={t("emptyBody")}
        action={
          <Link href="/shop" className={buttonClasses()}>
            {t("browse")}
          </Link>
        }
      />
    );
  return <SavedProducts key={`${locale}:${ids.join(",")}`} ids={ids} locale={locale} />;
}
