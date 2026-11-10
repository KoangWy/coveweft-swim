"use client";

import { useEffect, useRef, useState } from "react";

import { ProductImage } from "@/components/ui/product-image";

/**
 * Second studio angle that fades in while the pointer is over the card. It is
 * only fetched after a mouse first enters the card, so touch devices and
 * cards nobody hovers never download it.
 */
export function HoverImage({
  src,
  sizes,
  fallbackLabel,
}: {
  src: string;
  sizes?: string;
  fallbackLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const card = ref.current?.closest("article");
    if (!card || armed) return;
    function arm(event: PointerEvent) {
      if (event.pointerType === "mouse") setArmed(true);
    }
    card.addEventListener("pointerenter", arm);
    return () => card.removeEventListener("pointerenter", arm);
  }, [armed]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="absolute inset-0 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 motion-reduce:transition-none"
    >
      {armed ? <ProductImage src={src} alt="" fallbackLabel={fallbackLabel} sizes={sizes} /> : null}
    </div>
  );
}
