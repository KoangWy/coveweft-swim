import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import { ERROR_CODES } from "@/server/errors";

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result[path] = value;
    } else {
      Object.assign(result, flatten(value, path));
    }
  }
  return result;
}

/** Top-level ICU argument names, for example `{threshold}` or `{count, plural, ...}`. */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let index = 0; index < message.length; index += 1) {
    const char = message[index];
    if (char === "{") {
      if (depth === 0) {
        const name = /^\{\s*([A-Za-z0-9_]+)/.exec(message.slice(index))?.[1];
        if (name) names.add(name);
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }
  }
  return [...names].sort();
}

const catalogs = { en: flatten(en as Messages), vi: flatten(vi as Messages) };

describe("message dictionaries", () => {
  it("have the same keys in English and Vietnamese", () => {
    const enKeys = Object.keys(catalogs.en);
    const viKeys = Object.keys(catalogs.vi);

    expect(
      enKeys.filter((key) => !(key in catalogs.vi)),
      "missing in vi.json",
    ).toEqual([]);
    expect(
      viKeys.filter((key) => !(key in catalogs.en)),
      "missing in en.json",
    ).toEqual([]);
  });

  it.each(Object.entries(catalogs))("%s has no empty messages", (_, catalog) => {
    expect(Object.entries(catalog).filter(([, value]) => value.trim() === "")).toEqual([]);
  });

  it("use the same placeholders in both languages", () => {
    const mismatched = Object.keys(catalogs.en).filter(
      (key) =>
        key in catalogs.vi &&
        placeholders(catalogs.en[key]).join() !== placeholders(catalogs.vi[key]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it.each(Object.entries(catalogs))(
    "%s has an errors.<CODE> message for every ErrorCode",
    (_, catalog) => {
      expect(ERROR_CODES.filter((code) => !(`errors.${code}` in catalog))).toEqual([]);
    },
  );

  it.each(Object.entries(catalogs))("%s has no error messages for unknown codes", (_, catalog) => {
    const codes = Object.keys(catalog)
      .filter((key) => key.startsWith("errors."))
      .map((key) => key.slice("errors.".length));
    expect(codes.filter((code) => !(ERROR_CODES as readonly string[]).includes(code))).toEqual([]);
  });

  it.each(Object.entries(catalogs))("%s has no em or en dashes in visible copy", (_, catalog) => {
    expect(Object.entries(catalog).filter(([, value]) => /[–—]/.test(value))).toEqual([]);
  });
});
