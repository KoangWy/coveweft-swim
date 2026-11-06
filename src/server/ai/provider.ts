import packageJson from "../../../package.json" with { type: "json" };

import type { AiConfig, AiProviderConfig } from "../../lib/config/env.ts";

import { errorDetail, kindForStatus, ProviderError } from "./errors.ts";
import {
  asRecord,
  buildRequestBody,
  flattenContent,
  parseCompletion,
  toFinishReason,
  ToolCallAccumulator,
  toUsage,
} from "./normalize.ts";
import { readSseData } from "./sse.ts";
import type {
  ChatCompletion,
  ChatProvider,
  ChatRequest,
  FinishReason,
  ProviderEvent,
  ProviderSettings,
  ProviderUsage,
} from "./types.ts";

export const DEFAULT_USER_AGENT = `coveweft-swim/${packageJson.version}`;

export type ProviderOptions = {
  /** Replaces the global `fetch`, for tests and diagnostics. */
  fetch?: typeof fetch;
  userAgent?: string;
};

/** Combines one role of the AI configuration with the shared request limits. */
export function providerSettings(config: AiConfig, role: AiProviderConfig): ProviderSettings {
  return { ...role, timeoutMs: config.timeoutMs, maxTokens: config.maxTokens };
}

type OpenRequest = {
  response: Response;
  /** Restarts the inactivity timer after data arrives. */
  touch: () => void;
  /** Maps an error raised while reading the body. */
  mapError: (error: unknown) => unknown;
  close: () => void;
};

/**
 * Creates a provider for one OpenAI-compatible Chat Completions endpoint. The
 * adapter calls the HTTP API directly and normalizes the response itself, so
 * Mistral's array `content` and reasoning chunks never leave this module.
 */
export function createChatProvider(
  settings: ProviderSettings,
  options: ProviderOptions = {},
): ChatProvider {
  const fetchImpl = options.fetch ?? fetch;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const url = `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  async function open(request: ChatRequest, stream: boolean): Promise<OpenRequest> {
    const timeout = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => timeout.abort(), settings.timeoutMs);
    };
    const close = () => clearTimeout(timer);
    const mapError = (error: unknown): unknown => {
      if (error instanceof ProviderError) {
        return error;
      }

      if (request.signal?.aborted) {
        return request.signal.reason ?? error;
      }

      if (timeout.signal.aborted) {
        return new ProviderError("timeout", { cause: error });
      }

      // Network failure: DNS, connection reset, or a broken stream.
      return new ProviderError("server", { cause: error });
    };

    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout.signal])
      : timeout.signal;

    touch();

    let response: Response;

    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
          Accept: stream ? "text/event-stream" : "application/json",
          "User-Agent": userAgent,
        },
        body: JSON.stringify(buildRequestBody(settings, request, stream)),
        signal,
      });
    } catch (error) {
      close();
      throw mapError(error);
    }

    if (!response.ok) {
      let body = "";

      try {
        body = await response.text();
      } catch (error) {
        // A cancelled or timed-out body read is not an HTTP failure.
        if (request.signal?.aborted || timeout.signal.aborted) {
          close();
          throw mapError(error);
        }
      }

      close();

      throw new ProviderError(kindForStatus(response.status), {
        status: response.status,
        detail: errorDetail(body),
      });
    }

    return { response, touch, mapError, close };
  }

  async function complete(request: ChatRequest): Promise<ChatCompletion> {
    const { response, mapError, close } = await open(request, false);

    try {
      const completion = parseCompletion(await response.json());

      if (!completion) {
        throw new ProviderError("server", {
          status: response.status,
          detail: "Response has no choices.",
        });
      }

      return completion;
    } catch (error) {
      throw mapError(error);
    } finally {
      close();
    }
  }

  async function* stream(request: ChatRequest): AsyncGenerator<ProviderEvent> {
    const { response, touch, mapError, close } = await open(request, true);
    const toolCalls = new ToolCallAccumulator();
    let reason: FinishReason | null = null;
    let usage: ProviderUsage | null = null;
    let emitted = false;

    try {
      if (!response.body) {
        throw new ProviderError("server", { status: response.status, detail: "Empty body." });
      }

      for await (const payload of readSseData(response.body, touch)) {
        const chunk = parseChunk(payload, response.status);
        usage = toUsage(chunk.usage) ?? usage;

        const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
        const choice = asRecord(choices[0]);

        if (!choice) {
          continue;
        }

        const delta = asRecord(choice.delta);
        const text = flattenContent(delta?.content);

        if (text !== "") {
          emitted = true;
          yield { type: "text", text };
        }

        toolCalls.add(delta?.tool_calls);

        if (choice.finish_reason === "error") {
          throw new ProviderError("server", {
            status: response.status,
            detail: "The model ended the stream with an error.",
          });
        }

        if (typeof choice.finish_reason === "string") {
          reason = toFinishReason(choice.finish_reason);
        }
      }

      if (reason === null) {
        throw new ProviderError("server", {
          status: response.status,
          detail: "The stream ended without a finish reason.",
        });
      }

      for (const call of toolCalls.drain()) {
        emitted = true;
        yield { type: "tool_call", ...call };
      }

      yield { type: "finish", reason, usage };
    } catch (error) {
      const mapped = mapError(error);
      throw mapped instanceof ProviderError && emitted ? mapped.markAfterOutput() : mapped;
    } finally {
      close();
    }
  }

  return { model: settings.model, stream, complete };
}

function parseChunk(payload: string, status: number): Record<string, unknown> {
  let chunk: Record<string, unknown> | null;

  try {
    chunk = asRecord(JSON.parse(payload));
  } catch {
    chunk = null;
  }

  if (!chunk) {
    throw new ProviderError("server", { status, detail: "Malformed stream event." });
  }

  if (chunk.error !== undefined || chunk.object === "error") {
    throw new ProviderError("server", { status, detail: errorDetail(payload) });
  }

  return chunk;
}
