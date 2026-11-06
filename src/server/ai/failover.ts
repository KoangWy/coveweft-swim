import { ProviderError } from "./errors.ts";
import type {
  ChatCompletion,
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ProviderEvent,
} from "./types.ts";

export type FailoverOptions = {
  /** Called once, when requests move to the fallback provider. */
  onFailover?: (error: ProviderError) => void;
};

/**
 * Removes the tool calls a provider produced, and their results, from a
 * conversation. Tool call ids differ in format between models, so the
 * fallback starts from the text history and runs its own tools.
 */
export function withoutToolCalls(messages: ChatMessage[], ids: ReadonlySet<string>): ChatMessage[] {
  return messages.flatMap((message): ChatMessage[] => {
    if (message.role === "tool") {
      return ids.has(message.toolCallId) ? [] : [message];
    }

    if (message.role !== "assistant" || !message.toolCalls?.length) {
      return [message];
    }

    const kept = message.toolCalls.filter((call) => !ids.has(call.id));

    if (kept.length > 0) {
      return [{ ...message, toolCalls: kept }];
    }

    return message.content.trim() === "" ? [] : [{ role: "assistant", content: message.content }];
  });
}

/**
 * Serves the requests of one customer turn from `primary` and moves to
 * `fallback` at most once, when the primary fails with a timeout, a rate
 * limit, or a server error. The returned provider is turn-scoped: create one
 * per user turn and reuse it for every request of that turn, including each
 * tool round; never reuse it for another turn.
 *
 * Failover happens only while the turn has emitted no text, in any request,
 * and the failing request emitted no tool call. Rounds that only produced
 * tool calls can still fail over; the primary's tool calls and results are
 * then removed from the history. Once text was emitted, later errors are
 * rethrown as retryable with `afterOutput` instead of joining two answers.
 * A request the caller cancelled is never retried, and `auth`, `config`, and
 * `bad_request` errors are never retried.
 */
export function withFailover(
  primary: ChatProvider,
  fallback: ChatProvider | null,
  options: FailoverOptions = {},
): ChatProvider {
  let active: ChatProvider = primary;
  const primaryToolCallIds = new Set<string>();

  // Turn-scoped: once customer-visible text was emitted by any request of
  // this turn, later errors never switch providers.
  let textEmitted = false;

  function shouldFailover(error: unknown, request: ChatRequest): error is ProviderError {
    return (
      fallback !== null &&
      active === primary &&
      !textEmitted &&
      !request.signal?.aborted &&
      error instanceof ProviderError &&
      error.canFailover
    );
  }

  function afterTurnOutput(error: unknown): unknown {
    return textEmitted && error instanceof ProviderError ? error.markAfterOutput() : error;
  }

  function switchToFallback(error: ProviderError): ChatProvider {
    active = fallback!;
    options.onFailover?.(error);

    return active;
  }

  function forActive(request: ChatRequest): ChatRequest {
    return active === primary || primaryToolCallIds.size === 0
      ? request
      : { ...request, messages: withoutToolCalls(request.messages, primaryToolCallIds) };
  }

  async function* stream(request: ChatRequest): AsyncGenerator<ProviderEvent> {
    const provider = active;
    let emitted = false;

    try {
      for await (const event of provider.stream(forActive(request))) {
        if (event.type === "text") {
          textEmitted = true;
        }

        if (event.type === "text" || event.type === "tool_call") {
          emitted = true;
        }

        if (event.type === "tool_call" && provider === primary) {
          primaryToolCallIds.add(event.id);
        }

        yield event;
      }

      return;
    } catch (error) {
      if (emitted && error instanceof ProviderError) {
        throw error.markAfterOutput();
      }

      if (!shouldFailover(error, request)) {
        throw afterTurnOutput(error);
      }

      switchToFallback(error);
    }

    yield* active.stream(forActive(request));
  }

  async function complete(request: ChatRequest): Promise<ChatCompletion> {
    const provider = active;

    try {
      const completion = await provider.complete(forActive(request));

      if (provider === primary) {
        for (const call of completion.toolCalls) {
          primaryToolCallIds.add(call.id);
        }
      }

      if (completion.text.trim() !== "") {
        textEmitted = true;
      }

      return completion;
    } catch (error) {
      if (!shouldFailover(error, request)) {
        throw afterTurnOutput(error);
      }

      const completion = await switchToFallback(error).complete(forActive(request));

      if (completion.text.trim() !== "") {
        textEmitted = true;
      }

      return completion;
    }
  }

  return {
    get model() {
      return active.model;
    },
    stream,
    complete,
  };
}
