import { parseCsv } from "./csv.ts";

/** Output widths in pixels, smallest first: listing, listing 2x, detail. */
export const MEDIA_WIDTHS = [480, 960, 1600] as const;

export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** Positions use two digits, so a folder can hold at most 99 photos. */
export const MAX_POSITION = 99;

const REQUIRED_COLUMNS = ["id", "name", "type", "group", "folder_path", "path", "sku"] as const;

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface InventoryRow {
  id: string;
  name: string;
  type: string;
  group: string;
  folderPath: string;
  path: string;
  sku: string;
}

export interface StudioImage {
  driveFileId: string;
  sku: string;
  sourceName: string;
  sourcePath: string;
  /** One-based position by ascending source file name within the SKU folder. */
  position: number;
}

export function parseInventoryCsv(text: string): InventoryRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header || header.length === 0) {
    throw new Error("Inventory CSV is empty");
  }

  const columnIndex = new Map<string, number>();
  header.forEach((name, index) => columnIndex.set(name.trim(), index));

  const missing = REQUIRED_COLUMNS.filter((column) => !columnIndex.has(column));
  if (missing.length > 0) {
    throw new Error(`Inventory CSV is missing required columns: ${missing.join(", ")}`);
  }

  const cell = (cells: string[], column: (typeof REQUIRED_COLUMNS)[number]) =>
    cells[columnIndex.get(column) ?? -1] ?? "";

  return body.map((cells) => ({
    id: cell(cells, "id").trim(),
    name: cell(cells, "name").trim(),
    type: cell(cells, "type").trim(),
    group: cell(cells, "group").trim(),
    folderPath: cell(cells, "folder_path").trim(),
    path: cell(cells, "path").trim(),
    sku: cell(cells, "sku").trim(),
  }));
}

/**
 * Select the studio photo nodes and assign the shared position convention.
 *
 * Positions are one-based and follow ascending file names inside each SKU
 * folder. The returned list is sorted by SKU and then position so every run
 * produces the same manifest order.
 */
export function selectStudioImages(rows: InventoryRow[]): StudioImage[] {
  const bySku = new Map<string, InventoryRow[]>();
  const seenIds = new Set<string>();

  for (const row of rows) {
    if (row.type !== "image" || row.group !== "studio") {
      continue;
    }

    if (!row.id || !DRIVE_ID_PATTERN.test(row.id)) {
      throw new Error(`Studio image has an invalid Drive file ID: "${row.id}"`);
    }
    if (seenIds.has(row.id)) {
      throw new Error(`Studio image Drive file ID appears more than once: ${row.id}`);
    }
    seenIds.add(row.id);

    if (!row.sku || !SKU_PATTERN.test(row.sku) || row.sku.includes("..")) {
      throw new Error(`Studio image has an invalid SKU: "${row.sku}"`);
    }
    if (!row.name || /[/\\]/.test(row.name)) {
      throw new Error(`Studio image has an invalid file name: "${row.name}"`);
    }

    const folderName = row.folderPath.split("/").at(-1);
    if (folderName !== row.sku) {
      throw new Error(
        `Studio image ${row.id} is in folder "${row.folderPath}" but has SKU "${row.sku}"`,
      );
    }

    const bucket = bySku.get(row.sku) ?? [];
    bucket.push(row);
    bySku.set(row.sku, bucket);
  }

  const images: StudioImage[] = [];
  for (const sku of [...bySku.keys()].sort(compareText)) {
    const bucket = bySku.get(sku) ?? [];
    bucket.sort((left, right) => compareText(left.name, right.name));

    if (bucket.length > MAX_POSITION) {
      throw new Error(
        `SKU ${sku} has ${bucket.length} studio images; the two-digit path convention allows ${MAX_POSITION}`,
      );
    }

    bucket.forEach((row, index) => {
      images.push({
        driveFileId: row.id,
        sku,
        sourceName: row.name,
        sourcePath: row.path,
        position: index + 1,
      });
    });
  }

  return images;
}

/** Archive-relative path for one exported size, for example `studio/10F1/01-480.webp`. */
export function mediaPath(sku: string, position: number, width: MediaWidth): string {
  return `studio/${sku}/${positionLabel(position)}-${width}.webp`;
}

export function positionLabel(position: number): string {
  if (!Number.isInteger(position) || position < 1 || position > MAX_POSITION) {
    throw new Error(`Position must be an integer between 1 and ${MAX_POSITION}: ${position}`);
  }
  return String(position).padStart(2, "0");
}

/** Code-unit ordering keeps positions stable across locales and Node versions. */
export function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
