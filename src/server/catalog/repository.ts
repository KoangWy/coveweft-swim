import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/lib/locale";
import { throwDatabaseError } from "@/server/db/throw";

import { garmentForProductType, getSizeGuide, groupFromSizeGuideKey } from "./size-guide";
import type {
  ProductAttribute,
  ProductDetail,
  ProductImage,
  ProductListItem,
  ProductVariant,
  SizeGuide,
} from "./types";

/** One row of the `catalog_products` view. */
export type CatalogRow = {
  id: string;
  sku: string;
  article_id: string | null;
  name: string;
  product_type: string;
  category: string;
  gender: string;
  collection: string | null;
  color: string | null;
  color_family: string | null;
  pattern: string | null;
  material: string | null;
  fabric_desc: string | null;
  sleeve: string | null;
  neckline: string | null;
  fit: string | null;
  length: string | null;
  closure: string | null;
  lining: string | null;
  features: string[];
  season: string | null;
  brand: string | null;
  price_vnd: number;
  description: string | null;
  caption: string | null;
  is_active: boolean;
  search_text: string | null;
  created_at: string;
  updated_at: string;
  description_en: string | null;
  caption_en: string | null;
  description_vi: string | null;
  caption_vi: string | null;
  search_text_all: string | null;
  in_stock: boolean;
  variant_labels: string[];
  available_variant_labels: string[];
  total_stock: number;
  variant_count: number;
};

type ProductImageRow = {
  id: string;
  product_id: string;
  kind: "studio" | "community";
  source: "release" | "upload";
  path: string;
  position: number;
  is_visible: boolean;
};

type ProductVariantRow = {
  id: string;
  variant_sku: string;
  option_label: string;
  size_guide_key: string | null;
  stock: number;
  position: number;
};

type AttributeTranslationRow = {
  attribute: string;
  value: string;
  label: string;
};

const SCALAR_ATTRIBUTE_KEYS = [
  "category",
  "product_type",
  "gender",
  "collection",
  "color",
  "color_family",
  "pattern",
  "material",
  "fabric_desc",
  "sleeve",
  "neckline",
  "fit",
  "length",
  "closure",
  "lining",
  "season",
  "brand",
] as const;

export function localizedDescription(row: CatalogRow, locale: Locale): string | null {
  if (locale === "vi") {
    return row.description_vi ?? row.description_en ?? row.description;
  }

  return row.description_en ?? row.description;
}

export function localizedCaption(row: CatalogRow, locale: Locale): string | null {
  if (locale === "vi") {
    return row.caption_vi ?? row.caption_en ?? row.caption;
  }

  return row.caption_en ?? row.caption;
}

function mapImage(row: ProductImageRow): ProductImage {
  return {
    id: row.id,
    kind: row.kind,
    source: row.source,
    path: row.path,
    position: row.position,
    isVisible: row.is_visible,
  };
}

function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "studio" ? -1 : 1;
    }

    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return left.id.localeCompare(right.id);
  });
}

export function mapProductListItem(
  row: CatalogRow,
  locale: Locale,
  images: ProductImage[],
): ProductListItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    priceVnd: row.price_vnd,
    category: row.category,
    gender: row.gender,
    productType: row.product_type,
    material: row.material,
    color: row.color,
    features: row.features ?? [],
    inStock: row.in_stock,
    description: localizedDescription(row, locale),
    caption: localizedCaption(row, locale),
    images: sortImages(images),
  };
}

export async function loadProductImages(
  supabase: SupabaseClient,
  productIds: string[],
  options: { includeHidden: boolean },
): Promise<Map<string, ProductImage[]>> {
  const grouped = new Map<string, ProductImage[]>();

  if (productIds.length === 0) {
    return grouped;
  }

  let query = supabase
    .from("product_images")
    .select("id, product_id, kind, source, path, position, is_visible")
    .in("product_id", productIds);

  if (!options.includeHidden) {
    query = query.eq("is_visible", true);
  }

  const { data, error } = await query;

  if (error) {
    throwDatabaseError(error);
  }

  for (const raw of (data ?? []) as ProductImageRow[]) {
    const list = grouped.get(raw.product_id) ?? [];
    list.push(mapImage(raw));
    grouped.set(raw.product_id, list);
  }

  return grouped;
}

