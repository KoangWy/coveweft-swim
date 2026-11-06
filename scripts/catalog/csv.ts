import { parse } from "csv-parse/sync";

import { compareText } from "./text.ts";
import type { CatalogImage, SourceProduct } from "./types.ts";

/** Positions use two digits, so a SKU folder can hold at most 99 photos. */
export const MAX_POSITION = 99;

const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const PRODUCT_COLUMNS = [
  "sku",
  "article_id",
  "product_name",
  "product_type",
  "category",
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
  "features",
  "season",
  "brand",
  "price_vnd",
  "sizes",
  "stock_qty",
  "stock_by_size",
  "variant_sku_by_size",
  "stock_status",
  "description",
  "caption",
  "studio_image_count",
] as const;

const INVENTORY_COLUMNS = ["id", "name", "type", "group", "folder_path", "path", "sku"] as const;

export type InventoryParseResult = {
  images: CatalogImage[];
  totalRows: number;
  studioImageCount: number;
};

/**
 * Reads the RFC 4180 style CSV used by the SOBIE export. The files are UTF-8
 * with a BOM; `bom` removes it before the header row is mapped.
 */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const records = parse(text, {
    bom: true,
    columns: (header: string[]) => header.map((name) => name.trim()),
    skip_empty_lines: true,
  }) as Record<string, string>[];

  if (records.length === 0) {
    throw new Error("CSV input has no data rows");
  }

  return records;
}

export function parseProductsCsv(text: string): SourceProduct[] {
  const records = parseCsvRecords(text);
  assertColumns(records, PRODUCT_COLUMNS, "products CSV");

  return records.map((record, index) => {
    const sku = requiredText(record, "sku", index);
    const sizes = splitList(record.sizes);
    const stockBySize = parseIntegerRecord(record.stock_by_size, `${sku} stock_by_size`);
    const variantSkuBySize = parseStringRecord(
      record.variant_sku_by_size,
      `${sku} variant_sku_by_size`,
    );

    const product: SourceProduct = {
      sku,
      articleId: record.article_id.trim(),
      name: requiredText(record, "product_name", index),
      productType: requiredText(record, "product_type", index),
      category: requiredText(record, "category", index),
      gender: requiredText(record, "gender", index),
      collection: record.collection.trim(),
      color: record.color.trim(),
      colorFamily: record.color_family.trim(),
      pattern: record.pattern.trim(),
      material: record.material.trim(),
      fabricDesc: record.fabric_desc.trim(),
      sleeve: record.sleeve.trim(),
      neckline: record.neckline.trim(),
      fit: record.fit.trim(),
      length: record.length.trim(),
      closure: record.closure.trim(),
      lining: record.lining.trim(),
      features: splitList(record.features),
      season: record.season.trim(),
      brand: record.brand.trim(),
      priceVnd: parseInteger(record.price_vnd, `${sku} price_vnd`),
      sizes,
      stockQty: parseInteger(record.stock_qty, `${sku} stock_qty`),
      stockBySize,
      variantSkuBySize,
      stockStatus: record.stock_status.trim(),
      description: record.description.trim(),
      caption: record.caption.trim(),
      studioImageCount: parseInteger(record.studio_image_count, `${sku} studio_image_count`),
    };

    validateSourceProduct(product);
    return product;
  });
}

/**
 * Selects the studio photo nodes and assigns the shared position convention.
 * Positions are one-based and follow ascending file names inside each SKU
 * folder; the returned list is sorted by SKU and then position.
 */
