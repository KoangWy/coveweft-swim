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
    expect(errorDetail(JSON.stringify(body), 500)).not.toContain("PRIVATE-THOUGHT");
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

describe("re-verification probes", () => {
  const ATTACHED = `invalid-key-${KEY.slice(0, 12)}…`;

  it.each([
    ["joined by hyphens", ATTACHED],
    ["joined to letters", `key${KEY.slice(4, 16)}end`],
    ["inside punctuation", `(${KEY.slice(10, 18)}),"${KEY.slice(-7)}"`],
  ])("masks a key fragment %s", (_label, text) => {
    const redacted = redactSecrets(text, [KEY]);

    for (let start = 0; start + 6 <= KEY.length; start += 1) {
      expect(redacted).not.toContain(KEY.slice(start, start + 6));
    }
  });

  it("keeps the surrounding text of a masked fragment", () => {
    expect(redactSecrets(ATTACHED, [KEY])).toBe("invalid-key-***…");
  });

  async function caughtError(run: () => Promise<unknown>): Promise<ProviderError> {
    const error = await run().then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ProviderError);

    return error as ProviderError;
  }

  function surfaces(error: ProviderError): string {
    return [
      error.detail,
      error.message,
      String(error.stack),
      String(error.cause),
      JSON.stringify(error),
    ].join("\n");
  }

  async function drain(events: AsyncIterable<unknown>) {
    for await (const event of events) {
      void event;
    }
  }

  it.each(["complete", "stream"] as const)(
    "masks an attached key fragment from an HTTP 401 body on %s",
    async (path) => {
      const provider = createChatProvider(settings({ apiKey: KEY }), {
        fetch: async () => jsonResponse({ error: { message: ATTACHED } }, 401),
      });
      const error = await caughtError(() =>
        path === "complete" ? provider.complete(request) : drain(provider.stream(request)),
      );

      expect(error.detail).toBe("invalid-key-***…");
      expect(surfaces(error)).not.toContain(KEY.slice(0, 6));
    },
  );

  it.each(["complete", "stream"] as const)(
    "does not echo a non-JSON HTTP error body on %s",
    async (path) => {
      const provider = createChatProvider(settings({ apiKey: KEY }), {
        fetch: async () =>
          new Response('{"reasoning_content":"PRIVATE-THOUGHT", "error":', { status: 500 }),
      });
      const error = await caughtError(() =>
        path === "complete" ? provider.complete(request) : drain(provider.stream(request)),
      );

      expect(error).toMatchObject({
        kind: "server",
        status: 500,
        detail: "Provider returned a non-JSON error body (HTTP 500).",
      });
      expect(surfaces(error)).not.toContain("PRIVATE-THOUGHT");
    },
  );

  it("keeps only the class and system code of a native error", async () => {
    const provider = createChatProvider(settings({ apiKey: KEY }), {
      fetch: async () => {
        throw new TypeError(`fetch failed: PRIVATE-THOUGHT ${ATTACHED}`, {
          cause: Object.assign(new Error("socket said PRIVATE-THOUGHT"), { code: "ECONNRESET" }),
        });
      },
    });
    const error = await caughtError(() => provider.complete(request));

    expect(error.detail).toBe("TypeError (ECONNRESET)");
    expect(surfaces(error)).not.toContain("PRIVATE-THOUGHT");
    expect(surfaces(error)).not.toContain(KEY.slice(0, 6));
  });
});
