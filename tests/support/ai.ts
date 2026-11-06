import type { ProviderSettings } from "@/server/ai";

export const THINKING = "SECRET-REASONING the customer must never see";

export function settings(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
  return {
    baseUrl: "https://api.example.test/v1/",
    model: "reasoning-model",
    apiKey: "test-key",
    reasoningEffort: "low",
    timeoutMs: 1000,
    maxTokens: 4096,
    ...overrides,
  };
}

/** The three `content` shapes Mistral returns. */
export const CONTENT_SHAPES = {
  string: "Hello there.",
  thinkingOnly: [{ type: "thinking", thinking: [{ type: "text", text: THINKING }] }],
  thinkingThenText: [
    { type: "thinking", thinking: THINKING },
    { type: "text", text: "Hello there." },
  ],
} as const;

export function completionBody(message: Record<string, unknown>, finishReason = "stop") {
  return {
    id: "cmpl-1",
    object: "chat.completion",
    choices: [
      { index: 0, message: { role: "assistant", ...message }, finish_reason: finishReason },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function deltaChunk(delta: Record<string, unknown>, finishReason: string | null = null) {
  return { id: "cmpl-1", choices: [{ index: 0, delta, finish_reason: finishReason }] };
}

/**
 * Builds an SSE response from chunks. Strings are sent verbatim; objects are
 * sent as `data:` events. `fail` errors the body after the chunks.
 */
export function sseResponse(
  chunks: (string | object)[],
  options: { fail?: boolean } = {},
): Response {
  const encoder = new TextEncoder();
  const queue = chunks.map((chunk) =>
    encoder.encode(typeof chunk === "string" ? chunk : `data: ${JSON.stringify(chunk)}\n\n`),
  );
  // Pull-based, so every chunk is read before the stream ends or fails.
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();

      if (next) {
        controller.enqueue(next);
      } else if (options.fail) {
        controller.error(new TypeError("terminated"));
      } else {
        controller.close();
      }
    },
  });

  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/** A fetch stub that never answers until the request is aborted. */
export function hangingFetch(): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    });
}

/**
 * A fetch stub that answers with `status` headers at once, then stalls the
 * body until the request is aborted.
 */
export function stalledBodyFetch(status: number): typeof fetch {
  return async (_input, init) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason));
      },
    });

    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  };
}
