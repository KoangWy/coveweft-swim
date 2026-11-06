"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cx } from "@/components/ui/cx";
import { ProductImage } from "@/components/ui/product-image";

export type GalleryImage = {
  id: string;
  thumb: string | null;
  full: string | null;
};

const THUMBS_PER_PAGE = 5;

/**
 * Studio gallery: one large image and a paged strip of thumbnails. Only the
 * selected image loads at full size; thumbnails load lazily at the smallest
 * width. Every frame keeps the 2:3 ratio, so switching never shifts layout.
 */
export function ProductGallery({ name, images }: { name: string; images: GalleryImage[] }) {
  const t = useTranslations("product.gallery");
  const tc = useTranslations("catalog");
  const [selected, setSelected] = useState(0);
  const [thumbPage, setThumbPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(images.length / THUMBS_PER_PAGE));
  const current = images[selected];
  const visible = images.slice(thumbPage * THUMBS_PER_PAGE, (thumbPage + 1) * THUMBS_PER_PAGE);

  function select(index: number) {
    setSelected(index);
    setThumbPage(Math.floor(index / THUMBS_PER_PAGE));
  }

  return (
    // Below lg the gallery is narrower so the option picker stays close to the
    // top of the page; desktop gives the photos the full column.
    <section
      aria-label={t("label")}
      className="mx-auto flex w-full max-w-[18rem] flex-col gap-3 sm:max-w-sm lg:max-w-none"
    >
      <div className="relative">
        <ProductImage
          key={current?.id ?? "placeholder"}
          src={current?.full ?? null}
          alt={t("imageAlt", { name, index: selected + 1, total: Math.max(images.length, 1) })}
          fallbackLabel={tc("imageUnavailable")}
          priority={selected === 0}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="rounded-md"
        />
        {images.length > 1 ? (
          <div className="absolute inset-x-2 bottom-2 flex justify-between">
            <button
              type="button"
              onClick={() => select((selected - 1 + images.length) % images.length)}
              aria-label={t("previous")}
              className="inline-flex size-11 items-center justify-center rounded-md bg-white/90 text-navy-900 shadow-raised hover:bg-white"
            >
              <CaretLeft aria-hidden size={20} />
            </button>
            <button
              type="button"
              onClick={() => select((selected + 1) % images.length)}
              aria-label={t("next")}
              className="inline-flex size-11 items-center justify-center rounded-md bg-white/90 text-navy-900 shadow-raised hover:bg-white"
            >
              <CaretRight aria-hidden size={20} />
            </button>
          </div>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {t("position", { index: selected + 1, total: Math.max(images.length, 1) })}
      </p>

      {images.length > 1 ? (
        <div className="flex items-center gap-2">
          {pageCount > 1 ? (
            <button
              type="button"
              onClick={() => setThumbPage((page) => Math.max(0, page - 1))}
              disabled={thumbPage === 0}
              aria-label={t("previousThumbs")}
              className="inline-flex h-11 w-8 shrink-0 items-center justify-center rounded-md text-navy-900 hover:bg-neutral-100 disabled:text-neutral-300"
            >
              <CaretLeft aria-hidden size={18} />
            </button>
          ) : null}
          <ul className="grid flex-1 grid-cols-5 gap-2">
            {visible.map((image, offset) => {
              const index = thumbPage * THUMBS_PER_PAGE + offset;
              const active = index === selected;
              return (
                <li key={image.id}>
                  <button
                    type="button"
                    onClick={() => select(index)}
                    aria-label={t("show", { index: index + 1, total: images.length })}
                    aria-pressed={active}
                    className={cx(
                      "block w-full overflow-hidden rounded-md border-2 transition-colors duration-150",
                      active ? "border-navy-900" : "border-transparent hover:border-neutral-300",
                    )}
                  >
                    <ProductImage src={image.thumb} alt="" fallbackLabel="" sizes="10vw" />
                  </button>
                </li>
              );
            })}
          </ul>
          {pageCount > 1 ? (
            <button
              type="button"
              onClick={() => setThumbPage((page) => Math.min(pageCount - 1, page + 1))}
              disabled={thumbPage >= pageCount - 1}
              aria-label={t("nextThumbs")}
              className="inline-flex h-11 w-8 shrink-0 items-center justify-center rounded-md text-navy-900 hover:bg-neutral-100 disabled:text-neutral-300"
            >
              <CaretRight aria-hidden size={18} />
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
