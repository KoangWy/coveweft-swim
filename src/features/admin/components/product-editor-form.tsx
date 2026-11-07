"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { saveProductAction, type ProductFormState } from "@/features/admin/actions";

export type AdminProductEditorValues = {
  id: string;
  sku: string;
  name: string;
  category: string;
  productType: string;
  gender: string;
  priceVnd: number;
  descriptionEn: string;
  descriptionVi: string;
  isActive: boolean;
};

type Option = { value: string; label: string };

export type AdminProductEditorProps = {
  product: AdminProductEditorValues;
  categoryOptions: Option[];
  productTypeOptions: Option[];
  genderOptions: Option[];
};

/** Adds the current value to a facet list if a filtered catalog hides it. */
function withCurrent(options: Option[], current: string): Option[] {
  return options.some((option) => option.value === current)
    ? options
    : [{ value: current, label: current }, ...options];
}

/** Form for the editable product fields plus both description translations. */
export function AdminProductEditor({
  product,
  categoryOptions,
  productTypeOptions,
  genderOptions,
}: AdminProductEditorProps) {
  const t = useTranslations("admin");
  const te = useTranslations("errors");
  const tv = useTranslations("validation");
  const toast = useToast();
  const [state, action, pending] = useActionState<ProductFormState, FormData>(
    saveProductAction,
    {},
  );
  const notified = useRef(false);
  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? tv(state.fieldErrors[name]) : undefined;

  useEffect(() => {
    if (state.saved && !notified.current) {
      notified.current = true;
      toast.show({ tone: "success", title: t("editorPage.saved") });
    }
    if (!state.saved) {
      notified.current = false;
    }
  }, [state.saved, t, toast]);

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.code ? <FormAlert>{te(state.code)}</FormAlert> : null}
      <input type="hidden" name="id" value={product.id} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          name="name"
          label={t("editorPage.name")}
          required
          maxLength={200}
          defaultValue={product.name}
          error={fieldError("name")}
          containerClassName="sm:col-span-2"
        />
        <div className="flex flex-col gap-2">
          <span className="text-small font-medium text-navy-900">{t("editorPage.sku")}</span>
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-body text-neutral-700">
            {product.sku ?? ""}
          </p>
          <p className="text-small text-neutral-600">{t("editorPage.skuHint")}</p>
        </div>
        <Input
          name="priceVnd"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          label={t("editorPage.price")}
          hint={t("editorPage.priceHint")}
          required
          defaultValue={product.priceVnd}
          error={fieldError("priceVnd")}
        />
        <Select
          name="category"
          label={t("editorPage.category")}
          options={withCurrent(categoryOptions, product.category)}
          defaultValue={product.category}
          error={fieldError("category")}
        />
        <Select
          name="productType"
          label={t("editorPage.productType")}
          options={withCurrent(productTypeOptions, product.productType)}
          defaultValue={product.productType}
          error={fieldError("productType")}
        />
        <Select
          name="gender"
          label={t("editorPage.gender")}
          options={withCurrent(genderOptions, product.gender)}
          defaultValue={product.gender}
          error={fieldError("gender")}
        />
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-heading-sm font-semibold text-navy-900">
          {t("editorPage.description")}
        </legend>
        <p className="text-small text-neutral-600">{t("editorPage.descriptionHint")}</p>
        <Textarea
          name="descriptionEn"
          label={t("editorPage.descriptionEn")}
          rows={4}
          maxLength={5000}
          defaultValue={product.descriptionEn}
        />
        <Textarea
          name="descriptionVi"
          label={t("editorPage.descriptionVi")}
          rows={4}
          maxLength={5000}
          defaultValue={product.descriptionVi}
        />
      </fieldset>

      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <Checkbox
          name="isActive"
          label={t("editorPage.onSale")}
          hint={t("editorPage.onSaleHint")}
          defaultChecked={product.isActive}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("editorPage.saving") : t("editorPage.save")}
        </Button>
        <p role="status" aria-live="polite" className="text-small text-success-700">
          {state.saved ? t("editorPage.saved") : ""}
        </p>
      </div>
    </form>
  );
}
