import { writeFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

import { getAiConfig, type AiConfig } from "@/lib/config/env";
import {
  createChatProvider,
  providerSettings,
  type ChatProvider,
  type ToolCall,
} from "@/server/ai";
import { chatDependencies, runAssistantTurn, type AssistantCatalog } from "@/server/assistant";

import {
  scoreCase,
  summarize,
  type CaseScore,
  type CatalogTruth,
  type EvalContext,
  type RetrievalCase,
  type TurnRecord,
} from "../support/retrieval-eval";
import { createAnonClient } from "./support/clients";
import { loadAiEnv } from "./support/env";
import { selectServiceClient } from "./support/service-context";

// Calls the real model once per case and spends API credit, so it only runs
// when asked. AI_LIVE_EVAL_ROLE picks the model role (default primary), and
// AI_LIVE_EVAL_REPORT names a JSON file for the transcripts and scores:
// AI_LIVE_EVAL=1 pnpm test:integration tests/integration/assistant-retrieval.test.ts
const enabled = process.env.AI_LIVE_EVAL === "1";
const role = process.env.AI_LIVE_EVAL_ROLE === "fallback" ? "fallback" : "primary";

const BLACK = (p: CatalogTruth) => p.colorFamily === "Black" || /\bblack\b/i.test(p.caption);

/**
 * Questions a customer would type, with the catalog rows that answer them.
 * Expected products are selected by attributes, so the cases follow the
 * seeded catalog instead of a fixed SKU list.
 */
const CASES: RetrievalCase[] = [
  {
    id: "M01",
    locale: "vi",
    question: "Tìm giúp mình đồ bơi một mảnh cho nữ, giá dưới 400.000đ.",
    kind: "match",
    relevant: (p) =>
      p.gender === "Women" &&
      ["Swimsuit", "Monokini", "Swim dress"].includes(p.productType) &&
      p.priceVnd <= 400_000,
  },
  {
    id: "M02",
    locale: "en",
    question: "Show me men's jammers that are still available in size L.",
    kind: "match",
    relevant: (p) =>
      p.gender === "Men" && p.productType === "Jammers" && p.availableSizes.includes("L"),
  },
  {
    id: "M03",
    locale: "vi",
    question: "Bé nhà mình 6 tuổi, cần áo bơi chống nắng (rash guard) cho bé.",
    kind: "match",
    relevant: (p) => p.gender === "Kids" && p.productType === "Rash guard",
  },
  {
    id: "M04",
    locale: "en",
    question: "I'm looking for a silicone swim cap.",
    kind: "match",
    relevant: (p) => p.productType === "Swim cap" && p.material === "Silicone",
  },
  {
    id: "M05",
    locale: "vi",
    question: "Quần short đi biển cho nam tầm 200 đến 300 nghìn có mẫu nào không?",
    kind: "match",
    relevant: (p) =>
      p.gender === "Men" &&
      ["Beach shorts", "Board shorts"].includes(p.productType) &&
      p.priceVnd >= 200_000 &&
      p.priceVnd <= 300_000,
  },
  {
    id: "M06",
    locale: "vi",
    question: "Mình muốn tìm đồ bơi nữ màu đen.",
    kind: "match",
    relevant: (p) => p.gender === "Women" && p.category !== "Accessories" && BLACK(p),
  },
  {
    id: "M07",
    locale: "en",
    question: "Do you sell waterproof dry bags?",
    kind: "match",
    relevant: (p) => p.productType === "Dry bag",
  },
  {
    id: "M08",
    locale: "vi",
    question: "do boi cho tre em duoi 300k",
    kind: "match",
    relevant: (p) =>
      ["Kids", "Baby", "Teen"].includes(p.gender) &&
      p.category !== "Accessories" &&
      p.priceVnd <= 300_000,
  },
  {
    id: "M09",
    locale: "vi",
    question: "Có quần bơi nào cho tuổi teen không?",
    kind: "match",
    relevant: (p) => p.gender === "Teen" && p.category === "Bottoms",
  },
  {
    id: "M10",
    locale: "en",
    question: "What is the cheapest swim cap you have?",
    kind: "match",
    relevant: (p) => p.productType === "Swim cap",
    cheapest: true,
  },
  {
    id: "L01",
    locale: "vi",
    question: "Cho mình xem đồ bơi Floral Aimee.",
    kind: "lookup",
    relevant: (p) => p.sku === "AIMEE",
  },
  {
    id: "L02",
    locale: "en",
    question: "How much is the Night dry bag?",
    kind: "lookup",
    relevant: (p) => p.sku === "10F1",
  },
  {
    id: "L03",
    locale: "vi",
    question: "Đồ bơi Gorgeous Lyra size XL còn hàng không?",
    kind: "lookup",
    relevant: (p) => p.sku === "GGL",
    size: "XL",
    tools: ["getAvailableVariants"],
  },
  {
    id: "L04",
    locale: "en",
    question: "Tell me about product AQM3.",
    kind: "lookup",
    relevant: (p) => p.sku === "AQM3",
  },
  {
    id: "N01",
    locale: "vi",
    question: "Shop có bán ván lướt sóng không?",
    kind: "none",
    relevant: (p) => /surfboard/i.test(p.productType) || /surfboard|ván/i.test(p.name),
  },
  {
    id: "N02",
    locale: "vi",
    question: "Có đồ lặn giữ nhiệt (wetsuit) cho em bé 1 tuổi không?",
    kind: "none",
    relevant: (p) => p.gender === "Baby" && p.productType === "Wetsuit",
  },
  {
    id: "N03",
    locale: "en",
    question: "Do you have men's swim trunks under 100,000 VND?",
    kind: "none",
    relevant: (p) => p.gender === "Men" && p.category === "Bottoms" && p.priceVnd <= 100_000,
  },
];

type CatalogRow = {
  sku: string;
  name: string;
  gender: string;
  category: string;
  product_type: string;
  material: string | null;
  color_family: string | null;
  caption_en: string | null;
  price_vnd: number;
  variant_labels: string[];
  available_variant_labels: string[];
};

/** Reads the catalog the way a visitor sees it: active products only. */
async function loadContext(): Promise<EvalContext> {
  const { data, error } = await createAnonClient()
    .from("catalog_products")
    .select(
      "sku, name, gender, category, product_type, material, color_family, caption_en, price_vnd, variant_labels, available_variant_labels",
    );

  if (error) {
    throw error;
  }

  const rows = data as CatalogRow[];
  const settings = await chatDependencies.catalog.getStoreSettings();

  if (!settings.ok) {
    throw new Error("Could not read the store settings.");
  }

  return {
    truth: new Map(
      rows.map((row) => [
        row.sku,
        {
          sku: row.sku,
          name: row.name,
          gender: row.gender,
          category: row.category,
          productType: row.product_type,
          material: row.material,
          colorFamily: row.color_family,
          caption: row.caption_en ?? "",
          priceVnd: row.price_vnd,
          availableSizes: row.available_variant_labels,
        },
      ]),
    ),
    policyAmounts: [
      settings.data.standardShippingFeeVnd,
      settings.data.expressShippingFeeVnd,
      settings.data.freeStandardShippingThresholdVnd,
    ],
    optionWords: new Set(rows.flatMap((row) => row.variant_labels.join(" ").match(/\w+/g) ?? [])),
  };
}

/** Passes the provider through and keeps every tool call the model makes. */
function recordToolCalls(provider: ChatProvider, calls: ToolCall[]): ChatProvider {
  return {
    get model() {
      return provider.model;
    },
    async *stream(request) {
      for await (const event of provider.stream(request)) {
        if (event.type === "tool_call") {
          calls.push({ id: event.id, name: event.name, arguments: event.arguments });
        }

        yield event;
      }
    },
    complete: (request) => provider.complete(request),
  };
}

/** Passes the catalog through and keeps the product and variant SKUs each read returned. */
function recordRetrieved(catalog: AssistantCatalog, skus: Set<string>): AssistantCatalog {
  return {
    ...catalog,
    async listProducts(input) {
      const result = await catalog.listProducts(input);

      if (result.ok) {
        result.data.items.forEach((item) => skus.add(item.sku));
      }

      return result;
    },
    async getProductBySku(input) {
      const result = await catalog.getProductBySku(input);

      if (result.ok) {
        skus.add(result.data.sku);
        result.data.variants.forEach((variant) => skus.add(variant.variantSku));
      }

      return result;
    },
  };
}

async function runCase(
  config: AiConfig,
  testCase: RetrievalCase,
): Promise<TurnRecord & { latencyMs: number }> {
  const roleConfig = role === "primary" ? config.primary : config.fallback!;
  const calls: ToolCall[] = [];
  const retrieved = new Set<string>();
  const started = Date.now();
  let answer = "";
  let cards: string[] = [];
  let error: string | null = null;

  for await (const event of runAssistantTurn({
    provider: recordToolCalls(createChatProvider(providerSettings(config, roleConfig)), calls),
    history: [{ role: "user", content: testCase.question }],
    locale: testCase.locale,
    catalog: recordRetrieved(chatDependencies.catalog, retrieved),
    limits: config.limits,
  })) {
    if (event.type === "delta") {
      answer += event.text;
    } else if (event.type === "products") {
      cards = event.items.map((item) => item.sku);
    } else {
      error = event.code;
    }
  }

  return {
    answer,
    cards,
    toolCalls: calls.map(({ name, arguments: args }) => ({ name, arguments: args })),
    retrieved: [...retrieved],
    error,
    latencyMs: Date.now() - started,
  };
}

describe.skipIf(!enabled)("assistant product retrieval evaluation", () => {
  let config: AiConfig;
  let context: EvalContext;
  const results: Array<{
    question: string;
    turn: TurnRecord & { latencyMs: number };
    score: CaseScore;
  }> = [];

  beforeAll(async () => {
    loadAiEnv();
    selectServiceClient(createAnonClient());
    config = getAiConfig()!;
    context = await loadContext();
  });

  afterAll(() => {
    if (results.length === 0) {
      return;
    }

    const summary = summarize(results.map((result) => result.score));
    const model = role === "primary" ? config.primary.model : config.fallback!.model;

    console.log(
      [
        `${model} (${role}): ${summary.passed}/${summary.cases} cases passed`,
        ...results.map(
          ({ score, turn }) =>
            `  ${score.passed ? "PASS" : "FAIL"} ${score.id} ${turn.latencyMs} ms, cards ${score.relevantCards}/${score.cards}${score.failures.length > 0 ? `: ${score.failures.join("; ")}` : ""}`,
        ),
        `  ${JSON.stringify(summary)}`,
      ].join("\n"),
    );

    if (process.env.AI_LIVE_EVAL_REPORT) {
      writeFileSync(
        process.env.AI_LIVE_EVAL_REPORT,
        `${JSON.stringify({ model, role, summary, results }, null, 2)}\n`,
      );
    }
  });

  it.each(CASES)(
    "$id: $question",
    async (testCase) => {
      expect(config?.[role], `AI ${role} role is not configured`).toBeTruthy();

      const expected = [...context.truth.values()].filter(testCase.relevant);

      // Guards the case itself: the catalog must still hold the answer.
      if (testCase.kind === "none") {
        expect(expected).toEqual([]);
      } else if (testCase.kind === "lookup") {
        expect(expected).toHaveLength(1);
      } else {
        expect(expected.length).toBeGreaterThan(0);
      }

      const turn = await runCase(config, testCase);
      const score = scoreCase(testCase, turn, context);
      results.push({ question: testCase.question, turn, score });

      expect(score.failures).toEqual([]);
    },
    120_000,
  );
});
