import type { z } from "zod";

import { fail, ok, type ErrorCode, type Result } from "./errors";

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

/**
 * Validates a service input with its exported zod schema. Validation failures
 * carry the field paths and messages as structured details; the UI never
 * renders them directly.
 */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): Result<z.output<TSchema>> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
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
