import { Info } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";

import type { SizeGuide } from "@/server/catalog";

/**
 * Demo Size Guide for a garment: one row per size with the measurement ranges.
 * The ranges are constructed demo data, which the notice states plainly.
 */
export function SizeGuideTable({ guide }: { guide: SizeGuide }) {
  const t = useTranslations("product.sizeGuide");

  function unit(measurement: string) {
    return measurement === "age_months" ? t("units.months") : t("units.cm");
  }

  return (
    <section id="size-guide" aria-labelledby="size-guide-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="size-guide-heading" className="text-heading font-semibold text-navy-900">
          {t("title")}
        </h2>
        <p className="text-small text-neutral-700">
          {t("subtitle", {
            group: t(`groups.${guide.group}`),
            garment: t(`garments.${guide.garment}`),
          })}
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <table className="w-full min-w-[22rem] text-left text-small">
          <caption className="sr-only">{t("caption")}</caption>
          <thead className="bg-neutral-50 text-navy-900">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t("size")}
              </th>
              {guide.measurements.map((measurement) => (
                <th key={measurement} scope="col" className="px-4 py-3 font-semibold">
                  {t(`measurements.${measurement}`)}{" "}
                  <span className="font-normal text-neutral-600">({unit(measurement)})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guide.rows.map((row) => (
              <tr key={row.sizeGuideKey} className="border-t border-neutral-200">
                <th scope="row" className="px-4 py-3 font-semibold text-navy-900">
                  {row.label}
                </th>
                {guide.measurements.map((measurement) => {
                  const range = row.ranges[measurement];
                  return (
                    <td key={measurement} className="px-4 py-3 text-navy-900">
                      {range ? t("range", { from: range[0], to: range[1] }) : t("notAvailable")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-start gap-2 text-small text-neutral-700">
        <Info aria-hidden size={18} className="mt-px shrink-0 text-navy-900" />
        {t("notice")}
      </p>
    </section>
  );
}
