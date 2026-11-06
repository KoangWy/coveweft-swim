"use client";

import { Trash, WarningCircle } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { removeCartItemAction, updateCartItemAction } from "@/features/cart/actions";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import type { CartIssue, CartLine } from "@/server/cart";
import type { ErrorCode } from "@/server/errors";

export type CartLineView = CartLine & { imageSrc: string | null; issue: CartIssue | null };

/**
 * One cart line with quantity controls. Lines with a problem show what is
 * wrong and the action that fixes it: lower the quantity or remove the line.
 */
export function CartLineItem({ line }: { line: CartLineView }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorCode | null>(null);
  const unavailable = line.issue?.code === "PRODUCT_UNAVAILABLE" || line.productName === null;
  const available = line.issue?.availableStock ?? line.stock ?? 0;
  const name = line.productName ?? t("cart.unavailableProduct");

  function run(action: () => Promise<{ ok: boolean; code?: ErrorCode }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok && result.code) setError(result.code);
    });
  }

  const update = (quantity: number) =>
    run(() => updateCartItemAction({ variantId: line.variantId, quantity }));
  const remove = () => run(() => removeCartItemAction({ variantId: line.variantId }));

  return (
    <li
      aria-busy={pending}
      className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 py-6 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-6"
    >
      <div className="overflow-hidden rounded-md">
        <ProductImage
          src={line.imageSrc}
          alt={name}
          fallbackLabel={t("catalog.imageUnavailable")}
          sizes="7rem"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {line.sku && !unavailable ? (
              <Link
                href={`/products/${encodeURIComponent(line.sku)}`}
                className="text-body font-semibold text-navy-900 hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span className="text-body font-semibold text-navy-900">{name}</span>
            )}
            {line.optionLabel ? (
              <span className="text-small text-neutral-700">
                {t("cart.option", { option: line.optionLabel })}
              </span>
            ) : null}
            {line.unitPriceVnd !== null ? (
              <span className="text-small text-neutral-700">
                {t("cart.unitPrice")} <Price amount={line.unitPriceVnd} locale={locale} size="sm" />
              </span>
            ) : null}
          </div>
          <Price amount={line.lineTotalVnd} locale={locale} className="sm:pt-0.5" />
        </div>

        {line.issue ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-3">
            <Badge tone={unavailable || available === 0 ? "soldout" : "warning"}>
              {unavailable
                ? t("cart.issues.unavailable")
                : available === 0
                  ? t("cart.issues.soldOut")
                  : t("cart.issues.lowStock", { count: available })}
            </Badge>
            <p className="text-small text-warning-700">
              {unavailable
                ? t("cart.issues.unavailableHelp")
                : available === 0
                  ? t("cart.issues.soldOutHelp")
                  : t("cart.issues.lowStockHelp", { count: available })}
            </p>
            {!unavailable && available > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => update(available)}
              >
                {t("cart.issues.reduceTo", { count: available })}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          {unavailable ? null : (
            <QuantityStepper
              label={t("common.quantity")}
              decreaseLabel={t("cart.decrease", { name })}
              increaseLabel={t("cart.increase", { name })}
              value={line.quantity}
              max={Math.max(line.quantity, Math.min(99, line.stock ?? 99))}
              disabled={pending}
              onChange={(quantity) => {
                if (quantity !== line.quantity) update(quantity);
              }}
            />
          )}
          <Button variant="ghost" size="md" disabled={pending} onClick={remove}>
            <Trash aria-hidden size={18} />
            {t("cart.remove")}
            <span className="sr-only">{name}</span>
          </Button>
        </div>
        {error ? (
          <p role="alert" className="flex items-start gap-1.5 text-small text-error-700">
            <WarningCircle aria-hidden size={18} className="mt-px shrink-0" />
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </div>
    </li>
  );
}
