import { describe, expect, it } from "vitest";

import {
  garmentForProductType,
  getSizeGuide,
  groupFromSizeGuideKey,
} from "@/server/catalog/size-guide";

describe("size guide", () => {
  it("maps apparel product types to garments", () => {
    expect(garmentForProductType("Bikini top")).toBe("tops");
    expect(garmentForProductType("Board shorts")).toBe("bottoms");
    expect(garmentForProductType("Swimsuit")).toBe("full-body");
    expect(garmentForProductType("bikini SET")).toBe("full-body");
  });

  it("returns null for accessories and unknown types", () => {
    expect(garmentForProductType("Swim goggles")).toBeNull();
    expect(garmentForProductType("Something else")).toBeNull();
  });

  it("reads the group from a size key", () => {
    expect(groupFromSizeGuideKey("women-M")).toBe("women");
    expect(groupFromSizeGuideKey("baby-S")).toBe("baby");
    expect(groupFromSizeGuideKey("M")).toBeNull();
  });

  it("returns the table for a group and garment", async () => {
    const result = await getSizeGuide({ locale: "en", group: "women", garment: "tops" });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.group).toBe("women");
      expect(result.data.garment).toBe("tops");
      expect(result.data.measurements).toEqual(["chest", "waist"]);
      expect(result.data.rows.length).toBeGreaterThan(0);
      expect(result.data.highlightKey).toBeNull();
    }
  });

  it("highlights a requested size key", async () => {
    const result = await getSizeGuide({ locale: "en", key: "women-M", garment: "tops" });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.highlightKey).toBe("women-M");
      expect(result.data.rows.some((row) => row.sizeGuideKey === "women-M")).toBe(true);
    }
  });

  it("returns NOT_FOUND for an unknown group", async () => {
    const result = await getSizeGuide({ locale: "en", group: "unknown" });

    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", details: { group: "unknown", garment: null } },
    });
  });

  it("rejects an empty query", async () => {
    const result = await getSizeGuide({ locale: "en" });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });
});
