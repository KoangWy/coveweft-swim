import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ValidationIssue } from "@/server/errors";
import { parseInput } from "@/server/result";
import { AdminAdjustStockInput, AdminUpsertProductInput } from "@/server/admin/schemas";
import { UpdateProfileInput } from "@/server/auth/schemas";
import { GetSizeGuideInput, ListProductsInput } from "@/server/catalog/schemas";

function readIssues(result: {
  ok: boolean;
  error?: { code: string; details?: unknown };
}): ValidationIssue[] {
  if (result.ok) {
    throw new Error("Expected a validation failure.");
  }

  return (result.error?.details as { issues: ValidationIssue[] }).issues;
}

describe("validation issue codes", () => {
  it("returns required for a missing field", () => {
    expect(readIssues(parseInput(z.object({ name: z.string() }), {}))).toEqual([
      { field: "name", code: "required" },
    ]);
  });

  it("returns too_large with the maximum", () => {
    expect(readIssues(parseInput(z.object({ name: z.string().max(3) }), { name: "abcd" }))).toEqual(
      [
        {
          field: "name",
          code: "too_large",
          params: { maximum: 3, inclusive: true, type: "string" },
        },
      ],
    );
  });

  it("returns invalid_format for an email", () => {
    expect(
      readIssues(parseInput(z.object({ email: z.email() }), { email: "not-an-email" })),
    ).toEqual([{ field: "email", code: "invalid_format", params: { format: "email" } }]);
  });

  it("returns invalid_value for an enum", () => {
    expect(readIssues(parseInput(z.object({ role: z.enum(["a", "b"]) }), { role: "c" }))).toEqual([
      { field: "role", code: "invalid_value", params: { values: ["a", "b"] } },
    ]);
  });

  it("returns a stable code for an inverted price range", () => {
    expect(readIssues(parseInput(ListProductsInput, { priceMin: 200, priceMax: 100 }))).toEqual([
      { field: "priceMax", code: "invalid_range" },
    ]);
  });

  it("returns a stable code for a missing size guide selector", () => {
    expect(readIssues(parseInput(GetSizeGuideInput, {}))).toEqual([
      { field: "", code: "require_one_of" },
    ]);
  });

  it("returns a stable code for an empty profile patch", () => {
    expect(readIssues(parseInput(UpdateProfileInput, {}))).toEqual([
      { field: "", code: "at_least_one_field" },
    ]);
  });

  it("returns a stable code for missing create fields", () => {
    expect(readIssues(parseInput(AdminUpsertProductInput, { name: "Only a name" }))).toEqual([
      { field: "", code: "missing_create_fields" },
    ]);
  });

  it("returns a stable code for an invalid stock adjustment", () => {
    expect(
      readIssues(
        parseInput(AdminAdjustStockInput, {
          variantId: "7f3d9e2a-1b2c-4d5e-8f90-123456789abc",
          reason: "restock",
        }),
      ),
    ).toEqual([{ field: "", code: "require_one_of" }]);
  });

  it("never returns prose", () => {
    const issues = readIssues(parseInput(z.object({ name: z.string() }), {}));

    expect(issues.every((issue) => !("message" in issue))).toBe(true);
  });
});
