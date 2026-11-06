import { describe, expect, it } from "vitest";

import { createChatProvider, ProviderError } from "@/server/ai";
import { errorDetail } from "@/server/ai/errors";
import { redactSecrets, sanitizeDetail } from "@/server/ai/redact";

import { jsonResponse, settings } from "../support/ai";

const KEY = "Zx9Qw7Er5Ty3Ui1Op0As2Df4Gh6Jk8Lm";
const request = { messages: [{ role: "user" as const, content: "Hi" }] };

describe("redactSecrets", () => {
  it("masks bearer tokens, full keys, and key fragments", () => {
    const text = `Authorization: Bearer ${KEY}; key=${KEY}; prefix ${KEY.slice(0, 10)} and tail ${KEY.slice(-8)}`;
    const redacted = redactSecrets(text, [KEY]);

    expect(redacted).not.toContain(KEY.slice(0, 6));
    expect(redacted).not.toContain(KEY.slice(-6));
    expect(redacted).toContain("Bearer ***");
  });

  it("masks long opaque tokens even when the key is unknown", () => {
    expect(redactSecrets(`token ${KEY}`)).toBe("token ***");
  });

  it("keeps ordinary words and model names", () => {
    expect(redactSecrets("model deepseek-v4-1-flash-1017 is overloaded", [KEY])).toBe(
      "model deepseek-v4-1-flash-1017 is overloaded",
    );
  });
});

describe("sanitizeDetail", () => {
  it("redacts before truncating, so a key cut at the limit is not exposed", () => {
    const detail = sanitizeDetail(`${"x ".repeat(245)}${KEY}`, [KEY]);

    expect(detail).not.toMatch(/Zx9Q/);
    expect(detail!.length).toBeLessThanOrEqual(501);
  });
});

describe("errorDetail", () => {
  it.each([
    ["a reasoning field", { reasoning_content: "PRIVATE-THOUGHT", message: "failed" }],
    [
      "a thinking message",
      { error: { message: { type: "thinking", thinking: "PRIVATE-THOUGHT" } } },
    ],
    [
      "thinking chunks",
      {
        error: {
          message: [
            { type: "thinking", thinking: "PRIVATE-THOUGHT" },
            { type: "text", text: "failed" },
          ],
        },
      },
    ],
    ["a body without a message", { reasoning: "PRIVATE-THOUGHT", code: 500 }],
  ])("drops %s", (_label, body) => {
    expect(errorDetail(JSON.stringify(body))).not.toContain("PRIVATE-THOUGHT");
  });
});

describe("provider errors", () => {
  it("does not keep the key from an HTTP error body", async () => {
    const provider = createChatProvider(settings({ apiKey: KEY }), {
      fetch: async () =>
        jsonResponse({ error: { message: `Invalid key ${KEY.slice(0, 12)}…` } }, 401),
    });
    const error = (await provider
      .complete(request)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error).toBeInstanceOf(ProviderError);
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain(KEY.slice(0, 6));
  });

  it("keeps no raw cause from a network failure", async () => {
    const provider = createChatProvider(settings({ apiKey: KEY }), {
      fetch: async () => {
        throw new TypeError(`connect failed, Authorization: Bearer ${KEY}`);
      },
    });
    const error = (await provider
      .complete(request)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error).toMatchObject({ kind: "server" });
    expect(error.cause).toBeUndefined();
    expect(error.detail).toContain("TypeError");
    expect(error.detail).not.toContain(KEY.slice(0, 6));
  });

  it("keeps no raw cause from a malformed success body", async () => {
    const provider = createChatProvider(settings({ apiKey: KEY }), {
      fetch: async () =>
        new Response(`{"reasoning_content":"PRIVATE-THOUGHT", ${KEY}`, { status: 200 }),
    });
    const error = (await provider
      .complete(request)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.cause).toBeUndefined();
    expect(String(error.detail)).not.toContain(KEY.slice(0, 6));
    expect(error.detail).toBe("Malformed JSON response.");
  });
});
