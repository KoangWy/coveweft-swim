import { z } from "zod";

import type { AiConfig } from "@/lib/config/env";
import { LOCALES } from "@/lib/locale";
import type { ChatProvider } from "@/server/ai";
import type { ErrorCode } from "@/server/errors";
import { parseInput } from "@/server/result";

import { sanitizeHistory } from "./history";
import type { QuotaStore } from "./quota";
import type { AssistantCatalog } from "./tools";
import { runAssistantTurn } from "./turn";

/** Largest number of history entries accepted before sanitization. */
const MAX_HISTORY_ENTRIES = 100;

export const ChatRequestInput = z.object({
  locale: z.enum(LOCALES),
  messages: z.array(z.unknown()).min(1).max(MAX_HISTORY_ENTRIES),
});

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
  /** The quota store, or `null` when the server cannot reach it. */
  quota(config: AiConfig): QuotaStore | null;
  catalog: AssistantCatalog;
};

const ERROR_STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
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

/**
 * `POST /api/chat`. Checks run in order, each returning a JSON error before
 * any stream starts: configuration, session, body size, body shape, history
 * limits, then the quota. Only an accepted question consumes a unit; the
 * answer then streams as server-sent events.
 */
export async function handleChatRequest(
  request: Request,
  dependencies: ChatDependencies,
): Promise<Response> {
  const config = safeConfig(dependencies);
  const quota = config ? dependencies.quota(config) : null;

  if (!config || !quota) {
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

  const history = sanitizeHistory(parsed.data.messages, config.limits);

  if (!history.ok) {
    return errorResponse(history.code, { reason: history.reason });
  }

  const provider = dependencies.createProvider();

  if (!provider) {
    return errorResponse("AI_NOT_CONFIGURED");
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
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let failed = false;

      try {
        for await (const event of runAssistantTurn({
          provider,
          history: history.messages,
          locale: parsed.data.locale,
          catalog: dependencies.catalog,
          limits: config.limits,
          signal,
        })) {
          if (event.type === "delta") {
            controller.enqueue(sseEvent("delta", { text: event.text }));
          } else if (event.type === "products") {
            controller.enqueue(sseEvent("products", { items: event.items }));
          } else {
            failed = true;
            controller.enqueue(sseEvent("error", { code: event.code, retryable: event.retryable }));
          }
        }

        if (!failed && !signal.aborted) {
          controller.enqueue(sseEvent("done", { remainingToday }));
        }
      } catch {
        if (!signal.aborted) {
          controller.enqueue(sseEvent("error", { code: "INTERNAL", retryable: true }));
        }
      } finally {
        try {
          controller.close();
        } catch {
          // The client already went away.
        }
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
    },
  });
}
