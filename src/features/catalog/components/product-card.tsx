import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import type { ProductListItem } from "@/server/catalog";

import { imageSources } from "./image-sources";

export type ProductCardProps = {
  product: ProductListItem;
  locale: Locale;
  /** Translated product type, shown above the name. */
  typeLabel: string;
  /** Load the first image eagerly, for cards above the fold. */
  priority?: boolean;
  sizes?: string;
  headingLevel?: 2 | 3;
};

/**
 * Listing card: studio image, type, model name, and VND price. The whole card
 * is one link; on hover a second studio angle fades in when it exists.
 */
export function ProductCard({
  product,
  locale,
  typeLabel,
  priority,
  sizes,
  headingLevel = 3,
}: ProductCardProps) {
  const t = useTranslations("catalog");
  const Heading = `h${headingLevel}` as const;
  const primary = imageSources(product.images[0]);
  const secondary = product.images[1] ? imageSources(product.images[1]) : null;

  return (
    <article className="group relative flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-md">
        <ProductImage
          src={primary.medium}
          alt={product.name}
          fallbackLabel={t("imageUnavailable")}
          priority={priority}
          sizes={sizes}
        />
        {secondary?.medium ? (
          <div
            aria-hidden
            className="absolute inset-0 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 motion-reduce:transition-none"
          >
            <ProductImage
              src={secondary.medium}
              alt=""
              fallbackLabel={t("imageUnavailable")}
              sizes={sizes}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-caption text-neutral-600">{typeLabel}</p>
        <Heading className="text-small font-semibold text-navy-900">
          <Link
            href={`/products/${encodeURIComponent(product.sku)}`}
            className="rounded-md after:absolute after:inset-0 after:rounded-md hover:underline"
          >
            {product.name}
          </Link>
        </Heading>
        <div className="flex flex-wrap items-center gap-2">
          <Price amount={product.priceVnd} locale={locale} size="sm" />
          {product.inStock ? null : <Badge tone="soldout">{t("soldOut")}</Badge>}
        </div>
      </div>
    </article>
  );
}
