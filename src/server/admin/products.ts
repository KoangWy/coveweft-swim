import "server-only";

import { LOCALES } from "@/lib/locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth/guard";
import { loadProductDetail, loadProductImages, type CatalogRow } from "@/server/catalog/repository";
import { mapDatabaseError } from "@/server/db/errors";
import { throwDatabaseError } from "@/server/db/throw";
import { fail, ok, type Result } from "@/server/errors";
import { parseInput, runService } from "@/server/result";

import { normalizeNullable, sanitizeOrTerm } from "./helpers";
import {
  AdminAdjustStockInput,
  AdminGetProductInput,
  AdminListProductsInput,
  AdminSetProductActiveInput,
  AdminUpsertProductInput,
} from "./schemas";
import type {
  AdminProductDetail,
  AdminProductList,
  AdminProductTranslation,
  AdminStockAdjustment,
} from "./types";

type AdminProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  gender: string;
  product_type: string;
  price_vnd: number;
  is_active: boolean;
  total_stock: number;
  variant_count: number;
  updated_at: string;
};

type ProductTranslationRow = {
  locale: string;
  description: string | null;
  caption: string | null;
};

type VariantRow = {
  id: string;
  variant_sku: string;
  product_id: string;
  stock: number;
};

function toProductPatch(input: AdminUpsertProductInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (input.sku !== undefined) patch.sku = input.sku;
  if (input.name !== undefined) patch.name = input.name;
  if (input.productType !== undefined) patch.product_type = input.productType;
  if (input.category !== undefined) patch.category = input.category;
  if (input.gender !== undefined) patch.gender = input.gender;
  if (input.priceVnd !== undefined) patch.price_vnd = input.priceVnd;
  if (input.description !== undefined) patch.description = normalizeNullable(input.description);
  if (input.caption !== undefined) patch.caption = normalizeNullable(input.caption);
  if (input.articleId !== undefined) patch.article_id = normalizeNullable(input.articleId);
  if (input.collection !== undefined) patch.collection = normalizeNullable(input.collection);
  if (input.color !== undefined) patch.color = normalizeNullable(input.color);
  if (input.colorFamily !== undefined) patch.color_family = normalizeNullable(input.colorFamily);
  if (input.pattern !== undefined) patch.pattern = normalizeNullable(input.pattern);
  if (input.material !== undefined) patch.material = normalizeNullable(input.material);
  if (input.fabricDesc !== undefined) patch.fabric_desc = normalizeNullable(input.fabricDesc);
  if (input.sleeve !== undefined) patch.sleeve = normalizeNullable(input.sleeve);
  if (input.neckline !== undefined) patch.neckline = normalizeNullable(input.neckline);
  if (input.fit !== undefined) patch.fit = normalizeNullable(input.fit);
  if (input.length !== undefined) patch.length = normalizeNullable(input.length);
  if (input.closure !== undefined) patch.closure = normalizeNullable(input.closure);
  if (input.lining !== undefined) patch.lining = normalizeNullable(input.lining);
  if (input.features !== undefined) patch.features = input.features;
  if (input.season !== undefined) patch.season = normalizeNullable(input.season);
  if (input.brand !== undefined) patch.brand = normalizeNullable(input.brand);
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  return patch;
}

async function upsertTranslations(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string,
  translations: AdminUpsertProductInput["translations"],
): Promise<void> {
  if (!translations || translations.length === 0) {
    return;
  }

  const rows = translations.map((translation) => ({
    product_id: productId,
    locale: translation.locale,
    description: normalizeNullable(translation.description),
    caption: normalizeNullable(translation.caption),
  }));

  const { error } = await supabase
    .from("product_translations")
    .upsert(rows, { onConflict: "product_id,locale" });

  if (error) {
    throwDatabaseError(error);
  }
}

/**
 * Lists products for the admin table. Inactive products are included because
 * the caller is an administrator; the storefront query hides them.
 */
export async function adminListProducts(input: unknown): Promise<Result<AdminProductList>> {
  return runService(async () => {
    const parsed = parseInput(AdminListProductsInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const from = (parsed.data.page - 1) * parsed.data.pageSize;
    const to = from + parsed.data.pageSize - 1;
    const term = parsed.data.q ? sanitizeOrTerm(parsed.data.q) : "";

    let query = supabase
      .from("catalog_products")
      .select(
        "id, sku, name, category, gender, product_type, price_vnd, is_active, total_stock, variant_count, updated_at",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true });

    if (term) {
      query = query.or(`sku.ilike.%${term}%,name.ilike.%${term}%,search_text_all.ilike.%${term}%`);
    }

    if (parsed.data.category) {
      query = query.eq("category", parsed.data.category);
    }

    if (parsed.data.productType) {
      query = query.eq("product_type", parsed.data.productType);
    }

    if (parsed.data.isActive !== undefined) {
      query = query.eq("is_active", parsed.data.isActive);
    }

    switch (parsed.data.stockState) {
      case "in":
        query = query.gt("total_stock", 0);
        break;
      case "low":
        query = query.gt("total_stock", 0).lte("total_stock", 5);
        break;
      case "out":
        query = query.eq("total_stock", 0);
        break;
      default:
        break;
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    const rows = (data ?? []) as AdminProductRow[];
    const images = await loadProductImages(
      supabase,
      rows.map((row) => row.id),
      { includeHidden: true },
    );
    const total = count ?? rows.length;

    return ok({
      items: rows.map((row) => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        category: row.category,
        gender: row.gender,
        productType: row.product_type,
        priceVnd: row.price_vnd,
        isActive: row.is_active,
        totalStock: row.total_stock,
        variantCount: row.variant_count,
        updatedAt: row.updated_at,
        image: images.get(row.id)?.[0] ?? null,
      })),
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      pageCount: total === 0 ? 0 : Math.ceil(total / parsed.data.pageSize),
    });
  });
}

