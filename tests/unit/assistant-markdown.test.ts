import { describe, expect, it } from "vitest";

import {
  parseInline,
  parseMarkdown,
  safeHref,
} from "@/features/assistant/components/assistant-markdown";

describe("assistant Markdown inline parsing", () => {
  it("reads bold, italic, and code", () => {
    expect(parseInline("A **bold** and *soft* `SKU1` word")).toEqual([
      { type: "text", text: "A " },
      { type: "strong", children: [{ type: "text", text: "bold" }] },
      { type: "text", text: " and " },
      { type: "em", children: [{ type: "text", text: "soft" }] },
      { type: "text", text: " " },
      { type: "code", text: "SKU1" },
      { type: "text", text: " word" },
    ]);
  });

  it("drops a bold marker that has no partner, as while an answer streams", () => {
    expect(parseInline("Try the **Cherry swim")).toEqual([
      { type: "text", text: "Try the Cherry swim" },
    ]);
  });

  it("keeps multiplication, underscores inside words, and HTML as text", () => {
    expect(parseInline("2 * 3 = 6 in swim_cap_blue")).toEqual([
      { type: "text", text: "2 * 3 = 6 in swim_cap_blue" },
    ]);
    expect(parseInline("<b>bold</b> <img src=x onerror=alert(1)>")).toEqual([
      { type: "text", text: "<b>bold</b> <img src=x onerror=alert(1)>" },
    ]);
  });

  it("links site paths and http(s) URLs only", () => {
    expect(parseInline("[Cherry](/en/products/BB25CR)")).toEqual([
      { type: "link", href: "/en/products/BB25CR", children: [{ type: "text", text: "Cherry" }] },
    ]);
    expect(parseInline("[bad](javascript:alert(1))").some((node) => node.type === "link")).toBe(
      false,
    );
    expect(safeHref("//evil.example/x")).toBeNull();
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("data:text/html,hi")).toBeNull();
  });
});

describe("assistant Markdown blocks", () => {
  it("splits paragraphs, headings, and both list kinds", () => {
    const blocks = parseMarkdown(
      "### Picks\nFirst line\nsecond line\n\n- one\n- two\n\n1. a\n2) b",
    );
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "list", "list"]);
    expect(blocks[1]).toMatchObject({
      type: "paragraph",
      lines: [[{ text: "First line" }], [{ text: "second line" }]],
    });
    expect(blocks[2]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: true });
  });

  it("reads a simple table with a separator row", () => {
    const [table] = parseMarkdown(
      "| Size | Height |\n|---|:---:|\n| S | 150-158 |\n| M | 158-165 |",
    );
    expect(table).toMatchObject({
      type: "table",
      header: [[{ text: "Size" }], [{ text: "Height" }]],
      rows: [
        [[{ text: "S" }], [{ text: "150-158" }]],
        [[{ text: "M" }], [{ text: "158-165" }]],
      ],
    });
  });

  it("treats a pipe line without a separator as a paragraph", () => {
    expect(parseMarkdown("| not a table |")[0]?.type).toBe("paragraph");
  });
});
