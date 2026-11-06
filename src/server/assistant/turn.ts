import type { Locale } from "@/lib/locale";
import type { AssistantLimits } from "@/lib/config/env";
import { ProviderError, type ChatMessage, type ChatProvider, type ToolCall } from "@/server/ai";

import { toChatMessages, type HistoryMessage } from "./history";
import { createPrivacyGate, type PrivacyProfile } from "./privacy";
import { buildSystemPrompt } from "./prompt";
import {
  runTool,
  TOOL_DEFINITIONS,
  type AssistantCatalog,
  type ProductCard,
  type ToolContext,
} from "./tools";

/** Tool calls executed per model response; extra calls are ignored. */
const MAX_TOOL_CALLS_PER_ROUND = 6;
/** Product cards sent with one answer. */
const MAX_PRODUCT_CARDS = 6;

export type AssistantEvent =
  | { type: "delta"; text: string }
  | { type: "products"; items: ProductCard[] }
  | { type: "error"; code: "AI_UNAVAILABLE" | "AI_STREAM_INTERRUPTED"; retryable: boolean };

export type AssistantTurnInput = {
  /** One provider per turn, so failover is decided once for every round. */
  provider: ChatProvider;
  history: HistoryMessage[];
  /**
   * The signed-in customer's profile, used only to redact those values from
   * the history. It is never sent to the provider.
   */
  privacyProfile?: PrivacyProfile | null;
  locale: Locale;
  catalog: AssistantCatalog;
  limits: Pick<AssistantLimits, "maxToolRounds" | "maxResponseChars">;
  signal?: AbortSignal;
};

/**
 * Picks the cards for the products the answer mentions, by SKU or exact name,
 * in the order they appear. Only products returned by tools in this turn are
 * candidates, so a SKU or price the model wrote on its own never becomes a
 * card.
 */
export function selectProductCards(
  cards: ReadonlyMap<string, ProductCard>,
  answer: string,
): ProductCard[] {
  const text = answer.toLowerCase();

  return [...cards.values()]
    .map((card) => {
      const positions = [card.sku, card.name]
        .map((value) => text.indexOf(value.toLowerCase()))
        .filter((position) => position !== -1);

      return { card, position: positions.length > 0 ? Math.min(...positions) : -1 };
    })
    .filter((entry) => entry.position !== -1)
    .sort((left, right) => left.position - right.position)
    .slice(0, MAX_PRODUCT_CARDS)
    .map((entry) => entry.card);
}

function logFailure(error: unknown, model: string, round: number): void {
  // Only the error class is logged: never the conversation, measurements,
  // provider error text, or keys.
  console.error("Shopping assistant turn failed", {
    kind: error instanceof ProviderError ? error.kind : "unexpected",
    status: error instanceof ProviderError ? error.status : null,
    model,
    round,
  });
}

/**
 * Runs one customer question: streams the model answer, executes read-only
 * tool calls between rounds, and ends with the product cards the answer
 * mentions. The last round is sent without tools so the model must answer,
 * and the streamed text is capped at `maxResponseChars`.
 *
 * Failover happens inside the provider and only before any answer text was
 * streamed in this turn. A failure after text ends the turn with
 * `AI_STREAM_INTERRUPTED` instead of joining two answers.
 */
export async function* runAssistantTurn(input: AssistantTurnInput): AsyncGenerator<AssistantEvent> {
  const { provider, limits, signal } = input;
  const context: ToolContext = { locale: input.locale, catalog: input.catalog, cards: new Map() };
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input.locale) },
    ...toChatMessages(input.history, createPrivacyGate(input.privacyProfile ?? null)),
  ];
  let answer = "";

  for (let round = 0; round < limits.maxToolRounds; round += 1) {
    const lastRound = round === limits.maxToolRounds - 1;
    const calls: ToolCall[] = [];
    let roundText = "";
    let capped = false;

    try {
      for await (const event of provider.stream({
        messages,
        tools: lastRound ? undefined : TOOL_DEFINITIONS,
        signal,
      })) {
        if (event.type === "text") {
          const piece = event.text.slice(0, limits.maxResponseChars - answer.length);

          if (piece !== "") {
            answer += piece;
            roundText += piece;
            yield { type: "delta", text: piece };
          }

          if (piece.length < event.text.length) {
            capped = true;
            break;
          }
        } else if (event.type === "tool_call") {
          calls.push({ id: event.id, name: event.name, arguments: event.arguments });
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      logFailure(error, provider.model, round);

      const interrupted = answer !== "" || (error instanceof ProviderError && error.afterOutput);

      yield interrupted
        ? { type: "error", code: "AI_STREAM_INTERRUPTED", retryable: true }
        : {
            type: "error",
            code: "AI_UNAVAILABLE",
            retryable: error instanceof ProviderError ? error.retryable : true,
          };
      return;
    }

    if (capped || calls.length === 0 || lastRound) {
      break;
    }

    const executed = calls.slice(0, MAX_TOOL_CALLS_PER_ROUND);
    messages.push({ role: "assistant", content: roundText, toolCalls: executed });

    for (const call of executed) {
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: await runTool(call.name, call.arguments, context),
      });
    }
  }

  if (answer.trim() === "") {
    logFailure(null, provider.model, limits.maxToolRounds);
    yield { type: "error", code: "AI_UNAVAILABLE", retryable: true };
    return;
  }

  const items = selectProductCards(context.cards, answer);

  if (items.length > 0) {
    yield { type: "products", items };
  }
}
