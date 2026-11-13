import type { Locale } from "@/lib/locale";
import { getProductBySku } from "@/server/catalog";
import { imageUrl } from "@/server/media";

import { productUrl, type ProductCard } from "./tools";

/** Product cards sent with one answer, matching the turn's own limit. */
const MAX_CARDS = 6;

/**
 * Rebuilds product cards for stored SKUs from the current catalog. Prices,
 * stock, names, and images are never read from the conversation row, so a
 * product that was hidden or removed since then simply loses its card.
 */
export async function loadProductCards(
  skus: readonly string[],
  locale: Locale,
  options: { limit?: number } = {},
): Promise<ProductCard[]> {
  const unique = [...new Set(skus)].slice(0, options.limit ?? MAX_CARDS);
  const products = await Promise.all(
    unique.map(async (sku) => {
      const result = await getProductBySku({ sku }).catch(() => null);

      return result?.ok ? result.data : null;
    }),
  );

  return products.flatMap((product) => {
    if (!product) {
      return [];
    }

    const image = product.images.find((candidate) => candidate.isVisible) ?? null;

    return [
      {
        sku: product.sku,
        name: product.name,
        priceVnd: product.priceVnd,
        inStock: product.inStock,
        imageUrl: image ? imageUrl(image, 480) : null,
        url: productUrl(locale, product.sku),
      },
    ];
  });
}
