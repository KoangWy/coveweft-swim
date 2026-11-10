"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";
import { controlBorder, controlClasses } from "@/components/ui/field";
import { Link, useRouter } from "@/i18n/navigation";
import type { ProductFacets, ProductFacetValue } from "@/server/catalog";

import type { ShopQuery } from "./shop-query";

export type ShopFiltersProps = {
  facets: ProductFacets;
  query: ShopQuery;
  /** Prefix for element ids, so the sidebar and the drawer can both render. */
  idPrefix: string;
  /** Called after a filter change is applied, for example to close a drawer. */
  onApplied?: () => void;
  className?: string;
};

type SingleFacet = "category" | "gender" | "type" | "size" | "material";

function FacetGroup({
  title,
  open,
  children,
}: {
  title: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group border-b border-neutral-200 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md py-1 text-small font-semibold text-navy-900 [&::-webkit-details-marker]:hidden">
        {title}
        <CaretDown
          aria-hidden
          size={16}
          className="transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

function withSelected(values: ProductFacetValue[], selected: string | undefined) {
  if (!selected || values.some((value) => value.value === selected)) {
    return values;
  }
  return [{ value: selected, label: selected, count: 0 }, ...values];
}

const optionRow =
  "flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-small text-navy-900 hover:bg-neutral-100";
const boxClasses = "size-4 shrink-0 cursor-pointer accent-navy-900";

/**
 * Filter panel for the shop listing. It is a plain GET form, so it works
 * without JavaScript; with JavaScript, choosing an option updates the URL
 * right away.
 */
export function ShopFilters({ facets, query, idPrefix, onApplied, className }: ShopFiltersProps) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const { category, gender, type, size, material, priceMin, priceMax, inStock } = query;
  const featureKey = query.features.join("\n");

  // The inputs are uncontrolled, so they keep focus and typed text while the
  // listing reloads. When the URL changes, for example on Back, copy its
  // filters into the same inputs instead of remounting the form.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const single: Record<string, string | undefined> = { category, gender, type, size, material };
    const features = featureKey ? featureKey.split("\n") : [];
    const prices: Record<string, number | undefined> = { min: priceMin, max: priceMax };
    for (const element of form.elements) {
      if (!(element instanceof HTMLInputElement)) continue;
      if (element.type === "radio" && element.name in single) {
        element.checked = element.value === (single[element.name] ?? "");
      } else if (element.name === "inStock") {
        element.checked = inStock;
      } else if (element.name === "feature") {
        element.checked = features.includes(element.value);
      } else if (element.name in prices && element !== document.activeElement) {
        element.value = prices[element.name]?.toString() ?? "";
      }
    }
  }, [category, gender, type, size, material, priceMin, priceMax, inStock, featureKey]);

  function apply(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string" && value.trim() !== "") {
        params.append(key, value.trim());
      }
    }
    const search = params.toString();
    startTransition(() => {
      router.push(search ? `/shop?${search}` : "/shop", { scroll: false });
    });
    onApplied?.();
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (target.type === "radio" || target.type === "checkbox") {
      apply(event.currentTarget);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(event.currentTarget);
  }

  function genderLabel(value: ProductFacetValue) {
    return t.has(`genders.${value.value}`) ? t(`genders.${value.value}`) : value.label;
  }

  function single(
    name: SingleFacet,
    values: ProductFacetValue[],
    selected: string | undefined,
    label: (value: ProductFacetValue) => string = (value) => value.label,
  ) {
    const options = withSelected(values, selected);
    return (
      <fieldset>
        <legend className="sr-only">{t(`filters.${name}`)}</legend>
        <div className="flex max-h-64 flex-col overflow-y-auto">
          <label className={optionRow}>
            <input
              type="radio"
              name={name}
              value=""
              defaultChecked={!selected}
              className={boxClasses}
            />
            {t("filters.all")}
          </label>
          {options.map((value) => (
            <label key={value.value} className={optionRow}>
              <input
                type="radio"
                name={name}
                value={value.value}
                defaultChecked={selected === value.value}
                className={boxClasses}
              />
              <span className="flex-1">{label(value)}</span>
              <span className="text-caption text-neutral-600">{value.count}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <form
      ref={formRef}
      method="get"
      action={`/${locale}/shop`}
      onChange={onChange}
      onSubmit={onSubmit}
      aria-label={t("filters.title")}
      aria-busy={pending}
      className={className}
    >
      {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
      {query.group ? <input type="hidden" name="group" value={query.group} /> : null}
      {query.sort !== "newest" ? <input type="hidden" name="sort" value={query.sort} /> : null}

      <div className="border-b border-neutral-200 py-3">
        <label className={optionRow}>
          <input
            type="checkbox"
            name="inStock"
            value="1"
            defaultChecked={query.inStock}
            className={boxClasses}
          />
          {t("filters.inStock")}
        </label>
      </div>

      <FacetGroup title={t("filters.category")} open>
        {single("category", facets.categories, query.category)}
      </FacetGroup>
      <FacetGroup title={t("filters.gender")} open={Boolean(query.gender)}>
        {single("gender", facets.genders, query.gender, genderLabel)}
      </FacetGroup>
      <FacetGroup title={t("filters.type")} open={Boolean(query.type)}>
        {single("type", facets.productTypes, query.type)}
      </FacetGroup>
      <FacetGroup title={t("filters.size")} open>
        {single("size", facets.sizes, query.size)}
      </FacetGroup>
      <FacetGroup title={t("filters.price")} open>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t("filters.price")}</legend>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-min`} className="text-caption text-navy-900">
                {t("filters.priceMin")}
              </label>
              <input
                id={`${idPrefix}-min`}
                name="min"
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                defaultValue={query.priceMin}
                placeholder={String(facets.price.minVnd)}
                className={`${controlClasses} ${controlBorder(false)} h-10 text-small`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-max`} className="text-caption text-navy-900">
                {t("filters.priceMax")}
              </label>
              <input
                id={`${idPrefix}-max`}
                name="max"
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                defaultValue={query.priceMax}
                placeholder={String(facets.price.maxVnd)}
                className={`${controlClasses} ${controlBorder(false)} h-10 text-small`}
              />
            </div>
          </div>
          <p className="text-caption text-neutral-600">{t("filters.priceHint")}</p>
        </fieldset>
      </FacetGroup>
      <FacetGroup title={t("filters.material")} open={Boolean(query.material)}>
        {single("material", facets.materials, query.material)}
      </FacetGroup>
      <FacetGroup title={t("filters.features")} open={query.features.length > 0}>
        <fieldset>
          <legend className="sr-only">{t("filters.features")}</legend>
          <div className="flex max-h-64 flex-col overflow-y-auto">
            {[
              ...facets.features,
              ...query.features
                .filter((value) => !facets.features.some((facet) => facet.value === value))
                .map((value) => ({ value, label: value, count: 0 })),
            ].map((value) => (
              <label key={value.value} className={optionRow}>
                <input
                  type="checkbox"
                  name="feature"
                  value={value.value}
                  defaultChecked={query.features.includes(value.value)}
                  className={boxClasses}
                />
                <span className="flex-1">{value.label}</span>
                <span className="text-caption text-neutral-600">{value.count}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </FacetGroup>

      <div className="flex flex-wrap gap-2 pt-4">
        <button type="submit" className={buttonClasses({ size: "sm" })}>
          {t("filters.apply")}
        </button>
        <Link
          href={query.q ? `/shop?q=${encodeURIComponent(query.q)}` : "/shop"}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
          onClick={onApplied}
        >
          {t("filters.clear")}
        </Link>
      </div>
      <p aria-live="polite" className="sr-only">
        {pending ? t("filters.updating") : ""}
      </p>
    </form>
  );
}
