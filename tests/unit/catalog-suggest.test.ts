import { describe, expect, it } from "vitest";

import { SuggestProductsInput } from "@/server/catalog/schemas";
import { rankSuggestions, type SuggestionCandidate } from "@/server/catalog/search";

function candidate(
  name: string,
  overrides: Partial<SuggestionCandidate> = {},
): SuggestionCandidate {
  return {
    id: name.toLowerCase().replaceAll(" ", "-"),
    sku: name,
    name,
    priceVnd: 100_000,
    inStock: true,
    ...overrides,
  };
}

describe("rankSuggestions", () => {
  it("ranks exact, prefix, word-prefix, and substring matches in that order", () => {
    const ranked = rankSuggestions(
      [candidate("Sunset"), candidate("Beach Set"), candidate("Set Sail"), candidate("Set")],
      "set",
    );

    expect(ranked.map((item) => item.name)).toEqual(["Set", "Set Sail", "Beach Set", "Sunset"]);
  });

  it("folds Vietnamese diacritics before comparing", () => {
    const ranked = rankSuggestions([candidate("Bơi"), candidate("Áo bơi")], "ao");

    expect(ranked.map((item) => item.name)).toEqual(["Áo bơi", "Bơi"]);
  });

  it("prefers in-stock products when the name match is equally strong", () => {
    const ranked = rankSuggestions(
      [candidate("Bikini A", { inStock: false }), candidate("Bikini B")],
      "bikini",
    );

    expect(ranked.map((item) => item.name)).toEqual(["Bikini B", "Bikini A"]);
  });

  it("keeps a stable alphabetical order when ranks and stock match", () => {
    const ranked = rankSuggestions(
      [candidate("Bikini Zebra"), candidate("Bikini Alpha")],
      "bikini",
    );

    expect(ranked.map((item) => item.name)).toEqual(["Bikini Alpha", "Bikini Zebra"]);
  });

  it("does not mutate the input list", () => {
    const candidates = [candidate("Sunset"), candidate("Set")];

    rankSuggestions(candidates, "set");

    expect(candidates.map((item) => item.name)).toEqual(["Sunset", "Set"]);
  });
});

describe("SuggestProductsInput", () => {
  it("trims the term and defaults the limit", () => {
    const parsed = SuggestProductsInput.parse({ q: "  bikini  " });

    expect(parsed.q).toBe("bikini");
    expect(parsed.limit).toBe(6);
  });

  it("rejects terms shorter than two characters", () => {
    expect(SuggestProductsInput.safeParse({ q: "b" }).success).toBe(false);
    expect(SuggestProductsInput.safeParse({ q: "   " }).success).toBe(false);
    expect(SuggestProductsInput.safeParse({ q: "bi" }).success).toBe(true);
  });

  it("caps the number of suggestions", () => {
    expect(SuggestProductsInput.safeParse({ q: "bikini", limit: 0 }).success).toBe(false);
    expect(SuggestProductsInput.safeParse({ q: "bikini", limit: 9 }).success).toBe(false);
    expect(SuggestProductsInput.safeParse({ q: "bikini", limit: 8 }).success).toBe(true);
  });
});
