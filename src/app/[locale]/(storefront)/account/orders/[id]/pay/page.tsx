import { Info } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/features/account/components/session";
import { loadOrderOr404, orderReference } from "@/features/orders/components/load-order";
import { OrderBadges } from "@/features/orders/components/order-badges";
import { PaymentSimulator } from "@/features/orders/components/payment-simulator";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";

type Props = PageProps<"/[locale]/account/orders/[id]/pay">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  await requireUser(`/account/orders/${id}/pay`);
  await loadOrderOr404(id);
  const t = await getTranslations("payment");
  return { title: t("title") };
}

export default async function PaymentPage({ params }: Props) {
  const { id } = await params;
  await requireUser(`/account/orders/${id}/pay`);
  const order = await loadOrderOr404(id);
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const reference = orderReference(order.id);
  const payable =
    order.paymentMethod === "bank_transfer" &&
    order.status === "pending" &&
    order.paymentStatus === "unpaid" &&
    order.paymentDueAt !== null;
  const lastOutcome =
    [...order.paymentAttempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)
      ?.outcome ?? null;

  return (
    <Container className="py-8 lg:py-10">
      <Breadcrumb
        items={[
          { label: t("account.title"), href: "/account" },
          { label: t("orders.title"), href: "/account/orders" },
          { label: t("orders.reference", { reference }), href: `/account/orders/${order.id}` },
          { label: t("payment.title") },
        ]}
      />
      <div className="mt-6 grid gap-10 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <div className="flex flex-col gap-3">
            <Badge tone="accent" className="self-start">
              {t("payment.badge")}
            </Badge>
            <h1 className="text-title font-display text-navy-900">{t("payment.title")}</h1>
            <p className="max-w-[60ch] text-body text-neutral-700">{t("payment.intro")}</p>
          </div>

          {payable ? (
            <PaymentSimulator
              orderId={order.id}
              dueAt={order.paymentDueAt as string}
              lastOutcome={lastOutcome}
            />
          ) : order.paymentStatus === "paid" ? (
            <EmptyState
              title={t("payment.alreadyPaid")}
              description={t("payment.alreadyPaidBody")}
              action={
                <Link href={`/account/orders/${order.id}`} className={buttonClasses()}>
                  {t("payment.viewOrder")}
                </Link>
              }
            />
          ) : order.status === "cancelled" ? (
            <EmptyState
              title={t("payment.expiredTitle")}
              description={t("payment.cancelledBody")}
              action={
                <Link href="/shop" className={buttonClasses()}>
                  {t("payment.backToShop")}
                </Link>
              }
            />
          ) : (
            <EmptyState
              title={t("payment.notPayable")}
              description={t("errors.PAYMENT_NOT_ALLOWED")}
              action={
                <Link href={`/account/orders/${order.id}`} className={buttonClasses()}>
                  {t("payment.viewOrder")}
                </Link>
              }
            />
          )}
        </div>

        <aside className="lg:col-span-4 lg:col-start-9">
          <div className="flex flex-col gap-4 rounded-md border border-neutral-200 bg-neutral-50 p-5">
            <h2 className="text-heading-sm font-semibold text-navy-900">
              {t("orders.reference", { reference })}
            </h2>
            <OrderBadges status={order.status} paymentStatus={order.paymentStatus} />
            <dl className="flex flex-col gap-3 text-small">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-neutral-700">{t("payment.amount")}</dt>
                <dd>
                  <Price amount={order.totalVnd} locale={locale} size="lg" />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-700">{t("payment.transferNote")}</dt>
                <dd className="font-semibold text-navy-900">{reference}</dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 text-small text-neutral-700">
              <Info aria-hidden size={18} className="mt-px shrink-0 text-navy-900" />
              {t("payment.noMoney")}
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
