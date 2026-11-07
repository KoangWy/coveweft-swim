import { CreditCard } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { AdminOrderActions } from "@/features/admin/components/order-actions-panel";
import { AdminPageHeader } from "@/features/admin/components/page-header";
import { loadAdminOrderOr404 } from "@/features/admin/components/load-admin";
import { requireAdminPage } from "@/features/admin/components/session";
import {
  availableOrderActions,
  isWaitingForTransfer,
} from "@/features/admin/components/order-actions";
import { orderReference } from "@/features/orders/components/load-order";
import { OrderBadges } from "@/features/orders/components/order-badges";
import { ORDER_TIME_ZONE, OrderSummary } from "@/features/orders/components/order-summary";
import { Link } from "@/i18n/navigation";

type Props = PageProps<"/[locale]/admin/orders/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdminPage();
  const { id } = await params;
  const order = await loadAdminOrderOr404(id);
  const t = await getTranslations("admin");
  return { title: t("ordersPage.reference", { reference: orderReference(order.id) }) };
}

export default async function AdminOrderDetailPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;
  const order = await loadAdminOrderOr404(id);
  const t = await getTranslations();
  const format = await getFormatter();
  const reference = orderReference(order.id);
  const actions = availableOrderActions(order);
  const waitingForTransfer = isWaitingForTransfer(order);
  const events = [...order.events].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
  const attempts = [...order.paymentAttempts].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
  const crumbs = [
    { label: t("admin.orders"), href: "/admin/orders" },
    { label: t("admin.ordersPage.reference", { reference }) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        crumbs={crumbs}
        title={t("admin.ordersPage.reference", { reference })}
        description={t("admin.orderPage.intro")}
        badge={<OrderBadges status={order.status} paymentStatus={order.paymentStatus} />}
        actions={
          <AdminOrderActions
            orderId={order.id}
            reference={reference}
            actions={actions}
            waitingForTransfer={waitingForTransfer}
          />
        }
      />

      <OrderSummary order={order} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="admin-order-customer"
          className="rounded-md border border-neutral-200 bg-white p-5"
        >
          <h2 id="admin-order-customer" className="text-heading-sm font-semibold text-navy-900">
            {t("admin.orderPage.customer")}
          </h2>
          {order.customer ? (
            <dl className="mt-4 flex flex-col gap-3 text-small">
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-neutral-600">
                  {t("admin.orderPage.customerName")}
                </dt>
                <dd className="text-navy-900">
                  {order.customer.fullName ?? t("admin.orderPage.notSet")}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-neutral-600">
                  {t("admin.orderPage.customerPhone")}
                </dt>
                <dd className="text-navy-900">
                  {order.customer.phone ?? t("admin.orderPage.notSet")}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-neutral-600">
                  {t("admin.orderPage.customerAddress")}
                </dt>
                <dd className="whitespace-pre-line text-navy-900">
                  {order.customer.defaultAddress ?? t("admin.orderPage.notSet")}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-small text-neutral-700">{t("admin.orderPage.guest")}</p>
          )}
        </section>

        <section
          aria-labelledby="admin-order-payment"
          className="rounded-md border border-neutral-200 bg-white p-5"
        >
          <div className="flex items-center gap-2">
            <CreditCard aria-hidden size={20} className="text-navy-900" />
            <h2 id="admin-order-payment" className="text-heading-sm font-semibold text-navy-900">
              {t("admin.orderPage.payment")}
            </h2>
          </div>
          <dl className="mt-4 flex flex-col gap-3 text-small">
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-neutral-600">
                {t("admin.ordersPage.paymentMethod")}
              </dt>
              <dd className="text-navy-900">{t(`orders.paymentMethod.${order.paymentMethod}`)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-neutral-600">{t("admin.orderPage.paymentDue")}</dt>
              <dd className="text-navy-900">
                {order.paymentDueAt
                  ? format.dateTime(new Date(order.paymentDueAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: ORDER_TIME_ZONE,
                    })
                  : t("admin.orderPage.noPaymentDue")}
              </dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className="text-caption text-neutral-600">{t("admin.orderPage.attempts")}</dt>
              {attempts.length === 0 ? (
                <dd className="text-neutral-700">{t("admin.orderPage.noAttempts")}</dd>
              ) : (
                <dd>
                  <ul className="flex flex-col gap-2">
                    {attempts.map((attempt) => (
                      <li key={attempt.id} className="flex flex-wrap items-center gap-2">
                        <Badge tone={attempt.outcome === "succeeded" ? "success" : "error"}>
                          {attempt.outcome === "succeeded"
                            ? t("admin.orderPage.attemptSucceeded")
                            : t("admin.orderPage.attemptFailed")}
                        </Badge>
                        <span className="text-neutral-700">
                          {format.dateTime(new Date(attempt.createdAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: ORDER_TIME_ZONE,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              )}
            </div>
          </dl>
        </section>
      </div>

      <section aria-labelledby="admin-order-history" className="max-w-2xl">
        <h2 id="admin-order-history" className="text-heading-sm font-semibold text-navy-900">
          {t("admin.orderPage.history")}
        </h2>
        {events.length === 0 ? (
          <p className="mt-3 text-small text-neutral-700">{t("admin.orderPage.noHistory")}</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-4 border-l-2 border-neutral-200 pl-5">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col gap-0.5 text-small">
                <span className="font-semibold text-navy-900">
                  {t("orders.eventLine", {
                    status: t(`orders.status.${event.toStatus}`),
                    payment: t(`orders.paymentStatus.${event.toPaymentStatus}`),
                  })}
                </span>
                <span className="text-neutral-700">
                  {format.dateTime(new Date(event.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: ORDER_TIME_ZONE,
                  })}
                  {", "}
                  {t(`admin.orderPage.actors.${event.actorRole}`)}
                </span>
                {event.reason ? (
                  <span className="text-caption text-neutral-600">{event.reason}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div>
        <Link href="/admin/orders" className={buttonClasses({ variant: "secondary" })}>
          {t("admin.orderPage.backToList")}
        </Link>
      </div>
    </div>
  );
}
