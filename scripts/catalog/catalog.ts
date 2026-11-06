import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { compareText } from "./text.ts";
import type {
  CatalogData,
  CatalogImage,
  CatalogProduct,
  CatalogSummary,
  CatalogVariantGroup,
  ImportAnomaly,
  ImportReport,
  SizeGuide,
  SourceFileInfo,
  SourceProduct,
  ViTranslations,
} from "./types.ts";

export const SNAPSHOT_DATE = "2026-11-06";
export const SOURCE_URL =
  "https://drive.google.com/drive/folders/1FhaHd76Pto0hEG81Q50z_shC03xxLwku";

export const EXPECTED_COUNTS = {
  products: 475,
  variants: 1541,
  images: 3224,
  productTranslations: 475,
  attributeTranslations: 188,
} as const;

export type ExpectedCounts = { [Key in keyof typeof EXPECTED_COUNTS]: number };

export type ValidationOptions = {
  sourceProducts?: SourceProduct[];
  sizeGuide?: SizeGuide;
  expectedCounts?: Partial<ExpectedCounts>;
};

export const CATALOG_FILE_NAMES = {
  products: "products.json",
  variants: "variants.json",
  images: "images.json",
  report: "import-report.json",
  source: "SOURCE.md",
} as const;

const ATTRIBUTE_FIELDS = {
  category: "category",
  product_type: "productType",
  color: "color",
  color_family: "colorFamily",
  pattern: "pattern",
  material: "material",
  fabric_desc: "fabricDesc",
  fit: "fit",
  length: "length",
  sleeve: "sleeve",
  neckline: "neckline",
  closure: "closure",
  lining: "lining",
  season: "season",
  collection: "collection",
} as const satisfies Record<string, keyof CatalogProduct>;

const KNOWN_ATTRIBUTES = new Set([...Object.keys(ATTRIBUTE_FIELDS), "features"]);
const KNOWN_CATEGORIES = new Set(["Tops", "Bottoms", "Full body", "Accessories"]);
const KNOWN_GENDERS = new Set(["Women", "Men", "Unisex", "Kids", "Baby", "Teen"]);

const GARMENT_BY_CATEGORY: Record<string, "tops" | "bottoms" | "full-body"> = {
  Tops: "tops",
  Bottoms: "bottoms",
  "Full body": "full-body",
};

