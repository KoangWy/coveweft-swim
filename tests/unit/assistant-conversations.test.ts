import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decodeConversationCursor,
  encodeConversationCursor,
  titleFromQuestion,
} from "@/server/assistant/conversations";
import { loadProductCards } from "@/server/assistant/cards";
import { getProductBySku } from "@/server/catalog";
import type { ProductDetail } from "@/server/catalog/types";
import { fail, ok } from "@/server/errors";

vi.mock("@/server/catalog", () => ({ getProductBySku: vi.fn() }));
vi.mock("@/server/media", () => ({
  imageUrl: (image: { path: string }, width: number) =>
    `https://media.test/${image.path}-${width}.webp`,
}));

const getProductBySkuMock = vi.mocked(getProductBySku);

function product(sku: string, overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: `id-${sku}`,
    sku,
    name: `Product ${sku}`,
    priceVnd: 350_000,
    category: "Full body",
    gender: "Women",
    productType: "Swimsuit",
    material: "Functional fabric",
    color: "Blue",
    features: [],
    inStock: true,
    description: null,
    caption: null,
    articleId: null,
    collection: null,
    colorFamily: null,
    pattern: null,
    fabricDesc: null,
    sleeve: null,
    neckline: null,
    fit: null,
    length: null,
    closure: null,
    lining: null,
    season: null,
    brand: null,
    isActive: true,
    attributes: [],
    variants: [],
    sizeGuide: null,
    images: [
      {
        id: "img",
        kind: "studio",
        source: "release",
        path: `studio/${sku}/01`,
        position: 1,
        isVisible: true,
      },
    ],
    ...overrides,
  };
}

describe("conversation titles", () => {
  it("keeps a short question unchanged and collapses whitespace", () => {
    expect(titleFromQuestion("  Which   swimsuit is best for laps?  ")).toBe(
      "Which swimsuit is best for laps?",
    );
  });

  it("cuts a long question at a word boundary within sixty characters", () => {
    const question =
      "Which swimsuit should I pick for long lap sessions in chlorinated pools every summer?";
    const title = titleFromQuestion(question);

    expect(title).toBe("Which swimsuit should I pick for long lap sessions in");
  });

  it("keeps a single long word rather than returning an empty title", () => {
    const title = titleFromQuestion("a".repeat(80));

    expect(title).toBe("a".repeat(60));
  });
});

describe("conversation cursor", () => {
  const item = {
    id: "7f1e6a2c-1d8a-4c9a-9a55-8f5b2c1d0e33",
    title: "A conversation",
    updatedAt: "2026-11-14T10:20:30.123456+00:00",
  };

  it("round-trips the sort key", () => {
    expect(decodeConversationCursor(encodeConversationCursor(item))).toEqual({
      updatedAt: item.updatedAt,
      id: item.id,
    });
  });

  it("rejects an opaque value that is not a cursor", () => {
    expect(() => decodeConversationCursor("not-a-cursor")).toThrowError();
    expect(() =>
      decodeConversationCursor(Buffer.from(JSON.stringify({ id: "x" })).toString("base64url")),
    ).toThrowError();
  });
});

describe("product cards rebuilt from stored SKUs", () => {
  beforeEach(() => {
    getProductBySkuMock.mockReset();
  });

  it("uses the current catalog, keeps display order, and drops hidden products", async () => {
    getProductBySkuMock.mockImplementation(async (input) => {
      const { sku } = input as { sku: string };

      if (sku === "GONE") {
        return fail("NOT_FOUND");
      }

      return ok(product(sku));
    });

    const cards = await loadProductCards(["SW100", "GONE", "SW200", "SW100"], "vi");

    expect(cards.map((card) => card.sku)).toEqual(["SW100", "SW200"]);
    expect(cards[0]).toEqual({
      sku: "SW100",
      name: "Product SW100",
      priceVnd: 350_000,
      inStock: true,
      imageUrl: "https://media.test/studio/SW100/01-480.webp",
      url: "/vi/products/SW100",
    });
    expect(getProductBySkuMock).toHaveBeenCalledTimes(3);
  });

  it("drops a card when its image is hidden and caps the list at six", async () => {
    getProductBySkuMock.mockImplementation(async (input) => {
      const { sku } = input as { sku: string };

      return ok(
        product(sku, {
          images: [
            {
              id: "img",
              kind: "studio",
              source: "release",
              path: `studio/${sku}/01`,
              position: 1,
              isVisible: false,
            },
          ],
        }),
      );
    });

    const cards = await loadProductCards(["A1", "A2", "A3", "A4", "A5", "A6", "A7"], "en");

    expect(cards).toHaveLength(6);
    expect(cards[0]?.imageUrl).toBeNull();
    expect(getProductBySkuMock).toHaveBeenCalledTimes(6);
  });
});
