"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { IconButton } from "@/components/ui/icon-button";

export type ProductRailProps = {
  /** Section heading, rendered on the left of the controls. */
  heading: ReactNode;
  /** Extra link rendered before the arrows, such as "View all". */
  action?: ReactNode;
  previousLabel: string;
  nextLabel: string;
  /** `<li>` elements; each one snaps into place. */
  children: ReactNode;
};

/**
 * Horizontal, swipeable row of products with arrow buttons. The arrows are
 * disabled at either end, which IntersectionObserver detects without a scroll
 * listener.
 */
export function ProductRail({
  heading,
  action,
  previousLabel,
  nextLabel,
  children,
}: ProductRailProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const list = listRef.current;
    const first = list?.firstElementChild;
    const last = list?.lastElementChild;
    if (!list || !first || !last) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === first) setAtStart(entry.isIntersecting);
          if (entry.target === last) setAtEnd(entry.isIntersecting);
        }
      },
      { root: list, threshold: 0.95 },
    );
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, []);

  function scrollByPage(direction: 1 | -1) {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({ left: direction * list.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {heading}
        <div className="flex items-center gap-2">
          {action}
          <div className="hidden items-center gap-2 sm:flex">
            <IconButton
              label={previousLabel}
              icon={<CaretLeft aria-hidden size={20} />}
              onClick={() => scrollByPage(-1)}
              disabled={atStart}
              className="border border-neutral-300 bg-white"
            />
            <IconButton
              label={nextLabel}
              icon={<CaretRight aria-hidden size={20} />}
              onClick={() => scrollByPage(1)}
              disabled={atEnd}
              className="border border-neutral-300 bg-white"
            />
          </div>
        </div>
      </div>
      <ul
        ref={listRef}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:gap-6 lg:px-8 [&::-webkit-scrollbar]:hidden [&>li]:w-[68%] [&>li]:shrink-0 [&>li]:snap-start sm:[&>li]:w-[40%] lg:[&>li]:w-[calc((100%-4.5rem)/4)]"
      >
        {children}
      </ul>
    </div>
  );
}
