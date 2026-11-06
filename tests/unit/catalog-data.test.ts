import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXPECTED_COUNTS,
  loadCatalogData,
  loadSizeGuide,
  validateCatalogData,
} from "../../scripts/catalog/catalog.ts";
import { renderSeedSql } from "../../scripts/catalog/seed-sql.ts";
import type { ImportReport } from "../../scripts/catalog/types.ts";

const root = resolve(import.meta.dirname, "../..");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
}

const data = loadCatalogData(root);
const sizeGuide = loadSizeGuide(root);

describe("committed catalog data", () => {
  it("passes the full validation with the expected snapshot counts", () => {
    expect(validateCatalogData(data, { sizeGuide })).toEqual({
      products: EXPECTED_COUNTS.products,
      variants: EXPECTED_COUNTS.variants,
      images: EXPECTED_COUNTS.images,
      productTranslations: EXPECTED_COUNTS.productTranslations,
      attributeTranslations: EXPECTED_COUNTS.attributeTranslations,
      garmentVariants: 1417,
      accessoryVariants: 124,
    });
  });

  it("keeps the known source records", () => {
    const products = new Map(data.products.map((product) => [product.sku, product]));
    const variants = new Map(data.variants.map((group) => [group.sku, group]));

    expect(products.get("BB25HBX")).toMatchObject({
      name: "Hoa Bé Xinh swimsuit",
      category: "Full body",
      gender: "Baby",
      priceVnd: 350000,
    });
    expect(variants.get("BB25HBX")?.sizeGuideKeyBySize).toEqual({
      "S (Y)": "baby-S",
      "M (3Y)": "baby-M",
      "L (4Y)": "baby-L",
      "XL (5Y)": "baby-XL",
    });

    expect(products.get("JAP5")).toMatchObject({
      name: "Aqua Daniel swim boxers",
      features: ["upf 50+", "chlorine-resistant", "4-way stretch", "flatlock seams", "quick-dry"],
    });
    expect(variants.get("JAP5")?.stockBySize).toEqual({ S: 38, M: 33, L: 37, XL: 37 });

    expect(products.get("CUPSVSBZ11")).toMatchObject({
      category: "Accessories",
      features: [],
    });
    expect(variants.get("CUPSVSBZ11")?.sizeGuideKeyBySize).toEqual({
      "Free size (Black)": null,
      "Free size (Nude)": null,
    });
  });

  it("matches the media manifest ordering and size-less path convention", () => {
    const manifest = readJson<{
      entries: {
        sku: string;
        position: number;
        driveFileId: string;
        sizes: Record<string, { path: string }>;
      }[];
    }>("data/media/manifest-studio-v1.json");

    expect(data.images).toHaveLength(manifest.entries.length);

    data.images.forEach((image, index) => {
      const entry = manifest.entries[index];

      expect(image.sku).toBe(entry.sku);
      expect(image.position).toBe(entry.position);
      expect(image.driveFileId).toBe(entry.driveFileId);
      expect(`${image.path}-480.webp`).toBe(entry.sizes["480"].path);
      expect(`${image.path}-960.webp`).toBe(entry.sizes["960"].path);
      expect(`${image.path}-1600.webp`).toBe(entry.sizes["1600"].path);
    });
  });

  it("keeps the committed import report in sync with the data", () => {
    const report = readJson<ImportReport>("data/catalog/import-report.json");
    const anomalies = new Map(report.anomalies.map((anomaly) => [anomaly.code, anomaly]));

    expect(report.counts).toMatchObject({
      products: 475,
      variants: 1541,
      images: 3224,
      productTranslations: 475,
      attributeTranslations: 188,
    });
    expect(anomalies.get("DUPLICATE_PRODUCT_NAME")?.count).toBe(12);
    expect(anomalies.get("ZERO_STOCK_VARIANT")?.count).toBe(411);
    expect(anomalies.get("OUT_OF_STOCK_PRODUCT")?.count).toBe(56);
    expect(anomalies.get("SIZE_LABEL_ALIAS")?.items).toEqual([
      {
        sku: "BB25HBX",
        optionLabel: "S (Y)",
        canonicalLabel: "S (2Y)",
        sizeGuideKey: "baby-S",
      },
    ]);
  });

  it("keeps the generated seed SQL in sync with the JSON", () => {
    const committed = readFileSync(resolve(root, "supabase/seed.sql"), "utf8");

    expect(renderSeedSql(data)).toBe(committed);
  });

  it("documents the source snapshot", () => {
    const source = readFileSync(resolve(root, "data/catalog/SOURCE.md"), "utf8");

    expect(source).toContain("Snapshot date: 2026-11-06");
    expect(source).toContain(
      "https://drive.google.com/drive/folders/1FhaHd76Pto0hEG81Q50z_shC03xxLwku",
    );
    expect(source).toContain("475 products");
    expect(source).toContain("1541 variants");
    expect(source).toContain("3224 studio images");
  });
});
