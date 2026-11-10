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

// Foreground/background pairings rendered by the components, audited per
// state: default, hover, active (pressed or current), and focus. Disabled
// controls are exempt under WCAG 1.4.3 and are not listed.
const PAIRS: Pair[] = [
  // Body text and icons, default state
  { fg: "navy-900", bg: "white", min: TEXT, use: "body text and icons" },
  { fg: "navy-900", bg: "neutral-50", min: TEXT, use: "footer, panel, and admin text" },
  { fg: "neutral-700", bg: "white", min: TEXT, use: "secondary body text" },
  { fg: "neutral-700", bg: "neutral-50", min: TEXT, use: "footer links and contact card" },
  { fg: "neutral-600", bg: "white", min: TEXT, use: "hints, captions, breadcrumb" },
  { fg: "neutral-600", bg: "neutral-50", min: TEXT, use: "footer captions, admin breadcrumb" },
  { fg: "neutral-600", bg: "neutral-100", min: TEXT, use: "disabled input text" },
  { fg: "neutral-500", bg: "white", min: TEXT, use: "placeholders and disabled pagination" },
  { fg: "navy-900", bg: "neutral-100", min: TEXT, use: "neutral badge" },
  // Hover and pressed states
  { fg: "navy-900", bg: "neutral-100", min: TEXT, use: "hovered ghost, icon, and nav items" },
  { fg: "navy-900", bg: "neutral-200", min: TEXT, use: "pressed ghost and icon buttons" },
  { fg: "navy-900", bg: "white", min: TEXT, use: "hovered locale option in the footer" },
  { fg: "neutral-700", bg: "neutral-100", min: TEXT, use: "hovered policy nav items" },
  { fg: "navy-950", bg: "lime-500", min: TEXT, use: "hovered primary button" },
  { fg: "error-700", bg: "error-50", min: TEXT, use: "hovered danger button, error badge" },
  { fg: "lime-300", bg: "navy-950", min: TEXT, use: "hovered footer link, footer headings" },
  { fg: "white", bg: "navy-800", min: TEXT, use: "hovered current nav item" },
  // Current and selected states
  { fg: "white", bg: "navy-900", min: TEXT, use: "current locale and current page number" },
  { fg: "navy-900", bg: "neutral-100", min: TEXT, use: "current nav, admin, and policy items" },
  // Lime is only a fill under navy text
  { fg: "navy-950", bg: "lime-400", min: TEXT, use: "primary button, accent badge, skip link" },
  { fg: "navy-950", bg: "lime-300", min: TEXT, use: "text selection" },
  // Inverted surfaces: demo notice, footer, hero, assistant user bubble
  { fg: "white", bg: "navy-900", min: TEXT, use: "user chat bubble, assistant promo panel" },
  { fg: "white", bg: "navy-950", min: TEXT, use: "demo notice, footer, and hero text" },
  { fg: "neutral-300", bg: "navy-950", min: TEXT, use: "footer links and notice" },
  { fg: "lime-400", bg: "navy-950", min: TEXT, use: "hero accent word and status codes" },
  // Status colors with their tinted backgrounds
  { fg: "error-700", bg: "white", min: TEXT, use: "field errors" },
  { fg: "success-700", bg: "white", min: TEXT, use: "success text and toast icon" },
  { fg: "success-700", bg: "success-50", min: TEXT, use: "success badge" },
  { fg: "warning-700", bg: "white", min: TEXT, use: "warning text" },
  { fg: "warning-700", bg: "warning-50", min: TEXT, use: "warning badge" },
  { fg: "soldout-700", bg: "white", min: TEXT, use: "out of stock text" },
  { fg: "soldout-700", bg: "soldout-50", min: TEXT, use: "out of stock badge" },
  // Icons that carry meaning (UI threshold), including hover backgrounds
  { fg: "neutral-500", bg: "white", min: UI, use: "breadcrumb and policy nav carets" },
  { fg: "neutral-500", bg: "neutral-100", min: UI, use: "policy nav caret on a hovered row" },
  { fg: "neutral-500", bg: "neutral-50", min: UI, use: "breadcrumb caret on the admin background" },
  { fg: "navy-900", bg: "neutral-100", min: UI, use: "current policy nav caret" },
  // UI components: borders
  { fg: "neutral-500", bg: "white", min: UI, use: "input, select, search, and stepper borders" },
  { fg: "navy-900", bg: "white", min: UI, use: "hovered input and secondary button border" },
  { fg: "error-700", bg: "white", min: UI, use: "invalid input border" },
  // Focus indicators against every surface they are drawn on
  { fg: "navy-900", bg: "white", min: UI, use: "focus ring on white" },
  { fg: "navy-900", bg: "neutral-50", min: UI, use: "focus ring in the footer and admin" },
  { fg: "navy-900", bg: "neutral-100", min: UI, use: "inset focus ring on a hovered control" },
  { fg: "white", bg: "navy-950", min: UI, use: "focus ring in the footer and on photos" },
];

describe("design token contrast", () => {
  it("parses the color tokens from globals.css", () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(20);
  });

  it.each(PAIRS)("$fg on $bg meets $min:1 for $use", ({ fg, bg, min }) => {
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
