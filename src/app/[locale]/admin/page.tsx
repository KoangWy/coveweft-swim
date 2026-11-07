import { ArrowRight, Warning } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { AdminPageHeader } from "@/features/admin/components/page-header";
import { requireAdminPage } from "@/features/admin/components/session";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import { adminDashboard } from "@/server/admin";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@/server/commerce/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("overviewPage.title") };
}

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const format = await getFormatter();
  const result = await adminDashboard();
  const crumbs = [{ label: t("admin.overview") }];

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-6">
        <AdminPageHeader crumbs={crumbs} title={t("admin.overviewPage.title")} />
        <ErrorState
          title={t("admin.overviewPage.loadError")}
          description={t(`errors.${result.error.code}`)}
          action={
            <Link href="/admin" className={buttonClasses()}>
              {t("common.tryAgain")}
            </Link>
          }
        />
      </div>
    );
  }

  const dashboard = result.data;
  const needsAction = dashboard.ordersByStatus.pending + dashboard.ordersByStatus.confirmed;
  const lowStockCount = dashboard.lowStockVariants.length;
  const stats = [
    {
      key: "revenue",
      label: t("admin.overviewPage.revenue"),
      value: formatVnd(dashboard.revenueVnd, locale),
      hint: t("admin.overviewPage.revenueHint"),
    },
    {
      key: "orders",
      label: t("admin.overviewPage.orders"),
      value: String(dashboard.orderCount),
      hint: t("admin.overviewPage.ordersHint"),
    },
    {
      key: "action",
      label: t("admin.overviewPage.needsAction"),
      value: String(needsAction),
      hint: t("admin.overviewPage.needsActionHint"),
    },
    {
      key: "low-stock",
      label: t("admin.overviewPage.lowStock"),
      value: String(lowStockCount),
      hint: t("admin.overviewPage.lowStockHint", {
        threshold: dashboard.lowStockThreshold,
      }),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        crumbs={crumbs}
        title={t("admin.overviewPage.title")}
        description={t("admin.overviewPage.intro")}
        badge={<Badge tone="accent">{t("admin.demoData")}</Badge>}
      />
      <p className="text-small text-neutral-600">{t("admin.demoNote")}</p>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <li
            key={stat.key}
            className="flex flex-col gap-1 rounded-md border border-neutral-200 bg-white p-5"
          >
            <p className="text-small font-medium text-neutral-600">{stat.label}</p>
            <p className="text-heading font-bold text-navy-900 tabular-nums">{stat.value}</p>
            <p className="text-caption text-neutral-600">{stat.hint}</p>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-12">
        <section
          aria-labelledby="admin-orders-status"
          className="rounded-md border border-neutral-200 bg-white p-5 lg:col-span-4"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="admin-orders-status" className="text-heading-sm font-semibold text-navy-900">
              {t("admin.overviewPage.ordersByStatus")}
            </h2>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 rounded-md text-small font-semibold text-navy-900 hover:underline"
            >
              {t("admin.overviewPage.viewOrders")}
              <ArrowRight aria-hidden size={16} />
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-neutral-200">
            {ORDER_STATUSES.map((status) => (
              <li key={status}>
                <Link
                  href={`/admin/orders?status=${status}`}
                  className="flex items-center justify-between gap-3 py-3 text-small text-navy-900 hover:underline"
                >
                  <span>{t(`orders.status.${status}`)}</span>
                  <span className="font-semibold tabular-nums">
                    {dashboard.ordersByStatus[status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 text-small font-semibold text-navy-900">
            {t("admin.overviewPage.payments")}
          </h3>
          <ul className="mt-2 divide-y divide-neutral-200">
            {PAYMENT_STATUSES.map((status) => (
              <li key={status}>
                <Link
                  href={`/admin/orders?paymentStatus=${status}`}
                  className="flex items-center justify-between gap-3 py-3 text-small text-navy-900 hover:underline"
                >
                  <span>{t(`orders.paymentStatus.${status}`)}</span>
                  <span className="font-semibold tabular-nums">
                    {dashboard.ordersByPaymentStatus[status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="admin-top-products"
          className="rounded-md border border-neutral-200 bg-white p-5 lg:col-span-4"
        >
          <h2 id="admin-top-products" className="text-heading-sm font-semibold text-navy-900">
            {t("admin.overviewPage.topProducts")}
          </h2>
          <p className="mt-1 text-small text-neutral-600">
            {t("admin.overviewPage.topProductsHint")}
          </p>
          {dashboard.topProducts.length === 0 ? (
            <p className="mt-4 text-small text-neutral-700">{t("admin.overviewPage.topEmpty")}</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-4">
              {dashboard.topProducts.map((product, index) => (
                <li key={`${product.sku}-${index}`} className="flex items-start gap-3">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-caption font-semibold text-navy-900 tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-small font-semibold text-navy-900">{product.name}</p>
                    <p className="text-caption text-neutral-600">{product.sku}</p>
                    <p className="text-small text-neutral-700">
                      {t("admin.overviewPage.topProductLine", {
                        quantity: product.quantity,
                        revenue: formatVnd(product.revenueVnd, locale),
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section
          aria-labelledby="admin-low-stock"
          className="rounded-md border border-neutral-200 bg-white p-5 lg:col-span-4"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="admin-low-stock" className="text-heading-sm font-semibold text-navy-900">
              {t("admin.overviewPage.lowStockTitle")}
            </h2>
            <Warning aria-hidden size={20} className="shrink-0 text-warning-700" />
          </div>
          {dashboard.lowStockVariants.length === 0 ? (
            <p className="mt-4 text-small text-neutral-700">
              {t("admin.overviewPage.lowStockEmpty")}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-neutral-200">
              {dashboard.lowStockVariants.map((variant) => (
                <li key={variant.variantId} className="flex flex-col gap-1 py-3">
                  <Link
                    href={`/admin/products?q=${encodeURIComponent(variant.productSku)}`}
                    className="text-small font-semibold text-navy-900 hover:underline"
                  >
                    {variant.productName}
                  </Link>
                  <span className="text-caption text-neutral-600">
                    {variant.optionLabel} · {variant.variantSku}
                  </span>
                  <span className="text-small text-warning-700 tabular-nums">
                    {t("admin.overviewPage.lowStockValue", { count: variant.stock })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/products?stock=low"
            className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-4" })}
          >
            {t("admin.overviewPage.viewStock")}
          </Link>
        </section>
      </div>

      <p className="text-caption text-neutral-600">
        {t("admin.overviewPage.generatedAt", {
          time: format.dateTime(new Date(), {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Ho_Chi_Minh",
          }),
        })}
      </p>
    </div>
  );
}
