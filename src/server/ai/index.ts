import "server-only";

import { getAiConfig, type AiConfig } from "@/lib/config/env";

// The other modules in this folder import each other with explicit `.ts`
// extensions and no path aliases, so `pnpm ai:smoke` can load them in Node.
import { withFailover, type FailoverOptions } from "./failover";
import { createChatProvider, providerSettings, type ProviderOptions } from "./provider";
import type { ChatProvider } from "./types";

export { ProviderError, type ProviderErrorKind } from "./errors";
export { withFailover, withoutToolCalls, type FailoverOptions } from "./failover";
export { flattenContent } from "./normalize";
export {
  createChatProvider,
  DEFAULT_USER_AGENT,
  providerSettings,
  type ProviderOptions,
} from "./provider";
export type {
  ChatCompletion,
  ChatMessage,
  ChatProvider,
  ChatRequest,
  FinishReason,
  ProviderEvent,
  ProviderSettings,
  ProviderUsage,
  ToolCall,
  ToolDefinition,
} from "./types";

export type AiStatus =
  | { status: "ready"; primaryModel: string; fallbackModel: string | null }
  | { status: "not_configured"; reason: "missing_key" | "invalid_config" };

function readConfig(): AiConfig | null | "invalid" {
  try {
    return getAiConfig();
  } catch {
    return "invalid";
  }
}

/**
 * Reports whether the assistant can call a model. A missing key or a
 * malformed AI setting is reported as `not_configured`; it never throws.
 */
export function getAiStatus(): AiStatus {
  const config = readConfig();

  if (config === "invalid") {
    return { status: "not_configured", reason: "invalid_config" };
  }

  if (!config) {
    return { status: "not_configured", reason: "missing_key" };
  }

  return {
    status: "ready",
    primaryModel: config.primary.model,
    fallbackModel: config.fallback?.model ?? null,
  };
}

/**
 * Builds the assistant provider for one conversation turn: the primary role
 * with failover to the fallback role when one is configured. Returns `null`
 * when the assistant is not configured.
 */
export function createAiProvider(
  options: ProviderOptions & FailoverOptions = {},
): ChatProvider | null {
  const config = readConfig();

  if (config === "invalid" || !config) {
    return null;
  }

  const primary = createChatProvider(providerSettings(config, config.primary), options);
  const fallback = config.fallback
    ? createChatProvider(providerSettings(config, config.fallback), options)
    : null;

  return withFailover(primary, fallback, options);
}
