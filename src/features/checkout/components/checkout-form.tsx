"use client";

import { Bank, Money, Package, Lightning } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { FormAlert } from "@/components/ui/form-alert";
import type { FormState } from "@/components/ui/form-errors";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import { Textarea } from "@/components/ui/textarea";
import { placeOrderAction } from "@/features/checkout/actions";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import type { PaymentMethod, ShippingMethod } from "@/server/commerce/types";

export type CheckoutLine = {
  variantId: string;
  name: string;
  optionLabel: string | null;
  quantity: number;
  lineTotalVnd: number;
  imageSrc: string | null;
};

export type CheckoutTotals = { shippingFeeVnd: number; totalVnd: number };

export type CheckoutFormProps = {
  idempotencyKey: string;
  lines: CheckoutLine[];
  subtotalVnd: number;
  totals: Record<ShippingMethod, CheckoutTotals>;
  freeShippingThresholdVnd: number;
  paymentWindowMinutes: number;
  defaults: { recipientName: string; recipientPhone: string; shippingAddress: string };
};

function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  icon,
  title,
  detail,
  aside,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  icon: ReactNode;
  title: string;
  detail: string;
  aside?: ReactNode;
}) {
  return (
    <label
      className={cx(
        "flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy-900",
        checked
          ? "border-navy-900 bg-neutral-50 shadow-[inset_3px_0_0_var(--color-lime-500)]"
          : "border-neutral-300 bg-white hover:border-navy-900",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-4 shrink-0 accent-navy-900"
      />
      <span aria-hidden className="mt-0.5 text-navy-900">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-semibold text-navy-900">{title}</span>
        <span className="text-small text-neutral-700">{detail}</span>
      </span>
      {aside ? <span className="text-small font-semibold text-navy-900">{aside}</span> : null}
    </label>
  );
}

/**
 * Checkout form. Totals come from the server quote for each shipping method;
 * the browser only chooses between them. The idempotency key is fixed for
 * this visit, so a double click or a resubmission returns the same order.
 */
export function CheckoutForm({
  idempotencyKey,
  lines,
  subtotalVnd,
  totals,
  freeShippingThresholdVnd,
  paymentWindowMinutes,
  defaults,
}: CheckoutFormProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [state, action, pending] = useActionState<FormState, FormData>(placeOrderAction, {});
  const [shipping, setShipping] = useState<ShippingMethod>(
    (state.values?.shippingMethod as ShippingMethod) || "standard",
  );
  const [payment, setPayment] = useState<PaymentMethod>(
    (state.values?.paymentMethod as PaymentMethod) || "cod",
  );
  const submitting = useRef(false);
  const values = state.values ?? defaults;

  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending]);
  const current = totals[shipping];
  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(`validation.${state.fieldErrors[name]}`) : undefined;
  const feeLabel = (fee: number) => (fee === 0 ? t("checkout.free") : formatVnd(fee, locale));

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // A second click before the first submission settles is ignored here;
        // the shared idempotency key covers anything that still gets through.
        if (submitting.current) event.preventDefault();
        submitting.current = true;
      }}
      className="grid gap-10 lg:grid-cols-12"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="flex flex-col gap-10 lg:col-span-7">
        {state.code ? <FormAlert>{t(`errors.${state.code}`)}</FormAlert> : null}

        <section aria-labelledby="delivery-heading" className="flex flex-col gap-5">
          <h2 id="delivery-heading" className="text-heading font-semibold text-navy-900">
            {t("checkout.delivery")}
          </h2>
          <p className="-mt-3 text-small text-neutral-700">{t("checkout.fakeData")}</p>
          <Input
            name="recipientName"
            autoComplete="name"
            label={t("checkout.recipientName")}
            required
            requiredLabel={t("common.required")}
            maxLength={200}
            defaultValue={values.recipientName}
            error={fieldError("recipientName")}
          />
          <Input
            name="recipientPhone"
            type="tel"
            autoComplete="tel"
            label={t("checkout.recipientPhone")}
            required
            requiredLabel={t("common.required")}
            maxLength={30}
            defaultValue={values.recipientPhone}
            error={fieldError("recipientPhone")}
          />
          <Textarea
            name="shippingAddress"
            autoComplete="street-address"
            label={t("checkout.shippingAddress")}
            required
            requiredLabel={t("common.required")}
            maxLength={500}
            defaultValue={values.shippingAddress}
            error={fieldError("shippingAddress")}
          />
        </section>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-heading font-semibold text-navy-900">
            {t("checkout.shippingMethod")}
          </legend>
          <ChoiceCard
            name="shippingMethod"
            value="standard"
            checked={shipping === "standard"}
            onChange={() => setShipping("standard")}
            icon={<Package size={22} />}
            title={t("checkout.standard")}
            detail={t("checkout.standardDetail", {
              threshold: formatVnd(freeShippingThresholdVnd, locale),
            })}
            aside={feeLabel(totals.standard.shippingFeeVnd)}
          />
          <ChoiceCard
            name="shippingMethod"
            value="express"
            checked={shipping === "express"}
            onChange={() => setShipping("express")}
            icon={<Lightning size={22} />}
            title={t("checkout.express")}
            detail={t("checkout.expressDetail")}
            aside={feeLabel(totals.express.shippingFeeVnd)}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-heading font-semibold text-navy-900">
            {t("checkout.paymentMethod")}
          </legend>
          <ChoiceCard
            name="paymentMethod"
            value="cod"
            checked={payment === "cod"}
            onChange={() => setPayment("cod")}
            icon={<Money size={22} />}
            title={t("checkout.cod")}
            detail={t("checkout.codDetail")}
          />
          <ChoiceCard
            name="paymentMethod"
            value="bank_transfer"
            checked={payment === "bank_transfer"}
            onChange={() => setPayment("bank_transfer")}
            icon={<Bank size={22} />}
            title={t("checkout.bankTransfer")}
            detail={t("checkout.bankTransferDetail", { minutes: paymentWindowMinutes })}
          />
        </fieldset>
      </div>

      <aside aria-labelledby="order-summary" className="lg:col-span-5">
        <div className="flex flex-col gap-5 rounded-md border border-neutral-200 bg-neutral-50 p-5 lg:sticky lg:top-36">
          <h2 id="order-summary" className="text-heading-sm font-semibold text-navy-900">
            {t("checkout.summary")}
          </h2>
          <ul className="flex flex-col gap-4">
            {lines.map((line) => (
              <li key={line.variantId} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-3">
                <div className="overflow-hidden rounded-md">
                  <ProductImage src={line.imageSrc} alt="" fallbackLabel="" sizes="3.5rem" />
                </div>
                <div className="flex min-w-0 flex-col text-small">
                  <span className="font-semibold text-navy-900">{line.name}</span>
                  <span className="text-neutral-700">
                    {line.optionLabel ? `${line.optionLabel}, ` : ""}
                    {t("checkout.quantity", { count: line.quantity })}
                  </span>
                </div>
                <Price amount={line.lineTotalVnd} locale={locale} size="sm" />
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-2 border-t border-neutral-200 pt-4 text-small">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-700">{t("cart.subtotal")}</dt>
              <dd>
                <Price amount={subtotalVnd} locale={locale} size="sm" />
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-700">
                {t("checkout.shippingFee", { method: t(`checkout.${shipping}`) })}
              </dt>
              <dd className="font-semibold text-navy-900 tabular-nums">
                {feeLabel(current.shippingFeeVnd)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-neutral-200 pt-3">
              <dt className="text-body font-semibold text-navy-900">{t("checkout.total")}</dt>
              <dd aria-live="polite">
                <Price amount={current.totalVnd} locale={locale} size="lg" />
              </dd>
            </div>
          </dl>
          <p className="text-small text-neutral-700">
            {t.rich("checkout.terms", {
              terms: (chunks) => (
                <Link
                  href="/policies/terms"
                  target="_blank"
                  className="font-medium text-navy-900 underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
              payment: (chunks) => (
                <Link
                  href="/policies/payment"
                  target="_blank"
                  className="font-medium text-navy-900 underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? t("checkout.placing") : t("checkout.placeOrder")}
          </Button>
        </div>
      </aside>
    </form>
  );
}
