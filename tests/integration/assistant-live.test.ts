import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

import { getAiConfig } from "@/lib/config/env";
import { createAiProvider, createChatProvider, providerSettings, withFailover } from "@/server/ai";
import { chatDependencies, handleChatRequest, type ChatDependencies } from "@/server/assistant";
import { createDatabaseQuotaStore } from "@/server/assistant/quota";

import {
  createAnonClient,
  createCustomer,
  createServiceClient,
  deleteUsers,
  type TestUser,
} from "./support/clients";
import { selectServiceClient } from "./support/service-context";

// Calls the real provider and spends API credit, so it only runs when asked:
// AI_LIVE_SMOKE=1 pnpm test:integration tests/integration/assistant-live.test.ts
const enabled = process.env.AI_LIVE_SMOKE === "1";

function loadAiEnv(): void {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
      const match = /^(AI_[A-Z_]+)=(.*)$/.exec(line.trim());

      if (match && process.env[match[1]!] === undefined) {
        process.env[match[1]!] = match[2]!;
      }
    }
  } catch {
    // The variables may come from the shell instead.
  }
}

const QUESTIONS = [
  "Tìm giúp mình đồ bơi nữ giá dưới 400.000 VND.",
  "Mình có vòng ngực 86 cm, eo 68 cm, hông 95 cm. Đồ bơi AIMEE mình nên mặc size nào?",
];

type SseEvent = { event: string; data: Record<string, unknown> };

async function readEvents(response: Response): Promise<SseEvent[]> {
  return (await response.text())
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const [eventLine, dataLine] = block.split("\n");
      return { event: eventLine!.slice(7), data: JSON.parse(dataLine!.slice(6)) };
    });
}

describe.skipIf(!enabled)("assistant live smoke", () => {
  const service = createServiceClient();
  let customer: TestUser;

  beforeAll(async () => {
    loadAiEnv();
    customer = await createCustomer(service, "assistant-live");
    selectServiceClient(createAnonClient());
  });

  afterAll(async () => {
    await deleteUsers(service, [customer]);
  });

  const toolLog: string[] = [];

  function dependencies(mode: "primary" | "forced-fallback"): ChatDependencies {
    const config = getAiConfig()!;
    const catalog = chatDependencies.catalog;

    return {
      ...chatDependencies,
      catalog: {
        ...catalog,
        listProducts: (input) => {
          toolLog.push(`listProducts ${JSON.stringify(input)}`);
          return catalog.listProducts(input);
        },
        getProductBySku: (input) => {
          toolLog.push(`getProductBySku ${JSON.stringify(input)}`);
          return catalog.getProductBySku(input);
        },
      },
      config: () => config,
      getUser: async () => ({ id: customer.id }),
      quota: () => createDatabaseQuotaStore(service, config.quotas),
      createProvider:
        mode === "primary"
          ? () => createAiProvider()
          : () =>
              withFailover(
                // The primary answers 503, as an overloaded model would.
                createChatProvider(providerSettings(config, config.primary), {
                  fetch: async () => new Response('{"message":"overloaded"}', { status: 503 }),
                }),
                createChatProvider(providerSettings(config, config.fallback!)),
              ),
    };
  }

  it.each([
    ["primary", 0],
    ["primary", 1],
    ["forced-fallback", 0],
    ["forced-fallback", 1],
  ] as const)(
    "answers on %s (question %i)",
    async (mode, index) => {
      const config = getAiConfig();

      expect(config?.fallback).not.toBeNull();

      toolLog.length = 0;
      const started = Date.now();
      const response = await handleChatRequest(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            locale: "vi",
            messages: [{ role: "user", content: QUESTIONS[index] }],
          }),
        }),
        dependencies(mode),
      );
      const events = await readEvents(response);
      const answer = events
        .filter((event) => event.event === "delta")
        .map((event) => event.data.text)
        .join("");
      const products = events.find((event) => event.event === "products")?.data.items as
        Array<Record<string, unknown>> | undefined;
      const report = [
        `--- ${mode} | ${QUESTIONS[index]}`,
        `HTTP ${response.status} | ${Date.now() - started} ms | events: ${events.map((event) => event.event).join(",")}`,
        `answer: ${answer}`,
        `products: ${JSON.stringify((products ?? []).map(({ sku, name, priceVnd, inStock }) => ({ sku, name, priceVnd, inStock })))}`,
        `catalog reads: ${toolLog.join(" | ")}`,
        `last: ${JSON.stringify(events.at(-1))}`,
      ].join("\n");
      const redacted = `${report.replaceAll(config!.primary.apiKey, "[redacted]")}\n\n`;

      console.log(redacted);

      if (process.env.AI_LIVE_SMOKE_REPORT) {
        appendFileSync(process.env.AI_LIVE_SMOKE_REPORT, redacted);
      }

      expect(response.status).toBe(200);
      expect(events.at(-1)?.event).toBe("done");
      expect(answer.trim()).not.toBe("");

      if (index === 0) {
        expect(products?.length ?? 0).toBeGreaterThan(0);

        for (const product of products ?? []) {
          expect(product.priceVnd).toBeLessThanOrEqual(400_000);
        }
      }
    },
    120_000,
  );
});
