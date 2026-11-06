"use client";

import { CheckCircle, Clock, WarningCircle, XCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { simulatePaymentAction } from "@/features/orders/actions";
import { Link, useRouter } from "@/i18n/navigation";
import type { PaymentOutcome } from "@/server/commerce/types";
import type { ErrorCode } from "@/server/errors";

type Notice = { tone: "error" | "success"; message: string } | null;

/** Current time in whole seconds, updated every second; null during server rendering. */
function subscribeToClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 1000);
  return () => window.clearInterval(timer);
}

function useNow(): number | null {
  const seconds = useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / 1000),
    () => null,
  );
  return seconds === null ? null : seconds * 1000;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Simulated bank transfer: a countdown to the payment deadline and two
 * buttons that record a successful or failed attempt. A failure keeps the
 * order open for another try; after the deadline the page shows the expired
 * state and the buttons are disabled.
 */
export function PaymentSimulator({
  orderId,
  dueAt,
  lastOutcome,
}: {
  orderId: string;
  dueAt: string;
  lastOutcome: PaymentOutcome | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const now = useNow();
  const [expiredByServer, setExpiredByServer] = useState(false);
  const [notice, setNotice] = useState<Notice>(
    lastOutcome === "failed" ? { tone: "error", message: t("payment.failed") } : null,
  );
  const refreshed = useRef(false);
  const deadline = new Date(dueAt).getTime();
  const remaining = now === null ? null : deadline - now;
  const expired = expiredByServer || (remaining !== null && remaining <= 0);

  useEffect(() => {
    // Once the deadline passes, reload the order so the page reflects the
    // cancellation as soon as the server has applied it.
    if (expired && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [expired, router]);

  function attempt(outcome: PaymentOutcome) {
    setNotice(null);
    startTransition(async () => {
      const result = await simulatePaymentAction(orderId, outcome);
      if (!result.ok) {
        handleError(result.code);
        return;
      }
      if (result.paymentStatus === "paid") {
        router.push(`/checkout/confirmation/${orderId}`);
        return;
      }
      setNotice({ tone: "error", message: t("payment.failed") });
    });
  }

  function handleError(code: ErrorCode) {
    if (code === "PAYMENT_EXPIRED") {
      setExpiredByServer(true);
      return;
    }
    setNotice({ tone: "error", message: t(`errors.${code}`) });
  }

  if (expired) {
    return (
      <div
        role="status"
        className="flex flex-col items-start gap-4 rounded-md border border-soldout-200 bg-soldout-50 p-6"
      >
        <span className="inline-flex items-center gap-2 text-heading-sm font-semibold text-soldout-700">
          <XCircle aria-hidden size={24} />
          {t("payment.expiredTitle")}
        </span>
        <p className="text-body text-navy-900">{t("payment.expiredBody")}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/account/orders/${orderId}`}
            className={buttonClasses({ variant: "secondary" })}
          >
            {t("payment.viewOrder")}
          </Link>
          <Link href="/shop" className={buttonClasses()}>
            {t("payment.backToShop")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <Clock aria-hidden size={24} className="shrink-0 text-navy-900" />
        <div className="flex flex-col">
          <span className="text-small text-neutral-700">{t("payment.timeLeft")}</span>
          <span
            role="timer"
            aria-label={t("payment.timeLeft")}
            className="text-heading font-semibold text-navy-900 tabular-nums"
          >
            {remaining === null ? "--:--" : formatRemaining(remaining)}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button size="lg" onClick={() => attempt("succeeded")} disabled={pending}>
          <CheckCircle aria-hidden size={20} />
          {t("payment.succeed")}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => attempt("failed")} disabled={pending}>
          <XCircle aria-hidden size={20} />
          {t("payment.fail")}
        </Button>
      </div>

      <div aria-live="polite">
        {notice ? (
          <p
            className={cx(
              "flex items-start gap-2 rounded-md border p-4 text-small",
              notice.tone === "error"
                ? "border-error-200 bg-error-50 text-error-700"
                : "border-success-200 bg-success-50 text-success-700",
            )}
          >
            <WarningCircle aria-hidden size={18} className="mt-px shrink-0" />
            {notice.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
