"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import { m, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import type { PointerEvent } from "react";

import { Link } from "@/i18n/navigation";

/** The headline leads, then the single shop action arrives as the photos settle. */
export function HeroIntro({ description, cta }: { description: string; cta: string }) {
  const reduce = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 180, damping: 18 });
  const y = useSpring(pointerY, { stiffness: 180, damping: 18 });

  function move(event: PointerEvent<HTMLAnchorElement>) {
    if (reduce || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left - bounds.width / 2) * 0.08);
    pointerY.set((event.clientY - bounds.top - bounds.height / 2) * 0.18);
  }

  return (
    <div className="flex flex-col items-start gap-7 lg:gap-8">
      <h1
        id="hero-heading"
        className="text-[clamp(3.5rem,7.2vw,6.75rem)] leading-[1.02] font-display text-white"
      >
        <span className="block overflow-hidden pb-1">
          {["Find", "your"].map((word, index) => (
            <m.span
              key={word}
              className="inline-block"
              initial={reduce ? false : { y: "110%", rotate: 3 }}
              animate={{ y: 0, rotate: 0 }}
              transition={{ duration: 0.95, delay: 0.08 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              {word}
              {index === 0 ? "\u00a0" : ""}
            </m.span>
          ))}
        </span>
        <span className="block overflow-hidden pb-1">
          <m.span
            className="block text-lime-400"
            initial={reduce ? false : { y: "110%", rotate: 3 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ duration: 1.1, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            water.
          </m.span>
        </span>
      </h1>
      <m.p
        className="max-w-[34ch] text-lead text-white/85"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.45 }}
      >
        {description}
      </m.p>
      <m.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.6 }}
      >
        <Link
          href="/shop"
          onPointerMove={move}
          onPointerLeave={() => {
            pointerX.set(0);
            pointerY.set(0);
          }}
          className="group inline-flex min-h-14 items-center gap-6 rounded-full py-1 text-heading-sm font-semibold whitespace-nowrap text-white focus-visible:outline-lime-400 active:scale-[0.98]"
        >
          <span className="relative py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-white after:transition-transform after:duration-300 group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
            {cta}
          </span>
          <m.span
            style={reduce ? undefined : { x, y }}
            className="relative inline-flex size-14 items-center justify-center overflow-hidden rounded-full bg-lime-400 text-navy-950"
          >
            <ArrowUpRight
              aria-hidden
              size={26}
              className="transition-transform duration-500 ease-out-expo group-hover:translate-x-10 group-hover:-translate-y-10"
            />
            <ArrowUpRight
              aria-hidden
              size={26}
              className="absolute -translate-x-10 translate-y-10 transition-transform duration-500 ease-out-expo group-hover:translate-x-0 group-hover:translate-y-0"
            />
          </m.span>
        </Link>
      </m.div>
    </div>
  );
}
