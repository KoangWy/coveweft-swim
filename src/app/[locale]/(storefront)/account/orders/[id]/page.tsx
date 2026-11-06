import { Bank } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";
import { requireUser } from "@/features/account/components/session";
import { CancelOrderButton } from "@/features/orders/components/cancel-order-button";
import { loadOrderOr404, orderReference } from "@/features/orders/components/load-order";
import { OrderBadges } from "@/features/orders/components/order-badges";
import { ORDER_TIME_ZONE, OrderSummary } from "@/features/orders/components/order-summary";
import { Link } from "@/i18n/navigation";

type Props = PageProps<"/[locale]/account/orders/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  await requireUser(`/account/orders/${id}`);
  const order = await loadOrderOr404(id);
  const t = await getTranslations("orders");
  return { title: t("reference", { reference: orderReference(order.id) }) };
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  await requireUser(`/account/orders/${id}`);
  const order = await loadOrderOr404(id);
  const t = await getTranslations();
  const format = await getFormatter();
  const reference = orderReference(order.id);
  const awaitingTransfer =
    order.paymentMethod === "bank_transfer" &&
    order.status === "pending" &&
    order.paymentStatus === "unpaid";
  const events = [...order.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <Container className="py-8 lg:py-10">
      <Breadcrumb
        items={[
          { label: t("account.title"), href: "/account" },
          { label: t("orders.title"), href: "/account/orders" },
          { label: t("orders.reference", { reference }) },
        ]}
      />
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-title font-bold text-navy-900">
            {t("orders.reference", { reference })}
          </h1>
          <OrderBadges status={order.status} paymentStatus={order.paymentStatus} />
        </div>
        <div className="flex flex-wrap gap-3">
          {awaitingTransfer ? (
            <Link href={`/account/orders/${order.id}/pay`} className={buttonClasses()}>
              <Bank aria-hidden size={18} />
              {t("orders.pay")}
            </Link>
          ) : null}
          {order.status === "pending" ? (
            <CancelOrderButton orderId={order.id} reference={reference} />
          ) : null}
        </div>
      </div>

      {awaitingTransfer && order.paymentDueAt ? (
        <p className="mt-4 text-small text-warning-700">
          {t("orders.payBy", {
            time: format.dateTime(new Date(order.paymentDueAt), {
              timeStyle: "short",
              dateStyle: "medium",
              timeZone: ORDER_TIME_ZONE,
            }),
          })}
        </p>
      ) : null}

      <div className="mt-10">
        <OrderSummary order={order} />
      </div>

      {events.length > 0 ? (
        <section aria-labelledby="order-history" className="mt-12 max-w-2xl">
          <h2 id="order-history" className="text-heading-sm font-semibold text-navy-900">
            {t("orders.history")}
          </h2>
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
                  {t(`orders.actors.${event.actorRole}`)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="mt-10">
        <Link href="/account/orders" className={buttonClasses({ variant: "secondary" })}>
          {t("orders.backToList")}
        </Link>
      </div>
    </Container>
  );
}
