"use client";

import Image from "next/image";

import { BRAND_IMAGES, type BrandImageName } from "@/lib/brand-images";

import { cx } from "./cx";
import { sizedImageLoader } from "./image-loader";

const loaders = Object.fromEntries(
  Object.entries(BRAND_IMAGES).map(([name, image]) => [name, sizedImageLoader(image.widths)]),
) as Record<BrandImageName, ReturnType<typeof sizedImageLoader>>;

export type BrandImageProps = {
  name: BrandImageName;
  /** Empty for decorative backgrounds. */
  alt?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
};

/** Brand photo that fills its positioned parent. */
export function BrandImage({
  name,
  alt = "",
  sizes = "100vw",
  priority = false,
  className,
}: BrandImageProps) {
  return (
    <Image
      src={BRAND_IMAGES[name].src}
      alt={alt}
      fill
      loader={loaders[name]}
      sizes={sizes}
      priority={priority}
      fetchPriority={priority ? "high" : undefined}
      className={cx("object-cover", className)}
    />
  );
}
