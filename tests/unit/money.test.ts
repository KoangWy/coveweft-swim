import { describe, expect, it } from "vitest";

import { formatVnd } from "@/lib/money";

describe("formatVnd", () => {
  it("formats integer amounts for English", () => {
    const formatted = formatVnd(30000, "en");

    expect(formatted).toContain("30,000");
    expect(formatted).toContain("₫");
  });

  it("formats integer amounts for Vietnamese", () => {
    const formatted = formatVnd(30000, "vi");

    expect(formatted).toContain("30.000");
    expect(formatted).toContain("₫");
  });

  it("defaults to English", () => {
    expect(formatVnd(500000)).toBe(formatVnd(500000, "en"));
  });

  it("rejects fractional amounts", () => {
    expect(() => formatVnd(10.5)).toThrow(RangeError);
  });
});
