import { z } from "zod";

import {
  garmentForProductType,
  getSizeGuide,
  groupFromSizeGuideKey,
} from "@/server/catalog/size-guide";
import type { ProductVariant, SizeGuide } from "@/server/catalog/types";

/** Body measurements accepted by `recommendSize`, in centimetres and months. */
export const MeasurementsInput = z
  .object({
    chestCm: z.number().min(30).max(200).optional(),
    waistCm: z.number().min(30).max(200).optional(),
    hipsCm: z.number().min(30).max(200).optional(),
    heightCm: z.number().min(40).max(230).optional(),
    ageMonths: z.number().int().min(0).max(240).optional(),
  })
  .strict();

export type Measurements = z.infer<typeof MeasurementsInput>;

/** Size guide measurement names mapped to the tool argument names. */
const MEASUREMENT_FIELDS: Readonly<Record<string, keyof Measurements>> = {
  chest: "chestCm",
  waist: "waistCm",
  hips: "hipsCm",
  height: "heightCm",
  age_months: "ageMonths",
};

export type SizeProduct = {
  productType: string;
  variants: Pick<ProductVariant, "variantSku" | "optionLabel" | "sizeGuideKey" | "stock">[];
};

type MeasurementMatch = {
  measurement: keyof Measurements;
  value: number;
  /** Size guide key of the row whose half-open range holds the value. */
  sizeGuideKey: string | null;
  label: string | null;
};

export type SizeRecommendation =
  | { status: "not_applicable"; reason: "no_size_guide" }
  | { status: "missing"; missing: Array<keyof Measurements>; required: Array<keyof Measurements> }
  | {
      status: "no_fit";
      reason: "outside_table" | "size_not_offered";
      matches: MeasurementMatch[];
      offeredSizes: string[];
    }
  | {
      status: "recommended";
      reason: "all_measurements_agree" | "larger_size_when_measurements_differ";
      size: {
        label: string;
        sizeGuideKey: string;
        variantSku: string;
        optionLabel: string;
        stock: number;
        inStock: boolean;
      };
      matches: MeasurementMatch[];
      table: { group: string; garment: SizeGuide["garment"] };
    };

/**
 * Picks a size for a product from the Demo Size Guide. The whole decision is
 * made here; the model only explains the result.
 *
 * - The table comes from the product's own group (the prefix of its variants'
 *   size keys) and the garment of its product type. Products without a size
 *   key or with an accessory type are `not_applicable`.
 * - Every measurement the table needs must be present, or the result lists
 *   what is `missing`.
 * - Each value is matched against half-open `[min, max)` ranges. A value
 *   outside every row is `no_fit`; when measurements land in different rows
 *   the larger size wins.
 * - The chosen row must be one of the product's actual variants, otherwise
 *   the result is `no_fit` with the sizes the product does offer.
 */
export async function recommendSize(
  product: SizeProduct,
  measurements: Measurements,
): Promise<SizeRecommendation> {
  const garment = garmentForProductType(product.productType);
  const sizedVariants = product.variants.filter((variant) => variant.sizeGuideKey);
  const group = sizedVariants[0] ? groupFromSizeGuideKey(sizedVariants[0].sizeGuideKey!) : null;

  if (!garment || !group) {
    return { status: "not_applicable", reason: "no_size_guide" };
  }

  const guide = await getSizeGuide({ group, garment });

  if (!guide.ok) {
    return { status: "not_applicable", reason: "no_size_guide" };
  }

  const table = guide.data;
  const required = table.measurements.map((name) => MEASUREMENT_FIELDS[name]!);
  const missing = required.filter((field) => measurements[field] === undefined);

  if (missing.length > 0) {
    return { status: "missing", missing, required };
  }

  const matches: MeasurementMatch[] = table.measurements.map((name) => {
    const field = MEASUREMENT_FIELDS[name]!;
    const value = measurements[field]!;
    const row = table.rows.find((candidate) => {
      const range = candidate.ranges[name];
      return range !== undefined && value >= range[0] && value < range[1];
    });

    return {
      measurement: field,
      value,
      sizeGuideKey: row?.sizeGuideKey ?? null,
      label: row?.label ?? null,
    };
  });

  const offered = table.rows.filter((row) =>
    sizedVariants.some((variant) => variant.sizeGuideKey === row.sizeGuideKey),
  );
  const offeredSizes = offered.map((row) => row.label);

  if (matches.some((match) => match.sizeGuideKey === null)) {
    return { status: "no_fit", reason: "outside_table", matches, offeredSizes };
  }

  const rowIndexes = matches.map((match) =>
    table.rows.findIndex((row) => row.sizeGuideKey === match.sizeGuideKey),
  );
  const chosen = table.rows[Math.max(...rowIndexes)]!;
  const variant = sizedVariants.find((candidate) => candidate.sizeGuideKey === chosen.sizeGuideKey);

  if (!variant) {
    return { status: "no_fit", reason: "size_not_offered", matches, offeredSizes };
  }

  return {
    status: "recommended",
    reason: new Set(rowIndexes).size === 1
      ? "all_measurements_agree"
      : "larger_size_when_measurements_differ",
    size: {
      label: chosen.label,
      sizeGuideKey: chosen.sizeGuideKey,
      variantSku: variant.variantSku,
      optionLabel: variant.optionLabel,
      stock: variant.stock,
      inStock: variant.stock > 0,
    },
    matches,
    table: { group: table.group, garment: table.garment },
  };
}