export async function loadProductVariants(
  supabase: SupabaseClient,
  productId: string,
): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, variant_sku, option_label, size_guide_key, stock, position")
    .eq("product_id", productId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throwDatabaseError(error);
  }

  return ((data ?? []) as ProductVariantRow[]).map((row) => ({
    id: row.id,
    variantSku: row.variant_sku,
    optionLabel: row.option_label,
    sizeGuideKey: row.size_guide_key,
    stock: row.stock,
    position: row.position,
    inStock: row.stock > 0,
  }));
}

function collectAttributeValues(row: CatalogRow): string[] {
  const values = new Set<string>();

  for (const key of SCALAR_ATTRIBUTE_KEYS) {
    const value = row[key];

    if (typeof value === "string" && value.length > 0) {
      values.add(value);
    }
  }

  for (const feature of row.features ?? []) {
    values.add(feature);
  }

  return [...values];
}

async function loadAttributeTranslations(
  supabase: SupabaseClient,
  locale: Locale,
  values: string[],
): Promise<Map<string, string>> {
  const translations = new Map<string, string>();

  if (locale === "en" || values.length === 0) {
    return translations;
  }

  const { data, error } = await supabase
    .from("attribute_translations")
    .select("attribute, value, label")
    .eq("locale", locale)
    .in("value", values);

  if (error) {
    throwDatabaseError(error);
  }

  for (const row of (data ?? []) as AttributeTranslationRow[]) {
    translations.set(`${row.attribute}:${row.value}`, row.label);
  }

  return translations;
}

function buildAttributes(row: CatalogRow, translations: Map<string, string>): ProductAttribute[] {
  const attributes: ProductAttribute[] = [];

  for (const key of SCALAR_ATTRIBUTE_KEYS) {
    const value = row[key];

    if (typeof value === "string" && value.length > 0) {
      attributes.push({
        key,
        value,
        valueLabel: translations.get(`${key}:${value}`) ?? value,
      });
    }
  }

  for (const feature of row.features ?? []) {
    attributes.push({
      key: "features",
      value: feature,
      valueLabel: translations.get(`features:${feature}`) ?? feature,
    });
  }

  return attributes;
}

async function resolveSizeGuide(
  row: CatalogRow,
  variants: ProductVariant[],
  locale: Locale,
): Promise<SizeGuide | null> {
  const garment = garmentForProductType(row.product_type);
  const sizeKey = variants.find((variant) => variant.sizeGuideKey)?.sizeGuideKey ?? null;
  const group = sizeKey ? groupFromSizeGuideKey(sizeKey) : null;

  if (!garment || !group) {
    return null;
  }

  const guide = await getSizeGuide({ locale, group, garment });

  return guide.ok ? guide.data : null;
}

/**
 * Loads the variants, images, translated attributes, and size guide for one
 * catalog row. The caller's Supabase client decides which rows are visible, so
 * the same loader serves the storefront and the admin editor.
 */
export async function loadProductDetail(
  supabase: SupabaseClient,
  row: CatalogRow,
  locale: Locale,
  options: { includeHiddenImages: boolean },
): Promise<ProductDetail> {
  const [variants, imagesByProduct, translations] = await Promise.all([
    loadProductVariants(supabase, row.id),
    loadProductImages(supabase, [row.id], { includeHidden: options.includeHiddenImages }),
    loadAttributeTranslations(supabase, locale, collectAttributeValues(row)),
  ]);

  const images = imagesByProduct.get(row.id) ?? [];

  return {
    ...mapProductListItem(row, locale, images),
    articleId: row.article_id,
    collection: row.collection,
    colorFamily: row.color_family,
    pattern: row.pattern,
    fabricDesc: row.fabric_desc,
    sleeve: row.sleeve,
    neckline: row.neckline,
    fit: row.fit,
    length: row.length,
    closure: row.closure,
    lining: row.lining,
    season: row.season,
    brand: row.brand,
    isActive: row.is_active,
    attributes: buildAttributes(row, translations),
    variants,
    sizeGuide: await resolveSizeGuide(row, variants, locale),
  };
}
