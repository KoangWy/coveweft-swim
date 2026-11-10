import { X } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { FilterDrawer } from "@/features/catalog/components/filter-drawer";
import { ProductCard } from "@/features/catalog/components/product-card";
import { ShopBanner } from "@/features/catalog/components/shop-banner";
import { ShopFilters } from "@/features/catalog/components/shop-filters";
import {
  hasActiveFilters,
  parseShopQuery,
  shopHref,
  toListProductsInput,
  type ShopQuery,
} from "@/features/catalog/components/shop-query";
import { SortSelect } from "@/features/catalog/components/sort-select";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import { listProducts, type ProductFacets } from "@/server/catalog";

export async function generateMetadata({
  searchParams,
}: PageProps<"/[locale]/shop">): Promise<Metadata> {
  const query = parseShopQuery(await searchParams);
  const t = await getTranslations();
  const title = query.group ? t(`nav.categories.${query.group}`) : t("catalog.shopTitle");
  return { title, description: t("catalog.shopDescription") };
}

type Chip = { key: string; label: string; href: string };

function facetLabel(values: { value: string; label: string }[], value: string) {
  return values.find((item) => item.value === value)?.label ?? value;
}

async function activeChips(query: ShopQuery, facets: ProductFacets, locale: Locale) {
  const t = await getTranslations("catalog");
  const chips: Chip[] = [];
  const add = (key: string, label: string, changes: Partial<ShopQuery>) =>
    chips.push({ key, label, href: shopHref(query, changes) });

  if (query.q) add("q", t("chips.search", { term: query.q }), { q: undefined });
  if (query.category)
    add("category", facetLabel(facets.categories, query.category), { category: undefined });
  if (query.gender)
    add("gender", t.has(`genders.${query.gender}`) ? t(`genders.${query.gender}`) : query.gender, {
      gender: undefined,
    });
  if (query.type) add("type", facetLabel(facets.productTypes, query.type), { type: undefined });
  if (query.size) add("size", t("chips.size", { size: query.size }), { size: undefined });
  if (query.material)
    add("material", facetLabel(facets.materials, query.material), { material: undefined });
  for (const feature of query.features) {
    add(`feature-${feature}`, facetLabel(facets.features, feature), {
      features: query.features.filter((value) => value !== feature),
    });
  }
  if (query.priceMin !== undefined)
    add("min", t("chips.priceMin", { amount: formatVnd(query.priceMin, locale) }), {
      priceMin: undefined,
    });
  if (query.priceMax !== undefined)
    add("max", t("chips.priceMax", { amount: formatVnd(query.priceMax, locale) }), {
      priceMax: undefined,
    });
  if (query.inStock) add("inStock", t("filters.inStock"), { inStock: false });

  return chips;
}

export default async function ShopPage({ searchParams }: PageProps<"/[locale]/shop">) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const query = parseShopQuery(await searchParams);
  const result = await listProducts(toListProductsInput(query, locale));
  const title = query.group ? t(`nav.categories.${query.group}`) : t("catalog.shopTitle");
  const crumbs = query.group
    ? [{ label: t("catalog.shopTitle"), href: "/shop" }, { label: title }]
    : [{ label: title }];

  if (!result.ok) {
    return (
      <>
        <ShopBanner group={query.group} crumbs={crumbs} title={title} />
        <Container className="py-10 lg:py-12">
          <ErrorState
            title={t("catalog.loadErrorTitle")}
            description={t(`errors.${result.error.code}`)}
            action={
              <Link href={shopHref(query)} className={buttonClasses()}>
                {t("common.tryAgain")}
              </Link>
            }
          />
        </Container>
      </>
    );
  }

  const list = result.data;
  const chips = await activeChips(query, list.facets, locale);
  const typeLabels = new Map(list.facets.productTypes.map((item) => [item.value, item.label]));
  const filtersActive = hasActiveFilters(query);

  return (
    <>
      <ShopBanner
        group={query.group}
        crumbs={crumbs}
        title={query.q ? t("catalog.searchTitle", { term: query.q }) : title}
      >
        <p className="text-body text-white/85" aria-live="polite">
          {t("catalog.resultCount", { count: list.total })}
        </p>
      </ShopBanner>
      <Container className="py-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="hidden lg:block" aria-label={t("catalog.filters.title")}>
            <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-2">
              <h2 className="text-heading-sm font-semibold text-navy-900">
                {t("catalog.filters.title")}
              </h2>
              <ShopFilters facets={list.facets} query={query} idPrefix="sidebar-filters" />
            </div>
          </aside>

          <section aria-labelledby="results-heading" className="flex min-w-0 flex-col gap-6">
            <h2 id="results-heading" className="sr-only">
              {t("catalog.resultsHeading")}
            </h2>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 pb-4">
              <div className="lg:hidden">
                <FilterDrawer facets={list.facets} query={query} activeCount={chips.length} />
              </div>
              <div className="ml-auto">
                <SortSelect query={query} />
              </div>
            </div>

            {chips.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label={t("catalog.chips.label")}>
                {chips.map((chip) => (
                  <li key={chip.key}>
                    <Link
                      href={chip.href}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-neutral-300 bg-white px-3.5 text-small text-navy-900 transition-colors hover:border-navy-900"
                    >
                      {chip.label}
                      <X aria-hidden size={14} weight="bold" />
                      <span className="sr-only">{t("catalog.chips.remove")}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/shop"
                    className="inline-flex h-9 items-center rounded-full px-3 text-small font-semibold text-navy-900 underline underline-offset-2"
                  >
                    {t("catalog.filters.clearAll")}
                  </Link>
                </li>
              </ul>
            ) : null}

            {list.items.length === 0 ? (
              <EmptyState
                title={t("catalog.emptyTitle")}
                description={t(filtersActive ? "catalog.emptyFiltered" : "catalog.emptyCatalog")}
                action={
                  filtersActive ? (
                    <Link href="/shop" className={buttonClasses()}>
                      {t("catalog.filters.clearAll")}
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
                {list.items.map((product, index) => (
                  <li key={product.id} className="scroll-reveal">
                    <ProductCard
                      product={product}
                      locale={locale}
                      typeLabel={typeLabels.get(product.productType) ?? product.productType}
                      priority={index < 4}
                      sizes="(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 34vw"
                    />
                  </li>
                ))}
              </ul>
            )}

            <Pagination
              className="pt-4"
              page={list.page}
              pageCount={list.pageCount}
              hrefForPage={(page) => shopHref(query, { page })}
              linkComponent={Link}
              labels={{
                nav: t("pagination.nav"),
                previous: t("pagination.previous"),
                next: t("pagination.next"),
                page: (page) => t("pagination.page", { page }),
              }}
            />
          </section>
        </div>
      </Container>
    </>
  );
}