const IMAGE_PATH_PATTERN = /^studio\/([^/]+)\/(\d{2})$/;
const VARIANT_SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class CatalogValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Catalog validation failed:\n- ${issues.join("\n- ")}`);
    this.name = "CatalogValidationError";
    this.issues = issues;
  }
}

export function buildCatalog(
  input: {
    products: SourceProduct[];
    images: CatalogImage[];
    translations: ViTranslations;
    sizeGuide: SizeGuide;
  },
  options: { expectedCounts?: Partial<ExpectedCounts> } = {},
): CatalogData {
  const sources = new Map(input.products.map((product) => [product.sku, product]));

  if (sources.size !== input.products.length) {
    throw new Error("Products CSV contains a duplicate SKU");
  }

  const sortedSources = [...input.products].sort((left, right) => compareText(left.sku, right.sku));
  const labelMap = buildLabelMap(input.sizeGuide);

  const data: CatalogData = {
    products: sortedSources.map(normalizeProduct),
    variants: sortedSources.map((source) => buildVariantGroup(source, labelMap)),
    images: [...input.images].sort(
      (left, right) => compareText(left.sku, right.sku) || left.position - right.position,
    ),
    translations: input.translations,
  };

  validateCatalogData(data, {
    sourceProducts: input.products,
    sizeGuide: input.sizeGuide,
    expectedCounts: options.expectedCounts,
  });
  return data;
}

export function validateCatalogData(
  data: CatalogData,
  options: ValidationOptions = {},
): CatalogSummary {
  const expected = { ...EXPECTED_COUNTS, ...options.expectedCounts };
  const issues: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) {
      issues.push(message);
    }
  };

  check(
    data.products.length === expected.products,
    `Expected ${expected.products} products, found ${data.products.length}`,
  );

  const productBySku = new Map<string, CatalogProduct>();
  for (const product of data.products) {
    check(!productBySku.has(product.sku), `Duplicate product SKU: ${product.sku}`);
    productBySku.set(product.sku, product);
  }

  for (const product of data.products) {
    check(product.sku.length > 0, "Product has an empty SKU");
    check(product.name.length > 0, `${product.sku} has an empty name`);
    check(product.productType.length > 0, `${product.sku} has an empty product type`);
    check(
      KNOWN_CATEGORIES.has(product.category),
      `${product.sku} has unknown category ${product.category}`,
    );
    check(KNOWN_GENDERS.has(product.gender), `${product.sku} has unknown gender ${product.gender}`);
    check(
      Number.isInteger(product.priceVnd) && product.priceVnd >= 0,
      `${product.sku} has an invalid price`,
    );
    check(product.description.length > 0, `${product.sku} has an empty description`);
    check(product.caption.length > 0, `${product.sku} has an empty caption`);
    check(
      product.features.every((feature) => feature.length > 0),
      `${product.sku} has an empty feature`,
    );
    check(
      new Set(product.features).size === product.features.length,
      `${product.sku} repeats a feature`,
    );
  }

  check(
    data.variants.length === data.products.length,
    `Expected one variant group per product, found ${data.variants.length} groups`,
  );

  const variantGroupBySku = new Map<string, CatalogVariantGroup>();
  const seenVariantSkus = new Set<string>();
  let variantCount = 0;
  let garmentVariants = 0;
  let accessoryVariants = 0;

  for (const group of data.variants) {
    check(!variantGroupBySku.has(group.sku), `Duplicate variant group for ${group.sku}`);
    variantGroupBySku.set(group.sku, group);

    const product = productBySku.get(group.sku);
    check(product !== undefined, `Variant group references unknown product ${group.sku}`);
    check(group.sizes.length > 0, `${group.sku} has no variants`);
    check(new Set(group.sizes).size === group.sizes.length, `${group.sku} repeats an option label`);

    const sizeSet = new Set(group.sizes);
    const stockKeys = Object.keys(group.stockBySize);
    const variantKeys = Object.keys(group.variantSkuBySize);
    const guideKeys = Object.keys(group.sizeGuideKeyBySize);

    check(
      stockKeys.length === sizeSet.size && stockKeys.every((key) => sizeSet.has(key)),
      `${group.sku} stockBySize does not match sizes`,
    );
    check(
      variantKeys.length === sizeSet.size && variantKeys.every((key) => sizeSet.has(key)),
      `${group.sku} variantSkuBySize does not match sizes`,
    );
    check(
      guideKeys.length === sizeSet.size && guideKeys.every((key) => sizeSet.has(key)),
      `${group.sku} sizeGuideKeyBySize does not match sizes`,
    );

    const stockTotal = group.sizes.reduce((sum, size) => sum + (group.stockBySize[size] ?? 0), 0);
    check(
      Number.isInteger(group.stockQty) && group.stockQty >= 0,
      `${group.sku} has an invalid stockQty`,
    );
    check(
      stockTotal === group.stockQty,
      `${group.sku} stockBySize sums to ${stockTotal}, expected ${group.stockQty}`,
    );

    for (const size of group.sizes) {
      variantCount += 1;

      const stock = group.stockBySize[size];
      check(
        Number.isInteger(stock) && stock >= 0,
        `${group.sku} ${size} has an invalid stock value`,
      );

      const variantSku = group.variantSkuBySize[size] ?? "";
      check(
        VARIANT_SKU_PATTERN.test(variantSku),
        `${group.sku} ${size} has an invalid variant SKU`,
      );
      check(!seenVariantSkus.has(variantSku), `Duplicate variant SKU: ${variantSku}`);
      seenVariantSkus.add(variantSku);

      if (group.sizeGuideKeyBySize[size] === null) {
        accessoryVariants += 1;
        check(
          product?.category === "Accessories",
          `${group.sku} ${size} has no size guide key but is not an accessory`,
        );
      } else {
        garmentVariants += 1;
        check(
          product?.category !== "Accessories",
          `${group.sku} ${size} is an accessory with a size guide key`,
        );
      }
    }
  }

  check(
    variantCount === expected.variants,
    `Expected ${expected.variants} variants, found ${variantCount}`,
  );

  for (const product of data.products) {
    check(variantGroupBySku.has(product.sku), `Product ${product.sku} has no variant group`);
  }

  validateImages(data.images, productBySku, options.sourceProducts, expected, issues);
  validateTranslations(data, productBySku, expected, issues);
  validateSizeGuide(data, productBySku, options.sizeGuide ?? null, issues);

  if (issues.length > 0) {
    throw new CatalogValidationError(issues);
  }

  return {
    products: data.products.length,
    variants: variantCount,
    images: data.images.length,
    productTranslations: Object.keys(data.translations.products).length,
    attributeTranslations: countAttributeTranslations(data.translations),
    garmentVariants,
    accessoryVariants,
  };
}

export function buildImportReport(
  data: CatalogData,
  sourceProducts: SourceProduct[],
  sizeGuide: SizeGuide,
  options: { expectedCounts?: Partial<ExpectedCounts> } = {},
): ImportReport {
  const expected = { ...EXPECTED_COUNTS, ...options.expectedCounts };
  const summary = validateCatalogData(data, {
    sourceProducts,
    sizeGuide,
    expectedCounts: options.expectedCounts,
  });
  const sourceBySku = new Map(sourceProducts.map((product) => [product.sku, product]));
  const garmentLabels = new Set(sizeGuide.labelMap.map((label) => label.sourceLabel));

  const anomalies: ImportAnomaly[] = [];

  const duplicateNames = collectDuplicateNames(sourceProducts);
  anomalies.push({
    code: "DUPLICATE_PRODUCT_NAME",
    summary: `${duplicateNames.length} ${plural(
      duplicateNames.length,
      "product name",
    )} shared by ${duplicateNames.reduce(
      (sum, item) => sum + item.skus.length,
      0,
    )} SKUs; the extra rows are kept instead of merged.`,
    count: duplicateNames.length,
    items: duplicateNames,
  });

  const zeroStock = collectZeroStock(data);
  anomalies.push({
    code: "ZERO_STOCK_VARIANT",
    summary: `${zeroStock.count} ${plural(zeroStock.count, "variant")} with zero stock across ${zeroStock.items.length} products.`,
    count: zeroStock.count,
    items: zeroStock.items,
  });

  const outOfStock = sourceProducts
    .filter((product) => product.stockQty === 0)
    .sort((left, right) => compareText(left.sku, right.sku))
    .map((product) => ({ sku: product.sku, name: product.name }));
  anomalies.push({
    code: "OUT_OF_STOCK_PRODUCT",
    summary: `${outOfStock.length} ${plural(outOfStock.length, "product")} with no stock in any variant.`,
    count: outOfStock.length,
    items: outOfStock,
  });

  const nonSizeLabels = collectLabels(data, sourceBySku, (label) => !garmentLabels.has(label));
  anomalies.push({
    code: "NON_SIZE_OPTION_LABEL",
    summary: `${nonSizeLabels.count} ${plural(nonSizeLabels.count, "variant")} with option labels that are not garment sizes, such as "Free size" or a dimension.`,
    count: nonSizeLabels.count,
    items: nonSizeLabels.items,
  });

  const accessorySizeLabels = collectLabels(
    data,
    sourceBySku,
    (label, category) => category === "Accessories" && garmentLabels.has(label),
  );
  anomalies.push({
    code: "ACCESSORY_SIZE_LIKE_LABEL",
    summary: `${accessorySizeLabels.count} accessory ${plural(accessorySizeLabels.count, "variant")} with garment size labels; the size guide key stays null by rule.`,
    count: accessorySizeLabels.count,
    items: accessorySizeLabels.items,
  });

  const emptyFeatures = sourceProducts
    .filter((product) => product.features.length === 0)
    .sort((left, right) => compareText(left.sku, right.sku))
    .map((product) => ({ sku: product.sku, name: product.name }));
  anomalies.push({
    code: "EMPTY_FEATURES",
    summary: `${emptyFeatures.length} ${plural(emptyFeatures.length, "product")} without feature values in the source.`,
    count: emptyFeatures.length,
    items: emptyFeatures,
  });

  const otherBrands = sourceProducts
    .filter((product) => product.brand !== "Sobie")
    .sort((left, right) => compareText(left.sku, right.sku))
    .map((product) => ({ sku: product.sku, brand: product.brand }));
  anomalies.push({
    code: "NON_SOBIE_BRAND",
    summary: `${otherBrands.length} ${plural(otherBrands.length, "product")} without the SOBIE brand label.`,
    count: otherBrands.length,
    items: otherBrands,
  });

  const statusMismatches = sourceProducts
    .filter((product) => (product.stockStatus === "Out of stock") !== (product.stockQty === 0))
    .sort((left, right) => compareText(left.sku, right.sku))
    .map((product) => ({
      sku: product.sku,
      stockStatus: product.stockStatus,
      stockQty: product.stockQty,
    }));

  if (statusMismatches.length > 0) {
    anomalies.push({
      code: "STOCK_STATUS_MISMATCH",
      summary: `${statusMismatches.length} ${plural(statusMismatches.length, "product")} with a stock_status that does not match stock_qty.`,
      count: statusMismatches.length,
      items: statusMismatches,
    });
  }

  const aliases = collectLabelAliases(data, sourceBySku, sizeGuide);
  anomalies.push({
    code: "SIZE_LABEL_ALIAS",
    summary: `${aliases.length} ${plural(aliases.length, "variant")} with an alias label that maps to the same size guide key as a canonical label.`,
    count: aliases.length,
    items: aliases,
  });

  return {
    snapshotDate: SNAPSHOT_DATE,
    source: {
      products: "products.csv",
      inventory: "sobie-drive-inventory.csv",
      translations: "data/translations/vi.json",
      sizeGuide: "data/size-guides/demo-size-guide.json",
    },
    counts: {
      products: summary.products,
      variants: summary.variants,
      images: summary.images,
      productTranslations: summary.productTranslations,
      attributeTranslations: summary.attributeTranslations,
      garmentVariants: summary.garmentVariants,
      accessoryVariants: summary.accessoryVariants,
    },
    checks: [
      {
        name: "products",
        expected: expected.products,
        actual: summary.products,
      },
      {
        name: "variants",
        expected: expected.variants,
        actual: summary.variants,
      },
      {
        name: "images",
        expected: expected.images,
        actual: summary.images,
      },
      {
        name: "productTranslations",
        expected: expected.productTranslations,
        actual: summary.productTranslations,
      },
      {
        name: "attributeTranslations",
        expected: expected.attributeTranslations,
        actual: summary.attributeTranslations,
      },
    ],
    anomalies,
  };
}

export function renderSourceMarkdown(
  report: ImportReport,
  inputs: {
    products: SourceFileInfo;
    inventory: SourceFileInfo;
    translations: SourceFileInfo;
    sizeGuide: SourceFileInfo;
  },
): string {
  const expected = EXPECTED_COUNTS;
  const lines = [
    "# Catalog source",
    "",
    "This directory holds the catalog snapshot used by the seed. The source package stays",
    "outside this repository; the exporter receives its paths as command arguments.",
    "",
    `- Source: SOBIE Drive, <${SOURCE_URL}>`,
    `- Snapshot date: ${SNAPSHOT_DATE}`,
    "- Export command: `pnpm catalog:export --source <products.csv> --inventory <sobie-drive-inventory.csv>`",
    "",
    "## Inputs",
    "",
    "| Input | File | Rows | Bytes | SHA-256 |",
    "| --- | --- | ---: | ---: | --- |",
    `| Products | \`${inputs.products.file}\` | ${inputs.products.rows} | ${inputs.products.bytes} | \`${inputs.products.sha256}\` |`,
    `| Drive inventory | \`${inputs.inventory.file}\` | ${inputs.inventory.rows} | ${inputs.inventory.bytes} | \`${inputs.inventory.sha256}\` |`,
    `| Vietnamese translations | \`${inputs.translations.file}\` | ${inputs.translations.rows} | ${inputs.translations.bytes} | \`${inputs.translations.sha256}\` |`,
    `| Demo size guide | \`${inputs.sizeGuide.file}\` | ${inputs.sizeGuide.rows} | ${inputs.sizeGuide.bytes} | \`${inputs.sizeGuide.sha256}\` |`,
    "",
    "Both CSV files are UTF-8 with a BOM. The exporter reads them with a CSV parser that",
    "handles quoted commas, doubled quotes, and embedded newlines.",
    "",
    "## Columns used",
    "",
    "`products.csv`: `sku`, `article_id`, `product_name`, `product_type`, `category`,",
    "`gender`, `collection`, `color`, `color_family`, `pattern`, `material`,",
    "`fabric_desc`, `sleeve`, `neckline`, `fit`, `length`, `closure`, `lining`,",
    "`features`, `season`, `brand`, `price_vnd`, `sizes`, `stock_qty`,",
    "`stock_by_size`, `variant_sku_by_size`, `stock_status`, `description`,",
    "`caption`, `studio_image_count`.",
    "",
    "`sobie-drive-inventory.csv`: `id`, `name`, `type`, `group`, `folder_path`,",
    "`path`, `sku`.",
    "",
    "## Normalization",
    "",
    "- `features` is split on `|`; empty values are dropped.",
    "- `sizes`, `stock_by_size`, and `variant_sku_by_size` become `sizes`,",
    "  `stockBySize`, and `variantSkuBySize`. The `sizes` entries are the source",
    "  `option_label` values, preserved verbatim.",
    "- `sizeGuideKeyBySize` is derived from `data/size-guides/demo-size-guide.json`.",
    "  Garment variants use the `(gender, option_label)` entry in `labelMap`;",
    "  accessory variants keep `null`. Every mapped key exists in the size guide",
    "  table for the product's garment type.",
    "- Studio images are selected from the inventory rows with `group = studio` and",
    "  `type = image`. Positions are one-based by ascending source file name inside",
    "  each SKU folder. `path` is the size-less media key `studio/<SKU>/<NN>`; the",
    "  media pipeline appends `-<width>.webp`.",
    "- `products.json`, `variants.json`, and `images.json` are sorted by SKU (and",
    "  position for images) so the export is deterministic.",
    "- English descriptions and captions stay in `products.json`. Vietnamese",
    "  descriptions and captions are seeded into `product_translations` with",
    "  `locale = 'vi'`; English falls back to the product row.",
    "",
    "## Validation",
    "",
    "The exporter fails when any of these checks fails:",
    "",
    `- ${expected.products} products and ${expected.products} unique SKUs.`,
    `- ${expected.variants} variants and ${expected.variants} unique variant SKUs.`,
    "- Per product, `sizes`, `stockBySize`, and `variantSkuBySize` have the same",
    "  keys, and the stock sums to `stockQty`.",
    `- ${expected.images} studio images with unique paths and Drive file IDs; every`,
    "  product has at least one image.",
    `- Vietnamese translations cover every SKU and every attribute value (${expected.attributeTranslations}).`,
    "- Every garment variant has a size guide key; every accessory variant has",
    "  `null`.",
    "",
    "## Seed",
    "",
    "`supabase/seed.sql` is generated from these files. It runs as the database",
    "owner during `supabase db reset`; `pnpm db:seed` loads the same rows through",
    "the service role. Both paths insert the initial variant stock directly",
    "because the client INSERT grant on `product_variants` excludes `stock`; later",
    "stock changes go through `admin_adjust_stock` and are audited. Every",
    "statement is idempotent (`ON CONFLICT DO NOTHING`), so a re-run keeps existing",
    "stock and admin edits.",
    "",
    "## Anomalies",
    "",
    "Source anomalies are listed in `import-report.json`; the raw source is never",
    "modified. The report records:",
    "",
    ...report.anomalies.map((anomaly) => `- ${anomaly.summary}`),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

