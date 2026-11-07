import { describe, expect, it, vi } from "vitest";

import {
  assistantHistoryKey,
  clearOtherAssistantHistories,
  createMessageId,
  issueBlocksComposer,
  issueForError,
  MAX_QUESTION_CHARS,
  MAX_REQUEST_TURNS,
  MAX_STORED_TURNS,
  parseProductCards,
  readAssistantHistory,
  SseParser,
  toRequestTurns,
  writeAssistantHistory,
  type AssistantMessage,
  type SessionStorageLike,
} from "@/features/assistant/components/assistant-chat";

class MemoryStorage implements SessionStorageLike {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function message(role: "user" | "assistant", content: string): AssistantMessage {
  return { id: createMessageId(), role, content, cards: [], interrupted: false };
}

describe("SseParser", () => {
  it("parses events split across arbitrary chunks", () => {
    const onEvent = vi.fn();
    const parser = new SseParser(onEvent);

    parser.push('event: delta\ndata: {"text":"Hel');
    parser.push('lo"}\n\nevent: products\ndata: {"items":[]}');
    parser.push('\n\nevent: done\ndata: {"remainingToday":3}\n\n');

    expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
      { event: "delta", data: { text: "Hello" } },
      { event: "products", data: { items: [] } },
      { event: "done", data: { remainingToday: 3 } },
    ]);
  });

  it("handles CRLF separators and a final event without a blank line", () => {
    const onEvent = vi.fn();
    const parser = new SseParser(onEvent);

    parser.push(
      'event: delta\r\ndata: {"text":"a"}\r\n\r\nevent: done\r\ndata: {"remainingToday":1}',
    );
    parser.end();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1][0]).toEqual({ event: "done", data: { remainingToday: 1 } });
  });

  it("ignores comments, unknown fields, and data-free blocks", () => {
    const onEvent = vi.fn();
    const parser = new SseParser(onEvent);

    parser.push(": keep-alive\n\nevent: ping\n\ndata: not-json\n\n");

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ event: "message", data: "not-json" });
  });
});

