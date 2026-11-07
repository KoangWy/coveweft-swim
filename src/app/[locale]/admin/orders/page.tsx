import { CaretRight } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  adminOrderHref,
  hasActiveOrderFilters,
  parseAdminOrderQuery,
  toAdminListOrdersInput,
} from "@/features/admin/components/admin-query";
import { AdminPageHeader } from "@/features/admin/components/page-header";
import { requireAdminPage } from "@/features/admin/components/session";
import { orderReference } from "@/features/orders/components/load-order";
import { OrderBadges } from "@/features/orders/components/order-badges";
import { ORDER_TIME_ZONE } from "@/features/orders/components/order-summary";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { adminListOrders } from "@/server/admin";
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from "@/server/commerce/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("ordersPage.title") };
}

export default async function AdminOrdersPage({
  searchParams,
}: PageProps<"/[locale]/admin/orders">) {
  await requireAdminPage();
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const format = await getFormatter();
  const query = parseAdminOrderQuery(await searchParams);
  const result = await adminListOrders(toAdminListOrdersInput(query));
  const crumbs = [{ label: t("admin.orders") }];

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-6">
        <AdminPageHeader crumbs={crumbs} title={t("admin.ordersPage.title")} />
        <ErrorState
          title={t("admin.ordersPage.loadError")}
          description={t(`errors.${result.error.code}`)}
          action={
            <Link href="/admin/orders" className={buttonClasses()}>
              {t("common.tryAgain")}
            </Link>
          }
        />
      </div>
    );
  }

  const list = result.data;
  const filtersActive = hasActiveOrderFilters(query);
  const statusOptions = [
    { value: "", label: t("admin.ordersPage.all") },
    ...ORDER_STATUSES.map((status) => ({
      value: status,
      label: t(`orders.status.${status}`),
    })),
  ];
  const paymentStatusOptions = [
    { value: "", label: t("admin.ordersPage.all") },
    ...PAYMENT_STATUSES.map((status) => ({
      value: status,
      label: t(`orders.paymentStatus.${status}`),
    })),
  ];
  const paymentMethodOptions = [
    { value: "", label: t("admin.ordersPage.all") },
    ...PAYMENT_METHODS.map((method) => ({
      value: method,
      label: t(`orders.paymentMethod.${method}`),
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        crumbs={crumbs}
        title={t("admin.ordersPage.title")}
        description={t("admin.ordersPage.intro")}
      />

      <form
        method="get"
        action={`/${locale}/admin/orders`}
        aria-label={t("admin.ordersPage.filters")}
        className="grid gap-4 rounded-md border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        <Input
          name="q"
          label={t("admin.ordersPage.search")}
          placeholder={t("admin.ordersPage.searchPlaceholder")}
          defaultValue={query.q}
          containerClassName="lg:col-span-2"
        />
        <Select
          name="status"
          label={t("admin.ordersPage.orderStatus")}
          options={statusOptions}
          defaultValue={query.status ?? ""}
        />
        <Select
          name="paymentStatus"
          label={t("admin.ordersPage.paymentStatus")}
          options={paymentStatusOptions}
          defaultValue={query.paymentStatus ?? ""}
        />
        <Select
          name="paymentMethod"
          label={t("admin.ordersPage.paymentMethod")}
          options={paymentMethodOptions}
          defaultValue={query.paymentMethod ?? ""}
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          <button type="submit" className={buttonClasses({ size: "sm" })}>
            {t("admin.ordersPage.apply")}
          </button>
          {filtersActive ? (
            <Link href="/admin/orders" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              {t("admin.ordersPage.clear")}
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-small text-neutral-600" aria-live="polite">
        {t("admin.ordersPage.resultCount", { count: list.total })}
      </p>

      {list.items.length === 0 ? (
        <EmptyState
          title={t("admin.ordersPage.emptyTitle")}
          description={t("admin.ordersPage.emptyBody")}
          action={
            filtersActive ? (
              <Link href="/admin/orders" className={buttonClasses()}>
                {t("admin.ordersPage.clear")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[62rem] border-collapse text-left text-small">
              <caption className="sr-only">{t("admin.ordersPage.title")}</caption>
              <thead>
                <tr className="border-b border-neutral-300 text-caption text-neutral-600">
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    {t("admin.ordersPage.colReference")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("admin.ordersPage.colPlaced")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("admin.ordersPage.colCustomer")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("admin.ordersPage.colItems")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t("admin.ordersPage.colTotal")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("admin.ordersPage.colStatus")}
                  </th>
                  <th scope="col" className="py-3 pl-4 text-right font-semibold">
                    {t("admin.ordersPage.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {list.items.map((order) => (
                  <tr key={order.id}>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-semibold text-navy-900 hover:underline"
                      >
                        {orderReference(order.id)}
                      </Link>
                      <span className="block text-caption text-neutral-600">
                        {t(`orders.paymentMethod.${order.paymentMethod}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {format.dateTime(new Date(order.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: ORDER_TIME_ZONE,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-navy-900">{order.recipientName}</span>
                      <span className="block text-caption text-neutral-600">
                        {order.recipientPhone}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700 tabular-nums">
                      {t("admin.ordersPage.itemCount", { count: order.itemCount })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Price amount={order.totalVnd} locale={locale} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <OrderBadges status={order.status} paymentStatus={order.paymentStatus} />
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className={buttonClasses({ variant: "secondary", size: "sm" })}
                      >
                        {t("admin.ordersPage.view")}
                        <CaretRight aria-hidden size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {list.items.map((order) => (
              <li
                key={order.id}
                className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <h2 className="text-body font-semibold text-navy-900">
                      {t("admin.ordersPage.reference", {
                        reference: orderReference(order.id),
                      })}
                    </h2>
                    <p className="text-caption text-neutral-600">
                      {format.dateTime(new Date(order.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: ORDER_TIME_ZONE,
                      })}
                    </p>
                  </div>
                  <Price amount={order.totalVnd} locale={locale} size="sm" />
                </div>
                <div className="flex flex-col gap-0.5 text-small">
                  <span className="text-navy-900">{order.recipientName}</span>
                  <span className="text-neutral-700">{order.recipientPhone}</span>
                  <span className="text-neutral-700">
                    {t("admin.ordersPage.itemCount", { count: order.itemCount })},{" "}
                    {t(`orders.paymentMethod.${order.paymentMethod}`)}
                  </span>
                </div>
                <OrderBadges status={order.status} paymentStatus={order.paymentStatus} />
                <div>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    {t("admin.ordersPage.view")}
                    <CaretRight aria-hidden size={16} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <Pagination
            page={list.page}
            pageCount={list.pageCount}
            hrefForPage={(page) => adminOrderHref(query, { page })}
            linkComponent={Link}
            labels={{
              nav: t("pagination.nav"),
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              page: (page) => t("pagination.page", { page }),
            }}
          />
        </>
      )}
    </div>
  );
}
