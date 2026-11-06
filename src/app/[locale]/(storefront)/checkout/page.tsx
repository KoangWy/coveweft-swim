import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { requireUser } from "@/features/account/components/session";
import { imageSources } from "@/features/catalog/components/image-sources";
import { CheckoutForm } from "@/features/checkout/components/checkout-form";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { quoteCheckout } from "@/server/checkout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("title") };
}

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const [standard, express] = await Promise.all([
    quoteCheckout({ shippingMethod: "standard" }),
    quoteCheckout({ shippingMethod: "express" }),
  ]);

  for (const quote of [standard, express]) {
    if (quote.ok) continue;
    const { code, details } = quote.error;
    if (code === "VALIDATION_ERROR" && (details as { reason?: string })?.reason === "empty_cart") {
      redirect({ href: "/cart", locale });
    }
    if (code === "OUT_OF_STOCK" || code === "PRODUCT_UNAVAILABLE") {
      redirect({ href: "/cart?notice=stock", locale });
    }
  }

  const crumbs = [{ label: t("cart.title"), href: "/cart" }, { label: t("checkout.title") }];

  if (!standard.ok || !express.ok) {
    const code = !standard.ok ? standard.error.code : !express.ok ? express.error.code : "INTERNAL";
    return (
      <Container className="py-8 lg:py-10">
        <Breadcrumb items={crumbs} />
        <h1 className="mt-6 text-title font-bold text-navy-900">{t("checkout.title")}</h1>
        <ErrorState
          className="mt-8"
          title={t("checkout.quoteError")}
          description={t(`errors.${code}`)}
          action={
            <Link href="/checkout" className={buttonClasses()}>
              {t("common.tryAgain")}
            </Link>
          }
        />
      </Container>
    );
  }

  // One key per visit to this page. A reload starts a new checkout.
  const idempotencyKey = crypto.randomUUID();

  return (
    <Container className="py-8 lg:py-10">
      <Breadcrumb items={crumbs} />
      <h1 className="mt-6 mb-8 text-title font-bold text-navy-900">{t("checkout.title")}</h1>
      <CheckoutForm
        idempotencyKey={idempotencyKey}
        lines={standard.data.items.map((line) => ({
          variantId: line.variantId,
          name: line.productName ?? "",
          optionLabel: line.optionLabel,
          quantity: line.quantity,
          lineTotalVnd: line.lineTotalVnd,
          imageSrc: imageSources(line.image).small,
        }))}
        subtotalVnd={standard.data.subtotalVnd}
        totals={{
          standard: {
            shippingFeeVnd: standard.data.shippingFeeVnd,
            totalVnd: standard.data.totalVnd,
          },
          express: { shippingFeeVnd: express.data.shippingFeeVnd, totalVnd: express.data.totalVnd },
        }}
        freeShippingThresholdVnd={standard.data.freeShippingThresholdVnd}
        paymentWindowMinutes={standard.data.paymentWindowMinutes}
        defaults={{
          recipientName: user.fullName ?? "",
          recipientPhone: user.phone ?? "",
          shippingAddress: user.defaultAddress ?? "",
        }}
      />
    </Container>
  );
}