export function parseTranslationsJson(text: string): ViTranslations {
  const value = parseJson(text, "translations");
  const record = requireObject(value, "translations");

  if (record.locale !== "vi" || record.sourceLocale !== "en") {
    throw new Error("Translations must declare locale vi and sourceLocale en");
  }

  const products = requireObject(record.products, "translations.products");
  const attributes = requireObject(record.attributes, "translations.attributes");

  for (const [sku, entry] of Object.entries(products)) {
    const translation = requireObject(entry, `translations.products.${sku}`);
    if (typeof translation.description !== "string" || translation.description.length === 0) {
      throw new Error(`Translation ${sku} is missing a description`);
    }
    if (typeof translation.caption !== "string" || translation.caption.length === 0) {
      throw new Error(`Translation ${sku} is missing a caption`);
    }
  }

  for (const [attribute, values] of Object.entries(attributes)) {
    const labels = requireObject(values, `translations.attributes.${attribute}`);
    for (const [value, label] of Object.entries(labels)) {
      if (typeof label !== "string" || label.length === 0) {
        throw new Error(`Translation ${attribute}.${value} is empty`);
      }
    }
  }

  return {
    locale: "vi",
    sourceLocale: "en",
    method: typeof record.method === "string" ? record.method : "",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    source: typeof record.source === "string" ? record.source : "",
    notice: typeof record.notice === "string" ? record.notice : "",
    attributes: attributes as Record<string, Record<string, string>>,
    products: products as Record<string, { description: string; caption: string }>,
  };
}