describe("assistant transcript", () => {
  it("sends only user and assistant text turns, keeping the latest ten", () => {
    const messages = Array.from({ length: MAX_REQUEST_TURNS + 4 }, (_, index) =>
      message(index % 2 === 0 ? "user" : "assistant", `turn ${index}`),
    );
    messages.splice(3, 0, { ...message("user", "   "), role: "user" });

    const turns = toRequestTurns(messages);

    expect(turns).toHaveLength(MAX_REQUEST_TURNS);
    expect(turns.at(0)?.content).toBe("turn 4");
    expect(turns.at(-1)?.content).toBe(`turn ${MAX_REQUEST_TURNS + 3}`);
    expect(turns.every((turn) => turn.role === "user" || turn.role === "assistant")).toBe(true);
    expect(turns.every((turn) => typeof turn.content === "string")).toBe(true);
  });

  it("stores text only and reads it back per account", () => {
    const storage = new MemoryStorage();
    const messages: AssistantMessage[] = [
      message("user", "Do you have size M?"),
      {
        ...message("assistant", "Yes, size M is in stock."),
        cards: [
          {
            sku: "BB25CR",
            name: "Cherry swimsuit",
            priceVnd: 450000,
            inStock: true,
            imageUrl: null,
            url: "/en/products/BB25CR",
          },
        ],
      },
    ];

    writeAssistantHistory(storage, "user-1", messages);

    expect(readAssistantHistory(storage, "user-1")).toEqual([
      { role: "user", content: "Do you have size M?" },
      { role: "assistant", content: "Yes, size M is in stock." },
    ]);
    expect(readAssistantHistory(storage, "user-2")).toEqual([]);
  });

  it("drops malformed stored entries and caps the stored transcript", () => {
    const storage = new MemoryStorage();
    const key = assistantHistoryKey("user-1");
    const turns = Array.from({ length: MAX_STORED_TURNS + 5 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index}`,
    }));
    storage.setItem(
      key,
      JSON.stringify([
        { role: "system", content: "ignored" },
        { role: "user", content: 3 },
        ...turns,
      ]),
    );

    const loaded = readAssistantHistory(storage, "user-1");

    expect(loaded).toHaveLength(MAX_STORED_TURNS);
    expect(loaded.at(-1)?.content).toBe(`turn ${MAX_STORED_TURNS + 4}`);
  });

  it("clears another account's transcript but keeps the current one", () => {
    const storage = new MemoryStorage();
    storage.setItem(assistantHistoryKey("old"), "[]");
    storage.setItem(assistantHistoryKey("current"), "[]");
    storage.setItem("unrelated", "keep");

    clearOtherAssistantHistories(storage, "current");

    expect(storage.getItem(assistantHistoryKey("old"))).toBeNull();
    expect(storage.getItem(assistantHistoryKey("current"))).toBe("[]");
    expect(storage.getItem("unrelated")).toBe("keep");
  });

  it("clears every transcript when nobody is signed in", () => {
    const storage = new MemoryStorage();
    storage.setItem(assistantHistoryKey("a"), "[]");
    storage.setItem(assistantHistoryKey("b"), "[]");

    clearOtherAssistantHistories(storage, null);

    expect(storage.getItem(assistantHistoryKey("a"))).toBeNull();
    expect(storage.getItem(assistantHistoryKey("b"))).toBeNull();
  });
});

describe("assistant error states", () => {
  it("maps each API code to a distinct state", () => {
    expect(issueForError("AI_NOT_CONFIGURED").kind).toBe("not_configured");
    expect(issueForError("AI_QUOTA_USER_DAY").kind).toBe("quota_day");
    expect(issueForError("AI_QUOTA_USER_MINUTE").kind).toBe("quota_minute");
    expect(issueForError("AI_QUOTA_GLOBAL").kind).toBe("paused");
    expect(issueForError("UNAUTHENTICATED").kind).toBe("unauthenticated");
    expect(
      issueForError("AI_INPUT_TOO_LONG", {
        count: MAX_QUESTION_CHARS + 1,
        max: MAX_QUESTION_CHARS,
      }),
    ).toMatchObject({
      kind: "too_long",
      count: MAX_QUESTION_CHARS + 1,
      max: MAX_QUESTION_CHARS,
    });
    expect(issueForError("AI_STREAM_INTERRUPTED", { retryable: true })).toMatchObject({
      kind: "interrupted",
      retryable: true,
    });
    expect(issueForError("AI_UNAVAILABLE", { retryable: false })).toMatchObject({
      kind: "error",
      retryable: false,
    });
    expect(issueForError("INTERNAL").kind).toBe("error");
  });

  it("keeps the composer open for retryable and per-minute errors", () => {
    expect(issueBlocksComposer("error")).toBe(false);
    expect(issueBlocksComposer("interrupted")).toBe(false);
    expect(issueBlocksComposer("quota_minute")).toBe(false);
    expect(issueBlocksComposer("too_long")).toBe(false);
    expect(issueBlocksComposer("not_configured")).toBe(true);
    expect(issueBlocksComposer("quota_day")).toBe(true);
    expect(issueBlocksComposer("paused")).toBe(true);
    expect(issueBlocksComposer("unauthenticated")).toBe(true);
  });
});

describe("product cards", () => {
  it("keeps valid cards and drops malformed entries", () => {
    const cards = parseProductCards({
      items: [
        {
          sku: "BB25CR",
          name: "Cherry swimsuit",
          priceVnd: 450000,
          inStock: true,
          imageUrl: "http://localhost:3130/media/studio/BB25CR/01-480.webp",
          url: "/en/products/BB25CR",
        },
        { sku: "BAD", name: "No price", inStock: true, imageUrl: null, url: "/en/products/BAD" },
        { sku: "BAD2", name: "Bad url", priceVnd: 1, inStock: false, imageUrl: null },
        {
          sku: "BAD3",
          name: "Script link",
          priceVnd: 1,
          inStock: false,
          imageUrl: null,
          url: "javascript:alert(1)",
        },
        {
          sku: "BAD4",
          name: "Protocol-relative link",
          priceVnd: 1,
          inStock: false,
          imageUrl: null,
          url: "//example.com",
        },
        null,
        "text",
      ],
    });

    expect(cards).toEqual([
      {
        sku: "BB25CR",
        name: "Cherry swimsuit",
        priceVnd: 450000,
        inStock: true,
        imageUrl: "http://localhost:3130/media/studio/BB25CR/01-480.webp",
        url: "/en/products/BB25CR",
      },
    ]);
    expect(parseProductCards({ items: "nope" })).toEqual([]);
    expect(parseProductCards(null)).toEqual([]);
  });
});
