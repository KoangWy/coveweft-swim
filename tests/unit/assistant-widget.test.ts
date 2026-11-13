import { describe, expect, it, vi } from "vitest";

import {
  clearLegacyAssistantHistories,
  issueBlocksComposer,
  isAbortError,
  issueForError,
  MAX_QUESTION_CHARS,
  parseProductCards,
  reconcileIssueWithStatus,
  SseParser,
  type LegacyStorageLike,
} from "@/features/assistant/components/assistant-chat";

class MemoryStorage implements LegacyStorageLike {
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

describe("legacy browser transcripts", () => {
  it("removes every old transcript key and keeps unrelated storage", () => {
    const storage = new MemoryStorage();
    storage.setItem("coveweft.assistant.history.a", "[]");
    storage.setItem("coveweft.assistant.history.b", "[]");
    storage.setItem("unrelated", "keep");

    clearLegacyAssistantHistories(storage);

    expect(storage.getItem("coveweft.assistant.history.a")).toBeNull();
    expect(storage.getItem("coveweft.assistant.history.b")).toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
  });
});

describe("abort errors", () => {
  it("recognises fetch and body cancellation without treating it as malformed JSON", () => {
    expect(isAbortError(new DOMException("The operation was aborted.", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("Unexpected end of JSON input"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
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

  it("clears blocking issues when a fresh status allows sending", () => {
    const ready = {
      configured: true,
      signedIn: true,
      remainingToday: 9,
      globalPaused: false,
    };

    for (const kind of ["not_configured", "quota_day", "paused", "unauthenticated"] as const) {
      expect(reconcileIssueWithStatus({ kind, retryable: false }, ready)).toBeNull();
    }
    expect(reconcileIssueWithStatus({ kind: "error", retryable: true }, ready)).toMatchObject({
      kind: "error",
    });
    expect(reconcileIssueWithStatus({ kind: "interrupted", retryable: true }, ready)).toMatchObject(
      { kind: "interrupted" },
    );
  });

  it("replaces stale issues with the blocking state the status reports", () => {
    const base = {
      configured: true,
      signedIn: true,
      remainingToday: 9,
      globalPaused: false,
    };

    expect(reconcileIssueWithStatus(null, { ...base, signedIn: false })?.kind).toBe(
      "unauthenticated",
    );
    expect(reconcileIssueWithStatus(null, { ...base, configured: false })?.kind).toBe(
      "not_configured",
    );
    expect(reconcileIssueWithStatus(null, { ...base, globalPaused: true })?.kind).toBe("paused");
    expect(reconcileIssueWithStatus(null, { ...base, remainingToday: 0 })?.kind).toBe("quota_day");
    expect(
      reconcileIssueWithStatus({ kind: "quota_minute", retryable: false }, base),
    ).toMatchObject({ kind: "quota_minute" });
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
