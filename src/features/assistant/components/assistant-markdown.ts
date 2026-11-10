/**
 * A small Markdown subset for assistant answers: paragraphs, headings,
 * bullet and numbered lists, simple tables, bold, italic, inline code, and
 * links. The parser returns plain data; the view turns it into React
 * elements, so model output never becomes raw HTML.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "heading"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

// Order matters: bold before italic, so `**a**` is never read as `*` + `*a*`.
const INLINE =
  /\*\*(.+?)\*\*|__(.+?)__|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])|(?<![\w_])_(?![\s_])(.+?)(?<![\s_])_(?![\w_])/g;

/**
 * Accepts site-relative paths and http(s) URLs. Anything else, such as a
 * `javascript:` URL, is rendered as text.
 */
export function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return href;
  }
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function pushText(nodes: Inline[], text: string) {
  // A marker without its partner (for example while an answer is still
  // streaming) carries no meaning, so it is dropped instead of shown.
  const cleaned = text.replace(/\*\*/g, "");
  if (cleaned === "") return;
  const last = nodes[nodes.length - 1];
  if (last?.type === "text") {
    last.text += cleaned;
  } else {
    nodes.push({ type: "text", text: cleaned });
  }
}

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    pushText(nodes, text.slice(index, start));
    index = start + match[0].length;
    const [, strongA, strongB, code, linkText, linkHref, emA, emB] = match;
    if (strongA !== undefined || strongB !== undefined) {
      nodes.push({ type: "strong", children: parseInline(strongA ?? strongB ?? "") });
    } else if (code !== undefined) {
      nodes.push({ type: "code", text: code });
    } else if (linkText !== undefined && linkHref !== undefined) {
      const href = safeHref(linkHref);
      if (href) {
        nodes.push({ type: "link", href, children: parseInline(linkText) });
      } else {
        pushText(nodes, linkText);
      }
    } else {
      nodes.push({ type: "em", children: parseInline(emA ?? emB ?? "") });
    }
  }
  pushText(nodes, text.slice(index));
  return nodes;
}

function tableCells(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));
}

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", children: parseInline(heading[1]) });
      index += 1;
      continue;
    }

    if (TABLE_ROW.test(line) && TABLE_SEPARATOR.test(lines[index + 1] ?? "")) {
      const header = tableCells(line);
      const rows: Inline[][][] = [];
      index += 2;
      while (index < lines.length && TABLE_ROW.test(lines[index])) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const listPattern = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : null;
    if (listPattern) {
      const items: Inline[][] = [];
      while (index < lines.length) {
        const item = listPattern.exec(lines[index]);
        if (!item) break;
        items.push(parseInline(item[1]));
        index += 1;
      }
      blocks.push({ type: "list", ordered: listPattern === NUMBERED, items });
      continue;
    }

    const paragraph: Inline[][] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !HEADING.test(lines[index]) &&
      !BULLET.test(lines[index]) &&
      !NUMBERED.test(lines[index]) &&
      !(TABLE_ROW.test(lines[index]) && TABLE_SEPARATOR.test(lines[index + 1] ?? ""))
    ) {
      paragraph.push(parseInline(lines[index]));
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}
