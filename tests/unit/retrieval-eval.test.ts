import { describe, expect, it } from "vitest";

import {
  citedSkus,
  parseVndAmounts,
  scoreCase,
  summarize,
  type CatalogTruth,
  type EvalContext,
  type RetrievalCase,
  type TurnRecord,
} from "../support/retrieval-eval";

function product(overrides: Partial<CatalogTruth> & Pick<CatalogTruth, "sku">): CatalogTruth {
  return {
    name: `Product ${overrides.sku}`,
    gender: "Women",
    category: "Full body",
    productType: "Swimsuit",
    material: "Functional fabric",
    colorFamily: "Black",
    caption: "black swimsuit",
    priceVnd: 360_000,
    availableSizes: ["S", "M"],
    ...overrides,
  };
}

const context: EvalContext = {
  truth: new Map(
    [
      product({ sku: "AIMEE", name: "Floral Aimee swimsuit", priceVnd: 560_000 }),
      product({ sku: "GGP", name: "Gorgeous Phoenix swimsuit", priceVnd: 392_000 }),
      product({ sku: "10F1", name: "Night dry bag", productType: "Dry bag", priceVnd: 350_000 }),
    ].map((item) => [item.sku, item]),
  ),
  policyAmounts: [30_000, 50_000, 400_000],
  optionWords: new Set(["S", "M", "L", "XL", "4Y"]),
};

const underBudget: RetrievalCase = {
  id: "T01",
  locale: "vi",
  question: "Đồ bơi nữ dưới 400.000đ",
  kind: "match",
  relevant: (p) => p.productType === "Swimsuit" && p.priceVnd <= 400_000,
};

function turn(overrides: Partial<TurnRecord> = {}): TurnRecord {
  return {
    answer: "- Gorgeous Phoenix swimsuit (GGP): 392.000đ",
    cards: ["GGP"],
    toolCalls: [{ name: "searchProducts", arguments: "{}" }],
    retrieved: ["GGP", "AIMEE"],
    error: null,
    ...overrides,
  };
}

describe("retrieval evaluation scoring", () => {
  it("reads VND amounts in the formats the assistant writes", () => {
    expect(
      parseVndAmounts("₫350,000 · 392.000đ · 560.000 VND · 300k · 200 nghìn · size 6 · 2026"),
    ).toEqual([350_000, 392_000, 560_000, 300_000, 200_000]);
  });

  it("reads SKUs cited in parentheses but not option labels, counts, or abbreviations", () => {
    expect(
      citedSkus(
        "Aimee (AIMEE), size (XL), (4Y), (UPF), (PVC), (SKU: FAKE1), (Women), (28), (10F1)",
        context,
      ),
    ).toEqual(["AIMEE", "FAKE1", "10F1"]);
  });

  it("passes a grounded answer whose cards all match the request", () => {
    const score = scoreCase(underBudget, turn(), context);

    expect(score).toMatchObject({ passed: true, cards: 1, relevantCards: 1, hit: true });
  });

  it("fails a card outside the request and a price that differs from the catalog", () => {
    const score = scoreCase(
      underBudget,
      turn({
        answer:
          "- Gorgeous Phoenix swimsuit (GGP): 392.000đ\n- Floral Aimee swimsuit (AIMEE): 390.000đ",
        cards: ["GGP", "AIMEE"],
      }),
      context,
    );

    expect(score.passed).toBe(false);
    expect(score.relevantCards).toBe(1);
    expect(score.failures).toEqual([
      "cards outside the request: AIMEE",
      "prices that differ from the catalog: 1",
    ]);
  });

  it("fails an invented product: no catalog read, unknown SKU, and its price", () => {
    const score = scoreCase(
      underBudget,
      turn({ answer: "Coral One-Piece (CORAL1): 350.000đ", cards: [], toolCalls: [] }),
      context,
    );

    expect(score.failures).toEqual([
      "answered without reading the catalog",
      "no relevant product card",
      "cited SKUs no tool returned: CORAL1",
      "prices that differ from the catalog: 1",
    ]);
  });

  it("requires a no-match answer to say that nothing matches", () => {
    const surfboards: RetrievalCase = {
      id: "T02",
      locale: "vi",
      question: "Shop có bán ván lướt sóng không?",
      kind: "none",
      relevant: () => false,
    };
    const scores = [
      scoreCase(surfboards, turn({ answer: "Rất tiếc, shop chưa có ván lướt sóng." }), context),
      scoreCase(surfboards, turn({ answer: "Bạn xem thử Night dry bag (10F1) nhé." }), context),
    ];

    expect(scores.map((score) => score.passed)).toEqual([true, false]);
    expect(summarize(scores)).toMatchObject({ cases: 2, passed: 1, abstentionRate: 0.5 });
  });

  it("recognises English no-match answers with adverbs and curly apostrophes", () => {
    const trunks: RetrievalCase = {
      id: "T04",
      locale: "en",
      question: "Men's swim trunks under 100,000 VND?",
      kind: "none",
      relevant: () => false,
    };
    const answers = [
      "We don't currently have any men's swim trunks under 100,000 VND.",
      "I don’t see any men’s swim trunks under 100,000 VND in stock right now.",
      "There's nothing under 100,000 VND at the moment.",
      "Here are our men's swim trunks.",
    ];

    expect(answers.map((answer) => scoreCase(trunks, turn({ answer }), context).passed)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("checks the stock claim for the size the customer asked about", () => {
    const lookup: RetrievalCase = {
      id: "T03",
      locale: "vi",
      question: "Gorgeous Phoenix size XL còn hàng không?",
      kind: "lookup",
      relevant: (p) => p.sku === "GGP",
      size: "XL",
      tools: ["getAvailableVariants"],
    };
    const variants = [{ name: "getAvailableVariants", arguments: '{"sku":"GGP"}' }];

    expect(
      scoreCase(lookup, turn({ answer: "Size XL đã hết hàng.", toolCalls: variants }), context)
        .passed,
    ).toBe(true);
    expect(
      scoreCase(lookup, turn({ answer: "Size XL vẫn còn hàng nhé." }), context).failures,
    ).toEqual(["did not call getAvailableVariants", "did not say that size XL is out of stock"]);
  });
});
