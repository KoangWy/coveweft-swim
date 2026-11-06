import { describe, expect, it } from "vitest";

import { loadCatalogData } from "../../scripts/catalog/catalog.ts";
import { buildSeedRows } from "../../scripts/catalog/seed.ts";

const data = loadCatalogData();
const plan = buildSeedRows(data);

describe("buildSeedRows", () => {
  it("plans every catalog row", () => {
    expect(plan.products).toHaveLength(475);
    expect(plan.variants).toHaveLength(1541);
    expect(plan.images).toHaveLength(3224);
    expect(plan.productTranslations).toHaveLength(475);
    expect(plan.attributeTranslations).toHaveLength(188);
    expect(plan.storeSettings).toEqual([{ id: 1 }]);
  });

  it("maps a garment variant with its stock and size guide key", () => {
    const variant = plan.variants.find((row) => row.variant_sku === "JAP5-1");

    expect(variant).toEqual({
      sku: "JAP5",
      variant_sku: "JAP5-1",
      option_label: "S",
      size_guide_key: "men-S",
      stock: 38,
      position: 1,
    });
  });

  it("keeps accessory size guide keys null", () => {
    const variant = plan.variants.find((row) => row.variant_sku === "CUPSVSBZ11-1");

    expect(variant).toMatchObject({
      option_label: "Free size (Black)",
      size_guide_key: null,
    });
  });

  it("marks studio images as release data", () => {
    const image = plan.images.find((row) => row.path === "studio/10F1/01");

    expect(image).toEqual({
      sku: "10F1",
      kind: "studio",
      source: "release",
      path: "studio/10F1/01",
      position: 1,
      drive_file_id: "1kTbq9Fzh357FCmc-ohU-PGL21xw1firJ",
    });
  });

  it("plans Vietnamese product and attribute translations", () => {
    expect(plan.productTranslations.find((row) => row.sku === "JAP5")).toMatchObject({
      locale: "vi",
      description: expect.stringContaining("Sowave"),
    });
    expect(plan.attributeTranslations).toContainEqual({
      attribute: "category",
      value: "Accessories",
      locale: "vi",
      label: "Phụ kiện",
    });
  });
});
