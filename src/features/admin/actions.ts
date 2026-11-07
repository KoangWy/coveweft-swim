"use server";

import { refresh } from "next/cache";

import { fieldErrorsFrom, formValues, type FormState } from "@/components/ui/form-errors";
import {
  adminAdjustStock,
  adminDeleteImage,
  adminReorderImages,
  adminSetProductActive,
  adminTransitionOrder,
  adminUpsertProduct,
} from "@/server/admin";
import type { OrderAction } from "@/server/commerce/types";
import type { ErrorCode } from "@/server/errors";

export type AdminActionResult = { ok: true } | { ok: false; code: ErrorCode };

export type AdminStockResult = { ok: true; stock: number } | { ok: false; code: ErrorCode };

export type AdminTransitionResult =
  { ok: true; status: string; paymentStatus: string } | { ok: false; code: ErrorCode };

export type ProductFormState = FormState & { saved?: boolean };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Saves the editable product fields and both description translations. */
export async function saveProductAction(
  _previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const priceRaw = text(formData, "priceVnd").trim();
  const values = formValues(formData, [
    "id",
    "name",
    "category",
    "productType",
    "gender",
    "priceVnd",
    "descriptionEn",
    "descriptionVi",
  ]);
  const result = await adminUpsertProduct({
    id: text(formData, "id"),
    name: text(formData, "name"),
    category: text(formData, "category"),
    productType: text(formData, "productType"),
    gender: text(formData, "gender"),
    priceVnd: priceRaw === "" ? Number.NaN : Number(priceRaw),
    isActive: formData.get("isActive") === "on",
    translations: [
      { locale: "en", description: text(formData, "descriptionEn") },
      { locale: "vi", description: text(formData, "descriptionVi") },
    ],
  });

  if (!result.ok) {
    return {
      code: result.error.code,
      fieldErrors:
        result.error.code === "VALIDATION_ERROR" ? fieldErrorsFrom(result.error.details) : {},
      values,
    };
  }

  refresh();
  return { saved: true, values };
}

/** Hides a product from the storefront or brings it back. */
export async function setProductActiveAction(
  productId: string,
  isActive: boolean,
): Promise<AdminActionResult> {
  const result = await adminSetProductActive({ id: productId, isActive });

  if (!result.ok) {
    return { ok: false, code: result.error.code };
  }

  refresh();
  return { ok: true };
}

/** Sets a variant to an absolute stock value with an audit reason. */
export async function adjustStockAction(formData: FormData): Promise<AdminStockResult> {
  const stockRaw = text(formData, "stock").trim();
  const result = await adminAdjustStock({
    variantId: text(formData, "variantId"),
    stock: stockRaw === "" ? Number.NaN : Number(stockRaw),
    reason: text(formData, "reason"),
  });

  if (!result.ok) {
    return { ok: false, code: result.error.code };
  }

  refresh();
  return { ok: true, stock: result.data.stock };
}

/** Deletes an uploaded image or hides a release image. */
export async function deleteImageAction(imageId: string): Promise<AdminActionResult> {
  const result = await adminDeleteImage({ imageId });

  if (!result.ok) {
    return { ok: false, code: result.error.code };
  }

  refresh();
  return { ok: true };
}

/** Saves the display order of a product's images. */
export async function reorderImagesAction(
  productId: string,
  imageIds: string[],
): Promise<AdminActionResult> {
  const result = await adminReorderImages({ productId, imageIds });

  if (!result.ok) {
    return { ok: false, code: result.error.code };
  }

  refresh();
  return { ok: true };
}

/** Applies one order transition allowed by the status table. */
export async function transitionOrderAction(
  orderId: string,
  action: OrderAction,
): Promise<AdminTransitionResult> {
  const result = await adminTransitionOrder({ orderId, action });

  if (!result.ok) {
    return { ok: false, code: result.error.code };
  }

  refresh();
  return {
    ok: true,
    status: result.data.status,
    paymentStatus: result.data.paymentStatus,
  };
}
