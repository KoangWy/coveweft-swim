import type { z } from "zod";

import {
  fail,
  ok,
  type ErrorCode,
  type Result,
  type ValidationIssue,
  type ValidationIssueCode,
  VALIDATION_ISSUE_CODES,
} from "./errors";

/**
 * A service failure raised by repository code. `runService` turns it back into
 * the shared result shape so callers never receive a raw exception.
 */
export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, details?: unknown) {
    super(code);
    this.name = "ServiceError";
    this.code = code;
    this.details = details;
  }
}

type ZodIssueLike = {
  code: string;
  path: PropertyKey[];
  message: string;
  params?: Record<string, unknown>;
  expected?: unknown;
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
  origin?: string;
  format?: string;
  values?: unknown[];
  keys?: string[];
};

const ZOD_ISSUE_CODE_MAP: Readonly<Record<string, ValidationIssueCode>> = {
  invalid_type: "invalid_type",
  too_small: "too_small",
  too_big: "too_large",
  invalid_format: "invalid_format",
  invalid_value: "invalid_value",
  invalid_union: "invalid_value",
  unrecognized_keys: "unknown_field",
  custom: "invalid_value",
  not_multiple_of: "invalid_value",
  invalid_key: "invalid_value",
};

function isValidationIssueCode(value: unknown): value is ValidationIssueCode {
  return typeof value === "string" && (VALIDATION_ISSUE_CODES as readonly string[]).includes(value);
}

function withoutIssueParam(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!params) {
    return undefined;
  }

  const rest = Object.fromEntries(Object.entries(params).filter(([key]) => key !== "issue"));

  return Object.keys(rest).length > 0 ? rest : undefined;
}

function compactParams(params: Record<string, unknown>): Record<string, unknown> | undefined {
  const compacted = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );

  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

/**
 * Converts a zod issue into a stable field code. The message is deliberately
 * dropped: the frontend owns the English and Vietnamese wording.
 */
function mapZodIssue(issue: ZodIssueLike): ValidationIssue {
  const field = issue.path.map(String).join(".");

  if (issue.code === "invalid_type" && /received undefined/i.test(issue.message)) {
    return { field, code: "required" };
  }

  if (issue.code === "custom") {
    const customCode = issue.params?.issue;

    if (isValidationIssueCode(customCode)) {
      return { field, code: customCode, params: withoutIssueParam(issue.params) };
    }

    return { field, code: "invalid_value", params: withoutIssueParam(issue.params) };
  }

  const params: Record<string, unknown> = {};

  switch (issue.code) {
    case "invalid_type":
      params.expected = issue.expected;
      break;
    case "too_small":
      params.minimum = issue.minimum;
      params.inclusive = issue.inclusive;
      params.type = issue.origin;
      break;
    case "too_big":
      params.maximum = issue.maximum;
      params.inclusive = issue.inclusive;
      params.type = issue.origin;
      break;
    case "invalid_format":
      params.format = issue.format;
      break;
    case "invalid_value":
      params.values = issue.values;
      break;
    case "unrecognized_keys":
      params.keys = issue.keys;
      break;
    default:
      break;
  }

  return {
    field,
    code: ZOD_ISSUE_CODE_MAP[issue.code] ?? "unknown",
    params: compactParams(params),
  };
}

/**
 * Validates a service input with its exported zod schema. Validation failures
 * carry stable field codes and structured constraint data; the UI localizes
 * them and never receives server prose.
 */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): Result<z.output<TSchema>> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", {
      issues: (parsed.error.issues as unknown as ZodIssueLike[]).map(mapZodIssue),
    });
  }

  return ok(parsed.data);
}

/**
 * Runs a service body and turns an unexpected exception into the shared
 * `INTERNAL` code. Known failures return their own result.
 */
export async function runService<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ServiceError) {
      return fail(error.code, error.details);
    }

    return fail("INTERNAL");
  }
}
