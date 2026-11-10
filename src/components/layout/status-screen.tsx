import type { ReactNode } from "react";

import { BrandImage } from "@/components/ui/brand-image";
import { cx } from "@/components/ui/cx";

import { Container } from "./container";

/**
 * Full-width status page (404, 500) over the pool photo: a large status
 * code, the heading, a short explanation, and the actions that resolve it.
 */
export function StatusScreen({
  code,
  title,
  description,
  actions,
  className,
}: {
  code: string;
  title: string;
  description: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "relative isolate flex flex-1 overflow-hidden bg-navy-950 text-white",
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-10">
        <BrandImage name="poolLanes" sizes="(min-width: 1024px) 100vw, 66vw" priority />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/95 via-navy-950/75 to-navy-950/30" />
      </div>
      <Container className="flex min-h-[32rem] flex-col justify-center gap-5 py-20">
        <p className="animate-rise text-[6rem] leading-none font-display text-lime-400 sm:text-[8rem]">
          {code}
        </p>
        <h1 className="animate-rise text-title font-display text-white [animation-delay:100ms] md:text-display">
          {title}
        </h1>
        <div className="max-w-[48ch] animate-rise text-lead text-white/85 [animation-delay:180ms]">
          {description}
        </div>
        <div className="mt-2 flex animate-rise flex-wrap gap-3 [animation-delay:260ms]">
          {actions}
        </div>
      </Container>
    </section>
  );
}
