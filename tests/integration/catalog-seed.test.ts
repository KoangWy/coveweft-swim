import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { seedCatalog } from "../../scripts/catalog/seed.ts";
import { createServiceClient } from "./support/clients";

const EXPECTED_SUMMARY = {
  products: 475,
  variants: 1541,
  images: 3224,
  productTranslations: 475,
  attributeTranslations: 188,
  storeSettings: 1,
};

const TABLES = [
  "products",
  "product_variants",
  "product_images",
  "product_translations",
  "attribute_translations",
  "store_settings",
] as const;

type TableName = (typeof TABLES)[number];

async function countRows(service: SupabaseClient, table: TableName): Promise<number> {
  const { count, error } = await service.from(table).select("*", { count: "exact", head: true });

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function countAll(service: SupabaseClient): Promise<Record<TableName, number>> {
  const entries = await Promise.all(
    TABLES.map(async (table) => [table, await countRows(service, table)] as const),
  );

  return Object.fromEntries(entries) as Record<TableName, number>;
}

async function variantStock(service: SupabaseClient, variantSku: string) {
  const { data, error } = await service
    .from("product_variants")
    .select("id,stock,size_guide_key")
    .eq("variant_sku", variantSku)
    .single();

  if (error) {
    throw error;
  }

  return data as { id: string; stock: number; size_guide_key: string | null };
}

describe("catalog seed", () => {
  const service = createServiceClient();

  it("is idempotent and keeps edited stock", async () => {
    const summary = await seedCatalog(service);
    expect(summary).toEqual(EXPECTED_SUMMARY);

    const original = await variantStock(service, "JAP5-1");

    try {
      const afterFirst = await countAll(service);
      expect(afterFirst.products).toBeGreaterThanOrEqual(EXPECTED_SUMMARY.products);
      expect(afterFirst.product_variants).toBeGreaterThanOrEqual(EXPECTED_SUMMARY.variants);
      expect(afterFirst.product_images).toBeGreaterThanOrEqual(EXPECTED_SUMMARY.images);

      await seedCatalog(service);
      expect(await countAll(service)).toEqual(afterFirst);

      const seeded = await variantStock(service, "JAP5-1");
      expect(seeded.size_guide_key).toBe("men-S");

      const edited = await service
        .from("product_variants")
        .update({ stock: 999 })
        .eq("id", original.id);

      if (edited.error) {
        throw edited.error;
      }

      await seedCatalog(service);

      expect((await variantStock(service, "JAP5-1")).stock).toBe(999);
      expect(await countAll(service)).toEqual(afterFirst);
    } finally {
      const restored = await service
        .from("product_variants")
        .update({ stock: original.stock })
        .eq("id", original.id);

      if (restored.error) {
        throw restored.error;
      }
    }
  }, 180_000);

  it("stores release studio images and Vietnamese translations", async () => {
    const image = await service
      .from("product_images")
      .select("kind,source,path")
      .eq("path", "studio/10F1/01")
      .single();

    expect(image.error).toBeNull();
    expect(image.data).toEqual({ kind: "studio", source: "release", path: "studio/10F1/01" });

    const productTranslation = await service
      .from("product_translations")
      .select("locale,description")
      .eq("locale", "vi")
      .not("description", "is", null)
      .limit(1);

    expect(productTranslation.error).toBeNull();
    expect(productTranslation.data?.length).toBeGreaterThan(0);

    const attributeTranslation = await service
      .from("attribute_translations")
      .select("label")
      .eq("attribute", "category")
      .eq("value", "Accessories")
      .eq("locale", "vi")
      .single();

    expect(attributeTranslation.error).toBeNull();
    expect(attributeTranslation.data).toEqual({ label: "Phụ kiện" });

    const settings = await service.from("store_settings").select("id").eq("id", 1).single();

    expect(settings.error).toBeNull();
    expect(settings.data).toEqual({ id: 1 });
  });
});
