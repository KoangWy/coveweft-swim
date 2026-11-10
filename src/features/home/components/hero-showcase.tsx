"use client";

import { m, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";

import { cx } from "@/components/ui/cx";
import { ProductImage } from "@/components/ui/product-image";
import { Link } from "@/i18n/navigation";

export type ShowcaseItem = {
  id: string;
  href: string;
  name: string;
  price: string;
  image: string | null;
};

/** Resting position, size, tilt, and parallax travel of each card. */
const SLOTS = [
  { className: "top-[2%] left-[2%] w-[50%]", rotate: -4, travel: -90, delay: 0.25 },
  { className: "top-[24%] right-0 w-[42%]", rotate: 5, travel: -170, delay: 0.4 },
] as const;

function Card({
  item,
  slot,
  progress,
  reduce,
  fallbackLabel,
}: {
  item: ShowcaseItem;
  slot: (typeof SLOTS)[number];
  progress: MotionValue<number>;
  reduce: boolean;
  fallbackLabel: string;
}) {
  const y = useTransform(progress, [0, 1], [0, slot.travel]);

  return (
    <m.li style={reduce ? undefined : { y }} className={cx("absolute", slot.className)}>
      <m.div
        initial={{ opacity: 0, y: 56, rotate: 0 }}
        animate={{ opacity: 1, y: 0, rotate: slot.rotate }}
        transition={{ type: "spring", stiffness: 80, damping: 18, delay: slot.delay }}
      >
        <Link href={item.href} className="group block rounded-lg focus-visible:outline-white">
          <span className="block overflow-hidden rounded-lg shadow-float ring-1 ring-white/25 transition-transform duration-500 ease-out-expo group-hover:-translate-y-2">
            <ProductImage
              src={item.image}
              alt={item.name}
              fallbackLabel={fallbackLabel}
              sizes="(min-width: 1280px) 22vw, 26vw"
              priority={slot.delay < 0.3}
              imageClassName="transition-transform duration-700 ease-out-expo group-hover:scale-105"
            />
          </span>
          <span className="mt-3 flex items-baseline justify-between gap-3 px-1 text-small text-white">
            <span className="truncate font-semibold">{item.name}</span>
            <span className="shrink-0 text-lime-300">{item.price}</span>
          </span>
        </Link>
      </m.div>
    </m.li>
  );
}

/**
 * Two studio photos floating over the hero photo. They rise in on load and
 * move at different speeds while the hero scrolls away.
 */
export function HeroShowcase({
  items,
  label,
  fallbackLabel,
}: {
  items: ShowcaseItem[];
  label: string;
  fallbackLabel: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  return (
    <ul ref={ref} aria-label={label} className="relative mx-auto aspect-[5/6] w-full max-w-[34rem]">
      {items.slice(0, SLOTS.length).map((item, index) => (
        <Card
          key={item.id}
          item={item}
          slot={SLOTS[index]}
          progress={scrollYProgress}
          reduce={reduce}
          fallbackLabel={fallbackLabel}
        />
      ))}
    </ul>
  );
}
