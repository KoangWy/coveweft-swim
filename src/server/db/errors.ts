import type { PostgrestError } from "@supabase/supabase-js";

import type { ErrorCode } from "@/server/errors";

/**
 * Stable error message codes raised by the Postgres functions. The service
 * layer maps these to the shared ErrorCode union so the UI never receives
 * database text.
 */
const DATABASE_ERROR_CODES: Readonly<Record<string, ErrorCode>> = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  CONFLICT: "CONFLICT",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  CART_CHANGED: "CART_CHANGED",
  ORDER_NOT_CANCELLABLE: "ORDER_NOT_CANCELLABLE",
  ORDER_STATE_CONFLICT: "ORDER_STATE_CONFLICT",
  PAYMENT_NOT_ALLOWED: "PAYMENT_NOT_ALLOWED",
  PAYMENT_EXPIRED: "PAYMENT_EXPIRED",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  INTERNAL: "INTERNAL",
};

type DatabaseError = Pick<PostgrestError, "code" | "message" | "details">;

export type MappedDatabaseError = { code: ErrorCode; details?: unknown };

/**
 * Converts a PostgREST error into the shared result error shape. Known
 * function codes win; Postgres privilege and uniqueness errors fall back to
 * the closest shared code.
 */
export function mapDatabaseError(error: DatabaseError | null | undefined): MappedDatabaseError {
  if (!error) {
    return { code: "INTERNAL" };
  }

  const mapped = DATABASE_ERROR_CODES[error.message];

  if (mapped) {
    return { code: mapped, details: parseDetails(error.details) };
  }

  if (error.code === "42501") {
    return { code: "FORBIDDEN" };
  }

  if (error.code === "23505") {
    return { code: "CONFLICT" };
  }

  return { code: "INTERNAL", details: error.message };
}

function parseDetails(details: string): unknown {
  if (!details) {
    return undefined;
  }

  try {
    return JSON.parse(details) as unknown;
  } catch {
    return details;
  }
}
