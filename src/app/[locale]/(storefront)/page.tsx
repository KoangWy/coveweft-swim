import { ArrowRight, ArrowUpRight, Truck } from "@phosphor-icons/react/ssr";
import { getLocale, getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ProductImage } from "@/components/ui/product-image";
import { Reveal } from "@/components/ui/reveal";
import { ErrorState } from "@/components/ui/states";
import { imageSources } from "@/features/catalog/components/image-sources";
import { ProductCard } from "@/features/catalog/components/product-card";
import { toListProductsInput, parseShopQuery } from "@/features/catalog/components/shop-query";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import { SHOP_CATEGORIES, type ShopCategory } from "@/lib/site";
import { getStoreSettings } from "@/lib/store-settings";
import { listProducts, type ProductListItem } from "@/server/catalog";

/** Grid placement of each category tile: one tall tile and three smaller ones. */
const TILE_LAYOUT: Record<ShopCategory, string> = {
  women: "md:col-span-2 md:row-span-2",
  men: "md:col-span-2",
  kids: "",
  accessories: "",
};

async function firstInGroup(group: ShopCategory, locale: Locale, count: number) {
  const result = await listProducts({
    ...toListProductsInput(parseShopQuery({ group, inStock: "1" }), locale),
    pageSize: count,
  });
  return result.ok ? result.data.items : [];
}

export default async function HomePage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const [featured, settings, ...groups] = await Promise.all([
    listProducts({ locale, inStock: true, sort: "newest", pageSize: 8 }),
    getStoreSettings(),
    ...SHOP_CATEGORIES.map((group) => firstInGroup(group, locale, 2)),
  ]);
  const byGroup = new Map<ShopCategory, ProductListItem[]>(
    SHOP_CATEGORIES.map((group, index) => [group, groups[index]]),
  );
  const heroProduct = byGroup.get("women")?.[1] ?? byGroup.get("women")?.[0];
  const hero = imageSources(heroProduct?.images[0]);

  return (
    <>
      <section aria-labelledby="hero-heading" className="border-b border-neutral-200">
        <Container className="grid items-center gap-8 py-8 lg:grid-cols-12 lg:gap-12 lg:py-12">
          <Reveal className="flex flex-col items-start gap-6 lg:col-span-5">
            <span aria-hidden className="h-1.5 w-16 rounded-md bg-lime-400" />
            <h1 id="hero-heading" className="text-display font-bold tracking-tight text-navy-900">
              {t("home.title")}
            </h1>
            <p className="max-w-[44ch] text-lead text-neutral-700">{t("home.description")}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/shop" className={buttonClasses({ size: "lg" })}>
                {t("home.shopCta")}
                <ArrowRight aria-hidden size={20} />
              </Link>
              <Link href="/about" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                {t("home.aboutCta")}
              </Link>
            </div>
          </Reveal>
          <div className="lg:col-span-7">
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-3 overflow-hidden rounded-md">
                <ProductImage
                  src={hero.large}
                  alt={heroProduct?.name ?? t("home.heroAlt")}
                  fallbackLabel={t("catalog.imageUnavailable")}
                  priority
                  sizes="(min-width: 1024px) 35vw, 60vw"
                />
              </div>
              <div className="col-span-2 flex flex-col justify-end gap-3">
                {(byGroup.get("men") ?? []).slice(0, 1).map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${encodeURIComponent(product.sku)}`}
                    className="group flex flex-col gap-2"
                  >
                    <span className="overflow-hidden rounded-md">
                      <ProductImage
                        src={imageSources(product.images[0]).medium}
                        alt={product.name}
                        fallbackLabel={t("catalog.imageUnavailable")}
                        sizes="(min-width: 1024px) 22vw, 40vw"
                      />
                    </span>
                    <span className="text-small font-semibold text-navy-900 group-hover:underline">
                      {product.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="categories-heading">
        <Container className="py-12 lg:py-16">
          <h2 id="categories-heading" className="text-title font-bold text-navy-900">
            {t("home.categoriesTitle")}
          </h2>
          <ul className="mt-8 grid auto-rows-[minmax(11rem,auto)] grid-cols-2 gap-3 md:auto-rows-[15rem] md:grid-cols-4">
            {SHOP_CATEGORIES.map((group) => {
              const product = byGroup.get(group)?.[0];
              const image = imageSources(product?.images[0]);
              return (
                <li key={group} className={cx("relative", TILE_LAYOUT[group])}>
                  <Link
                    href={`/shop?group=${group}`}
                    className="group relative flex h-full flex-col justify-end overflow-hidden rounded-md bg-neutral-100"
                  >
                    <ProductImage
                      src={image.medium}
                      alt=""
                      fallbackLabel=""
                      sizes="(min-width: 768px) 25vw, 50vw"
                      fill
                      className="transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                    <span className="relative m-3 inline-flex items-center gap-2 self-start rounded-md bg-white px-3 py-2 text-body font-semibold text-navy-900 shadow-raised">
                      {t(`nav.categories.${group}`)}
                      <ArrowUpRight aria-hidden size={18} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="featured-heading" className="bg-neutral-50">
        <Container className="py-12 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="featured-heading" className="text-title font-bold text-navy-900">
              {t("home.featuredTitle")}
            </h2>
            <Link
              href="/shop"
              className="inline-flex items-center gap-1 rounded-md text-small font-semibold text-navy-900 underline underline-offset-4"
            >
              {t("home.viewAll")}
              <ArrowRight aria-hidden size={16} />
            </Link>
          </div>
          {featured.ok ? (
            <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
              {featured.data.items.map((product) => (
                <li key={product.id}>
                  <ProductCard
                    product={product}
                    locale={locale}
                    typeLabel={
                      featured.data.facets.productTypes.find(
                        (type) => type.value === product.productType,
                      )?.label ?? product.productType
                    }
                    sizes="(min-width: 768px) 25vw, 50vw"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ErrorState
              className="mt-8"
              title={t("catalog.loadErrorTitle")}
              description={t(`errors.${featured.error.code}`)}
            />
          )}
        </Container>
      </section>

      <section aria-labelledby="service-heading">
        <Container className="flex flex-col gap-6 py-12 md:flex-row md:items-center md:justify-between lg:py-16">
          <div className="flex items-start gap-4">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-lime-400 text-navy-950">
              <Truck aria-hidden size={26} />
            </span>
            <div className="flex flex-col gap-1">
              <h2 id="service-heading" className="text-heading font-semibold text-navy-900">
                {t("home.shippingTitle", {
                  threshold: formatVnd(settings.freeStandardShippingThresholdVnd, locale),
                })}
              </h2>
              <p className="max-w-[60ch] text-body text-neutral-700">
                {t("home.shippingBody", {
                  express: formatVnd(settings.expressShippingFeeVnd, locale),
                })}
              </p>
            </div>
          </div>
          <Link
            href="/policies/shipping"
            className={buttonClasses({
              variant: "secondary",
              className: "self-start md:self-auto",
            })}
          >
            {t("home.shippingLink")}
          </Link>
        </Container>
      </section>
    </>
  );
}
