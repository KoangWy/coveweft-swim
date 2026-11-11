"use client";

import {
  m,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useRef, type PointerEvent } from "react";

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
  { className: "top-[2%] left-[2%] w-[50%]", rotate: -6, travel: -90, delay: 0.25 },
  { className: "top-[22%] right-0 w-[42%]", rotate: 7, travel: -170, delay: 0.4 },
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
        initial={
          reduce
            ? false
            : { opacity: 0, x: slot.rotate < 0 ? -64 : 64, y: 80, rotate: slot.rotate * 2 }
        }
        animate={{ opacity: 1, x: 0, y: 0, rotate: slot.rotate }}
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
          <span className="mt-3 flex w-fit max-w-full flex-col gap-1 rounded-md bg-navy-950 px-3 py-2 text-small text-white">
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

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateX = useSpring(pointerY, { stiffness: 90, damping: 22 });
  const rotateY = useSpring(pointerX, { stiffness: 90, damping: 22 });

  function move(event: PointerEvent<HTMLUListElement>) {
    if (reduce || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - bounds.left - bounds.width / 2) / bounds.width) * 9);
    pointerY.set(((event.clientY - bounds.top - bounds.height / 2) / bounds.height) * -7);
  }

  return (
    <m.ul
      style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 1000 }}
      onPointerMove={move}
      onPointerLeave={() => {
        pointerX.set(0);
        pointerY.set(0);
      }}
      ref={ref}
      aria-label={label}
      className="relative mx-auto aspect-[5/6] w-full max-w-[34rem]"
    >
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
    </m.ul>
  );
}
