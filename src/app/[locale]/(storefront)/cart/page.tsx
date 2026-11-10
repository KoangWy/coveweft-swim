import { Info, Truck } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { Price } from "@/components/ui/price";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { requireUser } from "@/features/account/components/session";
import { CartLineItem } from "@/features/cart/components/cart-line-item";
import { imageSources } from "@/features/catalog/components/image-sources";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import { getStoreSettings } from "@/lib/store-settings";
import { getCart } from "@/server/cart";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart");
  return { title: t("title") };
}

export default async function CartPage({ searchParams }: PageProps<"/[locale]/cart">) {
  await requireUser("/cart");
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const { notice } = await searchParams;
  const [result, settings] = await Promise.all([getCart(), getStoreSettings()]);
  const crumbs = [{ label: t("cart.title") }];

  if (!result.ok) {
    return (
      <Container className="py-8 lg:py-10">
        <Breadcrumb items={crumbs} />
        <h1 className="mt-6 text-title font-display text-navy-900">{t("cart.title")}</h1>
        <ErrorState
          className="mt-8"
          title={t("cart.loadError")}
          description={t(`errors.${result.error.code}`)}
          action={
            <Link href="/cart" className={buttonClasses()}>
              {t("common.tryAgain")}
            </Link>
          }
        />
      </Container>
    );
  }

  const cart = result.data;
  const hasIssues = cart.issues.length > 0;
  const remaining = settings.freeStandardShippingThresholdVnd - cart.subtotalVnd;
  const lines = cart.items.map((line) => ({
    ...line,
    imageSrc: imageSources(line.image).small,
    issue: cart.issues.find((issue) => issue.variantId === line.variantId) ?? null,
  }));

  return (
    <Container className="py-8 lg:py-10">
      <Breadcrumb items={crumbs} />
      <h1 className="mt-6 text-title font-display text-navy-900">
        {t("cart.title")}
        {cart.itemCount > 0 ? (
          <span className="ml-3 text-heading-sm font-normal text-neutral-600">
            {t("cart.itemCount", { count: cart.itemCount })}
          </span>
        ) : null}
      </h1>

      {notice === "stock" ? (
        <FormAlert className="mt-6">
          <p className="font-semibold">{t("cart.stockNoticeTitle")}</p>
          <p>{t("cart.stockNotice")}</p>
        </FormAlert>
      ) : null}

      {cart.items.length === 0 ? (
        <EmptyState
          className="mt-8"
          title={t("cart.emptyTitle")}
          description={t("cart.emptyBody")}
          action={
            <Link href="/shop" className={buttonClasses()}>
              {t("cart.browse")}
            </Link>
          }
        />
      ) : (
        <div className="mt-6 grid gap-10 lg:grid-cols-12">
          <section aria-labelledby="cart-lines" className="lg:col-span-8">
            <h2 id="cart-lines" className="sr-only">
              {t("cart.linesHeading")}
            </h2>
            <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
              {lines.map((line) => (
                <CartLineItem key={line.variantId} line={line} />
              ))}
            </ul>
          </section>

          <aside aria-labelledby="cart-summary" className="lg:col-span-4">
            <div className="flex flex-col gap-4 rounded-md border border-neutral-200 bg-neutral-50 p-5 lg:sticky lg:top-36">
              <h2 id="cart-summary" className="text-heading-sm font-semibold text-navy-900">
                {t("cart.summary")}
              </h2>
              <dl className="flex flex-col gap-2 text-small">
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-700">{t("cart.subtotal")}</dt>
                  <dd>
                    <Price amount={cart.subtotalVnd} locale={locale} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-700">{t("cart.shipping")}</dt>
                  <dd className="text-right text-navy-900">{t("cart.shippingAtCheckout")}</dd>
                </div>
              </dl>
              <p className="flex items-start gap-2 text-small text-navy-900">
                <Truck aria-hidden size={20} className="shrink-0" />
                {remaining > 0
                  ? t("cart.freeShippingRemaining", { amount: formatVnd(remaining, locale) })
                  : t("cart.freeShippingReached")}
              </p>
              {hasIssues ? (
                <>
                  <p className="flex items-start gap-2 text-small text-warning-700">
                    <Info aria-hidden size={18} className="mt-px shrink-0" />
                    {t("cart.fixIssues")}
                  </p>
                  <span
                    aria-disabled
                    className={buttonClasses({ size: "lg", className: "w-full" })}
                  >
                    {t("cart.checkout")}
                  </span>
                </>
              ) : (
                <Link
                  href="/checkout"
                  className={buttonClasses({ size: "lg", className: "w-full" })}
                >
                  {t("cart.checkout")}
                </Link>
              )}
              <Link
                href="/shop"
                className="text-center text-small font-medium text-navy-900 underline underline-offset-2"
              >
                {t("cart.continue")}
              </Link>
            </div>
          </aside>
        </div>
      )}
    </Container>
  );
}
