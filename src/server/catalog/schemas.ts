import { z } from "zod";

import { LOCALES } from "@/lib/locale";

export const LocaleInput = z.enum(LOCALES);

export const ProductSortInput = z.enum(["newest", "price-asc", "price-desc", "name-asc"]);

export const SizeGuideGarmentInput = z.enum(["tops", "bottoms", "full-body"]);

const optionalFilter = (max: number) => z.string().trim().min(1).max(max).optional();

const priceInput = z.number().int().nonnegative().max(2_147_483_647);

export const ListProductsInput = z
  .object({
    locale: LocaleInput.default("en"),
    q: z.string().trim().max(120).optional(),
    category: optionalFilter(120),
    gender: z
      .union([optionalFilter(60), z.array(z.string().trim().min(1).max(60)).min(1).max(10)])
      .optional(),
    productType: optionalFilter(120),
    priceMin: priceInput.optional(),
    priceMax: priceInput.optional(),
    material: optionalFilter(120),
    features: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    size: optionalFilter(60),
    inStock: z.boolean().optional(),
    sort: ProductSortInput.optional(),
    page: z.number().int().min(1).max(10_000).default(1),
    pageSize: z.number().int().min(1).max(60).default(12),
  })
  .superRefine((value, context) => {
    if (
      value.priceMin !== undefined &&
      value.priceMax !== undefined &&
      value.priceMin > value.priceMax
    ) {
      context.addIssue({
        code: "custom",
        path: ["priceMax"],
        params: { issue: "invalid_range" },
      });
    }
  });

export type ListProductsInput = z.infer<typeof ListProductsInput>;

export const GetProductBySkuInput = z.object({
  locale: LocaleInput.default("en"),
  sku: z.string().trim().min(1).max(64),
});

export type GetProductBySkuInput = z.infer<typeof GetProductBySkuInput>;

export const GetSizeGuideInput = z
  .object({
    locale: LocaleInput.default("en"),
    key: z.string().trim().min(1).max(60).optional(),
    group: z.string().trim().min(1).max(30).optional(),
    garment: SizeGuideGarmentInput.optional(),
  })
  .superRefine((value, context) => {
    if (!value.key && !value.group) {
      context.addIssue({
        code: "custom",
        path: [],
        params: { issue: "require_one_of" },
      });
    }
  });

export type GetSizeGuideInput = z.infer<typeof GetSizeGuideInput>;
