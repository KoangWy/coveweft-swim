import "server-only";

import type { ProductImage } from "@/server/catalog";
import { imageUrl } from "@/server/media";

/** Public URLs of one image at the three published widths. */
export type ImageSources = {
  small: string | null;
  medium: string | null;
  large: string | null;
};

const EMPTY: ImageSources = { small: null, medium: null, large: null };

/**
 * Resolves the URLs of a product image on the server, where the media
 * configuration is available. Without media configuration every URL is null
 * and the UI renders a neutral placeholder.
 */
export function imageSources(image: ProductImage | null | undefined): ImageSources {
  if (!image) {
    return EMPTY;
  }

  return {
    small: imageUrl(image, 480),
    medium: imageUrl(image, 960),
    large: imageUrl(image, 1600),
  };
}
