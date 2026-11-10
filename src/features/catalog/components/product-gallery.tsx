"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useRef, useState, type PointerEvent } from "react";

import { cx } from "@/components/ui/cx";
import { ProductImage } from "@/components/ui/product-image";

export type GalleryImage = {
  id: string;
  thumb: string | null;
  full: string | null;
};

/** Horizontal travel, in pixels, that counts as a swipe on the main image. */
const SWIPE_DISTANCE = 40;

/**
 * Studio gallery: a thumbnail strip and one main image. The main image is
 * capped to the viewport height so the option picker stays in view; it
 * zooms toward the pointer on hover and changes on swipe. Every frame keeps
 * the 2:3 ratio, so switching never shifts the layout.
 */
export function ProductGallery({ name, images }: { name: string; images: GalleryImage[] }) {
  const t = useTranslations("product.gallery");
  const tc = useTranslations("catalog");
  const [selected, setSelected] = useState(0);
  const zoomRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<number | null>(null);
  const current = images[selected];
  const total = Math.max(images.length, 1);

  function select(index: number) {
    setSelected((index + images.length) % images.length);
  }

  // The zoom origin follows the mouse through CSS variables, so pointer
  // movement never re-renders the component.
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const frame = zoomRef.current;
    if (!frame || event.pointerType !== "mouse") return;
    const box = frame.getBoundingClientRect();
    frame.style.setProperty("--zoom-x", `${((event.clientX - box.left) / box.width) * 100}%`);
    frame.style.setProperty("--zoom-y", `${((event.clientY - box.top) / box.height) * 100}%`);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") swipeStart.current = event.clientX;
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (start === null || images.length < 2) return;
    const distance = event.clientX - start;
    if (Math.abs(distance) >= SWIPE_DISTANCE) select(selected + (distance < 0 ? 1 : -1));
  }

  return (
    <section
      aria-label={t("label")}
      className="flex min-w-0 flex-col-reverse gap-3 lg:flex-row lg:items-start lg:gap-4"
    >
      {images.length > 1 ? (
        <ul className="-mx-1 flex [scrollbar-width:none] gap-2 overflow-x-auto p-1 lg:mx-0 lg:max-h-[min(calc(100dvh-12rem),46rem)] lg:w-[4.75rem] lg:shrink-0 lg:flex-col lg:overflow-y-auto [&::-webkit-scrollbar]:hidden">
          {images.map((image, index) => {
            const active = index === selected;
            return (
              <li key={image.id} className="w-14 shrink-0 lg:w-full">
                <button
                  type="button"
                  onClick={() => select(index)}
                  aria-label={t("show", { index: index + 1, total: images.length })}
                  aria-pressed={active}
                  className={cx(
                    "block w-full overflow-hidden rounded-md ring-2 ring-offset-2 transition-[box-shadow,opacity] duration-150",
                    active ? "ring-navy-900" : "opacity-70 ring-transparent hover:opacity-100",
                  )}
                >
                  <ProductImage src={image.thumb} alt="" fallbackLabel="" sizes="80px" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="relative mx-auto w-full max-w-[calc(54dvh*2/3)] lg:mx-0 lg:w-auto lg:max-w-none">
        <div
          ref={zoomRef}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipeStart.current = null)}
          className="group touch-pan-y overflow-hidden rounded-lg [--zoom-x:50%] [--zoom-y:50%]"
        >
          <ProductImage
            key={current?.id ?? "placeholder"}
            src={current?.full ?? null}
            alt={t("imageAlt", { name, index: selected + 1, total })}
            fallbackLabel={tc("imageUnavailable")}
            priority={selected === 0}
            sizes="(min-width: 1024px) 34vw, 52vw"
            className="w-full lg:h-[min(calc(100dvh-12rem),46rem)] lg:w-auto"
            imageClassName="origin-[var(--zoom-x)_var(--zoom-y)] transition-transform duration-300 ease-out [@media(hover:hover)]:group-hover:scale-[1.7] motion-reduce:transition-none"
          />
        </div>
        {images.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-between">
            <button
              type="button"
              onClick={() => select(selected - 1)}
              aria-label={t("previous")}
              className="pointer-events-auto inline-flex size-11 items-center justify-center rounded-full bg-white/90 text-navy-900 shadow-raised backdrop-blur-sm transition-colors hover:bg-white"
            >
              <CaretLeft aria-hidden size={20} />
            </button>
            <button
              type="button"
              onClick={() => select(selected + 1)}
              aria-label={t("next")}
              className="pointer-events-auto inline-flex size-11 items-center justify-center rounded-full bg-white/90 text-navy-900 shadow-raised backdrop-blur-sm transition-colors hover:bg-white"
            >
              <CaretRight aria-hidden size={20} />
            </button>
          </div>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {t("position", { index: selected + 1, total })}
        </p>
      </div>
    </section>
  );
}
