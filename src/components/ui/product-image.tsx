"use client";

import { ImageSquare } from "@phosphor-icons/react";
import Image from "next/image";
import { useState } from "react";

import { cx } from "./cx";

export type ProductImageProps = {
  /** Public image URL, or null when media is not configured. */
  src: string | null;
  alt: string;
  /** Short text shown in the placeholder when the image is missing or fails. */
  fallbackLabel: string;
  sizes?: string;
  priority?: boolean;
  /** Fill the positioned parent instead of keeping the 2:3 frame. */
  fill?: boolean;
  /** Keep the top of the photo in view when a wide frame crops it. */
  anchorTop?: boolean;
  className?: string;
};

/**
 * Studio image in a fixed 2:3 frame, so the layout does not move while it
 * loads. Images are served as published (no on-the-fly optimization). A
 * missing or broken image shows a neutral placeholder with a text label.
 */
export function ProductImage({
  src,
  alt,
  fallbackLabel,
  sizes = "(min-width: 1024px) 25vw, 50vw",
  priority = false,
  fill = false,
  anchorTop = false,
  className,
}: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && failedSrc !== src;

  return (
    <div
      className={cx(
        "overflow-hidden bg-neutral-100",
        fill ? "absolute inset-0" : "relative aspect-[2/3]",
        className,
      )}
    >
      {showImage ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          onError={() => setFailedSrc(src)}
          className={cx("object-cover", anchorTop && "object-top")}
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-neutral-600"
        >
          <ImageSquare aria-hidden size={32} />
          <span aria-hidden className="text-caption">
            {fallbackLabel}
          </span>
        </div>
      )}
    </div>
  );
}
