/**
 * Chat widget helpers that do not depend on React: the SSE decoder, the
 * conversation list types, and the mapping from API error codes to the states
 * the panel and the Assistant page show.
 */

/** Longest question the chat endpoint accepts, matching the server default. */
export const MAX_QUESTION_CHARS = 1000;
/** The panel mentions the daily allowance only once this few questions remain. */
export const LOW_QUOTA_THRESHOLD = 5;

export type ChatRole = "user" | "assistant";

/** One conversation in the account rail. */
export type AssistantConversation = {
  id: string;
  title: string;
  updatedAt: string;
};

export type AssistantConversationPage = {
  items: AssistantConversation[];
  nextCursor: string | null;
};

/** A product card from a `products` event or rebuilt from stored SKUs. */
export type AssistantProductCard = {
  sku: string;
  name: string;
  priceVnd: number;
  inStock: boolean;
  imageUrl: string | null;
  url: string;
};

export type AssistantMessage = {
  id: string;
  role: ChatRole;
  content: string;
  cards: AssistantProductCard[];
  /** The stream ended before the server sent `done`. */
  interrupted: boolean;
};

export type ChatStatus = {
  configured: boolean;
  signedIn: boolean;
  remainingToday: number | null;
  globalPaused: boolean;
};

export type AssistantIssueKind =
  | "not_configured"
  | "quota_day"
  | "quota_minute"
  | "paused"
  | "unauthenticated"
  | "too_long"
  | "interrupted"
  | "error";

export type AssistantIssue = {
  kind: AssistantIssueKind;
  /** Whether asking again could succeed without the customer changing anything. */
  retryable: boolean;
  /** Character limit for `too_long`. */
  max?: number;
  /** Characters typed when `too_long` comes from the live composer. */
  count?: number;
};

/** States that replace the composer, because sending cannot succeed now. */
export function issueBlocksComposer(kind: AssistantIssueKind): boolean {
  return (
    kind === "not_configured" ||
    kind === "quota_day" ||
    kind === "paused" ||
    kind === "unauthenticated"
  );
}

/**
 * Maps an API error code (a pre-stream JSON error or an SSE `error` event) to
 * the panel state. Unknown codes fall back to the retryable transient error.
 */
export function issueForError(
  code: string,
  options: { retryable?: boolean; max?: number; count?: number } = {},
): AssistantIssue {
  const retryable = options.retryable ?? true;

  switch (code) {
    case "AI_NOT_CONFIGURED":
      return { kind: "not_configured", retryable: false };
    case "AI_QUOTA_USER_DAY":
      return { kind: "quota_day", retryable: false };
    case "AI_QUOTA_USER_MINUTE":
      return { kind: "quota_minute", retryable: false };
    case "AI_QUOTA_GLOBAL":
      return { kind: "paused", retryable: false };
    case "UNAUTHENTICATED":
      return { kind: "unauthenticated", retryable: false };
    case "AI_INPUT_TOO_LONG":
      return { kind: "too_long", retryable: false, max: options.max, count: options.count };
    case "AI_STREAM_INTERRUPTED":
      return { kind: "interrupted", retryable };
    case "AI_UNAVAILABLE":
    case "INTERNAL":
      return { kind: "error", retryable };
    default:
      return { kind: "error", retryable: false };
  }
}

/**
 * Reconciles a blocking issue with a fresh status response. The server is the
 * source of truth for configuration, session, pause, and quota, so a healthy
 * response clears stale blocking states. Transient issues stay visible.
 */
export function reconcileIssueWithStatus(
  issue: AssistantIssue | null,
  status: ChatStatus,
): AssistantIssue | null {
  if (!status.signedIn) {
    return issueForError("UNAUTHENTICATED");
  }
  if (!status.configured) {
    return issueForError("AI_NOT_CONFIGURED");
  }
  if (status.globalPaused) {
    return issueForError("AI_QUOTA_GLOBAL");
  }
  if (status.remainingToday === 0) {
    return issueForError("AI_QUOTA_USER_DAY");
  }
  if (issue && issueBlocksComposer(issue.kind)) {
    return null;
  }
  return issue;
}

/** True for the cancellation error thrown by fetch or a response body. */
export function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

export const ASSISTANT_HISTORY_PREFIX = "coveweft.assistant.history.";

/** The browser storage methods used to remove old transcripts. */
export type LegacyStorageLike = {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
};

/**
 * Removes transcripts written by the browser-only history of earlier
 * versions. Conversations now live in the account; these keys are orphaned
 * and must not survive a deploy.
 */
export function clearLegacyAssistantHistories(storage: LegacyStorageLike): void {
  const stale: string[] = [];

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(ASSISTANT_HISTORY_PREFIX)) {
        stale.push(key);
      }
    }
    for (const key of stale) {
      storage.removeItem(key);
    }
  } catch {
    // Ignore storage failures.
  }
}

export type SseEvent = { event: string; data: unknown };

/**
 * Incremental parser for the server's server-sent events. It accepts chunks
 * split anywhere, including between the blank line and the next event.
 */
export class SseParser {
  private buffer = "";
  private readonly onEvent: (event: SseEvent) => void;

  constructor(onEvent: (event: SseEvent) => void) {
    this.onEvent = onEvent;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    this.drain(false);
  }

  end(): void {
    this.drain(true);
  }

  private drain(final: boolean): void {
    while (true) {
      const match = /\r?\n\r?\n/.exec(this.buffer);
      if (!match || match.index === undefined) {
        break;
      }
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      this.emit(block);
    }

    if (final && this.buffer.trim() !== "") {
      const block = this.buffer;
      this.buffer = "";
      this.emit(block);
    }
  }

  private emit(block: string): void {
    let event = "message";
    const dataLines: string[] = [];

    for (const line of block.split(/\r?\n/)) {
      if (line === "" || line.startsWith(":")) {
        continue;
      }
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }

    if (dataLines.length === 0) {
      return;
    }

    const raw = dataLines.join("\n");
    let data: unknown = raw;

    try {
      data = JSON.parse(raw);
    } catch {
      // Keep the raw text; callers ignore events they do not understand.
    }

    this.onEvent({ event, data });
  }
}

/** Validates the `products` event payload before the panel renders it. */
export function parseProductCards(data: unknown): AssistantProductCard[] {
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter(
      (item) =>
        typeof item.sku === "string" &&
        typeof item.name === "string" &&
        typeof item.priceVnd === "number" &&
        Number.isFinite(item.priceVnd) &&
        typeof item.inStock === "boolean" &&
        (item.imageUrl === null ||
          (typeof item.imageUrl === "string" && /^https?:\/\//i.test(item.imageUrl))) &&
        typeof item.url === "string" &&
        item.url.startsWith("/") &&
        !item.url.startsWith("//"),
    )
    .map((item) => ({
      sku: item.sku as string,
      name: item.name as string,
      priceVnd: item.priceVnd as number,
      inStock: item.inStock as boolean,
      imageUrl: item.imageUrl as string | null,
      url: item.url as string,
    }));
}

let messageCounter = 0;

/** A stable id for a new transcript message. */
export function createMessageId(): string {
  messageCounter += 1;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${crypto.randomUUID()}-${messageCounter}`;
  }
  return `message-${Date.now()}-${messageCounter}`;
}
