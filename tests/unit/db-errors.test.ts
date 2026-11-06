import { describe, expect, it } from "vitest";

import { mapDatabaseError } from "@/server/db/errors";

function postgrestError(message: string, code = "P0001", details = "") {
  return { message, code, details };
}

describe("mapDatabaseError", () => {
  it("maps a stable function code and parses its details", () => {
    const mapped = mapDatabaseError(
      postgrestError("OUT_OF_STOCK", "P0001", '{"variantIds":["variant-1"]}'),
    );

    expect(mapped).toEqual({
      code: "OUT_OF_STOCK",
      details: { variantIds: ["variant-1"] },
    });
  });

  it("maps the order and payment state codes", () => {
    expect(mapDatabaseError(postgrestError("ORDER_STATE_CONFLICT")).code).toBe(
      "ORDER_STATE_CONFLICT",
    );
    expect(mapDatabaseError(postgrestError("PAYMENT_NOT_ALLOWED")).code).toBe(
      "PAYMENT_NOT_ALLOWED",
    );
    expect(mapDatabaseError(postgrestError("PAYMENT_EXPIRED")).code).toBe("PAYMENT_EXPIRED");
    expect(mapDatabaseError(postgrestError("CONSENT_REQUIRED")).code).toBe("CONSENT_REQUIRED");
  });

  it("maps a Postgres privilege error to FORBIDDEN", () => {
    expect(mapDatabaseError(postgrestError("permission denied", "42501")).code).toBe("FORBIDDEN");
  });

  it("maps a unique violation to CONFLICT", () => {
    expect(mapDatabaseError(postgrestError("duplicate key value", "23505")).code).toBe("CONFLICT");
  });

  it("keeps non-JSON details as text", () => {
    expect(mapDatabaseError(postgrestError("CONFLICT", "P0001", "plain detail"))).toEqual({
      code: "CONFLICT",
      details: "plain detail",
    });
  });

  it("falls back to INTERNAL for unknown errors", () => {
    expect(mapDatabaseError(postgrestError("something else", "XX000"))).toEqual({
      code: "INTERNAL",
      details: "something else",
    });
    expect(mapDatabaseError(null)).toEqual({ code: "INTERNAL" });
  });
});
