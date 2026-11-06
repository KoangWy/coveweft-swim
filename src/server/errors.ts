/**
 * Error codes shared by server services and UI code.
 *
 * The frontend maps each code to the `errors.<CODE>` message key in
 * `src/messages/{en,vi}.json`; services never return display text.
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "EMAIL_TAKEN",
  "RATE_LIMITED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PRODUCT_UNAVAILABLE",
  "OUT_OF_STOCK",
  "CART_CHANGED",
  "ORDER_NOT_CANCELLABLE",
  "ORDER_STATE_CONFLICT",
  "PAYMENT_FAILED",
  "PAYMENT_NOT_ALLOWED",
  "PAYMENT_EXPIRED",
  "CONSENT_REQUIRED",
  "QUOTA_EXCEEDED",
  "AI_NOT_CONFIGURED",
  "AI_UNAVAILABLE",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Stable validation issue codes carried in `VALIDATION_ERROR` details. The
 * frontend localizes these codes; the server never returns prose. `field` is
 * the dotted input path, or an empty string for a form-level issue.
 */
export const VALIDATION_ISSUE_CODES = [
  "required",
  "invalid_type",
  "invalid_format",
  "invalid_value",
  "too_small",
  "too_large",
  "unknown_field",
  "invalid_range",
  "require_one_of",
  "at_least_one_field",
  "missing_create_fields",
  "unknown",
] as const;

export type ValidationIssueCode = (typeof VALIDATION_ISSUE_CODES)[number];

export type ValidationIssue = {
  field: string;
  code: ValidationIssueCode;
  /** Structured constraint data such as `minimum`, `maximum`, or `format`. */
  params?: Record<string, unknown>;
};

export type Result<T> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; details?: unknown } };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, details?: unknown): Result<never> {
  return details === undefined
    ? { ok: false, error: { code } }
    : { ok: false, error: { code, details } };
}
