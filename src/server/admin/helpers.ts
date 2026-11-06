import "server-only";

/** Rows at or below this stock level appear in the dashboard low-stock list. */
export const ADMIN_LOW_STOCK_THRESHOLD = 5;

export function normalizeNullable(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Removes characters that would break a PostgREST `or` expression. The result
 * is still a plain LIKE pattern; callers wrap it in `%...%`.
 */
export function sanitizeOrTerm(value: string): string {
  return value
    .replace(/[%_,()*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
