import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)),
  "utf8",
);

/** Reads `--color-*` hex values from the first `@theme` block. */
function readColorTokens(source: string): Record<string, string> {
  const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
  const tokens: Record<string, string> = {};
  for (const match of theme.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[match[1]] = match[2].toLowerCase();
  }
  return tokens;
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

const tokens = readColorTokens(css);

// Minimums from WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text and for
// UI component boundaries and focus indicators.
const TEXT = 4.5;
const UI = 3;

type Pair = { fg: string; bg: string; min: number; use: string };

// Every foreground/background pairing the components actually render.
const PAIRS: Pair[] = [
  // Body text and icons
  { fg: "navy-900", bg: "white", min: TEXT, use: "body text and icons" },
  { fg: "navy-900", bg: "neutral-50", min: TEXT, use: "footer and panel text" },
  { fg: "navy-900", bg: "neutral-100", min: TEXT, use: "hovered and current nav items" },
  { fg: "navy-900", bg: "neutral-200", min: TEXT, use: "pressed ghost buttons" },
  { fg: "neutral-700", bg: "white", min: TEXT, use: "secondary body text" },
  { fg: "neutral-700", bg: "neutral-50", min: TEXT, use: "footer links" },
  { fg: "neutral-700", bg: "neutral-100", min: TEXT, use: "hovered policy nav items" },
  { fg: "neutral-600", bg: "white", min: TEXT, use: "hints, captions, breadcrumb" },
  { fg: "neutral-600", bg: "neutral-50", min: TEXT, use: "footer captions" },
  { fg: "neutral-600", bg: "neutral-100", min: TEXT, use: "disabled input text" },
  { fg: "neutral-500", bg: "white", min: TEXT, use: "placeholders and disabled pagination" },
  // Lime is only a fill under navy text
  { fg: "navy-950", bg: "lime-400", min: TEXT, use: "primary button and accent badge" },
  { fg: "navy-950", bg: "lime-500", min: TEXT, use: "primary button hover" },
  { fg: "navy-950", bg: "lime-300", min: TEXT, use: "text selection" },
  // Inverted surfaces
  { fg: "white", bg: "navy-900", min: TEXT, use: "demo banner and current page markers" },
  { fg: "lime-300", bg: "navy-900", min: TEXT, use: "demo banner link hover" },
  // Status colors with their tinted backgrounds
  { fg: "error-700", bg: "white", min: TEXT, use: "field errors" },
  { fg: "error-700", bg: "error-50", min: TEXT, use: "error badge and danger hover" },
  { fg: "success-700", bg: "white", min: TEXT, use: "success text" },
  { fg: "success-700", bg: "success-50", min: TEXT, use: "success badge" },
  { fg: "warning-700", bg: "white", min: TEXT, use: "warning text" },
  { fg: "warning-700", bg: "warning-50", min: TEXT, use: "warning badge" },
  { fg: "soldout-700", bg: "white", min: TEXT, use: "out of stock text" },
  { fg: "soldout-700", bg: "soldout-50", min: TEXT, use: "out of stock badge" },
  // UI components: borders and focus indicators
  { fg: "neutral-500", bg: "white", min: UI, use: "input and stepper borders" },
  { fg: "navy-900", bg: "white", min: UI, use: "focus ring and secondary button border" },
  { fg: "white", bg: "navy-900", min: UI, use: "focus ring on the demo banner" },
  { fg: "error-700", bg: "white", min: UI, use: "invalid input border" },
];

describe("design token contrast", () => {
  it("parses the color tokens from globals.css", () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(20);
  });

  it.each(PAIRS)("$fg on $bg meets $min:1 ($use)", ({ fg, bg, min }) => {
    expect(tokens[fg], `missing token ${fg}`).toBeDefined();
    expect(tokens[bg], `missing token ${bg}`).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });

  it("computes known reference ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("never uses lime as text on white", () => {
    for (const lime of ["lime-300", "lime-400", "lime-500"]) {
      // Documented rule: if this ever passes AA, the rule can be revisited, but
      // today lime on white is unreadable and must stay a fill only.
      expect(contrastRatio(tokens[lime], tokens.white)).toBeLessThan(TEXT);
    }
  });
});
