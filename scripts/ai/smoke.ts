/**
 * Live smoke test for the AI provider roles.
 *
 * For the primary and the fallback role it runs a plain chat, a two-round
 * tool call with a stub `searchProducts` tool, and a streamed answer. It
 * prints the model, HTTP status, latency, and whether any reasoning text from
 * the raw response reached the normalized output. API keys are never printed.
 * A failure names the role and its settings; models are never switched here.
 *
 * Usage: pnpm ai:smoke
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getAiConfig, type AiProviderConfig } from "../../src/lib/config/env.ts";
import { ProviderError } from "../../src/server/ai/errors.ts";
import {
  createChatProvider,
  DEFAULT_USER_AGENT,
  providerSettings,
} from "../../src/server/ai/provider.ts";
import type { ChatMessage, ChatProvider, ToolDefinition } from "../../src/server/ai/types.ts";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const envFile = resolve(root, ".env.local");

if (existsSync(envFile)) {
  // Variables already set in the shell take precedence over the file.
  process.loadEnvFile(envFile);
}

type Exchange = {
  status: number;
  latencyMs: number;
  requestBody: Record<string, unknown>;
  raw: Promise<string>;
};

/** Wraps `fetch` to keep a copy of every request body and raw response. */
function recordingFetch(log: Exchange[]): typeof fetch {
  return async (input, init) => {
    const started = performance.now();
    const response = await fetch(input, init);
    const latencyMs = Math.round(performance.now() - started);
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (!response.body) {
      log.push({ status: response.status, latencyMs, requestBody, raw: Promise.resolve("") });
      return response;
    }

    const [forAdapter, forLog] = response.body.tee();
    log.push({ status: response.status, latencyMs, requestBody, raw: new Response(forLog).text() });

    return new Response(forAdapter, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

/** JSON values in a raw response: the body itself, or each SSE `data:` line. */
function rawPayloads(raw: string): unknown[] {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{")) {
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [];
    }
  }

  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((data) => data !== "" && data !== "[DONE]")
    .flatMap((data) => {
      try {
        return [JSON.parse(data) as unknown];
      } catch {
        return [];
      }
    });
}

/** Collects the reasoning text of `thinking` chunks and `reasoning_content`. */
function reasoningIn(raw: string): { chunks: number; text: string } {
  let chunks = 0;
  let text = "";

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;

    if (record.type === "thinking") {
      chunks += 1;
      const inner = record.thinking;

      if (typeof inner === "string") {
        text += inner;
      } else if (Array.isArray(inner)) {
        for (const part of inner) {
          if (
            part &&
            typeof part === "object" &&
            typeof (part as { text?: unknown }).text === "string"
          ) {
            text += (part as { text: string }).text;
          }
        }
      }

      return;
    }

    if (typeof record.reasoning_content === "string") {
      chunks += 1;
      text += record.reasoning_content;
    }

    Object.values(record).forEach(visit);
  };

  rawPayloads(raw).forEach(visit);

  return { chunks, text };
}

const FORBIDDEN_REQUEST_FIELDS = /"(reasoning_content|reasoning|thinking)"\s*:/;

const searchProducts: ToolDefinition = {
  name: "searchProducts",
  description: "Search the swimwear catalog. Returns at most five products with prices in VND.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keywords, for example 'one-piece'." },
      gender: { type: "string", enum: ["Women", "Men", "Kids", "Unisex"] },
      maxPriceVnd: { type: "integer", description: "Highest price in VND." },
    },
    additionalProperties: false,
  },
};

const STUB_RESULTS = [
  { sku: "SMOKE-001", name: "Coral One-Piece", gender: "Women", priceVnd: 359000, inStock: true },
  { sku: "SMOKE-002", name: "Navy Racerback", gender: "Women", priceVnd: 389000, inStock: true },
];

const SYSTEM_PROMPT =
  "You are the shopping assistant of a demo swimwear store. Answer briefly. " +
  "Use the searchProducts tool for any product question and rely only on its results.";

/** `text` is the normalized answer, used for the reasoning leak check. */
type CheckResult = { detail: string; text: string };

async function checkChat(provider: ChatProvider): Promise<CheckResult> {
  const completion = await provider.complete({
    messages: [
      { role: "system", content: "Answer in one short sentence." },
      { role: "user", content: "What is a rash guard?" },
    ],
  });

  if (completion.text.trim() === "") {
    throw new Error("empty answer");
  }

  return {
    detail: `${completion.text.length} chars, finish ${completion.reason}`,
    text: completion.text,
  };
}

async function checkTools(provider: ChatProvider): Promise<CheckResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Tìm giúp mình đồ bơi nữ dưới 400.000đ." },
  ];
  const first = await provider.complete({ messages, tools: [searchProducts] });
  const call = first.toolCalls.find((candidate) => candidate.name === "searchProducts");

  if (!call) {
    throw new Error(`round 1 returned no searchProducts call (finish ${first.reason})`);
  }

  const args = JSON.parse(call.arguments) as Record<string, unknown>;

  messages.push(
    { role: "assistant", content: first.text, toolCalls: first.toolCalls },
    ...first.toolCalls.map((toolCall): ChatMessage => ({
      role: "tool",
      toolCallId: toolCall.id,
      name: toolCall.name,
      content: JSON.stringify(toolCall.name === "searchProducts" ? { items: STUB_RESULTS } : {}),
    })),
  );

  const second = await provider.complete({ messages, tools: [searchProducts] });

  if (second.text.trim() === "") {
    throw new Error(`round 2 returned no answer (finish ${second.reason})`);
  }

  return {
    detail: `args ${JSON.stringify(args)}, answer ${second.text.length} chars`,
    text: first.text + second.text,
  };
}

