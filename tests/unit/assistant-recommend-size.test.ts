import { describe, expect, it } from "vitest";

import { recommendSize, type SizeProduct } from "@/server/assistant/recommend-size";

function product(productType: string, keys: Array<[string, string | null, number?]>): SizeProduct {
  return {
    productType,
    variants: keys.map(([label, key, stock = 5], index) => ({
      variantSku: `SKU-${index}`,
      optionLabel: label,
      sizeGuideKey: key,
      stock,
    })),
  };
}

const womenSwimsuit = product("Swimsuit", [
  ["XS", "women-XS"],
  ["S", "women-S"],
  ["M", "women-M", 0],
  ["L", "women-L"],
  ["2XL", "women-XXL"],
]);

describe("recommendSize", () => {
  it("recommends a women's full-body size when every measurement agrees", async () => {
    const result = await recommendSize(womenSwimsuit, { chestCm: 81, waistCm: 63, hipsCm: 87 });

    expect(result).toMatchObject({
      status: "recommended",
      reason: "all_measurements_agree",
      size: { label: "S", sizeGuideKey: "women-S", variantSku: "SKU-1", stock: 5, inStock: true },
      table: { group: "women", garment: "full-body" },
    });
  });

  it("treats ranges as half-open and picks the larger size when measurements differ", async () => {
    // Chest 84 is the first value of M ([84, 88)); waist and hips are S.
    const result = await recommendSize(womenSwimsuit, { chestCm: 84, waistCm: 63, hipsCm: 87 });

    expect(result).toMatchObject({
      status: "recommended",
      reason: "larger_size_when_measurements_differ",
      size: { label: "M", stock: 0, inStock: false },
    });
  });

  it("uses only the measurements of the garment table (women's bottoms: waist and hips)", async () => {
    const bottoms = product("Swim skirt", [
      ["M", "women-M"],
      ["L", "women-L"],
    ]);

    expect(await recommendSize(bottoms, { waistCm: 71, hipsCm: 95 })).toMatchObject({
      status: "recommended",
      size: { label: "L" },
    });
  });

  it("explains a men's split between top and bottom sizes", async () => {
    const top = product("Rash guard", [
      ["M", "men-M"],
      ["L", "men-L"],
    ]);
    const bottom = product("Jammers", [
      ["M", "men-M"],
      ["L", "men-L"],
    ]);
    const body = { chestCm: 90, waistCm: 79 };

    expect(await recommendSize(top, body)).toMatchObject({ size: { label: "M" } });
    expect(await recommendSize(bottom, body)).toMatchObject({ size: { label: "L" } });
  });

  it("recommends kids sizes from height and chest", async () => {
    const kids = product("Swimsuit", [
      ["S", "kids-S"],
      ["M", "kids-M"],
      ["L", "kids-L"],
    ]);

    expect(await recommendSize(kids, { heightCm: 115, chestCm: 57 })).toMatchObject({
      status: "recommended",
      size: { label: "M" },
      table: { group: "kids" },
    });
  });

  it("recommends teen sizes from the teen table, not the kids table", async () => {
    const teen = product("Rash guard", [
      ["2XL", "teen-2XL"],
      ["3XL", "teen-3XL"],
    ]);

    expect(await recommendSize(teen, { heightCm: 160, chestCm: 75 })).toMatchObject({
      status: "recommended",
      reason: "larger_size_when_measurements_differ",
      size: { label: "3XL" },
      table: { group: "teen" },
    });
  });

  it("recommends baby sizes by group even where the kids scale overlaps", async () => {
    const baby = product("Swimsuit", [
      ["S (2Y)", "baby-S"],
      ["M (3Y)", "baby-M"],
      ["L (4Y)", "baby-L"],
      ["XL (5Y)", "baby-XL"],
    ]);

    // 106 cm is baby XL ([105, 113)) and kids S ([100, 110)); the baby table wins.
    expect(await recommendSize(baby, { heightCm: 106, ageMonths: 56 })).toMatchObject({
      status: "recommended",
      size: { label: "XL (5Y)", sizeGuideKey: "baby-XL" },
      table: { group: "baby" },
    });
    // The end of an age range can fall into the next height row: larger size.
    expect(await recommendSize(baby, { heightCm: 97, ageMonths: 40 })).toMatchObject({
      reason: "larger_size_when_measurements_differ",
      size: { label: "L (4Y)" },
    });
  });

  it("lists missing measurements instead of guessing", async () => {
    expect(await recommendSize(womenSwimsuit, { chestCm: 82 })).toEqual({
      status: "missing",
      missing: ["waistCm", "hipsCm"],
      required: ["chestCm", "waistCm", "hipsCm"],
    });
  });

  it("returns no_fit outside the table", async () => {
    const result = await recommendSize(womenSwimsuit, { chestCm: 120, waistCm: 63, hipsCm: 87 });

    expect(result).toMatchObject({ status: "no_fit", reason: "outside_table" });
  });

  it("returns no_fit when the matching size is not one of the product's variants", async () => {
    // Men's full-body table covers S–XL; this product only has M and L.
    const wetsuit = product("Wetsuit", [
      ["M", "men-M"],
      ["L", "men-L"],
    ]);

    expect(await recommendSize(wetsuit, { chestCm: 85, waistCm: 71 })).toEqual({
      status: "no_fit",
      reason: "size_not_offered",
      matches: [
        { measurement: "chestCm", value: 85, sizeGuideKey: "men-S", label: "S" },
        { measurement: "waistCm", value: 71, sizeGuideKey: "men-S", label: "S" },
      ],
      offeredSizes: ["M", "L"],
    });
  });

  it("is not applicable to accessories", async () => {
    const goggles = product("Swim goggles", [["Free size", null]]);
    const hat = product("Sun hat", [["55-60CM", null]]);

    expect(await recommendSize(goggles, { headCm: 1 } as never)).toEqual({
      status: "not_applicable",
      reason: "no_size_guide",
    });
    expect(await recommendSize(hat, {})).toEqual({
      status: "not_applicable",
      reason: "no_size_guide",
    });
  });
});
