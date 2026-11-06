import type {
  ChatCompletion,
  ChatMessage,
  FinishReason,
  ProviderSettings,
  ProviderUsage,
  ToolCall,
  ToolDefinition,
} from "./types.ts";

/**
 * Returns the answer text of a Chat Completions `content` value.
 *
 * Mistral reasoning models send `content` either as a string or as an array
 * of chunks such as `[{ type: "thinking", thinking: [...] }, { type: "text",
 * text: "..." }]`, in full responses and in streamed deltas alike. Only `text`
 * chunks are kept; `thinking` chunks and any other chunk type are dropped, so
 * reasoning never reaches the customer, the log, or a later request.
 */
export function flattenContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  let text = "";

  for (const chunk of content) {
    if (chunk && typeof chunk === "object") {
      const { type, text: value } = chunk as { type?: unknown; text?: unknown };

      if (type === "text" && typeof value === "string") {
        text += value;
      }
    }
  }

  return text;
}

type WireToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type WireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content?: string; tool_calls?: WireToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

/**
 * Maps messages to the request format field by field, so reasoning fields
 * such as `reasoning_content`, `reasoning`, or `thinking` cannot be sent even
 * if a caller attaches them. An assistant message that only carries tool
 * calls omits `content` instead of sending an empty string.
 */
export function toWireMessage(message: ChatMessage): WireMessage {
  switch (message.role) {
    case "system":
    case "user":
      return { role: message.role, content: message.content };
    case "assistant": {
      const toolCalls = message.toolCalls ?? [];

      if (toolCalls.length === 0) {
        return { role: "assistant", content: message.content };
      }

      return {
        role: "assistant",
        ...(message.content.trim() === "" ? {} : { content: message.content }),
        tool_calls: toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    case "tool":
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      };
  }
}

function toWireTool(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

/**
 * Builds a Chat Completions request body with standard fields only. Mistral
 * answers `422 extra_forbidden` to unknown parameters, so `reasoning_effort`
 * is sent only when the role configures it.
 */
export function buildRequestBody(
  settings: Pick<ProviderSettings, "model" | "maxTokens" | "reasoningEffort">,
  request: { messages: ChatMessage[]; tools?: ToolDefinition[] },
  stream: boolean,
): Record<string, unknown> {
  const tools = request.tools ?? [];

  return {
    model: settings.model,
    messages: request.messages.map(toWireMessage),
    max_tokens: settings.maxTokens,
    stream,
    ...(tools.length > 0 ? { tools: tools.map(toWireTool) } : {}),
    ...(settings.reasoningEffort ? { reasoning_effort: settings.reasoningEffort } : {}),
  };
}

export function toFinishReason(value: unknown): FinishReason {
  switch (value) {
    case "stop":
    case "tool_calls":
    case "content_filter":
      return value;
    case "length":
    case "model_length":
      return "length";
    default:
      return "other";
  }
}

export function toUsage(value: unknown): ProviderUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const { prompt_tokens: input, completion_tokens: output } = value as Record<string, unknown>;

  if (typeof input !== "number" || typeof output !== "number") {
    return null;
  }

  return { inputTokens: input, outputTokens: output };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const call = asRecord(entry);
    const fn = asRecord(call?.function);

    if (typeof call?.id !== "string" || typeof fn?.name !== "string") {
      return [];
    }

    const args = fn.arguments;

    return [
      {
        id: call.id,
        name: fn.name,
        arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
      },
    ];
  });
}

/** Normalizes a non-streaming Chat Completions response. */
export function parseCompletion(body: unknown): ChatCompletion | null {
  const root = asRecord(body);
  const choices = root?.choices;
  const choice = Array.isArray(choices) ? asRecord(choices[0]) : null;
  const message = asRecord(choice?.message);

  if (!root || !choice || !message) {
    return null;
  }

  return {
    text: flattenContent(message.content),
    toolCalls: toToolCalls(message.tool_calls),
    reason: toFinishReason(choice.finish_reason),
    usage: toUsage(root.usage),
  };
}

type PendingToolCall = { id: string; name: string; arguments: string };

/**
 * Collects streamed tool call fragments by `index` until the stream finishes.
 * A fragment without an index is placed by its position in the delta.
 */
export class ToolCallAccumulator {
  private readonly calls = new Map<number, PendingToolCall>();

  add(deltaToolCalls: unknown): void {
    if (!Array.isArray(deltaToolCalls)) {
      return;
    }

    deltaToolCalls.forEach((entry, position) => {
      const fragment = asRecord(entry);

      if (!fragment) {
        return;
      }

      const index = typeof fragment.index === "number" ? fragment.index : position;
      const pending = this.calls.get(index) ?? { id: "", name: "", arguments: "" };
      const fn = asRecord(fragment.function);

      if (typeof fragment.id === "string" && fragment.id !== "") {
        pending.id = fragment.id;
      }

      if (typeof fn?.name === "string") {
        pending.name += fn.name;
      }

      if (typeof fn?.arguments === "string") {
        pending.arguments += fn.arguments;
      } else if (fn?.arguments && typeof fn.arguments === "object") {
        pending.arguments += JSON.stringify(fn.arguments);
      }

      this.calls.set(index, pending);
    });
  }

  drain(): ToolCall[] {
    const calls = [...this.calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => call)
      .filter((call) => call.id !== "" && call.name !== "");

    this.calls.clear();

    return calls;
  }
}