export function parseSizeGuideJson(text: string): SizeGuide {
  const value = parseJson(text, "size guide");
  const record = requireObject(value, "size guide");

  if (!Array.isArray(record.labelMap)) {
    throw new Error("Size guide labelMap must be an array");
  }
  if (!Array.isArray(record.tables)) {
    throw new Error("Size guide tables must be an array");
  }

  const labelMap = record.labelMap.map((entry, index) => {
    const label = requireObject(entry, `size guide labelMap[${index}]`);
    return {
      group: requireString(label.group, `labelMap[${index}].group`),
      sourceLabel: requireString(label.sourceLabel, `labelMap[${index}].sourceLabel`),
      sizeGuideKey: requireString(label.sizeGuideKey, `labelMap[${index}].sizeGuideKey`),
    };
  });

  const tables = record.tables.map((entry, index) => {
    const table = requireObject(entry, `size guide tables[${index}]`);
    const garment = requireGarment(table.garment, `tables[${index}].garment`);

    if (!Array.isArray(table.rows) || !Array.isArray(table.measurements)) {
      throw new Error(`Size guide table ${index} is missing rows or measurements`);
    }

    return {
      group: requireString(table.group, `tables[${index}].group`),
      garment,
      measurements: table.measurements.map((measurement) =>
        requireString(measurement, `tables[${index}].measurements`),
      ),
      rows: table.rows.map((row, rowIndex) => {
        const value = requireObject(row, `tables[${index}].rows[${rowIndex}]`);
        return {
          ...value,
          sizeGuideKey: requireString(
            value.sizeGuideKey,
            `tables[${index}].rows[${rowIndex}].sizeGuideKey`,
          ),
          label: requireString(value.label, `tables[${index}].rows[${rowIndex}].label`),
        } as SizeGuide["tables"][number]["rows"][number];
      }),
    };
  });

  return {
    name: typeof record.name === "string" ? record.name : "",
    method: typeof record.method === "string" ? record.method : "",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    unit: typeof record.unit === "string" ? record.unit : "",
    ageUnit: typeof record.ageUnit === "string" ? record.ageUnit : "",
    notice: typeof record.notice === "string" ? record.notice : "",
    labelMap,
    tables,
  };
}

