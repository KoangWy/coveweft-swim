/**
 * Small CSV reader for the SOBIE inventory export.
 *
 * The inventory is RFC 4180 style, UTF-8 with a BOM: quoted fields may contain
 * commas and doubled quotes, and rows end with CRLF. The parser keeps the raw
 * cell values so callers can validate the columns they need.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let fieldStarted = false;
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };

  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (fieldStarted) {
        throw new Error(`Unexpected quote in CSV field near line ${countLines(input, index) + 1}`);
      }
      quoted = true;
      fieldStarted = true;
    } else if (character === ",") {
      endField();
    } else if (character === "\n") {
      endRow();
    } else if (character === "\r") {
      // CRLF line endings: the newline is handled on the next iteration.
    } else {
      field += character;
      fieldStarted = true;
    }
  }

  if (quoted) {
    throw new Error("Unterminated quoted field in CSV input");
  }

  if (fieldStarted || field.length > 0 || row.length > 0) {
    endRow();
  }

  return rows.filter((cells) => !(cells.length === 1 && cells[0] === ""));
}

function countLines(input: string, index: number): number {
  let lines = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (input[cursor] === "\n") {
      lines += 1;
    }
  }
  return lines;
}
