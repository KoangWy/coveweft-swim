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
      cause?: unknown;
    } = {},
  ) {
    const status = options.status ?? null;
    super(`AI provider request failed: ${kind}${status === null ? "" : ` (HTTP ${status})`}`, {
      cause: options.cause,
    });
    this.name = "ProviderError";
    this.kind = kind;
    this.status = status;
    this.detail = options.detail ?? null;
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
      cause: this.cause,
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

const MAX_DETAIL_LENGTH = 500;

/** Extracts a short message from a provider error body. */
export function errorDetail(body: string): string | null {
  const trimmed = body.trim();

  if (trimmed === "") {
    return null;
  }

  let detail = trimmed;

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const nested = record.error;
      const candidate =
        (nested && typeof nested === "object"
          ? (nested as Record<string, unknown>).message
          : nested) ??
        record.message ??
        record.detail;

      if (candidate !== undefined) {
        detail = typeof candidate === "string" ? candidate : JSON.stringify(candidate);
      }
    }
  } catch {
    // Plain-text body; keep it as is.
  }

  return detail.length > MAX_DETAIL_LENGTH ? `${detail.slice(0, MAX_DETAIL_LENGTH)}…` : detail;
}