export function loadCatalogData(root = process.cwd()): CatalogData {
  const catalogDir = resolve(root, "data/catalog");

  return {
    products: readJsonFile<CatalogProduct[]>(resolve(catalogDir, CATALOG_FILE_NAMES.products)),
    variants: readJsonFile<CatalogVariantGroup[]>(resolve(catalogDir, CATALOG_FILE_NAMES.variants)),
    images: readJsonFile<CatalogImage[]>(resolve(catalogDir, CATALOG_FILE_NAMES.images)),
    translations: parseTranslationsJson(
      readFileSync(resolve(root, "data/translations/vi.json"), "utf8"),
    ),
  };
}

export function loadSizeGuide(root = process.cwd()): SizeGuide {
  return parseSizeGuideJson(
    readFileSync(resolve(root, "data/size-guides/demo-size-guide.json"), "utf8"),
  );
}

export function summarize(data: CatalogData): CatalogSummary {
  const summary = validateCatalogData(data);
  return summary;
}

function normalizeProduct(source: SourceProduct): CatalogProduct {
  return {
    sku: source.sku,
    articleId: optionalText(source.articleId),
    name: source.name,
    productType: source.productType,
    category: source.category,
    gender: source.gender,
    collection: optionalText(source.collection),
    color: optionalText(source.color),
    colorFamily: optionalText(source.colorFamily),
    pattern: optionalText(source.pattern),
    material: optionalText(source.material),
    fabricDesc: optionalText(source.fabricDesc),
    sleeve: optionalText(source.sleeve),
    neckline: optionalText(source.neckline),
    fit: optionalText(source.fit),
    length: optionalText(source.length),
    closure: optionalText(source.closure),
    lining: optionalText(source.lining),
    features: [...source.features],
    season: optionalText(source.season),
    brand: optionalText(source.brand),
    priceVnd: source.priceVnd,
    description: source.description,
    caption: source.caption,
    isActive: true,
  };
}

