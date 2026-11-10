/**
 * Brand photography served from `public/brand`. Each photo is published at
 * the listed widths as `<name>-<width>.webp`. Sources and licenses are listed
 * in docs/media.md.
 */
export const BRAND_IMAGES = {
  oceanShore: { src: "/brand/ocean-shore-1600.webp", widths: [480, 960, 1600, 2400] },
  poolLanes: { src: "/brand/pool-lanes-1600.webp", widths: [480, 960, 1600] },
  surfLines: { src: "/brand/surf-lines-1600.webp", widths: [480, 960, 1600] },
  underwaterSwim: { src: "/brand/underwater-swim-1600.webp", widths: [480, 960, 1600] },
} as const;

export type BrandImageName = keyof typeof BRAND_IMAGES;
