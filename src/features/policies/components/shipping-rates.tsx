import { Truck, Lightning } from "@phosphor-icons/react/ssr";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import type { StoreSettings } from "@/lib/store-settings";

/** Shipping fee table built from the current store settings. */
export async function ShippingRates({
  settings,
  locale,
}: {
  settings: StoreSettings;
  locale: Locale;
}) {
  const t = await getTranslations("policies.shipping.rates");
  const threshold = formatVnd(settings.freeStandardShippingThresholdVnd, locale);
  const expressFee = formatVnd(settings.expressShippingFeeVnd, locale);

  const rows = [
    {
      key: "standard",
      icon: <Truck aria-hidden size={22} />,
      fee: formatVnd(settings.standardShippingFeeVnd, locale),
      note: t("standardNote", { threshold }),
      highlight: true,
    },
    {
      key: "express",
      icon: <Lightning aria-hidden size={22} />,
      fee: expressFee,
      note: t("expressNote", { expressFee }),
      highlight: false,
    },
  ] as const;

  return (
    <div className="overflow-hidden rounded-md border border-neutral-200">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{t("caption")}</caption>
        <thead className="bg-neutral-50 text-small text-neutral-700">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              {t("method")}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              {t("fee")}
            </th>
            <th scope="col" className="hidden px-4 py-3 font-semibold sm:table-cell">
              {t("notes")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {rows.map((row) => (
            <tr key={row.key} className="align-top">
              <th scope="row" className="px-4 py-4 font-semibold text-navy-900">
                <span className="flex items-center gap-3">
                  {row.icon}
                  {t(row.key)}
                </span>
                <span className="mt-2 block text-small font-normal text-neutral-700 sm:hidden">
                  {row.note}
                </span>
              </th>
              <td className="px-4 py-4 text-right font-semibold whitespace-nowrap text-navy-900 tabular-nums">
                {row.fee}
              </td>
              <td className="hidden px-4 py-4 text-small text-neutral-700 sm:table-cell">
                {row.highlight ? (
                  <span className="flex flex-col items-start gap-2">
                    <Badge tone="accent">{threshold}+</Badge>
                    {row.note}
                  </span>
                ) : (
                  row.note
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
