"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";

import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";

export function priceCeiling(maxVnd: number) {
  return Math.max(100_000, Math.ceil(maxVnd / 100_000) * 100_000);
}

/** Native range inputs retain keyboard and touch support; values commit on release. */
export function PriceRange({
  idPrefix,
  maxVnd,
  min,
  max,
  onCommit,
}: {
  idPrefix: string;
  maxVnd: number;
  min?: number;
  max?: number;
  onCommit: () => void;
}) {
  const t = useTranslations("catalog.filters");
  const locale = useLocale() as Locale;
  const ceiling = priceCeiling(maxVnd);
  const initialMin = Math.min(min ?? 0, ceiling);
  const initialMax = Math.max(initialMin, Math.min(max ?? ceiling, ceiling));
  const root = useRef<HTMLFieldSetElement>(null);

  const update = useCallback(
    (changed?: HTMLInputElement) => {
      const element = root.current;
      if (!element) return;
      const lower = element.querySelector<HTMLInputElement>("[data-lower]")!;
      const upper = element.querySelector<HTMLInputElement>("[data-upper]")!;
      if (changed === lower)
        lower.value = String(Math.min(Number(lower.value), Number(upper.value)));
      else if (changed === upper)
        upper.value = String(Math.max(Number(lower.value), Number(upper.value)));
      const low = Number(lower.value);
      const high = Number(upper.value);
      // Local stacking only: keep the minimum thumb reachable at the upper endpoint.
      lower.style.zIndex = low === ceiling ? "1" : "auto";
      lower.setAttribute("aria-valuemax", String(high));
      upper.setAttribute("aria-valuemin", String(low));
      element.style.setProperty("--range-start", `${(low / ceiling) * 100}%`);
      element.style.setProperty("--range-end", `${(high / ceiling) * 100}%`);
      lower.setAttribute("aria-valuetext", formatVnd(low, locale));
      upper.setAttribute("aria-valuetext", formatVnd(high, locale));
      element.querySelector<HTMLOutputElement>("[data-low-label]")!.value = formatVnd(low, locale);
      element.querySelector<HTMLOutputElement>("[data-high-label]")!.value = formatVnd(
        high,
        locale,
      );
    },
    [ceiling, locale],
  );

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    element.querySelector<HTMLInputElement>("[data-lower]")!.value = String(initialMin);
    element.querySelector<HTMLInputElement>("[data-upper]")!.value = String(initialMax);
    update();
  }, [initialMin, initialMax, update]);

  function keyCommit(event: KeyboardEvent<HTMLInputElement>) {
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ].includes(event.key)
    )
      onCommit();
  }

  return (
    <fieldset
      ref={root}
      className="price-range isolate py-2"
      style={
        {
          "--range-start": `${(initialMin / ceiling) * 100}%`,
          "--range-end": `${(initialMax / ceiling) * 100}%`,
        } as CSSProperties
      }
    >
      <legend className="sr-only">{t("price")}</legend>
      <div className="mb-3 grid grid-cols-2 gap-2 text-caption">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-min`} className="text-neutral-600">
            {t("priceMin")}
          </label>
          <output
            data-low-label
            htmlFor={`${idPrefix}-min`}
            className="font-semibold text-navy-900"
          >
            {formatVnd(initialMin, locale)}
          </output>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label htmlFor={`${idPrefix}-max`} className="text-neutral-600">
            {t("priceMax")}
          </label>
          <output
            data-high-label
            htmlFor={`${idPrefix}-max`}
            className="font-semibold text-navy-900"
          >
            {formatVnd(initialMax, locale)}
          </output>
        </div>
      </div>
      <div className="relative mx-3 h-11">
        <div aria-hidden className="absolute inset-x-0 top-5 h-1 rounded-full bg-neutral-300" />
        <div
          aria-hidden
          className="absolute top-5 h-1 rounded-full bg-navy-900"
          style={{ left: "var(--range-start)", right: "calc(100% - var(--range-end))" }}
        />
        <input
          id={`${idPrefix}-min`}
          data-lower
          name="min"
          type="range"
          min={0}
          max={ceiling}
          step={1000}
          defaultValue={initialMin}
          aria-valuetext={formatVnd(initialMin, locale)}
          aria-describedby={`${idPrefix}-price-hint`}
          onInput={(event) => update(event.currentTarget)}
          onPointerUp={onCommit}
          onKeyUp={keyCommit}
        />
        <input
          id={`${idPrefix}-max`}
          data-upper
          name="max"
          type="range"
          min={0}
          max={ceiling}
          step={1000}
          defaultValue={initialMax}
          aria-valuetext={formatVnd(initialMax, locale)}
          aria-describedby={`${idPrefix}-price-hint`}
          onInput={(event) => update(event.currentTarget)}
          onPointerUp={onCommit}
          onKeyUp={keyCommit}
        />
      </div>
      <p id={`${idPrefix}-price-hint`} className="mt-2 text-caption text-neutral-600">
        {t("priceHint")}
      </p>
    </fieldset>
  );
}
