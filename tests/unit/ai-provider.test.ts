import { describe, expect, it, vi } from "vitest";

import {
  createChatProvider,
  DEFAULT_USER_AGENT,
  ProviderError,
  type ProviderEvent,
} from "@/server/ai";

import {
  completionBody,
  CONTENT_SHAPES,
  deltaChunk,
  hangingFetch,
  jsonResponse,
  settings,
  sseResponse,
  THINKING,
} from "../support/ai";

async function collect(events: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];

  for await (const event of events) {
    out.push(event);
  }

  return out;
}

async function streamError(events: AsyncIterable<ProviderEvent>): Promise<ProviderError> {
  try {
    await collect(events);
  } catch (error) {
    if (error instanceof ProviderError) {
      return error;
    }

    throw error;
  }

  throw new Error("expected the stream to fail");
}

const request = { messages: [{ role: "user" as const, content: "Hi" }] };

describe("createChatProvider", () => {
  it("posts a normalized request with the app User-Agent", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(completionBody({ content: "Hi!" })),
    );
    const provider = createChatProvider(settings(), { fetch: fetchMock });

    await provider.complete(request);

    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;

    expect(url).toBe("https://api.example.test/v1/chat/completions");
    expect(headers["User-Agent"]).toBe(DEFAULT_USER_AGENT);
    expect(DEFAULT_USER_AGENT).toMatch(/^coveweft-swim\/\d+\.\d+\.\d+/);
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "reasoning-model",
      stream: false,
      max_tokens: 4096,
      reasoning_effort: "low",
    });
  });

  it.each(Object.entries(CONTENT_SHAPES))(
    "normalizes %s content in a full response",
    async (_shape, content) => {
      const provider = createChatProvider(settings(), {
        fetch: async () => jsonResponse(completionBody({ content, reasoning_content: THINKING })),
      });
      const completion = await provider.complete(request);

      expect(JSON.stringify(completion)).not.toContain("SECRET-REASONING");
    },
  );

  it("streams the three content shapes without reasoning text", async () => {
    const provider = createChatProvider(settings(), {
      fetch: async () =>
        sseResponse([
          deltaChunk({ role: "assistant", content: CONTENT_SHAPES.thinkingOnly }),
          deltaChunk({ content: CONTENT_SHAPES.thinkingThenText, reasoning_content: THINKING }),
          deltaChunk({ content: " Bye." }),
          deltaChunk({ content: "" }, "stop"),
          { id: "cmpl-1", choices: [], usage: { prompt_tokens: 3, completion_tokens: 4 } },
          "data: [DONE]\n\n",
        ]),
    });
    const events = await collect(provider.stream(request));

    expect(events).toEqual([
      { type: "text", text: "Hello there." },
      { type: "text", text: " Bye." },
      { type: "finish", reason: "stop", usage: { inputTokens: 3, outputTokens: 4 } },
    ]);
    expect(JSON.stringify(events)).not.toContain("SECRET-REASONING");
  });

  it("parses SSE split across reads and CRLF line endings", async () => {
    const event = `data: ${JSON.stringify(deltaChunk({ content: "Split" }, "stop"))}\r\n\r\n`;
    const provider = createChatProvider(settings(), {
      fetch: async () =>
        sseResponse([
          ": keep-alive\n\n",
          event.slice(0, 15),
          event.slice(15, -1),
          event.slice(-1),
          "data: [DONE]\n\n",
        ]),
    });

    expect(await collect(provider.stream(request))).toEqual([
      { type: "text", text: "Split" },
      { type: "finish", reason: "stop", usage: null },
    ]);
  });

  it("assembles streamed tool calls by index and emits them before finish", async () => {
    const provider = createChatProvider(settings(), {
      fetch: async () =>
        sseResponse([
          deltaChunk({ content: CONTENT_SHAPES.thinkingOnly }),
          deltaChunk({
            tool_calls: [
              {
                index: 1,
                id: "call-b",
                type: "function",
                function: { name: "getSizeGuide", arguments: "" },
              },
              {
                index: 0,
                id: "call-a",
                type: "function",
                function: { name: "searchProducts", arguments: '{"gen' },
              },
            ],
          }),
          deltaChunk({ tool_calls: [{ index: 0, function: { arguments: 'der":"Women"}' } }] }),
          deltaChunk({ tool_calls: [{ index: 1, function: { arguments: "{}" } }] }, "tool_calls"),
          "data: [DONE]\n\n",
        ]),
    });

    expect(await collect(provider.stream(request))).toEqual([
      { type: "tool_call", id: "call-a", name: "searchProducts", arguments: '{"gender":"Women"}' },
      { type: "tool_call", id: "call-b", name: "getSizeGuide", arguments: "{}" },
      { type: "finish", reason: "tool_calls", usage: null },
    ]);
  });

  it.each([
    [401, "auth"],
    [402, "auth"],
    [403, "auth"],
    [404, "config"],
    [400, "bad_request"],
    [422, "bad_request"],
    [408, "timeout"],
    [429, "rate_limit"],
    [500, "server"],
    [503, "server"],
  ] as const)("classifies HTTP %i as %s", async (status, kind) => {
    const provider = createChatProvider(settings(), {
      fetch: async () => jsonResponse({ object: "error", message: "nope" }, status),
    });
    const error = await provider.complete(request).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind, status, detail: "nope", afterOutput: false });
    expect(String((error as Error).message)).not.toContain("test-key");
  });

  it("reports a timeout when the provider does not answer", async () => {
    const provider = createChatProvider(settings({ timeoutMs: 20 }), { fetch: hangingFetch() });

    await expect(provider.complete(request)).rejects.toMatchObject({ kind: "timeout" });
    await expect(streamError(provider.stream(request))).resolves.toMatchObject({
      kind: "timeout",
      afterOutput: false,
    });
  });

  it("passes a caller abort through instead of reporting a provider error", async () => {
    const controller = new AbortController();
    const provider = createChatProvider(settings(), { fetch: hangingFetch() });
    const pending = provider.complete({ ...request, signal: controller.signal });

    controller.abort(new DOMException("Stopped", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports a network failure as a server error", async () => {
    const provider = createChatProvider(settings(), {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });

    await expect(provider.complete(request)).rejects.toMatchObject({
      kind: "server",
      status: null,
    });
  });

  it("marks a stream that breaks after text as failed after output", async () => {
    const provider = createChatProvider(settings(), {
      fetch: async () => sseResponse([deltaChunk({ content: "Partial" })], { fail: true }),
    });
    const error = await streamError(provider.stream(request));

    expect(error).toMatchObject({ kind: "server", afterOutput: true, retryable: true });
    expect(error.canFailover).toBe(false);
  });

  it("fails a stream that ends without a finish reason or reports an error event", async () => {
    const truncated = createChatProvider(settings(), {
      fetch: async () => sseResponse([deltaChunk({ content: CONTENT_SHAPES.thinkingOnly })]),
    });
    const errored = createChatProvider(settings(), {
      fetch: async () => sseResponse([{ object: "error", message: "overloaded" }]),
    });

    await expect(streamError(truncated.stream(request))).resolves.toMatchObject({
      kind: "server",
      afterOutput: false,
    });
    await expect(streamError(errored.stream(request))).resolves.toMatchObject({
      kind: "server",
      detail: "overloaded",
    });
  });
});
