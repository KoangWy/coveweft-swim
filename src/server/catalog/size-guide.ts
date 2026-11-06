import sizeGuideFile from "../../../data/size-guides/demo-size-guide.json";

import { fail, ok, type Result } from "@/server/errors";
import { parseInput } from "@/server/result";

import { GetSizeGuideInput } from "./schemas";
import type { SizeGuide, SizeGuideGarment, SizeGuideRow } from "./types";

type SizeGuideFileTable = {
  group: string;
  garment: SizeGuideGarment;
  measurements: string[];
  rows: Array<{ sizeGuideKey: string; label: string } & Record<string, unknown>>;
};

type SizeGuideFile = {
  unit: "cm";
  ageUnit: "months";
  notice: string;
  tables: SizeGuideFileTable[];
};

const guide = sizeGuideFile as unknown as SizeGuideFile;

/**
 * Product types that have a size table. Accessories are deliberately absent:
 * their variants have no `size_guide_key` and the UI shows specifications
 * instead of a size table.
 */
const PRODUCT_TYPE_GARMENTS: Readonly<Record<string, SizeGuideGarment>> = Object.freeze({
  "bikini top": "tops",
  "rash guard": "tops",
  shirt: "tops",
  "t-shirt": "tops",
  "wetsuit top": "tops",
  "beach shorts": "bottoms",
  "bikini bottoms": "bottoms",
  "board shorts": "bottoms",
  jammers: "bottoms",
  "swim boxers": "bottoms",
  "swim briefs": "bottoms",
  "swim leggings": "bottoms",
  "swim shorts": "bottoms",
  "swim skirt": "bottoms",
  "swim trunks": "bottoms",
  "wetsuit shorts": "bottoms",
  "bikini set": "full-body",
  monokini: "full-body",
  "swim dress": "full-body",
  swimsuit: "full-body",
  wetsuit: "full-body",
});

const tables: ReadonlyArray<{
  group: string;
  garment: SizeGuideGarment;
  measurements: string[];
  rows: SizeGuideRow[];
}> = guide.tables.map((table) => ({
  group: table.group,
  garment: table.garment,
  measurements: table.measurements,
  rows: table.rows.map((row) => {
    const ranges: Record<string, [number, number]> = {};

    for (const measurement of table.measurements) {
      const value = row[measurement];

      if (Array.isArray(value) && value.length === 2) {
        ranges[measurement] = [Number(value[0]), Number(value[1])];
      }
    }

    return { sizeGuideKey: row.sizeGuideKey, label: row.label, ranges };
  }),
}));

/**
 * Maps a catalog product type to the garment table that applies to it.
 * Accessories and unknown values return `null`.
 */
export function garmentForProductType(productType: string): SizeGuideGarment | null {
  return PRODUCT_TYPE_GARMENTS[productType.trim().toLowerCase()] ?? null;
}

/** Reads the group prefix from a size guide key such as `women-M`. */
export function groupFromSizeGuideKey(key: string): string | null {
  const separator = key.indexOf("-");

  if (separator <= 0) {
    return null;
  }

  return key.slice(0, separator);
}

/**
 * Returns one size table for a group and garment. When only a size key is
 * supplied, the table that contains the key is preferred; a full-body table
 * wins ties so the result is deterministic.
 */
export async function getSizeGuide(input: unknown): Promise<Result<SizeGuide>> {
  const parsed = parseInput(GetSizeGuideInput, input);

  if (!parsed.ok) {
    return parsed;
  }

  const { key, group: requestedGroup, garment } = parsed.data;
  const group = requestedGroup ?? (key ? groupFromSizeGuideKey(key) : null);

  if (!group) {
    return fail("NOT_FOUND", { reason: "unknown_size_guide_key" });
  }

  let candidates = tables.filter((table) => table.group === group);

  if (garment) {
    candidates = candidates.filter((table) => table.garment === garment);
  }

  if (key) {
    const withKey = candidates.filter((table) =>
      table.rows.some((row) => row.sizeGuideKey === key),
    );

    if (withKey.length > 0) {
      candidates = withKey;
    }
  }

  if (candidates.length === 0) {
    return fail("NOT_FOUND", { group, garment: garment ?? null });
  }

  const table = candidates.find((candidate) => candidate.garment === "full-body") ?? candidates[0];

  return ok({
    group: table.group,
    garment: table.garment,
    unit: guide.unit,
    ageUnit: guide.ageUnit,
    notice: guide.notice,
    measurements: table.measurements,
    rows: table.rows,
    highlightKey: key ?? null,
  });
}

/** Size tables known to the demo guide, grouped by group and garment. */
export function listSizeGuideTables(): ReadonlyArray<{
  group: string;
  garment: SizeGuideGarment;
  measurements: string[];
  rowCount: number;
}> {
  return tables.map((table) => ({
    group: table.group,
    garment: table.garment,
    measurements: table.measurements,
    rowCount: table.rows.length,
  }));
}
