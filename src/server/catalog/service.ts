import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/lib/locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";
import { parseInput, runService, ServiceError } from "@/server/result";

import {
  loadProductDetail,
  loadProductImages,
  mapProductListItem,
  type CatalogRow,
} from "./repository";
import { GetProductBySkuInput, ListProductsInput } from "./schemas";
import { normalizeSearchTerm } from "./search";
import type {
  ProductDetail,
  ProductFacetValue,
  ProductFacets,
  ProductList,
  ProductSort,
} from "./types";

type CatalogQuery = ReturnType<typeof createCatalogQuery>;

const SIZE_ORDER = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "ONE SIZE",
] as const;

function createCatalogQuery(supabase: SupabaseClient, columns: string) {
  return supabase.from("catalog_products").select(columns, { count: "exact" });
}

function applyFilters(query: CatalogQuery, input: ListProductsInput): CatalogQuery {
  let next = query;
  if (input.ids) next = next.in("id", input.ids);
  const term = input.q ? normalizeSearchTerm(input.q) : "";

  if (term) {
    next = next.ilike("search_text_all", `%${term}%`);
  }

  if (input.category) {
    next = next.eq("category", input.category);
  }

  if (Array.isArray(input.gender)) {
    next = next.in("gender", input.gender);
  } else if (input.gender) {
    next = next.eq("gender", input.gender);
  }

  if (input.productType) {
    next = next.eq("product_type", input.productType);
  }

  if (input.priceMin !== undefined) {
    next = next.gte("price_vnd", input.priceMin);
  }

  if (input.priceMax !== undefined) {
    next = next.lte("price_vnd", input.priceMax);
  }

  if (input.material) {
    next = next.eq("material", input.material);
  }

  if (input.features && input.features.length > 0) {
    next = next.overlaps("features", input.features);
  }

  if (input.size) {
    next = next.contains("available_variant_labels", [input.size]);
  }

  if (input.inStock !== undefined) {
    next = next.eq("in_stock", input.inStock);
  }

  return next;
}

function applySort(query: CatalogQuery, sort: ProductSort): CatalogQuery {
  switch (sort) {
    case "price-asc":
      return query.order("price_vnd", { ascending: true }).order("id", { ascending: true });
    case "price-desc":
      return query.order("price_vnd", { ascending: false }).order("id", { ascending: true });
    case "name-asc":
      return query.order("name", { ascending: true }).order("id", { ascending: true });
    case "newest":
    default:
      return query.order("created_at", { ascending: false }).order("id", { ascending: true });
  }
}

