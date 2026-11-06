import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Price } from "@/components/ui/price";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import type { OrderSummary as Order } from "@/server/orders";

export const ORDER_TIME_ZONE = "Asia/Ho_Chi_Minh";

/**
 * The order snapshot: items with the prices charged, totals, and delivery
 * details as they were when the order was placed.
 */
export async function OrderSummary({ order }: { order: Order }) {
  const t = await getTranslations("orders");
  const locale = (await getLocale()) as Locale;
  const format = await getFormatter();

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <section aria-labelledby="order-items" className="lg:col-span-7">
        <h2 id="order-items" className="text-heading-sm font-semibold text-navy-900">
          {t("items")}
        </h2>
        <ul className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 py-4">
              <div className="flex min-w-0 flex-col gap-0.5 text-small">
                {item.productId ? (
                  <Link
                    href={`/products/${encodeURIComponent(item.sku)}`}
                    className="font-semibold text-navy-900 hover:underline"
                  >
                    {item.productName}
                  </Link>
                ) : (
                  <span className="font-semibold text-navy-900">{item.productName}</span>
                )}
                <span className="text-neutral-700">
                  {t("itemLine", {
                    option: item.optionLabel,
                    quantity: item.quantity,
                    price: formatVnd(item.unitPriceVnd, locale),
                  })}
                </span>
              </div>
              <Price amount={item.lineTotalVnd} locale={locale} size="sm" />
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-2 text-small">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-700">{t("subtotal")}</dt>
            <dd>
              <Price amount={order.itemsSubtotalVnd} locale={locale} size="sm" />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-700">
              {t("shippingFee", { method: t(`shippingMethod.${order.shippingMethod}`) })}
            </dt>
            <dd className="font-semibold text-navy-900 tabular-nums">
              {order.shippingFeeVnd === 0 ? t("free") : formatVnd(order.shippingFeeVnd, locale)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-neutral-200 pt-3">
            <dt className="text-body font-semibold text-navy-900">{t("total")}</dt>
            <dd>
              <Price amount={order.totalVnd} locale={locale} size="lg" />
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="order-delivery" className="lg:col-span-4 lg:col-start-9">
        <h2 id="order-delivery" className="text-heading-sm font-semibold text-navy-900">
          {t("details")}
        </h2>
        <dl className="mt-4 flex flex-col gap-4 rounded-md border border-neutral-200 bg-neutral-50 p-5 text-small">
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-neutral-600">{t("placedAt")}</dt>
            <dd className="text-navy-900">
              {format.dateTime(new Date(order.createdAt), {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: ORDER_TIME_ZONE,
              })}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-neutral-600">{t("recipient")}</dt>
            <dd className="text-navy-900">
              {order.recipientName}
              <br />
              {order.recipientPhone}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-neutral-600">{t("address")}</dt>
            <dd className="whitespace-pre-line text-navy-900">{order.shippingAddress}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-neutral-600">{t("payment")}</dt>
            <dd className="text-navy-900">{t(`paymentMethod.${order.paymentMethod}`)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
