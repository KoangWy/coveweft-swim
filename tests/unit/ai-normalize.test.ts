import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@/server/ai";
import {
  buildRequestBody,
  flattenContent,
  parseCompletion,
  toWireMessage,
} from "@/server/ai/normalize";

import { completionBody, CONTENT_SHAPES, settings, THINKING } from "../support/ai";

describe("flattenContent", () => {
  it("keeps string content unchanged", () => {
    expect(flattenContent(CONTENT_SHAPES.string)).toBe("Hello there.");
  });

  it("returns no text for a thinking-only array", () => {
    expect(flattenContent(CONTENT_SHAPES.thinkingOnly)).toBe("");
  });

  it("joins text chunks and drops thinking chunks", () => {
    expect(flattenContent(CONTENT_SHAPES.thinkingThenText)).toBe("Hello there.");
    expect(
      flattenContent([
        { type: "text", text: "A" },
        { type: "thinking", thinking: [{ type: "text", text: THINKING }] },
        { type: "text", text: "B" },
        { type: "image_url", image_url: "ignored" },
      ]),
    ).toBe("AB");
  });

  it("treats missing or unexpected content as empty", () => {
    expect(flattenContent(null)).toBe("");
    expect(flattenContent(undefined)).toBe("");
    expect(flattenContent({ type: "text", text: "x" })).toBe("");
  });
});

describe("parseCompletion", () => {
  it.each(Object.entries(CONTENT_SHAPES))("normalizes %s content", (shape, content) => {
    const completion = parseCompletion(completionBody({ content, reasoning_content: THINKING }));

    expect(completion?.text).toBe(shape === "thinkingOnly" ? "" : "Hello there.");
    expect(JSON.stringify(completion)).not.toContain("SECRET-REASONING");
  });

  it("reads tool calls, finish reason, and usage", () => {
    const completion = parseCompletion(
      completionBody(
        {
          content: CONTENT_SHAPES.thinkingOnly,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "searchProducts", arguments: '{"gender":"Women"}' },
            },
          ],
        },
        "tool_calls",
      ),
    );

    expect(completion).toEqual({
      text: "",
      toolCalls: [{ id: "call-1", name: "searchProducts", arguments: '{"gender":"Women"}' }],
      reason: "tool_calls",
      usage: { inputTokens: 12, outputTokens: 7 },
    });
  });

  it("returns null for a body without choices", () => {
    expect(parseCompletion({ object: "error" })).toBeNull();
  });
});

describe("request normalization", () => {
  const history: ChatMessage[] = [
    { role: "system", content: "Be brief." },
    { role: "user", content: "Find a swimsuit." },
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "call-1", name: "searchProducts", arguments: "{}" }],
    },
    { role: "tool", toolCallId: "call-1", name: "searchProducts", content: "[]" },
    { role: "assistant", content: "Nothing matched." },
  ];

  it("sends only standard fields, even when callers attach reasoning fields", () => {
    const withReasoning = history.map((message) => ({
      ...message,
      reasoning_content: THINKING,
      reasoning: THINKING,
      thinking: THINKING,
    })) as ChatMessage[];
    const body = JSON.stringify(buildRequestBody(settings(), { messages: withReasoning }, false));

    expect(body).not.toMatch(/"(reasoning_content|reasoning|thinking)"/);
    expect(body).not.toContain("SECRET-REASONING");
  });

  it("omits content from an assistant message that only carries tool calls", () => {
    const wire = toWireMessage(history[2]!);

    expect(wire).not.toHaveProperty("content");
    expect(wire).toEqual({
      role: "assistant",
      tool_calls: [
        { id: "call-1", type: "function", function: { name: "searchProducts", arguments: "{}" } },
      ],
    });
  });

  it("keeps assistant text that accompanies tool calls", () => {
    expect(
      toWireMessage({
        role: "assistant",
        content: "Let me check.",
        toolCalls: [{ id: "call-1", name: "searchProducts", arguments: "{}" }],
      }),
    ).toMatchObject({ content: "Let me check." });
  });

  it("sends tool results with tool_call_id and name", () => {
    expect(toWireMessage(history[3]!)).toEqual({
      role: "tool",
      tool_call_id: "call-1",
      name: "searchProducts",
      content: "[]",
    });
  });

  it("sends reasoning_effort only when the role configures it", () => {
    const primary = buildRequestBody(settings(), { messages: history }, true);
    const fallback = buildRequestBody(
      settings({ model: "small-model", reasoningEffort: null }),
      { messages: history },
      true,
    );

    expect(primary).toMatchObject({
      model: "reasoning-model",
      reasoning_effort: "low",
      stream: true,
    });
    expect(fallback).not.toHaveProperty("reasoning_effort");
    expect(fallback).toMatchObject({ model: "small-model", max_tokens: 4096 });
  });

  it("maps tools to function definitions and leaves them out when empty", () => {
    const tool = {
      name: "searchProducts",
      description: "Search the catalog.",
      parameters: { type: "object", properties: {} },
    };

    expect(buildRequestBody(settings(), { messages: history, tools: [tool] }, false).tools).toEqual(
      [{ type: "function", function: tool }],
    );
    expect(
      buildRequestBody(settings(), { messages: history, tools: [] }, false),
    ).not.toHaveProperty("tools");
  });
});
