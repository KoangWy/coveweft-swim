import { describe, expect, it } from "vitest";

import { isUuid, normalizeNullable, sanitizeOrTerm } from "@/server/admin/helpers";

describe("admin helpers", () => {
  it("normalizes empty strings to null", () => {
    expect(normalizeNullable("  ")).toBeNull();
    expect(normalizeNullable(null)).toBeNull();
    expect(normalizeNullable(undefined)).toBeNull();
    expect(normalizeNullable("  value  ")).toBe("value");
  });

  it("removes PostgREST or-expression characters", () => {
    expect(sanitizeOrTerm("a,b(c)*d_e%f")).toBe("a b c d e f");
    expect(sanitizeOrTerm("  plain  ")).toBe("plain");
  });

  it("recognizes UUIDs", () => {
    expect(isUuid("7f3d9e2a-1b2c-4d5e-8f90-123456789abc")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
