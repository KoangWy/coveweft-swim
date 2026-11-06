import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";
import type { ErrorCode } from "@/server/errors";

/** Per-field validation codes, localized through `validation.<code>`. */
export type FieldErrors = Record<string, string>;

export type FormState = {
  /** Error code for the whole form, localized through `errors.<code>`. */
  code?: ErrorCode;
  fieldErrors?: FieldErrors;
  /** Submitted values to refill the form after a failed submission. */
  values?: Record<string, string>;
};

const KNOWN_CODES = ["required", "too_long", "too_short", "invalid_format", "invalid"] as const;

type Issue = { path?: unknown; field?: unknown; code?: unknown; message?: unknown };

/**
 * Turns the `details.issues` of a `VALIDATION_ERROR` into field codes. Issues
 * may carry a stable `code` per field; issues without one map to `invalid`.
 * Server text is never shown.
 */
export function fieldErrorsFrom(details: unknown): FieldErrors {
  const issues = (details as { issues?: unknown } | undefined)?.issues;
  const errors: FieldErrors = {};

  if (!Array.isArray(issues)) {
    return errors;
  }

  for (const issue of issues as Issue[]) {
    const field = typeof issue.field === "string" ? issue.field : issue.path;
    if (typeof field !== "string" || field === "" || field in errors) {
      continue;
    }
    const code = typeof issue.code === "string" ? issue.code : "invalid";
    errors[field] = (KNOWN_CODES as readonly string[]).includes(code) ? code : "invalid";
  }

  return errors;
}

/** Reads trimmed string values from a form, for refilling it after an error. */
export function formValues(formData: FormData, names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => {
      const value = formData.get(name);
      return [name, typeof value === "string" ? value : ""];
    }),
  );
}

/**
 * Locale submitted with a form. Server actions cannot read the route locale,
 * so forms send it in a hidden `locale` field.
 */
export function formLocale(formData: FormData): Locale {
  const value = formData.get("locale");
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
