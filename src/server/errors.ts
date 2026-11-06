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
