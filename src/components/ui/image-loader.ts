import type { ImageLoader } from "next/image";

/** Widths published for every studio image in the release media package. */
export const RELEASE_IMAGE_WIDTHS = [480, 960, 1600] as const;

const SIZED_WEBP = /-(\d+)\.webp$/;

/** Whether the URL ends in a `-<width>.webp` suffix that a sized loader can swap. */
export function isSizedImage(src: string): boolean {
  return SIZED_WEBP.test(src);
}

/**
 * Builds a next/image loader for files published at fixed widths and named
 * `<base>-<width>.webp`. The browser gets a real `srcset` and picks the
 * smallest file that covers the slot, without on-the-fly optimization.
 *
 * On phones, callers list about two thirds of the real slot width in `sizes`.
 * That caps downloads near 2x density on 3x screens, where the extra detail
 * is not visible but the larger files cost mobile data.
 */
export function sizedImageLoader(widths: readonly number[]): ImageLoader {
  const sorted = [...widths].sort((a, b) => a - b);
  return ({ src, width }) => {
    const chosen = sorted.find((candidate) => candidate >= width) ?? sorted[sorted.length - 1];
    return src.replace(SIZED_WEBP, `-${chosen}.webp`);
  };
}
