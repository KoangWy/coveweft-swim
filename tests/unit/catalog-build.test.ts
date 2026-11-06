import { describe, expect, it } from "vitest";

import {
  buildCatalog,
  buildImportReport,
  CatalogValidationError,
  renderSourceMarkdown,
  validateCatalogData,
} from "../../scripts/catalog/catalog.ts";
import { renderSeedSql } from "../../scripts/catalog/seed-sql.ts";
import type {
  CatalogData,
  CatalogImage,
  SizeGuide,
  SourceProduct,
  ViTranslations,
} from "../../scripts/catalog/types.ts";

const EXPECTED = {
  products: 3,
  variants: 5,
  images: 4,
  productTranslations: 3,
  attributeTranslations: 15,
};

function sourceProduct(overrides: Partial<SourceProduct> = {}): SourceProduct {
  return {
    sku: "TOP1",
    articleId: "1001",
    name: "Shared name",
    productType: "Tops",
    category: "Tops",
    gender: "Women",
    collection: "Swim",
    color: "Black",
    colorFamily: "Black",
    pattern: "Solid",
    material: "Fabric",
    fabricDesc: "",
    sleeve: "",
    neckline: "",
    fit: "",
    length: "",
    closure: "",
    lining: "",
    features: ["quick-dry"],
    season: "All season",
    brand: "Sobie",
    priceVnd: 250000,
    sizes: ["S", "M"],
    stockQty: 5,
    stockBySize: { S: 2, M: 3 },
    variantSkuBySize: { S: "TOP1-1", M: "TOP1-2" },
    stockStatus: "In stock",
    description: "A test product.",
    caption: "a test product",
    studioImageCount: 2,
    ...overrides,
  };
}

function images(): CatalogImage[] {
  return [
    { sku: "TOP1", position: 2, path: "studio/TOP1/02", driveFileId: "drive-top-2" },
    { sku: "TOP1", position: 1, path: "studio/TOP1/01", driveFileId: "drive-top-1" },
    { sku: "ACC1", position: 1, path: "studio/ACC1/01", driveFileId: "drive-acc-1" },
    { sku: "BABY1", position: 1, path: "studio/BABY1/01", driveFileId: "drive-baby-1" },
  ];
}

function translations(): ViTranslations {
  return {
    locale: "vi",
    sourceLocale: "en",
    method: "machine translation",
    createdAt: "2026-11-06",
    source: "test",
    notice: "test",
    attributes: {
      category: { Tops: "Áo", Accessories: "Phụ kiện", "Full body": "Toàn thân" },
      product_type: { Tops: "Áo", Accessories: "Phụ kiện", Swimsuit: "Đồ bơi" },
      color: { Black: "Đen" },
      color_family: { Black: "Đen" },
      pattern: { Solid: "Trơn" },
      material: { Fabric: "Vải" },
      season: { "All season": "Bốn mùa" },
      collection: { Swim: "Bơi", Accessory: "Phụ kiện" },
      features: { "quick-dry": "Nhanh khô", soft: "Mềm" },
    },
    products: {
      TOP1: { description: "Mô tả", caption: "chú thích" },
      ACC1: { description: "Mô tả", caption: "chú thích" },
      BABY1: { description: "Mô tả", caption: "chú thích" },
    },
  };
}

function sizeGuide(): SizeGuide {
  return {
    name: "Test size guide",
    method: "constructed",
    createdAt: "2026-11-06",
    unit: "cm",
    ageUnit: "months",
    notice: "test",
    labelMap: [
      { group: "women", sourceLabel: "S", sizeGuideKey: "women-S" },
      { group: "women", sourceLabel: "M", sizeGuideKey: "women-M" },
      { group: "baby", sourceLabel: "S (2Y)", sizeGuideKey: "baby-S" },
      { group: "baby", sourceLabel: "S (Y)", sizeGuideKey: "baby-S" },
      { group: "baby", sourceLabel: "M (3Y)", sizeGuideKey: "baby-M" },
    ],
    tables: [
      {
        group: "women",
        garment: "tops",
        measurements: ["chest"],
        rows: [
          { sizeGuideKey: "women-S", label: "S", chest: [80, 84] },
          { sizeGuideKey: "women-M", label: "M", chest: [84, 88] },
        ],
      },
      {
        group: "baby",
        garment: "full-body",
        measurements: ["height"],
        rows: [
          { sizeGuideKey: "baby-S", label: "S (2Y)", height: [81, 89] },
          { sizeGuideKey: "baby-M", label: "M (3Y)", height: [89, 97] },
        ],
      },
    ],
  };
}

