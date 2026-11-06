import { CheckCircle } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";
import { requireUser } from "@/features/account/components/session";
import { loadOrderOr404, orderReference } from "@/features/orders/components/load-order";
import { OrderBadges } from "@/features/orders/components/order-badges";
import { OrderSummary } from "@/features/orders/components/order-summary";
import { Link } from "@/i18n/navigation";

type Props = PageProps<"/[locale]/checkout/confirmation/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  await requireUser(`/checkout/confirmation/${id}`);
  await loadOrderOr404(id);
  const t = await getTranslations("confirmation");
  return { title: t("title") };
}

export default async function ConfirmationPage({ params }: Props) {
  const { id } = await params;
  await requireUser(`/checkout/confirmation/${id}`);
  const order = await loadOrderOr404(id);
  const t = await getTranslations();
  const reference = orderReference(order.id);
  const awaitingTransfer =
    order.paymentMethod === "bank_transfer" &&
    order.status === "pending" &&
    order.paymentStatus === "unpaid";

  return (
    <Container className="py-8 lg:py-12">
      <div className="flex max-w-3xl flex-col gap-4">
        <span className="inline-flex size-12 items-center justify-center rounded-md bg-lime-400 text-navy-950">
          <CheckCircle aria-hidden size={28} weight="bold" />
        </span>
        <h1 className="text-title font-bold text-navy-900">{t("confirmation.title")}</h1>
        <p className="text-lead text-neutral-700">
          {t(order.paymentStatus === "paid" ? "confirmation.paidBody" : "confirmation.codBody", {
            reference,
          })}
        </p>
        <OrderBadges status={order.status} paymentStatus={order.paymentStatus} />
        <p className="text-small text-neutral-700">{t("confirmation.demoNote")}</p>
        <div className="flex flex-wrap gap-3 pt-2">
          {awaitingTransfer ? (
            <Link href={`/account/orders/${order.id}/pay`} className={buttonClasses()}>
              {t("orders.pay")}
            </Link>
          ) : null}
          <Link
            href={`/account/orders/${order.id}`}
            className={buttonClasses({ variant: awaitingTransfer ? "secondary" : "primary" })}
          >
            {t("confirmation.viewOrder")}
          </Link>
          <Link href="/shop" className={buttonClasses({ variant: "ghost" })}>
            {t("cart.continue")}
          </Link>
        </div>
      </div>
      <div className="mt-12 border-t border-neutral-200 pt-10">
        <OrderSummary order={order} />
      </div>
    </Container>
  );
}
