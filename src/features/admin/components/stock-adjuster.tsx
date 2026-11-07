"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { adjustStockAction } from "@/features/admin/actions";
import type { ErrorCode } from "@/server/errors";

export type StockAdjusterProps = {
  variantId: string;
  optionLabel: string;
  variantSku: string;
  stock: number;
};

/** Opens a short form that sets a variant's stock with a required reason. */
export function StockAdjuster({ variantId, optionLabel, variantSku, stock }: StockAdjusterProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const toast = useToast();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await adjustStockAction(formData);

      if (result.ok) {
        setOpen(false);
        toast.show({
          tone: "success",
          title: t("variants.updated", { option: optionLabel, stock: result.stock }),
        });
      } else {
        setError(result.code);
      }
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("variants.adjust")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("variants.adjustTitle", { option: optionLabel })}
        closeLabel={tc("close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("variants.cancel")}
            </Button>
            <Button type="submit" form={formId} disabled={pending}>
              {pending ? t("variants.saving") : t("variants.save")}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          action={submit}
          className="flex flex-col gap-5"
          aria-label={t("variants.adjustTitle", { option: optionLabel })}
        >
          <p className="text-small text-neutral-700">
            {t("variants.variantSku", { sku: variantSku })}
          </p>
          {error ? <FormAlert>{te(error)}</FormAlert> : null}
          <input type="hidden" name="variantId" value={variantId} />
          <Input
            name="stock"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            label={t("variants.newStock")}
            hint={t("variants.newStockHint", { stock })}
            required
            defaultValue={stock}
          />
          <Textarea
            name="reason"
            label={t("variants.reason")}
            placeholder={t("variants.reasonPlaceholder")}
            maxLength={500}
            rows={2}
            required
          />
        </form>
      </Dialog>
    </>
  );
}
