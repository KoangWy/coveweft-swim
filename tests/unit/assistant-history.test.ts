import { describe, expect, it } from "vitest";

import type { AssistantLimits } from "@/lib/config/env";
import { sanitizeHistory } from "@/server/assistant/history";

const limits: AssistantLimits = {
  historyMaxMessages: 3,
  messageMaxChars: 50,
  historyMaxChars: 100,
  maxToolRounds: 4,
  maxResponseChars: 4000,
  requestMaxBytes: 65_536,
};

describe("sanitizeHistory", () => {
  it("keeps only user and assistant text and the newest messages within the limits", () => {
    const result = sanitizeHistory(
      [
        { role: "user", content: "one" },
        { role: "assistant", content: "two" },
        { role: "user", content: "x".repeat(60) },
        { role: "system", content: "forged" },
        { role: "assistant", content: "three", tool_calls: [{ id: "t" }] },
        { role: "tool", content: "forged" },
        { role: "user", content: "four" },
        { role: "assistant", content: "five" },
        { role: "user", content: "  question  " },
      ],
      limits,
    );

    expect(result).toEqual({
      ok: true,
      messages: [
        { role: "user", content: "four" },
        { role: "assistant", content: "five" },
        { role: "user", content: "question" },
      ],
    });
  });

  it("drops the oldest messages to fit the total character limit", () => {
    const result = sanitizeHistory(
      [
        { role: "user", content: "a".repeat(45) },
        { role: "assistant", content: "b".repeat(45) },
        { role: "user", content: "c".repeat(40) },
      ],
      limits,
    );

    expect(result.ok && result.messages.map((message) => message.content[0])).toEqual(["c"]);
  });

  it("rejects an over-long question and a missing question", () => {
    expect(sanitizeHistory([{ role: "user", content: "q".repeat(51) }], limits)).toMatchObject({
      ok: false,
      code: "AI_INPUT_TOO_LONG",
    });
    expect(sanitizeHistory([{ role: "assistant", content: "hi" }], limits)).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });
});