function sourceProducts(): SourceProduct[] {
  return [
    sourceProduct(),
    sourceProduct({
      sku: "ACC1",
      articleId: "1002",
      name: "Shared name",
      productType: "Accessories",
      category: "Accessories",
      gender: "Unisex",
      collection: "Accessory",
      features: [],
      priceVnd: 20000,
      sizes: ["Free size"],
      stockQty: 0,
      stockBySize: { "Free size": 0 },
      variantSkuBySize: { "Free size": "ACC1" },
      description: "An accessory.",
      caption: "an accessory",
      studioImageCount: 1,
    }),
    sourceProduct({
      sku: "BABY1",
      articleId: "1003",
      name: "Baby suit",
      productType: "Swimsuit",
      category: "Full body",
      gender: "Baby",
      collection: "Swim",
      features: ["soft"],
      priceVnd: 300000,
      sizes: ["S (Y)", "M (3Y)"],
      stockQty: 4,
      stockBySize: { "S (Y)": 1, "M (3Y)": 3 },
      variantSkuBySize: { "S (Y)": "BABY1-1", "M (3Y)": "BABY1-2" },
      description: "A baby suit.",
      caption: "a baby suit",
      studioImageCount: 1,
    }),
  ];
}

function build(): CatalogData {
  return buildCatalog(
    {
      products: sourceProducts(),
      images: images(),
      translations: translations(),
      sizeGuide: sizeGuide(),
    },
    { expectedCounts: EXPECTED },
  );
}

describe("buildCatalog", () => {
  it("normalizes products, variants, and images", () => {
    const data = build();

    expect(data.products.map((product) => product.sku)).toEqual(["ACC1", "BABY1", "TOP1"]);
    expect(data.products[2]).toMatchObject({
      sku: "TOP1",
      articleId: "1001",
      sleeve: null,
      features: ["quick-dry"],
      isActive: true,
    });
    expect(data.images.map((image) => image.path)).toEqual([
      "studio/ACC1/01",
      "studio/BABY1/01",
      "studio/TOP1/01",
      "studio/TOP1/02",
    ]);

    const top = data.variants.find((group) => group.sku === "TOP1");
    expect(top?.sizeGuideKeyBySize).toEqual({ S: "women-S", M: "women-M" });

    const accessory = data.variants.find((group) => group.sku === "ACC1");
    expect(accessory?.sizeGuideKeyBySize).toEqual({ "Free size": null });

    const baby = data.variants.find((group) => group.sku === "BABY1");
    expect(baby?.sizeGuideKeyBySize).toEqual({ "S (Y)": "baby-S", "M (3Y)": "baby-M" });
  });

  it("rejects a stock total that does not match the variant map", () => {
    const data = build();
    const top = data.variants.find((group) => group.sku === "TOP1");
    if (top) {
      top.stockBySize.S = 99;
    }

    expect(() =>
      validateCatalogData(data, { sizeGuide: sizeGuide(), expectedCounts: EXPECTED }),
    ).toThrow(CatalogValidationError);
  });

  it("rejects duplicate variant SKUs", () => {
    const data = build();
    const accessory = data.variants.find((group) => group.sku === "ACC1");
    if (accessory) {
      accessory.variantSkuBySize["Free size"] = "TOP1-1";
    }

    expect(() =>
      validateCatalogData(data, { sizeGuide: sizeGuide(), expectedCounts: EXPECTED }),
    ).toThrow("Duplicate variant SKU");
  });

  it("rejects an accessory with a size guide key", () => {
    const data = build();
    const accessory = data.variants.find((group) => group.sku === "ACC1");
    if (accessory) {
      accessory.sizeGuideKeyBySize["Free size"] = "women-S";
    }

    expect(() =>
      validateCatalogData(data, { sizeGuide: sizeGuide(), expectedCounts: EXPECTED }),
    ).toThrow("accessory with a size guide key");
  });
});