async function loadFacetTranslations(
  supabase: SupabaseClient,
  locale: Locale,
): Promise<Map<string, string>> {
  const translations = new Map<string, string>();

  if (locale === "en") {
    return translations;
  }

  const { data, error } = await supabase
    .from("attribute_translations")
    .select("attribute, value, label")
    .eq("locale", locale);

  if (error) {
    const mapped = mapDatabaseError(error);
    throw new ServiceError(mapped.code, mapped.details);
  }

  for (const row of (data ?? []) as Array<{ attribute: string; value: string; label: string }>) {
    translations.set(`${row.attribute}:${row.value}`, row.label);
  }

  return translations;
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function toFacetValues(
  counts: Map<string, number>,
  translations: Map<string, string>,
  attribute: string,
  compare?: (left: ProductFacetValue, right: ProductFacetValue) => number,
): ProductFacetValue[] {
  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label: translations.get(`${attribute}:${value}`) ?? value,
      count,
    }))
    .sort(
      compare ??
        ((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
    );
}

function sizeRank(label: string): number {
  const base = label.split(" ")[0]?.toUpperCase() ?? "";
  const index = SIZE_ORDER.indexOf(base as (typeof SIZE_ORDER)[number]);

  return index === -1 ? SIZE_ORDER.length : index;
}

type FacetRow = {
  category: string;
  gender: string;
  product_type: string;
  material: string | null;
  features: string[] | null;
  price_vnd: number;
  available_variant_labels: string[] | null;
};

function buildFacets(rows: FacetRow[], translations: Map<string, string>): ProductFacets {
  const categories: string[] = [];
  const genders: string[] = [];
  const productTypes: string[] = [];
  const materials: string[] = [];
  const features: string[] = [];
  const sizes: string[] = [];
  let minVnd = Number.POSITIVE_INFINITY;
  let maxVnd = 0;

  for (const row of rows) {
    categories.push(row.category);
    genders.push(row.gender);
    productTypes.push(row.product_type);

    if (row.material) {
      materials.push(row.material);
    }

    for (const feature of row.features ?? []) {
      features.push(feature);
    }

    for (const size of row.available_variant_labels ?? []) {
      sizes.push(size);
    }

    minVnd = Math.min(minVnd, row.price_vnd);
    maxVnd = Math.max(maxVnd, row.price_vnd);
  }

  return {
    categories: toFacetValues(countValues(categories), translations, "category"),
    genders: toFacetValues(countValues(genders), translations, "gender"),
    productTypes: toFacetValues(countValues(productTypes), translations, "product_type"),
    materials: toFacetValues(countValues(materials), translations, "material"),
    features: toFacetValues(countValues(features), translations, "features"),
    sizes: toFacetValues(countValues(sizes), translations, "size", (left, right) => {
      const rank = sizeRank(left.value) - sizeRank(right.value);
      return rank !== 0 ? rank : left.value.localeCompare(right.value);
    }),
    price: {
      minVnd: Number.isFinite(minVnd) ? minVnd : 0,
      maxVnd,
    },
  };
}

/**
 * Lists active products with filters, sorting, pagination, and facet counts.
 * Search matches the product name, the English description, and the
 * Vietnamese translation, with or without diacritics.
 */
export async function listProducts(input: unknown): Promise<Result<ProductList>> {
  return runService(async () => {
    const parsed = parseInput(ListProductsInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const filters = parsed.data;
    const supabase = await createSupabaseServerClient();
    const sort = filters.sort ?? "newest";
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;

    const itemsQuery = applySort(
      applyFilters(createCatalogQuery(supabase, "*"), filters),
      sort,
    ).range(from, to);

    const facetsQuery = applyFilters(
      createCatalogQuery(
        supabase,
        "category, gender, product_type, material, features, price_vnd, available_variant_labels",
      ),
      filters,
    ).limit(1000);

    const [itemsResult, facetsResult, translations, ceilingResult] = await Promise.all([
      itemsQuery,
      facetsQuery,
      loadFacetTranslations(supabase, filters.locale),
      supabase
        .from("catalog_products")
        .select("price_vnd")
        .order("price_vnd", { ascending: false })
        .limit(1),
    ]);

    if (itemsResult.error) {
      const mapped = mapDatabaseError(itemsResult.error);
      return fail(mapped.code, mapped.details);
    }

    if (facetsResult.error) {
      const mapped = mapDatabaseError(facetsResult.error);
      return fail(mapped.code, mapped.details);
    }

    if (ceilingResult.error) {
      const mapped = mapDatabaseError(ceilingResult.error);
      return fail(mapped.code, mapped.details);
    }
    const facets = buildFacets((facetsResult.data ?? []) as unknown as FacetRow[], translations);
    // The slider domain stays stable when search, category, or price filters change.
    facets.price.maxVnd = ceilingResult.data?.[0]?.price_vnd ?? 0;

    const rows = (itemsResult.data ?? []) as unknown as CatalogRow[];
    const images = await loadProductImages(
      supabase,
      rows.map((row) => row.id),
      { includeHidden: false },
    );
    const total = itemsResult.count ?? rows.length;

    return ok({
      items: rows.map((row) => mapProductListItem(row, filters.locale, images.get(row.id) ?? [])),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      pageCount: total === 0 ? 0 : Math.ceil(total / filters.pageSize),
      facets,
    });
  });
}

/**
 * Returns one product with translated copy, attributes, variants, images, and
 * the matching demo size guide. Inactive products are hidden by row level
 * security for customers and return `NOT_FOUND`.
 */
export async function getProductBySku(input: unknown): Promise<Result<ProductDetail>> {
  return runService(async () => {
    const parsed = parseInput(GetProductBySkuInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("catalog_products")
      .select("*")
      .eq("sku", parsed.data.sku)
      .maybeSingle();

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("NOT_FOUND");
    }

    return ok(
      await loadProductDetail(supabase, data as CatalogRow, parsed.data.locale, {
        includeHiddenImages: false,
      }),
    );
  });
}
