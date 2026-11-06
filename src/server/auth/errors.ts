import type { AuthError } from "@supabase/supabase-js";

import type { ErrorCode } from "@/server/errors";

const AUTH_ERROR_CODES: Readonly<Record<string, ErrorCode>> = {
  email_exists: "EMAIL_TAKEN",
  user_already_exists: "EMAIL_TAKEN",
  weak_password: "VALIDATION_ERROR",
  invalid_credentials: "INVALID_CREDENTIALS",
  over_request_rate_limit: "RATE_LIMITED",
  over_email_send_rate_limit: "RATE_LIMITED",
  signup_disabled: "FORBIDDEN",
  email_not_confirmed: "UNAUTHENTICATED",
  session_not_found: "UNAUTHENTICATED",
  refresh_token_not_found: "UNAUTHENTICATED",
  same_password: "VALIDATION_ERROR",
  validation_failed: "VALIDATION_ERROR",
};

/**
 * Maps a Supabase Auth error to the shared code. The auth server hides the
 * database trigger message, so consent is validated before `signUp` and never
 * inferred from this error.
 */
export function mapAuthError(error: AuthError): { code: ErrorCode; details?: unknown } {
  const mapped = error.code ? AUTH_ERROR_CODES[error.code] : undefined;

  if (mapped) {
    return { code: mapped };
  }

  if (/already registered|already exists/i.test(error.message)) {
    return { code: "EMAIL_TAKEN" };
  }

  if (/invalid login credentials/i.test(error.message)) {
    return { code: "INVALID_CREDENTIALS" };
  }

  if (/rate limit/i.test(error.message)) {
    return { code: "RATE_LIMITED" };
  }

  if (error.status === 429) {
    return { code: "RATE_LIMITED" };
  }

  if (error.status === 401) {
    return { code: "UNAUTHENTICATED" };
  }

  if (error.status === 403) {
    return { code: "FORBIDDEN" };
  }

  if (error.status === 400 || error.status === 422) {
    return { code: "VALIDATION_ERROR" };
  }

  return { code: "INTERNAL" };
}
