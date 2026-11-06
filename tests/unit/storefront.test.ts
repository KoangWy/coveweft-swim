import { describe, expect, it } from "vitest";

import { fieldErrorsFrom, formLocale } from "@/components/ui/form-errors";
import { safeNextPath } from "@/features/auth/components/safe-next";
import {
  hasActiveFilters,
  parseShopQuery,
  shopHref,
  toListProductsInput,
} from "@/features/catalog/components/shop-query";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import { VALIDATION_ISSUE_CODES } from "@/server/errors";

describe("shop query", () => {
  it("parses filters and ignores values that do not parse", () => {
    const query = parseShopQuery({
      q: "  blue suit ",
      group: "kids",
      size: "M",
      feature: ["upf 50+", "upf 50+", "quick dry"],
      min: "500000",
      max: "100000",
      inStock: "1",
      sort: "cheapest",
      page: "-3",
    });

    expect(query).toMatchObject({
      q: "blue suit",
      group: "kids",
      size: "M",
      features: ["upf 50+", "quick dry"],
      priceMin: 100000,
      priceMax: 500000,
      inStock: true,
      sort: "newest",
      page: 1,
    });
    expect(parseShopQuery({ group: "pets", min: "12.5" })).toMatchObject({
      group: undefined,
      priceMin: undefined,
    });
  });

  it("builds hrefs without defaults and resets the page on change", () => {
    const query = parseShopQuery({ category: "Tops", page: "3", sort: "price-asc" });

    expect(shopHref(query)).toBe("/shop?category=Tops&sort=price-asc");
    expect(shopHref(query, { page: 4 })).toBe("/shop?category=Tops&sort=price-asc&page=4");
    expect(shopHref(parseShopQuery({}))).toBe("/shop");
  });

  it("maps header groups to catalog filters, letting explicit filters win", () => {
    expect(toListProductsInput(parseShopQuery({ group: "kids" }), "vi")).toMatchObject({
      locale: "vi",
      gender: ["Kids", "Baby", "Teen"],
    });
    expect(
      toListProductsInput(parseShopQuery({ group: "kids", gender: "Baby" }), "en").gender,
    ).toBe("Baby");
    expect(toListProductsInput(parseShopQuery({ group: "accessories" }), "en").category).toBe(
      "Accessories",
    );
  });

  it("detects active filters", () => {
    expect(hasActiveFilters(parseShopQuery({ sort: "name-asc", page: "2" }))).toBe(false);
    expect(hasActiveFilters(parseShopQuery({ inStock: "1" }))).toBe(true);
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths and strips the locale prefix", () => {
    expect(safeNextPath("/products/BB25CR?variant=1")).toBe("/products/BB25CR?variant=1");
    expect(safeNextPath("/vi/checkout")).toBe("/checkout");
    expect(safeNextPath("/en")).toBe("/");
  });

  it("rejects other origins and malformed values", () => {
    for (const value of ["https://example.com", "//example.com", "/\\example.com", "cart", 7]) {
      expect(safeNextPath(value)).toBe("/account");
    }
  });
});

describe("form helpers", () => {
  it("maps validation issues to one known code per field", () => {
    expect(
      fieldErrorsFrom({
        issues: [
          { field: "email", code: "invalid_format", params: { format: "email" } },
          { field: "email", code: "required" },
          { field: "phone", code: "something_new" },
          { field: "", code: "at_least_one_field" },
        ],
      }),
    ).toEqual({ email: "invalid_format", phone: "unknown" });
    expect(fieldErrorsFrom(undefined)).toEqual({});
  });

  it("reads the submitted locale with a safe default", () => {
    const form = new FormData();
    expect(formLocale(form)).toBe("en");
    form.set("locale", "vi");
    expect(formLocale(form)).toBe("vi");
    form.set("locale", "fr");
    expect(formLocale(form)).toBe("en");
  });

  it.each([
    ["en", en],
    ["vi", vi],
  ])("%s has a message for every validation issue code", (_, messages) => {
    const validation = (messages as { validation: Record<string, string> }).validation;
    expect(VALIDATION_ISSUE_CODES.filter((code) => !validation[code])).toEqual([]);
  });
});
