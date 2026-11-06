import { isRecord } from "./files.ts";
import { MEDIA_WIDTHS, mediaPath, type MediaWidth } from "./inventory.ts";

export const MANIFEST_VERSION = 1;
export const MAX_REPORTED_ERRORS = 200;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface SizeOutput {
  /** Archive-relative POSIX path. */
  path: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export interface ManifestEntry {
  sku: string;
  position: number;
  driveFileId: string;
  sizes: Record<MediaWidth, SizeOutput>;
}

export interface StudioManifest {
  version: typeof MANIFEST_VERSION;
  createdAt: string;
  imageCount: number;
  entries: ManifestEntry[];
}

export interface ManifestValidationOptions {
  /**
   * A partial build stops after a requested number of images, so its preview
   * manifest can end in the middle of a SKU folder. Full manifests must keep
   * positions contiguous from 1.
   */
  requireContiguousPositions?: boolean;
}

export interface ManifestValidationResult {
  manifest: StudioManifest | null;
  errors: string[];
  errorCount: number;
}

export function sizeOutputs(entry: { sizes: Record<MediaWidth, SizeOutput> }): SizeOutput[] {
  return MEDIA_WIDTHS.map((width) => entry.sizes[width]);
}

/** Build a manifest from the images selected in inventory order. */
export function buildManifest(
  images: { driveFileId: string; sku: string; position: number }[],
  entries: Map<string, { sizes: Record<MediaWidth, SizeOutput> }>,
  createdAt: string,
): StudioManifest {
  const manifestEntries = images.map((image) => {
    const entry = entries.get(image.driveFileId);
    if (!entry) {
      throw new Error(`Missing processed entry for ${image.driveFileId} (${image.sku})`);
    }
    return {
      sku: image.sku,
      position: image.position,
      driveFileId: image.driveFileId,
      sizes: entry.sizes,
    };
  });

  return {
    version: MANIFEST_VERSION,
    createdAt,
    imageCount: manifestEntries.length,
    entries: manifestEntries,
  };
}

export function validateManifest(
  value: unknown,
  options: ManifestValidationOptions = {},
): ManifestValidationResult {
  const errors: string[] = [];
  let errorCount = 0;

  const report = (message: string) => {
    errorCount += 1;
    if (errors.length < MAX_REPORTED_ERRORS) {
      errors.push(message);
    }
  };

  if (!isRecord(value)) {
    return { manifest: null, errors: ["Manifest must be a JSON object"], errorCount: 1 };
  }

  if (value.version !== MANIFEST_VERSION) {
    report(`Manifest version must be ${MANIFEST_VERSION}`);
  }
  if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) {
    report("Manifest createdAt must be an ISO 8601 timestamp");
  }
  if (!Array.isArray(value.entries)) {
    return {
      manifest: null,
      errors: [...errors, "Manifest entries must be an array"],
      errorCount: errorCount + 1,
    };
  }
  if (value.imageCount !== value.entries.length) {
    report(
      `Manifest imageCount ${String(value.imageCount)} does not match ${value.entries.length} entries`,
    );
  }

  const seenKeys = new Set<string>();
  const seenDriveIds = new Set<string>();
  const positionsBySku = new Map<string, number[]>();
  const entries: ManifestEntry[] = [];

  value.entries.forEach((rawEntry, index) => {
    const prefix = `entries[${index}]`;
    if (!isRecord(rawEntry)) {
      report(`${prefix} must be an object`);
      return;
    }

    const sku = rawEntry.sku;
    const position = rawEntry.position;
    const driveFileId = rawEntry.driveFileId;

    if (typeof sku !== "string" || sku.length === 0) {
      report(`${prefix}.sku must be a non-empty string`);
      return;
    }
    if (!Number.isInteger(position) || (position as number) < 1 || (position as number) > 99) {
      report(`${prefix}.position must be an integer between 1 and 99`);
      return;
    }
    if (typeof driveFileId !== "string" || !DRIVE_ID_PATTERN.test(driveFileId)) {
      report(`${prefix}.driveFileId is invalid`);
      return;
    }

    const entryKey = `${sku}:${String(position)}`;
    if (seenKeys.has(entryKey)) {
      report(`${prefix} duplicates ${entryKey}`);
    }
    seenKeys.add(entryKey);

    if (seenDriveIds.has(driveFileId)) {
      report(`${prefix} repeats Drive file ID ${driveFileId}`);
    }
    seenDriveIds.add(driveFileId);

    const positions = positionsBySku.get(sku) ?? [];
    positions.push(position as number);
    positionsBySku.set(sku, positions);

    if (!isRecord(rawEntry.sizes)) {
      report(`${prefix}.sizes must be an object`);
      return;
    }

    const expectedKeys = MEDIA_WIDTHS.map(String).sort();
    const actualKeys = Object.keys(rawEntry.sizes).sort();
    if (actualKeys.join(",") !== expectedKeys.join(",")) {
      report(`${prefix}.sizes must contain exactly ${expectedKeys.join(", ")}`);
      return;
    }

    const sizes = {} as Record<MediaWidth, SizeOutput>;
    for (const width of MEDIA_WIDTHS) {
      const rawOutput = rawEntry.sizes[String(width)];
      const outputPrefix = `${prefix}.sizes.${width}`;
      if (!isRecord(rawOutput)) {
        report(`${outputPrefix} must be an object`);
        continue;
      }

      const expectedPath = mediaPath(sku, position as number, width);
      if (rawOutput.path !== expectedPath) {
        report(`${outputPrefix}.path must be ${expectedPath}`);
      }
      if (!Number.isInteger(rawOutput.width) || (rawOutput.width as number) < 1) {
        report(`${outputPrefix}.width must be a positive integer`);
      }
      if (!Number.isInteger(rawOutput.height) || (rawOutput.height as number) < 1) {
        report(`${outputPrefix}.height must be a positive integer`);
      }
      if (!Number.isInteger(rawOutput.bytes) || (rawOutput.bytes as number) < 1) {
        report(`${outputPrefix}.bytes must be a positive integer`);
      }
      if (typeof rawOutput.sha256 !== "string" || !SHA256_PATTERN.test(rawOutput.sha256)) {
        report(`${outputPrefix}.sha256 must be a lowercase hex SHA-256`);
      }

      sizes[width] = {
        path: typeof rawOutput.path === "string" ? rawOutput.path : expectedPath,
        width: rawOutput.width as number,
        height: rawOutput.height as number,
        bytes: rawOutput.bytes as number,
        sha256: typeof rawOutput.sha256 === "string" ? rawOutput.sha256 : "",
      };
    }

    entries.push({
      sku,
      position: position as number,
      driveFileId,
      sizes,
    });
  });

  if (options.requireContiguousPositions !== false) {
    for (const [sku, positions] of positionsBySku) {
      const sorted = [...positions].sort((left, right) => left - right);
      const contiguous = sorted.every((position, index) => position === index + 1);
      if (!contiguous) {
        report(`SKU ${sku} positions are not contiguous starting at 1`);
      }
    }
  }

  return {
    manifest:
      errors.length === 0
        ? {
            version: MANIFEST_VERSION,
            createdAt: value.createdAt as string,
            imageCount: entries.length,
            entries,
          }
        : null,
    errors,
    errorCount,
  };
}
