import { ArrowRight, ArrowUpRight, Package, Ruler, Truck, Wallet } from "@phosphor-icons/react/ssr";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { LogoMark } from "@/components/layout/logo-mark";
import { BrandImage } from "@/components/ui/brand-image";
import { cx } from "@/components/ui/cx";
import { ProductImage } from "@/components/ui/product-image";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { AssistantOpenButton } from "@/features/assistant/components/assistant-open-button";
import { imageSources } from "@/features/catalog/components/image-sources";
import { ProductCard } from "@/features/catalog/components/product-card";
import { toListProductsInput, parseShopQuery } from "@/features/catalog/components/shop-query";
import { HeroIntro } from "@/features/home/components/hero-intro";
import { HeroBackdrop } from "@/features/home/components/hero-backdrop";
import { HeroShowcase } from "@/features/home/components/hero-showcase";
import { MarqueeBand } from "@/features/home/components/marquee-band";
import { ProductRail } from "@/features/home/components/product-rail";
import { WaveEdge } from "@/features/home/components/wave-edge";
import { Link } from "@/i18n/navigation";
import type { BrandImageName } from "@/lib/brand-images";
import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import { SHOP_CATEGORIES, type ShopCategory } from "@/lib/site";
import { getStoreSettings } from "@/lib/store-settings";
import { listProducts, type ProductListItem } from "@/server/catalog";

/** Grid placement of each category tile: one tall tile and three smaller ones. */
const TILE_LAYOUT: Record<ShopCategory, string> = {
  women: "col-span-2 row-span-2 md:col-span-2 md:row-span-2",
  men: "col-span-2 md:col-span-2",
  kids: "",
  accessories: "",
};

/** Activity panels: brand photo and the catalog filter each one opens. */
const WATER_PANELS: Array<{ key: "pool" | "surf" | "gear"; image: BrandImageName; href: string }> =
  [
    { key: "pool", image: "poolLanes", href: "/shop?type=Swimsuit" },
    { key: "surf", image: "surfLines", href: "/shop?type=Rash%20guard" },
    { key: "gear", image: "underwaterSwim", href: "/shop?type=Swim%20goggles" },
  ];

async function firstInGroup(group: ShopCategory, locale: Locale, count: number) {
  const result = await listProducts({
    ...toListProductsInput(parseShopQuery({ group, inStock: "1" }), locale),
    pageSize: count,
  });
  return result.ok ? result.data.items : [];
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-title font-display text-navy-900 md:text-display">
      {children}
    </h2>
  );
}

/** One request shares these reads across independently streamed sections. */
async function loadHomeData(locale: Locale) {
  const [featured, settings, ...groups] = await Promise.all([
    listProducts({ locale, inStock: true, sort: "newest", pageSize: 8 }),
    getStoreSettings(),
    ...SHOP_CATEGORIES.map((group) => firstInGroup(group, locale, 2)),
  ]);
  const byGroup = new Map<ShopCategory, ProductListItem[]>(
    SHOP_CATEGORIES.map((group, index) => [group, groups[index]]),
  );
  return { featured, settings, byGroup };
}

type HomeData = ReturnType<typeof loadHomeData>;

async function HomeShowcase({ data, locale }: { data: HomeData; locale: Locale }) {
  const t = await getTranslations();
  const { byGroup } = await data;
  const showcase = [byGroup.get("women")?.[0], byGroup.get("men")?.[0]]
    .filter((product): product is ProductListItem => product !== undefined)
    .map((product) => ({
      id: product.id,
      href: `/products/${encodeURIComponent(product.sku)}`,
      name: product.name,
      price: formatVnd(product.priceVnd, locale),
      image: imageSources(product.images[0]).medium,
    }));
  return showcase.length > 0 ? (
    <HeroShowcase
      items={showcase}
      label={t("home.showcaseLabel")}
      fallbackLabel={t("catalog.imageUnavailable")}
    />
  ) : null;
}

function HomeContentLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <Container className="py-16 lg:py-24">
        <Skeleton className="h-12 w-64" />
        <div className="mt-10 grid auto-rows-[11rem] grid-cols-2 gap-3 sm:auto-rows-[14rem] md:auto-rows-[16rem] md:grid-cols-4 md:gap-4">
          {SHOP_CATEGORIES.map((group) => (
            <Skeleton key={group} className={cx("h-full rounded-lg", TILE_LAYOUT[group])} />
          ))}
        </div>
      </Container>
    </div>
  );
}