function buildVariantGroup(
  source: SourceProduct,
  labelMap: Map<string, string>,
): CatalogVariantGroup {
  const group = source.gender.toLowerCase();
  const sizeGuideKeyBySize: Record<string, string | null> = {};

  for (const size of source.sizes) {
    sizeGuideKeyBySize[size] =
      source.category === "Accessories" ? null : (labelMap.get(`${group}\u0000${size}`) ?? null);
  }

  return {
    sku: source.sku,
    stockQty: source.stockQty,
    sizes: [...source.sizes],
    stockBySize: { ...source.stockBySize },
    variantSkuBySize: { ...source.variantSkuBySize },
    sizeGuideKeyBySize,
  };
}

function buildLabelMap(sizeGuide: SizeGuide): Map<string, string> {
  const labelMap = new Map<string, string>();

  for (const label of sizeGuide.labelMap) {
    const key = `${label.group}\u0000${label.sourceLabel}`;
    const existing = labelMap.get(key);

    if (existing !== undefined && existing !== label.sizeGuideKey) {
      throw new Error(
        `Size guide label ${label.group}/${label.sourceLabel} maps to both ${existing} and ${label.sizeGuideKey}`,
      );
    }

    labelMap.set(key, label.sizeGuideKey);
  }

  return labelMap;
}

function validateImages(
  images: CatalogImage[],
  productBySku: Map<string, CatalogProduct>,
  sourceProducts: SourceProduct[] | undefined,
  expected: ExpectedCounts,
  issues: string[],
): void {
  const check = (condition: boolean, message: string) => {
    if (!condition) {
      issues.push(message);
    }
  };

  check(
    images.length === expected.images,
    `Expected ${expected.images} images, found ${images.length}`,
  );

  const paths = new Set<string>();
  const driveIds = new Set<string>();
  const positionsBySku = new Map<string, number[]>();

  for (const image of images) {
    check(!paths.has(image.path), `Duplicate image path: ${image.path}`);
    paths.add(image.path);

    check(!driveIds.has(image.driveFileId), `Duplicate Drive file ID: ${image.driveFileId}`);
    driveIds.add(image.driveFileId);

    check(productBySku.has(image.sku), `Image references unknown product ${image.sku}`);

    const match = IMAGE_PATH_PATTERN.exec(image.path);
    check(match !== null, `Image path does not follow studio/<SKU>/<NN>: ${image.path}`);

    if (match) {
      check(match[1] === image.sku, `Image path ${image.path} does not match SKU ${image.sku}`);
      check(
        match[2] === String(image.position).padStart(2, "0"),
        `Image path ${image.path} does not match position ${image.position}`,
      );
    }

    const positions = positionsBySku.get(image.sku) ?? [];
    positions.push(image.position);
    positionsBySku.set(image.sku, positions);
  }

  for (const [sku, positions] of positionsBySku) {
    const sorted = [...positions].sort((left, right) => left - right);
    const expected = sorted.map((_, index) => index + 1);
    check(
      sorted.length === expected.length &&
        sorted.every((value, index) => value === expected[index]),
      `Image positions for ${sku} are not contiguous from 1`,
    );
  }

  for (const product of productBySku.values()) {
    check(
      (positionsBySku.get(product.sku)?.length ?? 0) > 0,
      `Product ${product.sku} has no studio image`,
    );
  }

  if (sourceProducts) {
    const sourceBySku = new Map(sourceProducts.map((product) => [product.sku, product]));

    for (const [sku, positions] of positionsBySku) {
      const source = sourceBySku.get(sku);
      check(source !== undefined, `Image references SKU ${sku} missing from the products CSV`);
      if (source) {
        check(
          positions.length === source.studioImageCount,
          `${sku} has ${positions.length} images, expected ${source.studioImageCount}`,
        );
      }
    }

    for (const source of sourceProducts) {
      check(positionsBySku.has(source.sku), `${source.sku} has no studio image in the inventory`);
    }
  }
}

