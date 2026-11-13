import { z } from "zod";

import type { AiConfig } from "@/lib/config/env";
import { LOCALES } from "@/lib/locale";
import type { ChatProvider } from "@/server/ai";
import type { ErrorCode } from "@/server/errors";
import { parseInput } from "@/server/result";

import {
  titleFromQuestion,
  type ConversationStore,
  type StoredConversation,
  type StoredMessage,
} from "./conversations";
import { sanitizeHistory } from "./history";
import type { PrivacyProfile } from "./privacy";
import type { QuotaStore } from "./quota";
import type { AssistantCatalog } from "./tools";
import { runAssistantTurn } from "./turn";

export const ChatRequestInput = z
  .object({
    locale: z.enum(LOCALES),
    conversationId: z.uuid().nullable(),
    message: z.string().trim().min(1),
  })
  .strict();

export type ChatRequestInput = z.infer<typeof ChatRequestInput>;

export type ChatStatus = {
  /** The provider key and the quota store are configured. */
  configured: boolean;
  signedIn: boolean;
  /** Questions left today for the signed-in customer; `null` otherwise. */
  remainingToday: number | null;
  /** The global daily limit is reached; shopping still works. */
  globalPaused: boolean;
};

/** Everything the chat endpoints need, injectable for tests. */
export type ChatDependencies = {
  /** The AI configuration, or `null` when it is missing or invalid. */
  config(): AiConfig | null;
  /** One provider with failover for one turn, or `null` when not configured. */
  createProvider(): ChatProvider | null;
  /** The signed-in user from the verified session, or `null`. */
  getUser(): Promise<{ id: string } | null>;
  /**
   * Profile values of the signed-in customer (name, email, phone, default
   * address), used only by the privacy gate to redact them.
   */
  getPrivacyProfile(userId: string): Promise<PrivacyProfile | null>;
  /** The quota store, or `null` when the server cannot reach it. */
  quota(config: AiConfig): QuotaStore | null;
  /** Conversation reads and writes, or `null` when the service role is absent. */
  conversations: ConversationStore | null;
  catalog: AssistantCatalog;
};

const ERROR_STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  AI_INPUT_TOO_LONG: 413,
  AI_QUOTA_USER_DAY: 429,
  AI_QUOTA_USER_MINUTE: 429,
  AI_QUOTA_GLOBAL: 429,
  AI_NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

