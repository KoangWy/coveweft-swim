import { describe, expect, it } from "vitest";

import { paginationItems } from "@/components/ui/pagination";
import en from "@/messages/en.json";
import { isPolicySlug, POLICY_SLUGS } from "@/lib/site";

describe("policy pages", () => {
  it("recognizes only known slugs", () => {
    expect(isPolicySlug("privacy")).toBe(true);
    expect(isPolicySlug("refunds")).toBe(false);
  });

  it("has a title, description, lead, and sections for every page", () => {
    for (const page of ["about", ...POLICY_SLUGS] as const) {
      const content = en.policies[page];
      expect(content.title).toBeTruthy();
      expect(content.description).toBeTruthy();
      expect(content.lead).toBeTruthy();
      expect(Object.keys(content.sections).length).toBeGreaterThan(0);
      expect(en.policies.names[page]).toBeTruthy();
    }
  });
});

describe("paginationItems", () => {
  it("shows every page when there are few", () => {
    expect(paginationItems(2, 3)).toEqual([1, 2, 3]);
  });

  it("collapses distant pages into gaps", () => {
    expect(paginationItems(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
  });

  it("keeps the window at the edges", () => {
    expect(paginationItems(1, 10)).toEqual([1, 2, "gap", 10]);
    expect(paginationItems(10, 10)).toEqual([1, "gap", 9, 10]);
  });
});
