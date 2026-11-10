import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { AssistantOpenButton } from "@/features/assistant/components/assistant-open-button";
import { imageSources } from "@/features/catalog/components/image-sources";
import { loadProduct } from "@/features/catalog/components/load-product";
import { ProductGallery } from "@/features/catalog/components/product-gallery";
import { ProductSpecs } from "@/features/catalog/components/product-specs";
import { ProductCard } from "@/features/catalog/components/product-card";
import { PurchasePanel } from "@/features/catalog/components/purchase-panel";
import { SizeGuideTable } from "@/features/catalog/components/size-guide-table";
import type { Locale } from "@/lib/locale";
import { listProducts } from "@/server/catalog";

type Props = PageProps<"/[locale]/products/[sku]">;

/**
 * Loads the product or ends the request with the localized 404. Metadata is
 * resolved before the page streams, so a `notFound()` raised here sets the
 * HTTP status to 404. Next.js 16.4 then renders the not-found view on the
 * client, so the 404 content needs JavaScript.
 */
async function requireProduct(params: Props["params"]) {
  const { sku } = await params;
  const locale = (await getLocale()) as Locale;
  const result = await loadProduct(locale, sku);

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND" || result.error.code === "VALIDATION_ERROR") {
      notFound();
    }
    throw new Error(`Could not load product (${result.error.code}).`);
  }

  return result.data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await requireProduct(params);
  return {
    title: product.name,
    description: product.description ?? undefined,
  };
}

/** Other in-stock products from the same category; streams in after the page. */
async function RelatedProducts({
  sku,
  category,
  locale,
}: {
  sku: string;
  category: string;
  locale: Locale;
}) {
  const t = await getTranslations();
  const related = await listProducts({
    locale,
    category,
    inStock: true,
    sort: "newest",
    pageSize: 5,
  });
  if (!related.ok) {
    return null;
  }
  const items = related.data.items.filter((item) => item.sku !== sku).slice(0, 4);
  if (items.length === 0) {
    return null;
  }
  const typeLabels = new Map(
    related.data.facets.productTypes.map((type) => [type.value, type.label]),
  );

  return (
    <section aria-labelledby="related-heading" className="mt-16 border-t border-neutral-200 pt-12">
      <h2 id="related-heading" className="text-title font-display text-navy-900">
        {t("product.relatedTitle")}
      </h2>
      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 lg:gap-x-6">
        {items.map((item) => (
          <li key={item.id} className="scroll-reveal">
            <ProductCard
              product={item}
              locale={locale}
              typeLabel={typeLabels.get(item.productType) ?? item.productType}
              sizes="(min-width: 768px) 25vw, 34vw"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ProductPage({ params, searchParams }: Props) {
  const product = await requireProduct(params);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const { variant } = await searchParams;
  const categoryLabel =
    product.attributes.find((attribute) => attribute.key === "category")?.valueLabel ??
    product.category;
  const typeLabel =
    product.attributes.find((attribute) => attribute.key === "product_type")?.valueLabel ??
    product.productType;
  const images = product.images.map((image) => {
    const sources = imageSources(image);
    return { id: image.id, thumb: sources.small, full: sources.large };
  });

  return (
    <Container className="pt-6 pb-28 lg:pt-8 lg:pb-16">
      <Breadcrumb
        items={[
          { label: t("catalog.shopTitle"), href: "/shop" },
          {
            label: categoryLabel,
            href: `/shop?category=${encodeURIComponent(product.category)}`,
          },
          { label: product.name },
        ]}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <ProductGallery name={product.name} images={images} />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-small font-medium text-neutral-600">{typeLabel}</p>
            <h1 className="text-title font-display text-navy-900 md:text-display">
              {product.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <Price amount={product.priceVnd} locale={locale} size="lg" />
              {product.inStock ? null : <Badge tone="soldout">{t("product.soldOut")}</Badge>}
            </div>
            <p className="text-caption text-neutral-600">
              {t("product.sku", { sku: product.sku })}
            </p>
          </div>

          <PurchasePanel
            sku={product.sku}
            name={product.name}
            priceVnd={product.priceVnd}
            variants={product.variants}
            initialVariantId={typeof variant === "string" ? variant : undefined}
            hasSizeGuide={product.sizeGuide !== null}
          />

          <div className="flex flex-col items-start gap-3 rounded-lg bg-neutral-50 p-5">
            <p className="text-small text-neutral-700">{t("product.assistantHint")}</p>
            <AssistantOpenButton label={t("product.assistantCta")} variant="secondary" size="md" />
          </div>

          {product.description ? (
            <div className="flex flex-col gap-2 border-t border-neutral-200 pt-6">
              <h2 className="text-heading-sm font-semibold text-navy-900">
                {t("product.descriptionTitle")}
              </h2>
              <p className="max-w-[65ch] text-body text-neutral-700">{product.description}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-12 grid gap-12 border-t border-neutral-200 pt-10 lg:grid-cols-12">
        <div className={product.sizeGuide ? "lg:col-span-5" : "lg:col-span-8"}>
          <ProductSpecs attributes={product.attributes} />
        </div>
        {product.sizeGuide ? (
          <div className="lg:col-span-7">
            <SizeGuideTable guide={product.sizeGuide} />
          </div>
        ) : null}
      </div>

      <Suspense fallback={null}>
        <RelatedProducts sku={product.sku} category={product.category} locale={locale} />
      </Suspense>
    </Container>
  );
}