function validateTranslations(
  data: CatalogData,
  productBySku: Map<string, CatalogProduct>,
  expected: ExpectedCounts,
  issues: string[],
): void {
  const check = (condition: boolean, message: string) => {
    if (!condition) {
      issues.push(message);
    }
  };

  const translationSkus = new Set(Object.keys(data.translations.products));
  check(
    translationSkus.size === expected.productTranslations,
    `Expected ${expected.productTranslations} product translations, found ${translationSkus.size}`,
  );

  for (const sku of productBySku.keys()) {
    check(translationSkus.has(sku), `Missing Vietnamese translation for ${sku}`);
  }
  for (const sku of translationSkus) {
    check(productBySku.has(sku), `Translation references unknown SKU ${sku}`);
  }

  const attributeKeys = Object.keys(data.translations.attributes);
  for (const attribute of attributeKeys) {
    check(KNOWN_ATTRIBUTES.has(attribute), `Unknown translated attribute ${attribute}`);
  }

  for (const attribute of KNOWN_ATTRIBUTES) {
    const translated = data.translations.attributes[attribute] ?? {};
    const sourceValues = collectAttributeValues(data.products, attribute);

    check(
      Object.keys(translated).length === sourceValues.size,
      `Translation coverage for ${attribute} is ${Object.keys(translated).length}, expected ${sourceValues.size}`,
    );

    for (const value of sourceValues) {
      check(value in translated, `Missing translation for ${attribute}.${value}`);
    }
    for (const value of Object.keys(translated)) {
      check(sourceValues.has(value), `Translation ${attribute}.${value} has no source value`);
      check(translated[value].trim().length > 0, `Translation ${attribute}.${value} is empty`);
    }
  }

  check(
    countAttributeTranslations(data.translations) === expected.attributeTranslations,
    `Expected ${expected.attributeTranslations} attribute translations, found ${countAttributeTranslations(data.translations)}`,
  );
}

function validateSizeGuide(
  data: CatalogData,
  productBySku: Map<string, CatalogProduct>,
  sizeGuide: SizeGuide | null,
  issues: string[],
): void {
  const check = (condition: boolean, message: string) => {
    if (!condition) {
      issues.push(message);
    }
  };

  if (!sizeGuide) {
    return;
  }

  const labelMap = new Map<string, string>();
  const keysByTable = new Map<string, Set<string>>();

  for (const label of sizeGuide.labelMap) {
    const key = `${label.group}\u0000${label.sourceLabel}`;
    const existing = labelMap.get(key);
    check(
      existing === undefined || existing === label.sizeGuideKey,
      `Size guide label ${label.group}/${label.sourceLabel} is ambiguous`,
    );
    labelMap.set(key, label.sizeGuideKey);
    check(
      label.sizeGuideKey.length > 0,
      `Size guide label ${label.group}/${label.sourceLabel} has an empty key`,
    );
  }

  for (const table of sizeGuide.tables) {
    const tableKey = `${table.group}\u0000${table.garment}`;
    const keys = keysByTable.get(tableKey) ?? new Set<string>();
    for (const row of table.rows) {
      keys.add(row.sizeGuideKey);
    }
    keysByTable.set(tableKey, keys);
  }

  for (const label of sizeGuide.labelMap) {
    const present = [...keysByTable.values()].some((keys) => keys.has(label.sizeGuideKey));
    check(present, `Size guide key ${label.sizeGuideKey} has no table row`);
  }

  for (const group of data.variants) {
    const product = productBySku.get(group.sku);
    if (!product) {
      continue;
    }

    const sizeGroup = product.gender.toLowerCase();
    const garment = GARMENT_BY_CATEGORY[product.category];

    for (const size of group.sizes) {
      const actual = group.sizeGuideKeyBySize[size] ?? null;

      if (product.category === "Accessories") {
        check(actual === null, `${group.sku} ${size} is an accessory but has a size guide key`);
        continue;
      }

      check(garment !== undefined, `${group.sku} has no garment type for ${product.category}`);

      const expected = labelMap.get(`${sizeGroup}\u0000${size}`);
      check(expected !== undefined, `${group.sku} ${size} has no labelMap entry`);
      check(
        expected !== undefined && actual === expected,
        `${group.sku} ${size} uses size guide key ${actual ?? "null"}, expected ${expected ?? "a value"}`,
      );

      if (expected !== undefined && garment !== undefined) {
        const tableKeys = keysByTable.get(`${sizeGroup}\u0000${garment}`);
        check(
          tableKeys?.has(expected) ?? false,
          `${group.sku} ${size} size guide key ${expected} has no ${sizeGroup}/${garment} table row`,
        );
      }
    }
  }
}

