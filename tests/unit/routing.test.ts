import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

describe("routing", () => {
  it("ignores Accept-Language so the bare root always uses the default locale", () => {
    expect(routing.localeDetection).toBe(false);
    expect(routing.defaultLocale).toBe("en");
  });
});
