import { CaretRight } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { buttonClasses } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Price } from "@/components/ui/price";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { AccountShell } from "@/features/account/components/account-shell";
import { requireUser } from "@/features/account/components/session";
import { orderReference } from "@/features/orders/components/load-order";
import { OrderBadges } from "@/features/orders/components/order-badges";
import { ORDER_TIME_ZONE } from "@/features/orders/components/order-summary";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { listMyOrders } from "@/server/orders";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders");
  return { title: t("title") };
}

export default async function OrdersPage({ searchParams }: PageProps<"/[locale]/account/orders">) {
  await requireUser("/account/orders");
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const format = await getFormatter();
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(String(rawPage ?? "1"), 10) || 1));
  const result = await listMyOrders({ page, pageSize: 10 });
  const crumbs = [{ label: t("account.title"), href: "/account" }, { label: t("orders.title") }];

  return (
    <AccountShell title={t("orders.title")} crumbs={crumbs}>
      {!result.ok ? (
        <ErrorState
          title={t("orders.loadError")}
          description={t(`errors.${result.error.code}`)}
          action={
            <Link href="/account/orders" className={buttonClasses()}>
              {t("common.tryAgain")}
            </Link>
          }
        />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          title={t("orders.emptyTitle")}
          description={t("orders.emptyBody")}
          action={
            <Link href="/shop" className={buttonClasses()}>
              {t("cart.browse")}
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="flex flex-col gap-3">
            {result.data.items.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/account/orders/${order.id}`}
                  className="group grid gap-3 rounded-md border border-neutral-200 bg-white p-4 transition-colors duration-150 hover:border-navy-900 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:p-5"
                >
                  <span className="flex flex-col gap-2">
                    <span className="text-body font-semibold text-navy-900">
                      {t("orders.reference", { reference: orderReference(order.id) })}
                    </span>
                    <span className="text-small text-neutral-700">
                      {format.dateTime(new Date(order.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: ORDER_TIME_ZONE,
                      })}
                      {", "}
                      {t("orders.itemCount", { count: order.itemCount })}
                    </span>
                    <OrderBadges status={order.status} paymentStatus={order.paymentStatus} />
                  </span>
                  <Price amount={order.totalVnd} locale={locale} />
                  <CaretRight
                    aria-hidden
                    size={20}
                    className="hidden text-navy-900 transition-transform duration-150 group-hover:translate-x-0.5 sm:block"
                  />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={result.data.page}
            pageCount={result.data.pageCount}
            hrefForPage={(target) => `/account/orders?page=${target}`}
            linkComponent={Link}
            labels={{
              nav: t("pagination.nav"),
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              page: (target) => t("pagination.page", { page: target }),
            }}
          />
        </div>
      )}
    </AccountShell>
  );
}