/** A pre-stream error: JSON `{ error: { code, details? } }`. */
export function errorResponse(code: ErrorCode, details?: unknown): Response {
  return Response.json(
    { error: details === undefined ? { code } : { code, details } },
    { status: ERROR_STATUS[code] ?? 500, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Reads the request body as text up to `maxBytes`. Returns `null` when the
 * body is larger, without buffering the rest.
 */
async function readBody(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > maxBytes) {
    return null;
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }

    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function sseEvent(name: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

function safeConfig(dependencies: ChatDependencies): AiConfig | null {
  try {
    return dependencies.config();
  } catch {
    return null;
  }
}

/** `GET /api/chat/status`. Never throws and never consumes quota. */
export async function getChatStatus(dependencies: ChatDependencies): Promise<ChatStatus> {
  const config = safeConfig(dependencies);
  const quota = config ? dependencies.quota(config) : null;
  const configured = config !== null && quota !== null;
  const user = await dependencies.getUser().catch(() => null);
  const status: ChatStatus = {
    configured,
    signedIn: user !== null,
    remainingToday: null,
    globalPaused: false,
  };

  if (!configured || !user) {
    return status;
  }

  try {
    const current = await quota!.status(user.id);

    return { ...status, ...current };
  } catch {
    return status;
  }
}

class NotFoundError extends Error {}

async function findOwnedConversation(
  conversations: ConversationStore,
  userId: string,
  id: string,
): Promise<StoredConversation> {
  const conversation = await conversations.findConversation(userId, id);

  // A missing row, a row of another owner, and a malformed id all look the
  // same to the caller, so the response never reveals that an id exists.
  if (!conversation) {
    throw new NotFoundError();
  }

  return conversation;
}

/**
 * `POST /api/chat`. Checks run in order, each returning a JSON error before
 * any stream starts: configuration, session, body size, body shape, the
 * conversation owner, history limits, then the quota. Only an accepted
 * question consumes a unit and is written to the conversation; the answer
 * then streams as server-sent events and is written once, when it ends.
 */
export async function handleChatRequest(
  request: Request,
  dependencies: ChatDependencies,
): Promise<Response> {
  const config = safeConfig(dependencies);
  const quota = config ? dependencies.quota(config) : null;
  const conversations = dependencies.conversations;

  if (!config || !quota || !conversations) {
    return errorResponse("AI_NOT_CONFIGURED");
  }

  const user = await dependencies.getUser().catch(() => null);

  if (!user) {
    return errorResponse("UNAUTHENTICATED");
  }

  const body = await readBody(request, config.limits.requestMaxBytes);

  if (body === null) {
    return errorResponse("AI_INPUT_TOO_LONG", { reason: "body_too_large" });
  }

  let json: unknown;

  try {
    json = JSON.parse(body);
  } catch {
    return errorResponse("VALIDATION_ERROR", { issues: [{ field: "", code: "invalid_format" }] });
  }

  const parsed = parseInput(ChatRequestInput, json);

  if (!parsed.ok) {
    return errorResponse(parsed.error.code, parsed.error.details);
  }

  const question = parsed.data.message;

  if (
    question.length > config.limits.messageMaxChars ||
    question.length > config.limits.historyMaxChars
  ) {
    return errorResponse("AI_INPUT_TOO_LONG", { reason: "question_too_long" });
  }

  let conversation: StoredConversation | null = null;

  if (parsed.data.conversationId) {
    try {
      conversation = await findOwnedConversation(
        conversations,
        user.id,
        parsed.data.conversationId,
      );
    } catch (error) {
      if (error instanceof NotFoundError) {
        return errorResponse("NOT_FOUND");
      }

      return errorResponse("INTERNAL");
    }
  }

  const provider = dependencies.createProvider();

  if (!provider) {
    return errorResponse("AI_NOT_CONFIGURED");
  }

  // The privacy gate needs the profile; without it the turn does not start,
  // so a profile read failure never sends unredacted profile values.
  let privacyProfile: PrivacyProfile | null;

  try {
    privacyProfile = await dependencies.getPrivacyProfile(user.id);
  } catch {
    return errorResponse("INTERNAL");
  }

  let decision;

  try {
    decision = await quota.consume(user.id);
  } catch {
    return errorResponse("INTERNAL");
  }

  if (!decision.allowed) {
    return errorResponse(decision.code, { remainingToday: decision.remainingToday });
  }

  const remainingToday = decision.remainingToday;
  let history: StoredMessage[];

  try {
    conversation ??= await conversations.createConversation(user.id, titleFromQuestion(question));
    await conversations.appendUserMessage(user.id, conversation.id, question);
    history = await conversations.recentMessages(conversation.id, config.limits.historyMaxMessages);
  } catch {
    return errorResponse("INTERNAL");
  }

  if (!conversation) {
    return errorResponse("INTERNAL");
  }

  const sanitized = sanitizeHistory(
    history.map(({ role, content }) => ({ role, content })),
    config.limits,
  );

  if (!sanitized.ok) {
    return errorResponse(sanitized.code, { reason: sanitized.reason });
  }

  const conversationId = conversation.id;
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let answer = "";
      let productSkus: string[] = [];
      let failure: {
        code: "AI_UNAVAILABLE" | "AI_STREAM_INTERRUPTED" | "INTERNAL";
        retryable: boolean;
      } | null = null;

      const enqueue = (name: string, data: unknown) => {
        if (closed || signal.aborted) {
          return false;
        }

        try {
          controller.enqueue(sseEvent(name, data));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      try {
        for await (const event of runAssistantTurn({
          provider,
          history: sanitized.messages,
          privacyProfile,
          locale: parsed.data.locale,
          catalog: dependencies.catalog,
          limits: config.limits,
          signal,
        })) {
          if (event.type === "delta") {
            answer += event.text;
            enqueue("delta", { text: event.text });
          } else if (event.type === "products") {
            productSkus = event.items.map((item) => item.sku);
            enqueue("products", { items: event.items });
          } else {
            failure = { code: event.code, retryable: event.retryable };
          }
        }
      } catch {
        failure = {
          code: answer === "" ? "INTERNAL" : "AI_STREAM_INTERRUPTED",
          retryable: true,
        };
      }

      const aborted = signal.aborted;
      const status = failure
        ? answer === ""
          ? "failed"
          : "interrupted"
        : aborted
          ? "interrupted"
          : "complete";

      // An empty interrupted answer has nothing to keep; neither has a turn
      // that ended without text and without a failure. A failed turn is kept
      // as an empty assistant row so the transcript records what happened.
      if (status === "failed" || answer !== "") {
        try {
          await conversations.appendAssistantMessage(user.id, conversationId, {
            content: answer,
            status,
            productSkus: status === "failed" ? [] : productSkus,
          });
        } catch {
          // The answer was already streamed; a failed history write must not
          // turn it into an error. Only the class is logged, never the text.
          console.error("Shopping assistant history write failed", { kind: "assistant_message" });
        }
      }

      if (!aborted && failure) {
        enqueue("error", failure);
      } else if (!aborted && !failure) {
        enqueue("done", { remainingToday, conversationId });
      }

      try {
        controller.close();
      } catch {
        // The client already went away.
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Conversation-Id": conversationId,
    },
  });
}
