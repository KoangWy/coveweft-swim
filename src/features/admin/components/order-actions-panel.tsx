"use client";

import { CheckCircle, Truck, XCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { transitionOrderAction } from "@/features/admin/actions";
import type { OrderAction } from "@/server/commerce/types";
import type { ErrorCode } from "@/server/errors";

const ACTION_ICONS = {
  confirm: CheckCircle,
  ship: Truck,
  deliver: CheckCircle,
  cancel: XCircle,
} as const;

export type AdminOrderActionsProps = {
  orderId: string;
  reference: string;
  actions: OrderAction[];
  waitingForTransfer: boolean;
};

/**
 * Buttons for the transitions the current state allows. Cancel asks for
 * confirmation; the other transitions apply immediately.
 */
export function AdminOrderActions({
  orderId,
  reference,
  actions,
  waitingForTransfer,
}: AdminOrderActionsProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<OrderAction | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  const labels: Record<OrderAction, string> = {
    confirm: t("orderPage.confirm"),
    ship: t("orderPage.ship"),
    deliver: t("orderPage.deliver"),
    cancel: t("orderPage.cancel"),
  };
  const toasts: Record<OrderAction, string> = {
    confirm: t("orderPage.confirmedToast", { reference }),
    ship: t("orderPage.shippedToast", { reference }),
    deliver: t("orderPage.deliveredToast", { reference }),
    cancel: t("orderPage.cancelledToast", { reference }),
  };

  function run(action: OrderAction) {
    setError(null);
    setRunning(action);
    startTransition(async () => {
      const result = await transitionOrderAction(orderId, action);

      if (result.ok) {
        setCancelOpen(false);
        toast.show({ tone: "success", title: toasts[action] });
      } else {
        setError(result.code);
      }
      setRunning(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {actions
          .filter((action) => action !== "cancel")
          .map((action) => {
            const Icon = ACTION_ICONS[action];
            return (
              <Button
                key={action}
                onClick={() => run(action)}
                disabled={pending}
                aria-busy={running === action}
              >
                <Icon aria-hidden size={18} />
                {running === action ? t("orderPage.working") : labels[action]}
              </Button>
            );
          })}
        {actions.includes("cancel") ? (
          <Button
            variant="danger"
            onClick={() => {
              setError(null);
              setCancelOpen(true);
            }}
            disabled={pending}
          >
            <XCircle aria-hidden size={18} />
            {labels.cancel}
          </Button>
        ) : null}
      </div>

      {waitingForTransfer ? (
        <p className="max-w-[60ch] text-small text-warning-700">{t("orderPage.waitingPayment")}</p>
      ) : null}
      {actions.length === 0 && !waitingForTransfer ? (
        <p className="text-small text-neutral-700">{t("orderPage.finalState")}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-small text-error-700">
          {te(error)}
        </p>
      ) : null}

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t("orderPage.cancelTitle", { reference })}
        closeLabel={tc("close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={pending}>
              {t("orderPage.keep")}
            </Button>
            <Button variant="danger" onClick={() => run("cancel")} disabled={pending}>
              {pending ? t("orderPage.cancelling") : t("orderPage.confirmCancel")}
            </Button>
          </>
        }
      >
        <p className="text-body text-neutral-700">{t("orderPage.cancelBody")}</p>
        {error ? (
          <p role="alert" className="mt-4 text-small text-error-700">
            {te(error)}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
