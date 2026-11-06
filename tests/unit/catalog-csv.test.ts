import { describe, expect, it } from "vitest";

import {
  compareText,
  parseCsvRecords,
  parseInventoryCsv,
  parseProductsCsv,
  positionLabel,
} from "../../scripts/catalog/csv.ts";

const PRODUCT_HEADER = [
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
];

const INVENTORY_HEADER = ["id", "name", "type", "group", "folder_path", "path", "sku"];

function productRecord(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    sku: "TEST1",
    article_id: "1001",
    product_name: "Test product",
    product_type: "Tops",
    category: "Tops",
    gender: "Women",
    collection: "Swim",
    color: "Black",
    color_family: "Black",
    pattern: "Solid",
    material: "Fabric",
    fabric_desc: "",
    sleeve: "",
    neckline: "",
    fit: "",
    length: "",
    closure: "",
    lining: "",
    features: "quick-dry|chlorine-resistant",
    season: "All season",
    brand: "Sobie",
    price_vnd: "250000",
    sizes: "S|M",
    stock_qty: "5",
    stock_by_size: '{"S":2,"M":3}',
    variant_sku_by_size: '{"S":"TEST1-1","M":"TEST1-2"}',
    stock_status: "In stock",
    description: "A test product.",
    caption: "a test product",
    studio_image_count: "2",
    ...overrides,
  };
}

function inventoryRecord(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    id: "drive-1",
    name: "TEST1_s01.jpg",
    type: "image",
    group: "studio",
    folder_path: "SOBIE/studio/TEST1",
    path: "SOBIE/studio/TEST1/TEST1_s01.jpg",
    sku: "TEST1",
    ...overrides,
  };
}

function quoteCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvFrom(header: string[], records: Record<string, string>[]): string {
  const rows = [header, ...records.map((record) => header.map((column) => record[column] ?? ""))];
  return `${rows.map((row) => row.map(quoteCsv).join(",")).join("\r\n")}\r\n`;
}

describe("parseCsvRecords", () => {
  it("removes the BOM and keeps quoted commas, quotes, and newlines", () => {
    const text = `\uFEFFname,note\r\n"a, b","line 1\nline ""2"""\r\n`;

    expect(parseCsvRecords(text)).toEqual([{ name: "a, b", note: 'line 1\nline "2"' }]);
  });

  it("rejects empty input", () => {
    expect(() => parseCsvRecords("")).toThrow("no data rows");
  });
});

describe("parseProductsCsv", () => {
  it("normalizes the source columns", () => {
    const [product] = parseProductsCsv(csvFrom(PRODUCT_HEADER, [productRecord()]));

    expect(product).toMatchObject({
      sku: "TEST1",
      name: "Test product",
      features: ["quick-dry", "chlorine-resistant"],
      sizes: ["S", "M"],
      stockQty: 5,
      stockBySize: { S: 2, M: 3 },
      variantSkuBySize: { S: "TEST1-1", M: "TEST1-2" },
      studioImageCount: 2,
    });
  });

  it("rejects a stock total that does not match stock_qty", () => {
    const record = productRecord({ stock_qty: "6" });

    expect(() => parseProductsCsv(csvFrom(PRODUCT_HEADER, [record]))).toThrow(
      "stock_by_size sums to 5",
    );
  });

  it("rejects a stock map that does not match sizes", () => {
    const record = productRecord({ stock_by_size: '{"S":5}' });

    expect(() => parseProductsCsv(csvFrom(PRODUCT_HEADER, [record]))).toThrow(
      "stock_by_size does not match sizes",
    );
  });
});

describe("parseInventoryCsv", () => {
  it("assigns positions by ascending file name and keeps the shared path", () => {
    const result = parseInventoryCsv(
      csvFrom(INVENTORY_HEADER, [
        inventoryRecord({ id: "drive-2", name: "TEST1_s02.jpg" }),
        inventoryRecord({ id: "drive-1", name: "TEST1_s01.jpg" }),
        inventoryRecord({
          id: "drive-3",
          name: "OTHER_s01.jpg",
          folder_path: "SOBIE/studio/OTHER",
          path: "SOBIE/studio/OTHER/OTHER_s01.jpg",
          sku: "OTHER",
        }),
      ]),
    );

    expect(result.totalRows).toBe(3);
    expect(result.studioImageCount).toBe(3);
    expect(result.images).toEqual([
      { sku: "OTHER", position: 1, path: "studio/OTHER/01", driveFileId: "drive-3" },
      { sku: "TEST1", position: 1, path: "studio/TEST1/01", driveFileId: "drive-1" },
      { sku: "TEST1", position: 2, path: "studio/TEST1/02", driveFileId: "drive-2" },
    ]);
  });

  it("rejects a duplicate Drive file ID", () => {
    const records = [
      inventoryRecord({ id: "drive-1", name: "TEST1_s01.jpg" }),
      inventoryRecord({ id: "drive-1", name: "TEST1_s02.jpg" }),
    ];

    expect(() => parseInventoryCsv(csvFrom(INVENTORY_HEADER, records))).toThrow(
      "appears more than once",
    );
  });

  it("rejects a folder that does not match the SKU", () => {
    const record = inventoryRecord({ folder_path: "SOBIE/studio/OTHER" });

    expect(() => parseInventoryCsv(csvFrom(INVENTORY_HEADER, [record]))).toThrow("but has SKU");
  });

  it("rejects more images than the two-digit path allows", () => {
    const records = Array.from({ length: 100 }, (_, index) =>
      inventoryRecord({
        id: `drive-${index}`,
        name: `TEST1_s${String(index + 1).padStart(3, "0")}.jpg`,
      }),
    );

    expect(() => parseInventoryCsv(csvFrom(INVENTORY_HEADER, records))).toThrow(
      "two-digit path convention",
    );
  });
});

describe("positionLabel", () => {
  it("pads one-based positions", () => {
    expect(positionLabel(1)).toBe("01");
    expect(positionLabel(99)).toBe("99");
  });

  it("rejects positions outside the supported range", () => {
    expect(() => positionLabel(0)).toThrow("between 1 and 99");
    expect(() => positionLabel(100)).toThrow("between 1 and 99");
  });
});

describe("compareText", () => {
  it("orders by code unit", () => {
    expect(["b", "A", "a"].sort(compareText)).toEqual(["A", "a", "b"]);
  });
});
