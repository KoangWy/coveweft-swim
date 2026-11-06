import { useTranslations } from "next-intl";

import type { ProductAttribute } from "@/server/catalog";

/** Attributes shown in the specification list, in display order. */
const SPEC_KEYS = [
  "product_type",
  "category",
  "material",
  "fabric_desc",
  "fit",
  "sleeve",
  "neckline",
  "length",
  "closure",
  "lining",
  "pattern",
  "color",
  "color_family",
  "collection",
  "season",
  "brand",
] as const;

/**
 * Translated product attributes as label and value pairs, followed by the
 * feature list. Accessories rely on this list instead of a size table.
 */
export function ProductSpecs({ attributes }: { attributes: ProductAttribute[] }) {
  const t = useTranslations("product");
  const byKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));
  const specs = SPEC_KEYS.flatMap((key) => {
    const attribute = byKey.get(key);
    return attribute ? [{ key, label: t(`attributes.${key}`), value: attribute.valueLabel }] : [];
  });
  const features = attributes.filter((attribute) => attribute.key === "features");

  return (
    <section aria-labelledby="specs-heading" className="flex flex-col gap-4">
      <h2 id="specs-heading" className="text-heading font-semibold text-navy-900">
        {t("specsTitle")}
      </h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {specs.map((spec) => (
          <div key={spec.key} className="flex flex-col gap-0.5">
            <dt className="text-caption text-neutral-600">{spec.label}</dt>
            <dd className="text-small font-medium text-navy-900">{spec.value}</dd>
          </div>
        ))}
      </dl>
      {features.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-small font-semibold text-navy-900">{t("attributes.features")}</h3>
          <ul className="flex flex-wrap gap-2">
            {features.map((feature) => (
              <li
                key={feature.value}
                className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-small text-navy-900"
              >
                {feature.valueLabel}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
