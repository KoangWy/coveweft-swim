import type { AssistantLimits } from "@/lib/config/env";
import type { ChatMessage } from "@/server/ai";

export type HistoryMessage = { role: "user" | "assistant"; content: string };

export type SanitizedHistory =
  | { ok: true; messages: HistoryMessage[] }
  | { ok: false; code: "AI_INPUT_TOO_LONG" | "VALIDATION_ERROR"; reason: string };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Vietnamese mobile and landline numbers (0xx or +84) and other international
// numbers written with a leading "+". Prices such as "400.000" or "400000"
// never start with 0 or +, so they are kept.
const PHONE = /(?:\+\d{1,3}|\b0)(?:[\s.-]?\d){8,11}\b/g;

/**
 * Replaces email addresses and phone numbers with placeholders, so contact
 * details a customer types by mistake are not sent to the provider.
 */
export function redactContactDetails(text: string): string {
  return text.replace(EMAIL, "[email removed]").replace(PHONE, "[phone removed]");
}

function textOf(entry: unknown): HistoryMessage | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const { role, content } = entry as { role?: unknown; content?: unknown };

  if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
    return null;
  }

  const trimmed = content.trim();

  return trimmed === "" ? null : { role, content: trimmed };
}

/**
 * Turns the untrusted history sent by the browser into model messages.
 *
 * - Only `user` and `assistant` messages with string content are kept;
 *   `system`, `tool`, tool calls, and any other field are dropped.
 * - The last message must be the customer's new question. A question longer
 *   than the per-message or total limit is rejected, never cut.
 * - Earlier messages longer than the per-message limit are dropped whole, then
 *   the oldest are dropped until the count and total length fit.
 * - Contact details are redacted from every message.
 */
export function sanitizeHistory(entries: unknown[], limits: AssistantLimits): SanitizedHistory {
  const messages = entries.map(textOf).filter((entry) => entry !== null);
  const question = messages.at(-1);

  if (!question || question.role !== "user") {
    return { ok: false, code: "VALIDATION_ERROR", reason: "missing_question" };
  }

  if (
    question.content.length > limits.messageMaxChars ||
    question.content.length > limits.historyMaxChars
  ) {
    return { ok: false, code: "AI_INPUT_TOO_LONG", reason: "question_too_long" };
  }

  const earlier = messages
    .slice(0, -1)
    .filter((message) => message.content.length <= limits.messageMaxChars);
  const kept: HistoryMessage[] = [];
  let total = question.content.length;

  for (let index = earlier.length - 1; index >= 0; index -= 1) {
    const message = earlier[index]!;

    if (kept.length >= limits.historyMaxMessages) {
      break;
    }

    if (total + message.content.length > limits.historyMaxChars) {
      break;
    }

    total += message.content.length;
    kept.unshift(message);
  }

  // A conversation sent to the model starts with a customer message.
  while (kept[0]?.role === "assistant") {
    kept.shift();
  }

  return {
    ok: true,
    messages: [...kept, question].map((message) => ({
      role: message.role,
      content: redactContactDetails(message.content),
    })),
  };
}

export function toChatMessages(history: HistoryMessage[]): ChatMessage[] {
  return history.map((message) => ({ role: message.role, content: message.content }));
}
