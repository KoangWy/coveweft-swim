"use client";

import { CheckCircle, Ruler, ShoppingBagOpen, WarningCircle } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { addToCartAction } from "@/features/cart/actions";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import type { ProductVariant } from "@/server/catalog";

/** Stock level below which the exact count is shown. */
const LOW_STOCK = 5;

export type PurchasePanelProps = {
  sku: string;
  name: string;
  priceVnd: number;
  variants: ProductVariant[];
  initialVariantId?: string;
  hasSizeGuide: boolean;
};

type Feedback = { tone: "success" | "error"; message: string } | null;

/**
 * Option picker, quantity, and add-to-cart button. Sold-out options stay
 * visible but disabled with a text label. On small screens a fixed buy bar
 * appears once the main button scrolls out of view.
 */
export function PurchasePanel({
  sku,
  name,
  priceVnd,
  variants,
  initialVariantId,
  hasSizeGuide,
}: PurchasePanelProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const groupId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [showBar, setShowBar] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState<string | undefined>(() => {
    const initial = variants.find((variant) => variant.id === initialVariantId && variant.inStock);
    if (initial) return initial.id;
    const available = variants.filter((variant) => variant.inStock);
    return available.length === 1 ? available[0].id : undefined;
  });
  const selected = variants.find((variant) => variant.id === variantId);
  const soldOut = variants.every((variant) => !variant.inStock);
  const maxQuantity = Math.max(1, Math.min(99, selected?.stock ?? 99));

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const observer = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting));
    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  function stockLabel(variant: ProductVariant) {
    if (!variant.inStock) return t("product.soldOut");
    if (variant.stock <= LOW_STOCK) return t("product.lowStock", { count: variant.stock });
    return t("product.inStock");
  }

  function addToCart() {
    if (!selected) {
      setFeedback({ tone: "error", message: t("product.chooseOption") });
      const firstAvailable = variants.findIndex((variant) => variant.inStock);
      document.getElementById(`${groupId}-${Math.max(0, firstAvailable)}`)?.focus();
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await addToCartAction({ variantId: selected.id, quantity });
      if (result.ok) {
        setFeedback({ tone: "success", message: t("product.added", { name }) });
        return;
      }
      if (result.code === "UNAUTHENTICATED") {
        const next = `/products/${encodeURIComponent(sku)}?variant=${selected.id}`;
        router.push(`/sign-in?next=${encodeURIComponent(next)}&reason=cart`);
        return;
      }
      setFeedback({
        tone: "error",
        message:
          result.code === "OUT_OF_STOCK" && result.availableStock !== undefined
            ? t("product.notEnoughStock", { count: result.availableStock })
            : t(`errors.${result.code}`),
      });
    });
  }

  const addLabel = soldOut ? t("product.soldOut") : t("product.addToCart");

  return (
    <div className="flex flex-col gap-6">
      <fieldset aria-describedby={feedback?.tone === "error" ? `${groupId}-feedback` : undefined}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <legend className="text-small font-semibold text-navy-900">
            {t("product.option")}
            {selected ? (
              <span className="ml-2 font-normal text-neutral-700">{selected.optionLabel}</span>
            ) : null}
          </legend>
          {hasSizeGuide ? (
            <a
              href="#size-guide"
              className="inline-flex items-center gap-1 rounded-md text-small font-medium text-navy-900 underline underline-offset-2"
            >
              <Ruler aria-hidden size={18} />
              {t("product.sizeGuideLink")}
            </a>
          ) : null}
        </div>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {variants.map((variant, index) => {
            const checked = variant.id === variantId;
            return (
              <li key={variant.id}>
                <input
                  id={`${groupId}-${index}`}
                  type="radio"
                  name={`${groupId}-variant`}
                  value={variant.id}
                  checked={checked}
                  disabled={!variant.inStock}
                  onChange={() => {
                    setVariantId(variant.id);
                    setQuantity(1);
                    setFeedback(null);
                  }}
                  className="peer sr-only"
                />
                <label
                  htmlFor={`${groupId}-${index}`}
                  className={cx(
                    "flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-md border px-2 py-2 text-center transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy-900",
                    checked
                      ? "border-navy-900 bg-navy-900 text-white"
                      : variant.inStock
                        ? "border-neutral-500 bg-white text-navy-900 hover:border-navy-900"
                        : "cursor-not-allowed border-soldout-200 bg-soldout-50 text-soldout-700",
                  )}
                >
                  <span
                    className={cx(
                      "text-small font-semibold",
                      !variant.inStock && "line-through decoration-1",
                    )}
                  >
                    {variant.optionLabel}
                  </span>
                  <span className={cx("text-caption", checked ? "text-white" : undefined)}>
                    {stockLabel(variant)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {soldOut ? null : (
        <QuantityStepper
          label={t("common.quantity")}
          decreaseLabel={t("common.decrease")}
          increaseLabel={t("common.increase")}
          value={quantity}
          max={maxQuantity}
          onChange={setQuantity}
        />
      )}

      <p className="text-small text-neutral-700">
        {t.rich("product.policyNote", {
          shipping: (chunks) => (
            <Link
              href="/policies/shipping"
              className="font-medium text-navy-900 underline underline-offset-2"
            >
              {chunks}
            </Link>
          ),
          returns: (chunks) => (
            <Link
              href="/policies/returns"
              className="font-medium text-navy-900 underline underline-offset-2"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

      <div className="flex flex-col gap-3">
        <Button
          ref={buttonRef}
          size="lg"
          onClick={addToCart}
          disabled={soldOut || pending}
          aria-disabled={pending || undefined}
          className="w-full"
        >
          <ShoppingBagOpen aria-hidden size={22} />
          {pending ? t("product.adding") : addLabel}
        </Button>
        <div aria-live="polite" id={`${groupId}-feedback`}>
          {feedback ? (
            <p
              className={cx(
                "flex items-start gap-2 text-small",
                feedback.tone === "success" ? "text-success-700" : "text-error-700",
              )}
            >
              {feedback.tone === "success" ? (
                <CheckCircle aria-hidden size={18} className="mt-px shrink-0" />
              ) : (
                <WarningCircle aria-hidden size={18} className="mt-px shrink-0" />
              )}
              <span>
                {feedback.message}{" "}
                {feedback.tone === "success" ? (
                  <Link href="/cart" className="font-semibold text-navy-900 underline">
                    {t("product.viewCart")}
                  </Link>
                ) : null}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div
        aria-hidden={!showBar}
        inert={!showBar}
        className={cx(
          "fixed inset-x-0 bottom-0 z-(--z-header) border-t border-neutral-200 bg-white px-4 py-3 shadow-overlay transition-transform duration-200 ease-out lg:hidden",
          showBar ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <Price amount={priceVnd} locale={locale} size="sm" />
            <span className="truncate text-caption text-neutral-700">
              {selected ? selected.optionLabel : t("product.chooseOptionShort")}
            </span>
          </div>
          <Button size="lg" onClick={addToCart} disabled={soldOut || pending}>
            {pending
              ? t("product.adding")
              : selected || soldOut
                ? addLabel
                : t("product.chooseOptionShort")}
          </Button>
        </div>
      </div>
    </div>
  );
}