function collectDuplicateNames(
  sourceProducts: SourceProduct[],
): { name: string; skus: string[] }[] {
  const byName = new Map<string, string[]>();

  for (const product of sourceProducts) {
    const skus = byName.get(product.name) ?? [];
    skus.push(product.sku);
    byName.set(product.name, skus);
  }

  return [...byName.entries()]
    .filter(([, skus]) => skus.length > 1)
    .sort(([left], [right]) => compareText(left, right))
    .map(([name, skus]) => ({ name, skus: [...skus].sort(compareText) }));
}

function collectZeroStock(data: CatalogData): {
  count: number;
  items: { sku: string; variants: { variantSku: string; optionLabel: string }[] }[];
} {
  const bySku = new Map<string, { variantSku: string; optionLabel: string }[]>();
  let count = 0;

  for (const group of data.variants) {
    for (const size of group.sizes) {
      if (group.stockBySize[size] !== 0) {
        continue;
      }

      count += 1;
      const variants = bySku.get(group.sku) ?? [];
      variants.push({
        variantSku: group.variantSkuBySize[size] ?? "",
        optionLabel: size,
      });
      bySku.set(group.sku, variants);
    }
  }

  return {
    count,
    items: [...bySku.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([sku, variants]) => ({
        sku,
        variants: variants.sort((left, right) => compareText(left.variantSku, right.variantSku)),
      })),
  };
}

function collectLabels(
  data: CatalogData,
  sourceBySku: Map<string, SourceProduct>,
  predicate: (label: string, category: string) => boolean,
): { count: number; items: { label: string; count: number; skus: string[] }[] } {
  const byLabel = new Map<string, string[]>();
  let count = 0;

  for (const group of data.variants) {
    const product = sourceBySku.get(group.sku);
    if (!product) {
      continue;
    }

    for (const size of group.sizes) {
      if (!predicate(size, product.category)) {
        continue;
      }

      count += 1;
      const skus = byLabel.get(size) ?? [];
      skus.push(group.sku);
      byLabel.set(size, skus);
    }
  }

  return {
    count,
    items: [...byLabel.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([label, skus]) => ({
        label,
        count: skus.length,
        skus: [...skus].sort(compareText),
      })),
  };
}

function collectLabelAliases(
  data: CatalogData,
  sourceBySku: Map<string, SourceProduct>,
  sizeGuide: SizeGuide,
): {
  sku: string;
  optionLabel: string;
  canonicalLabel: string;
  sizeGuideKey: string;
}[] {
  const canonical = new Map<string, string>();
  const tableLabels = new Set<string>();

  for (const label of sizeGuide.labelMap) {
    const key = `${label.group}\u0000${label.sizeGuideKey}`;
    if (!canonical.has(key)) {
      canonical.set(key, label.sourceLabel);
    }
  }

  for (const table of sizeGuide.tables) {
    for (const row of table.rows) {
      tableLabels.add(row.label);
    }
  }

  const aliases: {
    sku: string;
    optionLabel: string;
    canonicalLabel: string;
    sizeGuideKey: string;
  }[] = [];

  for (const group of data.variants) {
    const product = sourceBySku.get(group.sku);
    if (!product) {
      continue;
    }

    const sizeGroup = product.gender.toLowerCase();

    for (const size of group.sizes) {
      const sizeGuideKey = group.sizeGuideKeyBySize[size];
      if (!sizeGuideKey || tableLabels.has(size)) {
        continue;
      }

      const canonicalLabel = canonical.get(`${sizeGroup}\u0000${sizeGuideKey}`);
      if (canonicalLabel !== undefined) {
        aliases.push({
          sku: group.sku,
          optionLabel: size,
          canonicalLabel,
          sizeGuideKey,
        });
      }
    }
  }

  return aliases.sort((left, right) => compareText(left.sku, right.sku));
}

function collectAttributeValues(products: CatalogProduct[], attribute: string): Set<string> {
  const values = new Set<string>();

  if (attribute === "features") {
    for (const product of products) {
      for (const feature of product.features) {
        values.add(feature);
      }
    }
    return values;
  }

  const field = ATTRIBUTE_FIELDS[attribute as keyof typeof ATTRIBUTE_FIELDS];
  if (!field) {
    return values;
  }

  for (const product of products) {
    const value = product[field];
    if (typeof value === "string" && value.length > 0) {
      values.add(value);
    }
  }

  return values;
}

function countAttributeTranslations(translations: ViTranslations): number {
  return Object.values(translations.attributes).reduce(
    (total, values) => total + Object.keys(values).length,
    0,
  );
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireGarment(value: unknown, label: string): "tops" | "bottoms" | "full-body" {
  const garment = requireString(value, label);

  if (garment !== "tops" && garment !== "bottoms" && garment !== "full-body") {
    throw new Error(`Unknown size guide garment: ${garment}`);
  }

  return garment;
}

function readJsonFile<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error instanceof Error ? error.message : error}`);
  }
}
