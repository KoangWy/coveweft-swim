import { describe, expect, it } from "vitest";

import { fail, ok } from "@/server/errors";

describe("Result helpers", () => {
  it("wraps data in a success result", () => {
    expect(ok({ id: "product-1" })).toEqual({ ok: true, data: { id: "product-1" } });
  });

  it("creates a failure result without details", () => {
    expect(fail("NOT_FOUND")).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("keeps structured details on failure", () => {
    const details = { field: "email" };

    expect(fail("VALIDATION_ERROR", details)).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", details },
    });
  });
});
