import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import type { ComponentProps, ComponentType } from "react";

import { cx } from "./cx";

type LinkComponent = ComponentType<ComponentProps<"a"> & { href: string }>;

export type PaginationProps = {
  page: number;
  pageCount: number;
  /** Builds the URL for a page number, keeping the current filters. */
  hrefForPage: (page: number) => string;
  labels: {
    nav: string;
    previous: string;
    next: string;
    page: (page: number) => string;
  };
  /** Link component, for example the locale-aware Link from `@/i18n/navigation`. */
  linkComponent?: LinkComponent;
  className?: string;
};

/** Page numbers to show: first, last, and a window around the current page. */
export function paginationItems(page: number, pageCount: number): Array<number | "gap"> {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const items: Array<number | "gap"> = [];

  for (const [index, value] of sorted.entries()) {
    if (index > 0 && value - sorted[index - 1] > 1) {
      items.push("gap");
    }
    items.push(value);
  }

  return items;
}

const itemClasses =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-md px-3 text-small font-medium tabular-nums transition-colors duration-150";

export function Pagination({
  page,
  pageCount,
  hrefForPage,
  labels,
  linkComponent: LinkTag = "a" as unknown as LinkComponent,
  className,
}: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  const hasPrevious = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav aria-label={labels.nav} className={cx("flex justify-center", className)}>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {hasPrevious ? (
            <LinkTag
              href={hrefForPage(page - 1)}
              rel="prev"
              className={cx(itemClasses, "gap-1 text-navy-900 hover:bg-neutral-100")}
            >
              <CaretLeft aria-hidden size={16} />
              <span className="max-sm:sr-only">{labels.previous}</span>
            </LinkTag>
          ) : (
            <span aria-disabled className={cx(itemClasses, "gap-1 text-neutral-500")}>
              <CaretLeft aria-hidden size={16} />
              <span className="max-sm:sr-only">{labels.previous}</span>
            </span>
          )}
        </li>
        {paginationItems(page, pageCount).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden className="px-1 text-neutral-600">
              …
            </li>
          ) : (
            <li key={item}>
              <LinkTag
                href={hrefForPage(item)}
                aria-label={labels.page(item)}
                aria-current={item === page ? "page" : undefined}
                className={cx(
                  itemClasses,
                  item === page ? "bg-navy-900 text-white" : "text-navy-900 hover:bg-neutral-100",
                )}
              >
                {item}
              </LinkTag>
            </li>
          ),
        )}
        <li>
          {hasNext ? (
            <LinkTag
              href={hrefForPage(page + 1)}
              rel="next"
              className={cx(itemClasses, "gap-1 text-navy-900 hover:bg-neutral-100")}
            >
              <span className="max-sm:sr-only">{labels.next}</span>
              <CaretRight aria-hidden size={16} />
            </LinkTag>
          ) : (
            <span aria-disabled className={cx(itemClasses, "gap-1 text-neutral-500")}>
              <span className="max-sm:sr-only">{labels.next}</span>
              <CaretRight aria-hidden size={16} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
