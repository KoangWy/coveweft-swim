import { z } from "zod";

import { LOCALES } from "@/lib/locale";
import {
  ORDER_ACTIONS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/server/commerce/types";

const optionalFilter = (max: number) => z.string().trim().min(1).max(max).optional();

const priceInput = z.number().int().nonnegative().max(2_147_483_647);

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const AdminListProductsInput = z.object({
  q: z.string().trim().max(120).optional(),
  category: optionalFilter(120),
  productType: optionalFilter(120),
  isActive: z.boolean().optional(),
  stockState: z.enum(["all", "in", "low", "out"]).optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(60).default(20),
});

export type AdminListProductsInput = z.infer<typeof AdminListProductsInput>;

export const AdminGetProductInput = z.object({
  id: z.uuid(),
});

export type AdminGetProductInput = z.infer<typeof AdminGetProductInput>;

const AdminProductFields = {
  sku: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  productType: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  gender: z.string().trim().min(1).max(60).optional(),
  priceVnd: priceInput.optional(),
  description: nullableText(5000),
  caption: nullableText(1000),
  articleId: nullableText(64),
  collection: nullableText(120),
  color: nullableText(120),
  colorFamily: nullableText(120),
  pattern: nullableText(120),
  material: nullableText(120),
  fabricDesc: nullableText(200),
  sleeve: nullableText(120),
  neckline: nullableText(120),
  fit: nullableText(120),
  length: nullableText(120),
  closure: nullableText(120),
  lining: nullableText(120),
  features: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  season: nullableText(120),
  brand: nullableText(120),
  isActive: z.boolean().optional(),
  translations: z
    .array(
      z.object({
        locale: z.enum(LOCALES),
        description: nullableText(5000),
        caption: nullableText(1000),
      }),
    )
    .max(2)
    .optional(),
};

export const AdminUpsertProductInput = z
  .object({
    id: z.uuid().optional(),
    ...AdminProductFields,
  })
  .refine(
    (value) =>
      value.id !== undefined ||
      Boolean(
        value.sku &&
        value.name &&
        value.productType &&
        value.category &&
        value.gender &&
        value.priceVnd !== undefined,
      ),
    {
      message: "A new product needs sku, name, productType, category, gender, and priceVnd",
    },
  );

export type AdminUpsertProductInput = z.infer<typeof AdminUpsertProductInput>;

export const AdminSetProductActiveInput = z.object({
  id: z.uuid(),
  isActive: z.boolean(),
});

export type AdminSetProductActiveInput = z.infer<typeof AdminSetProductActiveInput>;

export const AdminAdjustStockInput = z
  .object({
    variantId: z.uuid(),
    delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    stock: z.number().int().min(0).max(1_000_000).optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((value) => (value.delta === undefined) !== (value.stock === undefined), {
    message: "Provide exactly one of delta or stock",
  });

export type AdminAdjustStockInput = z.infer<typeof AdminAdjustStockInput>;

export const AdminUploadImageInput = z.object({
  productId: z.uuid(),
  position: z.number().int().min(0).max(1000).optional(),
  file: z.custom<File>(
    (value) => typeof File !== "undefined" && value instanceof File,
    "Expected an image file",
  ),
});

export type AdminUploadImageInput = z.infer<typeof AdminUploadImageInput>;

export const AdminDeleteImageInput = z.object({
  imageId: z.uuid(),
});

export type AdminDeleteImageInput = z.infer<typeof AdminDeleteImageInput>;

export const AdminReorderImagesInput = z.object({
  productId: z.uuid(),
  imageIds: z.array(z.uuid()).min(1).max(100),
});

export type AdminReorderImagesInput = z.infer<typeof AdminReorderImagesInput>;

export const AdminListOrdersInput = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export type AdminListOrdersInput = z.infer<typeof AdminListOrdersInput>;

export const AdminGetOrderInput = z.object({
  id: z.uuid(),
});

export type AdminGetOrderInput = z.infer<typeof AdminGetOrderInput>;

export const AdminTransitionOrderInput = z.object({
  orderId: z.uuid(),
  action: z.enum(ORDER_ACTIONS),
});

export type AdminTransitionOrderInput = z.infer<typeof AdminTransitionOrderInput>;