describe("buildImportReport", () => {
  it("lists the source anomalies without changing the data", () => {
    const products = sourceProducts();
    const data = build();
    const report = buildImportReport(data, products, sizeGuide(), { expectedCounts: EXPECTED });

    expect(report.counts).toMatchObject(EXPECTED);
    expect(report.anomalies.map((anomaly) => anomaly.code)).toEqual([
      "DUPLICATE_PRODUCT_NAME",
      "ZERO_STOCK_VARIANT",
      "OUT_OF_STOCK_PRODUCT",
      "NON_SIZE_OPTION_LABEL",
      "ACCESSORY_SIZE_LIKE_LABEL",
      "EMPTY_FEATURES",
      "NON_SOBIE_BRAND",
      "STOCK_STATUS_MISMATCH",
      "SIZE_LABEL_ALIAS",
    ]);

    expect(report.anomalies[0]).toMatchObject({ count: 1 });
    expect(report.anomalies[1]).toMatchObject({ count: 1 });
    expect(report.anomalies[3]).toMatchObject({ count: 1 });
    expect(report.anomalies[5]).toMatchObject({ count: 1 });
    expect(report.anomalies[7]).toMatchObject({ count: 1 });
    expect(report.anomalies[8]).toMatchObject({
      count: 1,
      items: [
        {
          sku: "BABY1",
          optionLabel: "S (Y)",
          canonicalLabel: "S (2Y)",
          sizeGuideKey: "baby-S",
        },
      ],
    });
  });
});

describe("renderSourceMarkdown", () => {
  it("documents the snapshot and inputs deterministically", () => {
    const data = build();
    const report = buildImportReport(data, sourceProducts(), sizeGuide(), {
      expectedCounts: EXPECTED,
    });
    const inputs = {
      products: { file: "products.csv", rows: 3, bytes: 100, sha256: "a".repeat(64) },
      inventory: { file: "inventory.csv", rows: 10, bytes: 200, sha256: "b".repeat(64) },
      translations: { file: "vi.json", rows: 3, bytes: 300, sha256: "c".repeat(64) },
      sizeGuide: { file: "size-guide.json", rows: 5, bytes: 400, sha256: "d".repeat(64) },
    };

    const markdown = renderSourceMarkdown(report, inputs);

    expect(markdown).toContain("Snapshot date: 2026-11-06");
    expect(markdown).toContain("https://drive.google.com/drive/folders/");
    expect(markdown).toContain("| Products");
    expect(markdown).toContain("ON CONFLICT DO NOTHING");
    expect(markdown).toBe(renderSourceMarkdown(report, inputs));
  });
});

describe("renderSeedSql", () => {
  it("writes idempotent inserts with the release studio images and Vietnamese rows", () => {
    const sql = renderSeedSql(build());

    expect(sql).toContain("on conflict (sku) do nothing");
    expect(sql).toContain("on conflict (variant_sku) do nothing");
    expect(sql).toContain("on conflict (product_id, kind, source, path) do nothing");
    expect(sql).toContain("'studio'");
    expect(sql).toContain("'release'");
    expect(sql).toContain("'vi'");
    expect(sql).toContain("TOP1-1");
    expect(sql).toContain('"stock": 2');
  });

  it("is deterministic", () => {
    const data = build();

    expect(renderSeedSql(data)).toBe(renderSeedSql(data));
  });
});
