import { describe, expect, it } from "vitest";

import { normalizeSearchTerm } from "@/server/catalog/search";

describe("normalizeSearchTerm", () => {
  it("folds Vietnamese diacritics and đ", () => {
    expect(normalizeSearchTerm("Áo Bơi Đỏ")).toBe("ao boi do");
  });

  it("removes punctuation and collapses whitespace", () => {
    expect(normalizeSearchTerm("  bikini, set!!  ")).toBe("bikini set");
  });

  it("keeps hyphens and digits", () => {
    expect(normalizeSearchTerm("WSA7-01 2-piece")).toBe("wsa7-01 2-piece");
  });

  it("returns an empty string for punctuation only", () => {
    expect(normalizeSearchTerm("!!!")).toBe("");
  });
});