/** The ocean image and shop action never wait for catalog or shipping reads. */
export default async function HomePage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const data = loadHomeData(locale);

  return (
    <>
      <section
        aria-labelledby="hero-heading"
        className="hero-scene relative isolate overflow-hidden bg-navy-950 text-white"
      >
        <div className="absolute inset-0 -z-10">
          <HeroBackdrop />
          <div className="absolute inset-0 bg-gradient-to-r from-navy-950/90 via-navy-950/55 to-navy-950/5" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-navy-950/50 to-transparent" />
        </div>
        <Container className="grid min-h-[clamp(30rem,calc(100dvh-10rem),50rem)] items-center gap-6 pt-10 pb-16 lg:grid-cols-12 lg:pt-8 lg:pb-16">
          <div className="lg:col-span-6">
            <HeroIntro description={t("home.description")} cta={t("home.shopCta")} />
          </div>
          <div className="hidden lg:col-span-6 lg:block">
            <div className="relative mx-auto aspect-[5/6] w-full max-w-[34rem]">
              <Suspense fallback={null}>
                <HomeShowcase data={data} locale={locale} />
              </Suspense>
            </div>
          </div>
        </Container>
        <WaveEdge />
      </section>

      <Suspense fallback={<HomeContentLoading label={t("common.loading")} />}>
        <HomeContent data={data} locale={locale} />
      </Suspense>
    </>
  );
}

