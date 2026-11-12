"use client";

import { ArrowRight, CircleNotch, MagnifyingGlass } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import { cx } from "@/components/ui/cx";
import { Price } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";

/** Requests are debounced so typing a word sends one lookup, not one per key. */
const DEBOUNCE_MS = 250;
/** Below two characters the catalog match is too broad to be useful. */
const MIN_QUERY_CHARS = 2;
/** Most recent terms kept in memory, so backspacing does not refetch. */
const CACHE_ENTRIES = 30;
const PANEL_ID_SUFFIX = "-suggestions";

type Suggestion = {
  id: string;
  sku: string;
  name: string;
  priceVnd: number;
  inStock: boolean;
  imageUrl: string | null;
};

type SuggestionResponse = {
  items: Suggestion[];
  total: number;
};

type Status = "idle" | "loading" | "ready" | "error";

export type SearchFormProps = {
  /** Input id; a unique value per header instance. */
  id: string;
  className?: string;
};

/**
 * Header search with live suggestions. The form still works as a plain GET
 * form without JavaScript; the combobox only adds a preview of matching
 * products while the customer types.
 */
export function SearchForm({ id, className }: SearchFormProps) {
  const t = useTranslations("nav");
  const productT = useTranslations("catalog");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  // The pathname this panel was opened on. A navigation changes the pathname,
  // which closes the panel without an effect that writes state.
  const [panel, setPanel] = useState({ open: false, path: pathname });
  const [activeIndex, setActiveIndex] = useState(-1);
  const formRef = useRef<HTMLFormElement>(null);
  const cacheRef = useRef(new Map<string, SuggestionResponse>());
  const controllerRef = useRef<AbortController | null>(null);

  const term = query.trim();
  const open = panel.open && panel.path === pathname;
  const panelOpen = open && term.length >= MIN_QUERY_CHARS;
  const listboxId = `${id}${PANEL_ID_SUFFIX}`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const showSeeAll = status === "ready" && total > items.length;
  const optionCount = items.length + (showSeeAll ? 1 : 0);
  const listboxVisible = panelOpen && status === "ready" && items.length > 0;

  useEffect(() => {
    if (!panelOpen) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      return;
    }

    const cached = cacheRef.current.get(term);

    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setStatus("ready");
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("loading");
    setActiveIndex(-1);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ q: term });
          const response = await fetch(`/api/search/suggestions?${params.toString()}`, {
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`Search suggestions failed with ${response.status}`);
          }

          const payload = (await response.json()) as SuggestionResponse;

          if (controller.signal.aborted) {
            return;
          }

          cacheRef.current.set(term, payload);

          if (cacheRef.current.size > CACHE_ENTRIES) {
            const oldest = cacheRef.current.keys().next().value;
            if (oldest !== undefined) {
              cacheRef.current.delete(oldest);
            }
          }

          setItems(payload.items);
          setTotal(payload.total);
          setStatus("ready");
        } catch {
          if (controller.signal.aborted) {
            return;
          }

          setItems([]);
          setTotal(0);
          setStatus("error");
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [panelOpen, term]);

  useEffect(() => {
    if (!panelOpen || activeIndex < 0) {
      return;
    }

    document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, id, panelOpen]);

  useEffect(() => {
    if (!panelOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!formRef.current?.contains(event.target as Node)) {
        setPanel({ open: false, path: pathname });
        setActiveIndex(-1);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [panelOpen, pathname]);

  const closePanel = () => {
    setPanel({ open: false, path: pathname });
    setActiveIndex(-1);
  };

  const openPanel = () => {
    setPanel({ open: true, path: pathname });
  };

  const choose = (index: number) => {
    const item = items[index];
    closePanel();

    if (item) {
      router.push(`/products/${encodeURIComponent(item.sku)}`);
      return;
    }

    router.push(`/shop?q=${encodeURIComponent(term)}`);
  };

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    const nextTerm = value.trim();
    setQuery(value);
    setActiveIndex(-1);
    setPanel({ open: nextTerm.length >= MIN_QUERY_CHARS, path: pathname });

    if (nextTerm !== term) {
      // Do not show the previous term's products under the new text.
      setItems([]);
      setTotal(0);
      setStatus("loading");
    }
  }

  function handleFocus() {
    if (term.length >= MIN_QUERY_CHARS) {
      openPanel();
    }
  }

  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    const next = event.relatedTarget as Node | null;

    // A null target means focus went to the browser chrome, or a browser that
    // does not focus links on click. Keep the panel open for the click; the
    // outside pointer handler still closes it.
    if (next && !formRef.current?.contains(next)) {
      closePanel();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (panelOpen) {
        event.preventDefault();
        closePanel();
      }
      return;
    }

    if (!listboxVisible) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % optionCount);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? optionCount - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0 && activeIndex < optionCount) {
      event.preventDefault();
      choose(activeIndex);
    }
  }

  function handleSubmit() {
    closePanel();
  }

  return (
    <form
      ref={formRef}
      action={`/${locale}/shop`}
      method="get"
      role="search"
      className={className}
      onBlur={handleBlur}
      onSubmit={handleSubmit}
    >
      <label htmlFor={id} className="sr-only">
        {t("search")}
      </label>
      <div className="relative">
        <MagnifyingGlass
          aria-hidden
          size={18}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-neutral-600"
        />
        <input
          id={id}
          name="q"
          type="search"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("searchPlaceholder")}
          value={query}
          aria-autocomplete="list"
          aria-expanded={panelOpen}
          aria-controls={listboxVisible ? listboxId : undefined}
          aria-activedescendant={
            listboxVisible && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          className="h-10 w-full rounded-full border border-neutral-500 bg-white pr-24 pl-10 text-small text-navy-900 transition-colors duration-150 hover:border-navy-900"
          onChange={handleChange}
          onClick={handleFocus}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className="absolute top-1 right-1 inline-flex h-8 items-center rounded-full bg-navy-900 px-3.5 text-caption font-semibold text-white transition-colors duration-150 hover:bg-navy-800"
        >
          {t("searchSubmit")}
        </button>

        {panelOpen ? (
          <div className="absolute top-full right-0 left-0 z-(--z-header) mt-2 max-h-[min(32rem,calc(100dvh-8rem))] overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-overlay xl:left-auto xl:w-[22rem]">
            {status === "error" ? (
              <p role="status" className="px-3 py-4 text-small text-neutral-600">
                {t("searchError")}
              </p>
            ) : status === "ready" && items.length === 0 ? (
              <p role="status" className="px-3 py-4 text-small text-neutral-600">
                {t("searchNoResults", { term })}
              </p>
            ) : status !== "ready" ? (
              <p
                role="status"
                className="flex items-center gap-2 px-3 py-4 text-small text-neutral-600"
              >
                <CircleNotch aria-hidden size={16} className="animate-spin" />
                {t("searchLoading")}
              </p>
            ) : (
              <ul
                id={listboxId}
                role="listbox"
                aria-label={t("searchSuggestions")}
                className="py-1"
              >
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cx(
                      "transition-colors duration-150 hover:bg-neutral-100",
                      index === activeIndex && "bg-neutral-100",
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <Link
                      href={`/products/${encodeURIComponent(item.sku)}`}
                      tabIndex={-1}
                      onClick={closePanel}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-neutral-100">
                        <ProductImage
                          src={item.imageUrl}
                          alt=""
                          fallbackLabel=""
                          fill
                          sizes="40px"
                        />
                      </div>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-small font-medium text-navy-900">
                          {item.name}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <Price amount={item.priceVnd} locale={locale} size="sm" />
                          {item.inStock ? null : (
                            <span className="text-caption text-neutral-600">
                              {productT("soldOut")}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {showSeeAll ? (
                  <li
                    id={optionId(items.length)}
                    role="option"
                    aria-selected={activeIndex === items.length}
                    className={cx(
                      "border-t border-neutral-100 transition-colors duration-150 hover:bg-neutral-100",
                      activeIndex === items.length && "bg-neutral-100",
                    )}
                    onMouseEnter={() => setActiveIndex(items.length)}
                  >
                    <Link
                      href={`/shop?q=${encodeURIComponent(term)}`}
                      tabIndex={-1}
                      onClick={closePanel}
                      className="flex items-center gap-2 px-3 py-3 text-small font-semibold text-navy-900"
                    >
                      <MagnifyingGlass
                        aria-hidden
                        size={18}
                        className="shrink-0 text-neutral-600"
                      />
                      <span className="min-w-0 flex-1">
                        {t("searchSeeAll", { count: total, term })}
                      </span>
                      <ArrowRight aria-hidden size={16} className="shrink-0 text-neutral-500" />
                    </Link>
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </form>
  );
}