export function parseInventoryCsv(text: string): InventoryParseResult {
  const records = parseCsvRecords(text);
  assertColumns(records, INVENTORY_COLUMNS, "inventory CSV");

  const bySku = new Map<string, { id: string; name: string }[]>();
  const seenIds = new Set<string>();

  for (const record of records) {
    if (record.type.trim() !== "image" || record.group.trim() !== "studio") {
      continue;
    }

    const id = record.id.trim();
    const name = record.name.trim();
    const sku = record.sku.trim();
    const folderPath = record.folder_path.trim();

    if (!DRIVE_ID_PATTERN.test(id)) {
      throw new Error(`Studio image has an invalid Drive file ID: "${id}"`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Studio image Drive file ID appears more than once: ${id}`);
    }
    seenIds.add(id);

    if (!SKU_PATTERN.test(sku) || sku.includes("..")) {
      throw new Error(`Studio image has an invalid SKU: "${sku}"`);
    }
    if (!name || /[/\\]/.test(name)) {
      throw new Error(`Studio image has an invalid file name: "${name}"`);
    }

    const folderName = folderPath.split("/").at(-1);
    if (folderName !== sku) {
      throw new Error(`Studio image ${id} is in folder "${folderPath}" but has SKU "${sku}"`);
    }

    const bucket = bySku.get(sku) ?? [];
    bucket.push({ id, name });
    bySku.set(sku, bucket);
  }

  const images: CatalogImage[] = [];
  for (const sku of [...bySku.keys()].sort(compareText)) {
    const bucket = bySku.get(sku) ?? [];
    bucket.sort((left, right) => compareText(left.name, right.name));

    if (bucket.length > MAX_POSITION) {
      throw new Error(
        `SKU ${sku} has ${bucket.length} studio images; the two-digit path convention allows ${MAX_POSITION}`,
      );
    }

    bucket.forEach((row, index) => {
      const position = index + 1;
      images.push({
        sku,
        position,
        path: `studio/${sku}/${positionLabel(position)}`,
        driveFileId: row.id,
      });
    });
  }

  return { images, totalRows: records.length, studioImageCount: images.length };
}

export function positionLabel(position: number): string {
  if (!Number.isInteger(position) || position < 1 || position > MAX_POSITION) {
    throw new Error(`Position must be an integer between 1 and ${MAX_POSITION}: ${position}`);
  }
  return String(position).padStart(2, "0");
}

function assertColumns(
  records: Record<string, string>[],
  required: readonly string[],
  label: string,
): void {
  const present = new Set(Object.keys(records[0] ?? {}));
  const missing = required.filter((column) => !present.has(column));

  if (missing.length > 0) {
    throw new Error(`${label} is missing required columns: ${missing.join(", ")}`);
  }
}

function requiredText(record: Record<string, string>, column: string, index: number): string {
  const value = record[column]?.trim() ?? "";

  if (!value) {
    throw new Error(`Row ${index + 2} is missing ${column}`);
  }

  return value;
}

function parseInteger(value: string, label: string): number {
  const trimmed = value.trim();

  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`${label} must be an integer, received "${value}"`);
  }

  return Number(trimmed);
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return parsed as Record<string, unknown>;
}

function parseIntegerRecord(value: string, label: string): Record<string, number> {
  const parsed = parseJsonObject(value, label);
  const result: Record<string, number> = {};

  for (const [key, entry] of Object.entries(parsed)) {
    if (!Number.isInteger(entry) || (entry as number) < 0) {
      throw new Error(`${label}.${key} must be a non-negative integer`);
    }
    result[key] = entry as number;
  }

  return result;
}

function parseStringRecord(value: string, label: string): Record<string, string> {
  const parsed = parseJsonObject(value, label);
  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`${label}.${key} must be a non-empty string`);
    }
    result[key] = entry;
  }

  return result;
}

function splitList(value: string): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function validateSourceProduct(product: SourceProduct): void {
  if (product.priceVnd < 0) {
    throw new Error(`${product.sku} price_vnd must not be negative`);
  }
  if (product.stockQty < 0) {
    throw new Error(`${product.sku} stock_qty must not be negative`);
  }
  if (product.studioImageCount < 0) {
    throw new Error(`${product.sku} studio_image_count must not be negative`);
  }
  if (product.sizes.length === 0) {
    throw new Error(`${product.sku} has no sizes`);
  }
  if (new Set(product.sizes).size !== product.sizes.length) {
    throw new Error(`${product.sku} repeats an option label in sizes`);
  }

  const sizeSet = new Set(product.sizes);
  const stockKeys = Object.keys(product.stockBySize);
  const variantKeys = Object.keys(product.variantSkuBySize);

  if (stockKeys.length !== sizeSet.size || stockKeys.some((key) => !sizeSet.has(key))) {
    throw new Error(`${product.sku} stock_by_size does not match sizes`);
  }
  if (variantKeys.length !== sizeSet.size || variantKeys.some((key) => !sizeSet.has(key))) {
    throw new Error(`${product.sku} variant_sku_by_size does not match sizes`);
  }

  const stockTotal = Object.values(product.stockBySize).reduce((sum, value) => sum + value, 0);
  if (stockTotal !== product.stockQty) {
    throw new Error(
      `${product.sku} stock_by_size sums to ${stockTotal}, expected stock_qty ${product.stockQty}`,
    );
  }

  if (new Set(Object.values(product.variantSkuBySize)).size !== product.sizes.length) {
    throw new Error(`${product.sku} repeats a variant_sku`);
  }
  if (product.features.some((feature) => feature.length === 0)) {
    throw new Error(`${product.sku} has an empty feature`);
  }
}
