import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import type { ProductListItem } from "@/server/catalog";

import { HoverImage } from "./hover-image";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";

export type ProductCardViewProps = {
  primary: string | null;
  secondary: string | null;
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
 * is one link; on mouse hover a second studio angle fades in when it exists.
 */
export function ProductCardView({
  primary,
  secondary,
  product,
  locale,
  typeLabel,
  priority,
  sizes,
  headingLevel = 3,
}: ProductCardViewProps) {
  const t = useTranslations("catalog");
  const Heading = `h${headingLevel}` as const;

  return (
    <article className="group relative flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg">
        <ProductImage
          src={primary}
          alt={product.name}
          fallbackLabel={t("imageUnavailable")}
          priority={priority}
          sizes={sizes}
          imageClassName="transition-transform duration-700 ease-out-expo group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        {secondary ? (
          <HoverImage src={secondary} sizes={sizes} fallbackLabel={t("imageUnavailable")} />
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <p className="pr-12 text-caption text-neutral-600">{typeLabel}</p>
        <Heading className="text-small font-semibold text-navy-900">
          <Link
            href={`/products/${encodeURIComponent(product.sku)}`}
            className="rounded-md after:absolute after:inset-0 after:rounded-lg hover:underline"
          >
            {product.name}
          </Link>
        </Heading>
        <div className="flex flex-wrap items-center gap-2">
          <Price amount={product.priceVnd} locale={locale} size="sm" />
          {product.inStock ? null : <Badge tone="soldout">{t("soldOut")}</Badge>}
        </div>
      </div>
      <div className="absolute top-3 right-3">
        <FavoriteButton id={product.id} name={product.name} />
      </div>
    </article>
  );
}
