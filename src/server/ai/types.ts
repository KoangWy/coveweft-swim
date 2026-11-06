/**
 * Provider-neutral chat types. The adapter maps them to the OpenAI-compatible
 * Chat Completions format, so only the fields declared here ever reach a
 * provider.
 */

export type ToolCall = {
  id: string;
  name: string;
  /** JSON-encoded arguments exactly as the model produced them. */
  arguments: string;
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>;
};

export type ChatRequest = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  signal?: AbortSignal;
};

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "other";

export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type ProviderEvent =
  | { type: "text"; text: string }
  | ({ type: "tool_call" } & ToolCall)
  | { type: "finish"; reason: FinishReason; usage: ProviderUsage | null };

export type ChatCompletion = {
  text: string;
  toolCalls: ToolCall[];
  reason: FinishReason;
  usage: ProviderUsage | null;
};

export interface ChatProvider {
  /** Model that serves the next request. */
  readonly model: string;
  /**
   * Streams one model response. Text arrives as it is generated; tool calls
   * are emitted whole, after the text and before `finish`.
   */
  stream(request: ChatRequest): AsyncIterable<ProviderEvent>;
  /** Requests one model response without streaming. */
  complete(request: ChatRequest): Promise<ChatCompletion>;
}

/** Settings for one provider role, as returned by `getAiConfig()`. */
export type ProviderSettings = {
  baseUrl: string;
  model: string;
  apiKey: string;
  reasoningEffort: string | null;
  timeoutMs: number;
  maxTokens: number;
};