async function HomeContent({ data, locale }: { data: HomeData; locale: Locale }) {
  const t = await getTranslations();
  const { featured, settings, byGroup } = await data;
  const threshold = formatVnd(settings.freeStandardShippingThresholdVnd, locale);
  const services = [
    {
      icon: Truck,
      title: t("home.shippingTitle", { threshold }),
      body: t("home.shippingBody", { express: formatVnd(settings.expressShippingFeeVnd, locale) }),
    },
    {
      icon: Wallet,
      title: t("home.services.payment.title"),
      body: t("home.services.payment.body"),
    },
    { icon: Ruler, title: t("home.services.sizes.title"), body: t("home.services.sizes.body") },
    { icon: Package, title: t("home.services.cancel.title"), body: t("home.services.cancel.body") },
  ];

  return (
    <>
      <section aria-labelledby="categories-heading">
        <Container className="py-16 lg:py-24">
          <SectionHeading id="categories-heading">{t("home.categoriesTitle")}</SectionHeading>
          <ul className="mt-10 grid auto-rows-[11rem] grid-cols-2 gap-3 sm:auto-rows-[14rem] md:auto-rows-[16rem] md:grid-cols-4 md:gap-4">
            {SHOP_CATEGORIES.map((group) => {
              const product = byGroup.get(group)?.[0];
              const image = imageSources(product?.images[0]);
              return (
                <li key={group} className={cx("relative scroll-reveal", TILE_LAYOUT[group])}>
                  <Link
                    href={`/shop?group=${group}`}
                    className="group relative flex h-full flex-col justify-end overflow-hidden rounded-lg bg-neutral-100"
                  >
                    <ProductImage
                      src={image.medium}
                      alt=""
                      fallbackLabel=""
                      sizes="(min-width: 768px) 50vw, 66vw"
                      fill
                      anchorTop
                      imageClassName="transition-transform duration-700 ease-out-expo group-hover:scale-105 motion-reduce:transition-none"
                    />
                    <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-navy-950/80 via-navy-950/30 to-transparent" />
                    <span className="relative flex items-end justify-between gap-3 p-4 md:p-5">
                      <span className="text-heading-sm font-display text-white md:text-heading">
                        {t(`nav.categories.${group}`)}
                      </span>
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-navy-900 transition-[transform,background-color] duration-300 ease-out-expo group-hover:rotate-45 group-hover:bg-lime-400">
                        <ArrowUpRight aria-hidden size={18} weight="bold" />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      <MarqueeBand
        items={[
          t("home.marquee.tagline"),
          t("home.marquee.laps"),
          t("home.marquee.surf"),
          t("home.marquee.beach"),
          t("home.marquee.shipping", { threshold }),
        ]}
      />

      <section id="new-in" aria-labelledby="featured-heading" className="overflow-hidden">
        <Container className="py-16 lg:py-24">
          {featured.ok ? (
            <ProductRail
              heading={
                <SectionHeading id="featured-heading">{t("home.featuredTitle")}</SectionHeading>
              }
              action={
                <Link
                  href="/shop?sort=newest"
                  className="mr-2 inline-flex items-center gap-1 rounded-md text-small font-semibold text-navy-900 underline underline-offset-4"
                >
                  {t("home.viewAll")}
                  <ArrowRight aria-hidden size={16} />
                </Link>
              }
              previousLabel={t("home.railPrevious")}
              nextLabel={t("home.railNext")}
            >
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
                    sizes="(min-width: 1024px) 23vw, (min-width: 640px) 40vw, 46vw"
                  />
                </li>
              ))}
            </ProductRail>
          ) : (
            <>
              <SectionHeading id="featured-heading">{t("home.featuredTitle")}</SectionHeading>
              <ErrorState
                className="mt-8"
                title={t("catalog.loadErrorTitle")}
                description={t(`errors.${featured.error.code}`)}
              />
            </>
          )}
        </Container>
      </section>

      <section aria-labelledby="water-heading" className="bg-neutral-50">
        <Container className="py-16 lg:py-24">
          <p className="text-small font-semibold tracking-[0.18em] text-neutral-600 uppercase">
            {t("home.waterEyebrow")}
          </p>
          <div className="mt-3">
            <SectionHeading id="water-heading">{t("home.waterTitle")}</SectionHeading>
          </div>
          <ul className="mt-10 flex flex-col gap-3 lg:h-[30rem] lg:flex-row lg:gap-4">
            {WATER_PANELS.map((panel) => (
              <li
                key={panel.key}
                className="h-72 scroll-reveal transition-[flex-grow] duration-700 ease-out-expo lg:h-auto lg:flex-1 lg:hover:grow-[1.8] lg:has-[:focus-visible]:grow-[1.8]"
              >
                <Link
                  href={panel.href}
                  className="group relative flex h-full flex-col justify-end overflow-hidden rounded-lg"
                >
                  <BrandImage
                    name={panel.image}
                    sizes="(min-width: 1024px) 45vw, 66vw"
                    className="transition-transform duration-1000 ease-out-expo group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/30 to-navy-950/5" />
                  <span className="relative flex flex-col gap-2 p-6 lg:p-8">
                    <span className="text-title font-display text-white">
                      {t(`home.water.${panel.key}.title`)}
                    </span>
                    <span className="max-w-[32ch] text-body text-white/85">
                      {t(`home.water.${panel.key}.body`)}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-2 text-small font-semibold text-lime-300">
                      {t("home.waterShop")}
                      <ArrowRight
                        aria-hidden
                        size={16}
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="assistant-heading">
        <Container className="grid gap-10 py-16 lg:grid-cols-12 lg:gap-12 lg:py-24">
          <div className="relative isolate flex scroll-reveal flex-col items-start gap-5 overflow-hidden rounded-xl bg-navy-900 p-8 text-white sm:p-10 lg:col-span-6">
            <LogoMark className="size-14" />
            <h2 id="assistant-heading" className="text-title font-display text-white">
              {t("home.assistantTitle")}
            </h2>
            <p className="max-w-[44ch] text-body text-white/85">{t("home.assistantBody")}</p>
            <AssistantOpenButton label={t("home.assistantCta")} />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-24 -bottom-24 -z-10 size-72 rounded-full border-[28px] border-navy-800"
            />
          </div>
          <div className="flex flex-col justify-center gap-8 lg:col-span-6">
            <h2 className="text-heading-sm font-display text-navy-900">
              {t("home.servicesTitle")}
            </h2>
            <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {services.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex scroll-reveal gap-4">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-lime-400 text-navy-950">
                    <Icon aria-hidden size={22} />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-body font-semibold text-navy-900">{title}</h3>
                    <p className="text-small text-neutral-700">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href="/policies/shipping"
              className="inline-flex items-center gap-1 self-start rounded-md text-small font-semibold text-navy-900 underline underline-offset-4"
            >
              {t("home.shippingLink")}
              <ArrowRight aria-hidden size={16} />
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
