"use client";

import { m, useReducedMotion, useScroll, useTransform } from "motion/react";

import { BrandImage } from "@/components/ui/brand-image";

/**
 * Full-bleed ocean photo behind the hero. It settles from a slight zoom on
 * load and drifts slower than the page while the hero scrolls away, which
 * gives the headline depth. Both effects stop under reduced motion.
 */
export function HeroBackdrop() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 900], [0, 180]);

  return (
    <m.div
      aria-hidden
      style={reduce ? undefined : { y }}
      className="absolute inset-x-0 -top-8 -bottom-8"
    >
      <div className="absolute inset-0 animate-settle">
        <BrandImage
          name="oceanShore"
          priority
          sizes="(min-width: 1024px) 100vw, 66vw"
          className="object-[60%_50%]"
        />
      </div>
    </m.div>
  );
}
