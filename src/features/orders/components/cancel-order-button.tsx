"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cancelOrderAction } from "@/features/orders/actions";
import type { ErrorCode } from "@/server/errors";

/** Cancel button with a confirmation dialog. Shown only for pending orders. */
export function CancelOrderButton({ orderId, reference }: { orderId: string; reference: string }) {
  const t = useTranslations();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrderAction(orderId);
      if (result.ok) {
        setOpen(false);
        toast.show({ tone: "success", title: t("orders.cancelled", { reference }) });
      } else {
        setError(result.code);
      }
    });
  }

  return (
    <>
      <Button variant="danger" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t("orders.cancel")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("orders.cancelTitle", { reference })}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("orders.keepOrder")}
            </Button>
            <Button variant="danger" onClick={confirm} disabled={pending}>
              {pending ? t("orders.cancelling") : t("orders.confirmCancel")}
            </Button>
          </>
        }
      >
        <p className="text-body text-neutral-700">{t("orders.cancelBody")}</p>
        {error ? (
          <p role="alert" className="mt-4 flex items-start gap-1.5 text-small text-error-700">
            <WarningCircle aria-hidden size={18} className="mt-px shrink-0" />
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
