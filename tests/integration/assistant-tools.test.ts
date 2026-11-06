import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", async () => {
  const { serviceClientState } = await import("./support/service-context");

  return {
    createSupabaseServerClient: async () => {
      if (!serviceClientState.current) {
        throw new Error("No service client selected for this test.");
      }

      return serviceClientState.current;
    },
  };
});

import { chatDependencies } from "@/server/assistant";
import { runTool, type ToolContext } from "@/server/assistant/tools";

import { createAnonClient } from "./support/clients";
import { selectServiceClient } from "./support/service-context";

function context(locale: "en" | "vi" = "vi"): ToolContext {
  return { locale, catalog: chatDependencies.catalog, cards: new Map() };
}

async function call(name: string, args: unknown, toolContext = context()) {
  const content = await runTool(name, JSON.stringify(args), toolContext);

  return JSON.parse(content).data;
}

describe("assistant tools on the seeded catalog", () => {
  beforeAll(() => {
    selectServiceClient(createAnonClient());
  });

  it("searches women's swimwear under 400,000 VND and remembers the cards", async () => {
    const toolContext = context();
    const result = await call(
      "searchProducts",
      { query: "swimsuit", gender: ["Women"], maxPriceVnd: 400_000, limit: 5 },
      toolContext,
    );

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(5);

    for (const item of result.items) {
      expect(item.gender).toBe("Women");
      expect(item.priceVnd).toBeLessThanOrEqual(400_000);
      expect(toolContext.cards.get(item.sku)).toMatchObject({
        sku: item.sku,
        priceVnd: item.priceVnd,
        url: `/vi/products/${item.sku}`,
      });
    }
  });

  it("returns variants with stock and a size table for a product", async () => {
    const variants = await call("getAvailableVariants", { sku: "AIMEE" });

    expect(
      variants.variants.map((variant: { optionLabel: string }) => variant.optionLabel),
    ).toEqual(["S", "M", "L", "XL"]);

    const guide = await call("getSizeGuide", { sku: "AIMEE" });

    expect(guide).toMatchObject({
      name: "Demo Size Guide",
      group: "women",
      garment: "full-body",
      measurements: ["chest", "waist", "hips"],
      offeredSizes: ["S", "M", "L", "XL"],
    });
  });

  it("recommends a size from the product's own table and variants", async () => {
    const result = await call("recommendSize", {
      sku: "AIMEE",
      measurements: { chestCm: 86, waistCm: 68, hipsCm: 95 },
    });

    expect(result).toMatchObject({
      sku: "AIMEE",
      status: "recommended",
      reason: "larger_size_when_measurements_differ",
      size: { label: "L", sizeGuideKey: "women-L", inStock: true },
    });

    expect(
      await call("recommendSize", { sku: "BB25CHM", measurements: { heightCm: 100 } }),
    ).toMatchObject({ status: "missing", missing: ["ageMonths"] });
    expect(
      await call("recommendSize", { sku: "GGARRED", measurements: { chestCm: 90 } }),
    ).toMatchObject({ status: "not_applicable" });
  });

  it("reads the configured store policies", async () => {
    const result = await call("getStorePolicies", {}, context("en"));

    expect(result.shipping.standardFeeVnd).toBeGreaterThan(0);
    expect(result.paymentMethods).toEqual(["cod", "bank_transfer"]);
    expect(result.policies.shipping.join(" ")).not.toContain("{threshold}");
  });

  it("reports unknown products and invalid arguments as data", async () => {
    expect(await call("getProductDetails", { sku: "NOPE-123" })).toEqual({
      error: "product_not_found",
    });
    expect(await call("getProductDetails", { sku: "AIMEE", extra: true })).toMatchObject({
      error: "invalid_arguments",
    });
  });
});
