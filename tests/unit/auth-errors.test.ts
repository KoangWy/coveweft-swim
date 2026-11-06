import { describe, expect, it } from "vitest";

import { mapAuthError } from "@/server/auth/errors";

function authError(code: string, message: string, status?: number) {
  return { name: "AuthApiError", code, message, status } as Parameters<typeof mapAuthError>[0];
}

describe("mapAuthError", () => {
  it("maps a duplicate email", () => {
    expect(mapAuthError(authError("user_already_exists", "User already registered")).code).toBe(
      "EMAIL_TAKEN",
    );
  });

  it("maps invalid credentials", () => {
    expect(mapAuthError(authError("invalid_credentials", "Invalid login credentials")).code).toBe(
      "INVALID_CREDENTIALS",
    );
  });

  it("maps rate limits", () => {
    expect(mapAuthError(authError("over_request_rate_limit", "Too many requests")).code).toBe(
      "RATE_LIMITED",
    );
    expect(mapAuthError(authError("unknown", "rate limit reached", 429)).code).toBe("RATE_LIMITED");
  });

  it("maps weak passwords and validation failures", () => {
    expect(mapAuthError(authError("weak_password", "Password is too weak")).code).toBe(
      "VALIDATION_ERROR",
    );
    expect(mapAuthError(authError("unknown", "bad request", 400)).code).toBe("VALIDATION_ERROR");
    expect(mapAuthError(authError("unknown", "unprocessable", 422)).code).toBe("VALIDATION_ERROR");
  });

  it("maps session and permission failures", () => {
    expect(mapAuthError(authError("unknown", "unauthorized", 401)).code).toBe("UNAUTHENTICATED");
    expect(mapAuthError(authError("unknown", "forbidden", 403)).code).toBe("FORBIDDEN");
  });

  it("falls back to INTERNAL", () => {
    expect(mapAuthError(authError("unknown", "server error", 500)).code).toBe("INTERNAL");
  });
});