/** Returns one product with hidden images and both translation rows. */
export async function adminGetProduct(input: unknown): Promise<Result<AdminProductDetail>> {
  return runService(async () => {
    const parsed = parseInput(AdminGetProductInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { data, error } = await supabase
      .from("catalog_products")
      .select("*")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("NOT_FOUND");
    }

    const detail = await loadProductDetail(supabase, data as CatalogRow, "en", {
      includeHiddenImages: true,
    });

    const { data: translationRows, error: translationError } = await supabase
      .from("product_translations")
      .select("locale, description, caption")
      .eq("product_id", parsed.data.id);

    if (translationError) {
      const mapped = mapDatabaseError(translationError);
      return fail(mapped.code, mapped.details);
    }

    const byLocale = new Map(
      ((translationRows ?? []) as ProductTranslationRow[]).map((row) => [row.locale, row] as const),
    );

    const translations: AdminProductTranslation[] = LOCALES.map((locale) => ({
      locale,
      description: byLocale.get(locale)?.description ?? null,
      caption: byLocale.get(locale)?.caption ?? null,
    }));

    return ok({ ...detail, translations });
  });
}

/** Creates or updates a product and its optional translation rows. */
export async function adminUpsertProduct(input: unknown): Promise<Result<AdminProductDetail>> {
  return runService(async () => {
    const parsed = parseInput(AdminUpsertProductInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    let productId = parsed.data.id;

    if (productId) {
      const patch = toProductPatch(parsed.data);

      if (Object.keys(patch).length === 0 && !parsed.data.translations) {
        return fail("VALIDATION_ERROR", { reason: "empty_patch" });
      }

      if (Object.keys(patch).length === 0) {
        const { data, error } = await supabase
          .from("products")
          .select("id")
          .eq("id", productId)
          .maybeSingle();

        if (error) {
          const mapped = mapDatabaseError(error);
          return fail(mapped.code, mapped.details);
        }

        if (!data) {
          return fail("NOT_FOUND");
        }
      }

      if (Object.keys(patch).length > 0) {
        const { data, error } = await supabase
          .from("products")
          .update(patch)
          .eq("id", productId)
          .select("id")
          .maybeSingle();

        if (error) {
          const mapped = mapDatabaseError(error);
          return fail(mapped.code, mapped.details);
        }

        if (!data) {
          return fail("NOT_FOUND");
        }
      }
    } else {
      if (
        !parsed.data.sku ||
        !parsed.data.name ||
        !parsed.data.productType ||
        !parsed.data.category ||
        !parsed.data.gender ||
        parsed.data.priceVnd === undefined
      ) {
        return fail("VALIDATION_ERROR", { reason: "missing_create_fields" });
      }

      const { data, error } = await supabase
        .from("products")
        .insert({
          sku: parsed.data.sku,
          name: parsed.data.name,
          product_type: parsed.data.productType,
          category: parsed.data.category,
          gender: parsed.data.gender,
          price_vnd: parsed.data.priceVnd,
          ...toProductPatch(parsed.data),
        })
        .select("id")
        .maybeSingle();

      if (error) {
        const mapped = mapDatabaseError(error);
        return fail(mapped.code, mapped.details);
      }

      if (!data) {
        return fail("INTERNAL");
      }

      productId = data.id;
    }

    if (!productId) {
      return fail("INTERNAL");
    }

    await upsertTranslations(supabase, productId, parsed.data.translations);

    return adminGetProduct({ id: productId });
  });
}

/** Hides or restores a product without deleting order references. */
export async function adminSetProductActive(input: unknown): Promise<Result<AdminProductDetail>> {
  return runService(async () => {
    const parsed = parseInput(AdminSetProductActiveInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { data, error } = await supabase
      .from("products")
      .update({ is_active: parsed.data.isActive })
      .eq("id", parsed.data.id)
      .select("id")
      .maybeSingle();

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("NOT_FOUND");
    }

    return adminGetProduct({ id: parsed.data.id });
  });
}

/** Adjusts stock by delta or absolute value through the audited function. */
export async function adminAdjustStock(input: unknown): Promise<Result<AdminStockAdjustment>> {
  return runService(async () => {
    const parsed = parseInput(AdminAdjustStockInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { data, error } = await supabase.rpc("admin_adjust_stock", {
      p_variant_id: parsed.data.variantId,
      p_delta: parsed.data.delta ?? null,
      p_stock: parsed.data.stock ?? null,
      p_reason: parsed.data.reason,
    });

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("INTERNAL");
    }

    const variant = data as VariantRow;

    return ok({
      variantId: variant.id,
      variantSku: variant.variant_sku,
      productId: variant.product_id,
      stock: variant.stock,
    });
  });
}
