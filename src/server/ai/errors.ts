import { sanitizeDetail, stripReasoning } from "./redact.ts";

export type ProviderErrorKind =
  "timeout" | "rate_limit" | "server" | "auth" | "config" | "bad_request";

/** Kinds that may succeed on another attempt or another model. */
const TRANSIENT_KINDS: ReadonlySet<ProviderErrorKind> = new Set([
  "timeout",
  "rate_limit",
  "server",
]);

/**
 * A failed provider request. `detail` is a trimmed copy of the provider's
 * error message for logs; it is never shown to customers.
 */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | null;
  readonly detail: string | null;
  /** True when part of the answer had already been emitted. */
  readonly afterOutput: boolean;

  constructor(
    kind: ProviderErrorKind,
    options: {
      status?: number | null;
      detail?: string | null;
      afterOutput?: boolean;
    } = {},
  ) {
    const status = options.status ?? null;
    // No `cause`: native errors and response bodies can carry headers, keys,
    // or reasoning text, so only a sanitized `detail` is kept.
    super(`AI provider request failed: ${kind}${status === null ? "" : ` (HTTP ${status})`}`);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = status;
    this.detail = sanitizeDetail(options.detail);
    this.afterOutput = options.afterOutput ?? false;
  }

  /** The customer may retry the question later. */
  get retryable(): boolean {
    return TRANSIENT_KINDS.has(this.kind);
  }

  /** The request can move to the fallback provider. */
  get canFailover(): boolean {
    return this.retryable && !this.afterOutput;
  }

  markAfterOutput(): ProviderError {
    if (this.afterOutput) {
      return this;
    }

    return new ProviderError(this.kind, {
      status: this.status,
      detail: this.detail,
      afterOutput: true,
    });
  }
}

export function kindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 402 || status === 403) {
    return "auth";
  }

  if (status === 404) {
    return "config";
  }

  if (status === 408) {
    return "timeout";
  }

  if (status === 429) {
    return "rate_limit";
  }

  if (status >= 500) {
    return "server";
  }

  return "bad_request";
}

/**
 * Extracts a short, safe message from a provider error body. Reasoning
 * fields and `thinking` chunks are removed and secrets are redacted before
 * the text is truncated. A body that is not JSON gets a fixed message.
 */
export function errorDetail(
  body: string,
  status: number,
  secrets: readonly string[] = [],
): string | null {
  const trimmed = body.trim();

  if (trimmed === "") {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Unparsable text cannot be checked for reasoning, so it is not echoed.
    return `Provider returned a non-JSON error body (HTTP ${status}).`;
  }

  const safe = stripReasoning(parsed);
  let candidate: unknown = safe;

  if (safe && typeof safe === "object" && !Array.isArray(safe)) {
    const record = safe as Record<string, unknown>;
    const nested = record.error;
    candidate =
      (nested && typeof nested === "object"
        ? (nested as Record<string, unknown>).message
        : nested) ??
      record.message ??
      record.detail ??
      safe;
  }

  return sanitizeDetail(
    typeof candidate === "string" ? candidate : JSON.stringify(candidate ?? null),
    secrets,
  );
}