async function checkStream(provider: ChatProvider): Promise<CheckResult> {
  let text = "";
  let deltas = 0;
  let finish = "none";

  for await (const event of provider.stream({
    messages: [
      { role: "system", content: "Answer in two short sentences." },
      { role: "user", content: "Why does chlorine-resistant fabric matter for swimwear?" },
    ],
  })) {
    if (event.type === "text") {
      text += event.text;
      deltas += 1;
    } else if (event.type === "finish") {
      finish = event.reason;
    }
  }

  if (text.trim() === "" || finish === "none") {
    throw new Error(`stream ended without an answer (finish ${finish})`);
  }

  return { detail: `${deltas} text deltas, ${text.length} chars, finish ${finish}`, text };
}

const CHECKS = [
  { name: "chat", run: checkChat },
  { name: "tools", run: checkTools },
  { name: "stream", run: checkStream },
];

function redact(value: string, secrets: string[]): string {
  return secrets.reduce((text, secret) => (secret ? text.split(secret).join("***") : text), value);
}

function describeError(error: unknown): string {
  if (error instanceof ProviderError) {
    return `${error.kind}${error.status === null ? "" : ` HTTP ${error.status}`}${error.detail ? `: ${error.detail}` : ""}`;
  }

  return error instanceof Error ? error.message : String(error);
}

async function runRole(
  role: "primary" | "fallback",
  config: NonNullable<ReturnType<typeof getAiConfig>>,
  roleConfig: AiProviderConfig,
): Promise<string[]> {
  const prefix = role === "primary" ? "AI_PRIMARY" : "AI_FALLBACK";
  const failures: string[] = [];

  console.log(
    `\n[${role}] ${roleConfig.model} at ${roleConfig.baseUrl}, reasoning_effort ${roleConfig.reasoningEffort ?? "(not sent)"}`,
  );

  for (const { name, run } of CHECKS) {
    const exchanges: Exchange[] = [];
    const provider = createChatProvider(providerSettings(config, roleConfig), {
      fetch: recordingFetch(exchanges),
    });
    const started = performance.now();
    let outcome: CheckResult | Error;
    let output = "";

    try {
      outcome = await run(provider);
      output = outcome.text;
    } catch (error) {
      outcome = new Error(describeError(error));
    }

    const latencyMs = Math.round(performance.now() - started);
    const raws = await Promise.all(exchanges.map((exchange) => exchange.raw.catch(() => "")));
    const reasoning = raws.map(reasoningIn);
    const thinkingChunks = reasoning.reduce((sum, entry) => sum + entry.chunks, 0);
    const reasoningText = reasoning
      .map((entry) => entry.text.trim())
      .filter((text) => text.length >= 12);
    const leaked = reasoningText.some((text) => output.includes(text.slice(0, 40)));
    const badRequest = exchanges.some((exchange) =>
      FORBIDDEN_REQUEST_FIELDS.test(JSON.stringify(exchange.requestBody)),
    );
    const effortMismatch = exchanges.some(
      (exchange) => (exchange.requestBody.reasoning_effort ?? null) !== roleConfig.reasoningEffort,
    );
    const statuses = exchanges.map((exchange) => exchange.status);
    const allOk = statuses.length > 0 && statuses.every((status) => status === 200);
    const passed =
      !(outcome instanceof Error) && allOk && !leaked && !badRequest && !effortMismatch;

    const notes = [
      outcome instanceof Error ? `error: ${outcome.message}` : outcome.detail,
      badRequest ? "request carried a reasoning field" : null,
      effortMismatch ? "reasoning_effort did not match the configuration" : null,
    ].filter(Boolean);

    console.log(
      redact(
        [
          `  ${passed ? "PASS" : "FAIL"} ${name.padEnd(6)}`,
          `HTTP ${statuses.length > 0 ? statuses.join(",") : "-"}`,
          `${latencyMs} ms`,
          `thinking chunks ${thinkingChunks}, leaked ${leaked ? "YES" : "no"}`,
          notes.join("; "),
        ].join(" | "),
        [roleConfig.apiKey],
      ),
    );

    if (!passed) {
      failures.push(
        `${role} ${name}: check ${prefix}_BASE_URL=${roleConfig.baseUrl}, ${prefix}_MODEL=${roleConfig.model}, ${prefix}_REASONING_EFFORT=${roleConfig.reasoningEffort ?? ""}, and ${prefix}_API_KEY`,
      );
    }
  }

  return failures;
}

async function main(): Promise<void> {
  const config = getAiConfig();

  if (!config) {
    console.error("AI is not configured: set AI_PRIMARY_API_KEY in .env.local or the environment.");
    process.exitCode = 1;
    return;
  }

  console.log(
    `User-Agent ${DEFAULT_USER_AGENT}, max_tokens ${config.maxTokens}, timeout ${config.timeoutMs} ms`,
  );

  const failures = await runRole("primary", config, config.primary);

  if (config.fallback) {
    failures.push(...(await runRole("fallback", config, config.fallback)));
  } else {
    failures.push("fallback: not configured, set AI_FALLBACK_API_KEY");
  }

  if (failures.length > 0) {
    console.error(
      `\nSmoke test failed. Models were not changed.\n${failures.map((line) => `- ${line}`).join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nAll checks passed.");
}

await main();
