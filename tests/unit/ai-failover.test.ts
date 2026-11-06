import { describe, expect, it, vi } from "vitest";

import {
  createChatProvider,
  ProviderError,
  withFailover,
  withoutToolCalls,
  type ChatMessage,
  type ProviderEvent,
} from "@/server/ai";

import {
  completionBody,
  deltaChunk,
  hangingFetch,
  jsonResponse,
  settings,
  sseResponse,
} from "../support/ai";

async function collect(events: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];

  for await (const event of events) {
    out.push(event);
  }

  return out;
}

function answer(text: string): Response {
  return sseResponse([deltaChunk({ content: text }, "stop"), "data: [DONE]\n\n"]);
}

function providers(primaryFetch: typeof fetch) {
  const fallbackFetch = vi.fn<typeof fetch>(async () => answer("From fallback."));
  const primary = createChatProvider(settings({ timeoutMs: 20 }), { fetch: primaryFetch });
  const fallback = createChatProvider(settings({ model: "small-model", reasoningEffort: null }), {
    fetch: fallbackFetch,
  });

  return { primary, fallback, fallbackFetch };
}

const request = { messages: [{ role: "user" as const, content: "Hi" }] };

describe("withFailover", () => {
  it.each([
    ["HTTP 429", async () => jsonResponse({ message: "rate limited" }, 429)],
    ["HTTP 500", async () => jsonResponse({ message: "boom" }, 500)],
    ["HTTP 503", async () => jsonResponse({ message: "overloaded" }, 503)],
    ["a timeout", hangingFetch()],
  ] as const)("moves to the fallback after %s before any text", async (_label, primaryFetch) => {
    const { primary, fallback, fallbackFetch } = providers(primaryFetch);
    const onFailover = vi.fn();
    const provider = withFailover(primary, fallback, { onFailover });

    const events = await collect(provider.stream(request));

    expect(events).toEqual([
      { type: "text", text: "From fallback." },
      { type: "finish", reason: "stop", usage: null },
    ]);
    expect(fallbackFetch).toHaveBeenCalledOnce();
    expect(onFailover).toHaveBeenCalledOnce();
    expect(provider.model).toBe("small-model");

    const body = JSON.parse(String(fallbackFetch.mock.calls[0]![1]?.body));
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("ends with a retryable error, without the fallback, when the stream breaks after text", async () => {
    const { primary, fallback, fallbackFetch } = providers(async () =>
      sseResponse([deltaChunk({ content: "Half an ans" })], { fail: true }),
    );
    const provider = withFailover(primary, fallback);
    const seen: ProviderEvent[] = [];
    let caught: unknown;

    try {
      for await (const event of provider.stream(request)) {
        seen.push(event);
      }
    } catch (error) {
      caught = error;
    }

    expect(seen).toEqual([{ type: "text", text: "Half an ans" }]);
    expect(caught).toBeInstanceOf(ProviderError);
    expect(caught).toMatchObject({ afterOutput: true, retryable: true });
    expect(fallbackFetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 400, 422, 404])("does not retry HTTP %i", async (status) => {
    const primaryFetch = vi.fn<typeof fetch>(async () => jsonResponse({ message: "no" }, status));
    const { primary, fallback, fallbackFetch } = providers(primaryFetch);
    const provider = withFailover(primary, fallback);

    await expect(collect(provider.stream(request))).rejects.toMatchObject({ status });
    await expect(provider.complete(request)).rejects.toMatchObject({ status });
    expect(primaryFetch).toHaveBeenCalledTimes(2);
    expect(fallbackFetch).not.toHaveBeenCalled();
    expect(provider.model).toBe("reasoning-model");
  });

  it("fails over at most once", async () => {
    const primaryFetch = vi.fn<typeof fetch>(async () => jsonResponse({}, 500));
    const fallbackFetch = vi.fn<typeof fetch>(async () => jsonResponse({}, 503));
    const provider = withFailover(
      createChatProvider(settings(), { fetch: primaryFetch }),
      createChatProvider(settings({ model: "small-model" }), { fetch: fallbackFetch }),
    );

    await expect(collect(provider.stream(request))).rejects.toMatchObject({ status: 503 });
    await expect(provider.complete(request)).rejects.toMatchObject({ status: 503 });
    expect(primaryFetch).toHaveBeenCalledOnce();
    expect(fallbackFetch).toHaveBeenCalledTimes(2);
  });

  it("rethrows the primary error when no fallback is configured", async () => {
    const provider = withFailover(
      createChatProvider(settings(), { fetch: async () => jsonResponse({}, 429) }),
      null,
    );

    await expect(provider.complete(request)).rejects.toMatchObject({ kind: "rate_limit" });
  });

  it("drops the primary's tool calls before the fallback continues the turn", async () => {
    let primaryCalls = 0;
    const primaryFetch: typeof fetch = async () => {
      primaryCalls += 1;

      return primaryCalls === 1
        ? jsonResponse(
            completionBody(
              {
                content: "",
                tool_calls: [
                  {
                    id: "chatcmpl-tool-1",
                    type: "function",
                    function: { name: "searchProducts", arguments: "{}" },
                  },
                ],
              },
              "tool_calls",
            ),
          )
        : jsonResponse({}, 503);
    };
    const fallbackFetch = vi.fn<typeof fetch>(async () =>
      jsonResponse(completionBody({ content: "Fallback answer." })),
    );
    const provider = withFailover(
      createChatProvider(settings(), { fetch: primaryFetch }),
      createChatProvider(settings({ model: "small-model", reasoningEffort: null }), {
        fetch: fallbackFetch,
      }),
    );

    const first = await provider.complete(request);
    const messages: ChatMessage[] = [
      ...request.messages,
      { role: "assistant", content: first.text, toolCalls: first.toolCalls },
      { role: "tool", toolCallId: "chatcmpl-tool-1", name: "searchProducts", content: "[]" },
    ];
    const second = await provider.complete({ messages });

    expect(second.text).toBe("Fallback answer.");

    const body = JSON.parse(String(fallbackFetch.mock.calls[0]![1]?.body));
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
  });
});

describe("withoutToolCalls", () => {
  it("keeps other tool calls and assistant text", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hi" },
      {
        role: "assistant",
        content: "Checking.",
        toolCalls: [
          { id: "a", name: "searchProducts", arguments: "{}" },
          { id: "b", name: "getSizeGuide", arguments: "{}" },
        ],
      },
      { role: "tool", toolCallId: "a", name: "searchProducts", content: "[]" },
      { role: "tool", toolCallId: "b", name: "getSizeGuide", content: "{}" },
      {
        role: "assistant",
        content: "Checking again.",
        toolCalls: [{ id: "c", name: "x", arguments: "{}" }],
      },
    ];

    expect(withoutToolCalls(messages, new Set(["a", "c"]))).toEqual([
      { role: "user", content: "Hi" },
      {
        role: "assistant",
        content: "Checking.",
        toolCalls: [{ id: "b", name: "getSizeGuide", arguments: "{}" }],
      },
      { role: "tool", toolCallId: "b", name: "getSizeGuide", content: "{}" },
      { role: "assistant", content: "Checking again." },
    ]);
  });
});
