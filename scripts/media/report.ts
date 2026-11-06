import { MAX_REPORTED_ERRORS, type StudioManifest } from "./manifest.ts";
import { isRecord } from "./files.ts";
import { MEDIA_WIDTHS, type MediaWidth } from "./inventory.ts";

export const REPORT_VERSION = 1;

export type BuildStatus = "complete" | "failed" | "interrupted";

export interface BuildFailure {
  driveFileId: string;
  sku: string;
  position: number;
  sourceName: string;
  attempts: number;
  reason: string;
}

export interface SizeTotal {
  images: number;
  bytes: number;
}

export interface BuildReport {
  version: typeof REPORT_VERSION;
  createdAt: string;
  status: BuildStatus;
  durationMs: number;
  inventory: {
    file: string;
    studioImages: number;
    skus: number;
    limit: number | null;
  };
  images: {
    total: number;
    succeeded: number;
    failed: number;
    reused: number;
    downloaded: number;
  };
  source: {
    bytesDownloaded: number;
  };
  sizes: Record<MediaWidth, SizeTotal>;
  total: {
    images: number;
    files: number;
    bytes: number;
  };
  failures: BuildFailure[];
  manifest: string | null;
  archive: {
    file: string;
    bytes: number;
    sha256: string;
  } | null;
}

export function emptySizeTotals(): Record<MediaWidth, SizeTotal> {
  return Object.fromEntries(
    MEDIA_WIDTHS.map((width) => [width, { images: 0, bytes: 0 }]),
  ) as Record<MediaWidth, SizeTotal>;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface ReportValidationResult {
  report: BuildReport | null;
  errors: string[];
  errorCount: number;
}

/**
 * Validate a committed build report before using it as evidence. A report with
 * any structural error is not usable for cross-checking.
 */
export function validateBuildReport(value: unknown): ReportValidationResult {
  const errors: string[] = [];
  let errorCount = 0;
  const problem = (message: string) => {
    errorCount += 1;
    if (errors.length < MAX_REPORTED_ERRORS) {
      errors.push(message);
    }
  };

  if (!isRecord(value)) {
    return {
      report: null,
      errors: ["Build report must be a JSON object"],
      errorCount: 1,
    };
  }

  if (value.version !== REPORT_VERSION) {
    problem(`Build report version must be ${REPORT_VERSION}`);
  }
  if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) {
    problem("Build report createdAt must be an ISO 8601 timestamp");
  }
  if (value.status !== "complete") {
    problem(`Build report status must be complete, found ${String(value.status)}`);
  }

  const readInteger = (
    record: Record<string, unknown>,
    key: string,
    path: string,
    minimum: number,
  ): number | null => {
    const current = record[key];
    if (!Number.isInteger(current) || (current as number) < minimum) {
      problem(`${path} must be an integer of at least ${minimum}`);
      return null;
    }
    return current as number;
  };

  const durationMs = readInteger(value, "durationMs", "durationMs", 0) ?? 0;

  const imagesValue = isRecord(value.images) ? value.images : null;
  if (!imagesValue) {
    problem("images must be an object");
  }
  const imagesTotal = imagesValue ? (readInteger(imagesValue, "total", "images.total", 1) ?? 0) : 0;
  const imagesSucceeded = imagesValue
    ? (readInteger(imagesValue, "succeeded", "images.succeeded", 0) ?? 0)
    : 0;
  const imagesFailed = imagesValue
    ? (readInteger(imagesValue, "failed", "images.failed", 0) ?? 0)
    : 0;
  const imagesReused = imagesValue
    ? (readInteger(imagesValue, "reused", "images.reused", 0) ?? 0)
    : 0;
  const imagesDownloaded = imagesValue
    ? (readInteger(imagesValue, "downloaded", "images.downloaded", 0) ?? 0)
    : 0;
  if (imagesValue) {
    if (imagesFailed !== 0) {
      problem(`Build report lists ${imagesFailed} failed image(s)`);
    }
    if (imagesSucceeded !== imagesTotal) {
      problem(
        `Build report images.succeeded is ${imagesSucceeded}, expected images.total ${imagesTotal}`,
      );
    }
    if (imagesReused + imagesDownloaded !== imagesTotal) {
      problem(
        `Build report reused (${imagesReused}) plus downloaded (${imagesDownloaded}) ` +
          `does not equal images.total ${imagesTotal}`,
      );
    }
  }

  const inventoryValue = isRecord(value.inventory) ? value.inventory : null;
  if (!inventoryValue) {
    problem("inventory must be an object");
  }
  const inventoryFile =
    inventoryValue && typeof inventoryValue.file === "string" && inventoryValue.file.length > 0
      ? inventoryValue.file
      : null;
  if (!inventoryFile) {
    problem("inventory.file must be a non-empty string");
  }
  const studioImages = inventoryValue
    ? (readInteger(inventoryValue, "studioImages", "inventory.studioImages", 1) ?? 0)
    : 0;
  const skus = inventoryValue ? (readInteger(inventoryValue, "skus", "inventory.skus", 1) ?? 0) : 0;
  let limit: number | null = null;
  if (inventoryValue) {
    if (inventoryValue.limit === null) {
      limit = null;
    } else {
      limit = readInteger(inventoryValue, "limit", "inventory.limit", 1);
    }
  }

  const sourceValue = isRecord(value.source) ? value.source : null;
  if (!sourceValue) {
    problem("source must be an object");
  }
  const bytesDownloaded = sourceValue
    ? (readInteger(sourceValue, "bytesDownloaded", "source.bytesDownloaded", 0) ?? 0)
    : 0;

  const sizesValue = isRecord(value.sizes) ? value.sizes : null;
  if (!sizesValue) {
    problem("sizes must be an object");
  }
  const expectedSizeKeys = MEDIA_WIDTHS.map(String).sort();
  if (sizesValue) {
    const actualSizeKeys = Object.keys(sizesValue).sort();
    if (actualSizeKeys.join(",") !== expectedSizeKeys.join(",")) {
      problem(`sizes must contain exactly ${expectedSizeKeys.join(", ")}`);
    }
  }
  const sizes = emptySizeTotals();
  for (const width of MEDIA_WIDTHS) {
    const rawSize = sizesValue ? sizesValue[String(width)] : undefined;
    const sizeValue = isRecord(rawSize) ? rawSize : null;
    if (!sizeValue) {
      problem(`sizes.${width} must be an object`);
      continue;
    }
    sizes[width] = {
      images: readInteger(sizeValue, "images", `sizes.${width}.images`, 0) ?? 0,
      bytes: readInteger(sizeValue, "bytes", `sizes.${width}.bytes`, 0) ?? 0,
    };
  }

  const totalValue = isRecord(value.total) ? value.total : null;
  if (!totalValue) {
    problem("total must be an object");
  }
  const totalImages = totalValue ? (readInteger(totalValue, "images", "total.images", 1) ?? 0) : 0;
  const totalFiles = totalValue ? (readInteger(totalValue, "files", "total.files", 1) ?? 0) : 0;
  const totalBytes = totalValue ? (readInteger(totalValue, "bytes", "total.bytes", 1) ?? 0) : 0;

  if (!Array.isArray(value.failures)) {
    problem("failures must be an array");
  } else if (value.failures.length > 0) {
    problem(`Build report lists ${value.failures.length} failure(s)`);
  }

  const manifest =
    typeof value.manifest === "string" && value.manifest.length > 0 ? value.manifest : null;
  if (!manifest) {
    problem("manifest must be a non-empty string");
  }

  let archive: BuildReport["archive"] = null;
  if (value.archive !== null) {
    if (!isRecord(value.archive)) {
      problem("archive must be null or an object");
    } else {
      const archiveFile =
        typeof value.archive.file === "string" && value.archive.file.length > 0
          ? value.archive.file
          : null;
      if (!archiveFile) {
        problem("archive.file must be a non-empty string");
      }
      const archiveBytes = readInteger(value.archive, "bytes", "archive.bytes", 1);
      const archiveSha256 =
        typeof value.archive.sha256 === "string" && SHA256_PATTERN.test(value.archive.sha256)
          ? value.archive.sha256
          : null;
      if (!archiveSha256) {
        problem("archive.sha256 must be a lowercase hex SHA-256");
      }
      if (archiveFile && archiveBytes !== null && archiveSha256) {
        archive = { file: archiveFile, bytes: archiveBytes, sha256: archiveSha256 };
      }
    }
  }

  return {
    report:
      errors.length === 0
        ? {
            version: REPORT_VERSION,
            createdAt: value.createdAt as string,
            status: "complete",
            durationMs,
            inventory: {
              file: inventoryFile as string,
              studioImages,
              skus,
              limit,
            },
            images: {
              total: imagesTotal,
              succeeded: imagesSucceeded,
              failed: imagesFailed,
              reused: imagesReused,
              downloaded: imagesDownloaded,
            },
            source: { bytesDownloaded },
            sizes,
            total: {
              images: totalImages,
              files: totalFiles,
              bytes: totalBytes,
            },
            failures: [],
            manifest,
            archive,
          }
        : null,
    errors,
    errorCount,
  };
}

export interface ReportCrossCheckOptions {
  report: BuildReport;
  manifest: StudioManifest;
  /** Files and bytes actually checked on disk. */
  observed?: {
    files: number;
    bytes: number;
  };
  inventory?: {
    images: number;
    skus: number;
  };
}

/**
 * Compare the committed report with the manifest and the checked output. This
 * is the completeness guard: a truncated manifest must not pass against a
 * report and archive that describe the full set.
 */
export function crossCheckReport(options: ReportCrossCheckOptions): string[] {
  const errors: string[] = [];
  const imageCount = options.manifest.imageCount;
  const expectedFiles = imageCount * MEDIA_WIDTHS.length;
  const sizeTotals = emptySizeTotals();
  let totalBytes = 0;

  for (const entry of options.manifest.entries) {
    for (const width of MEDIA_WIDTHS) {
      sizeTotals[width].images += 1;
      sizeTotals[width].bytes += entry.sizes[width].bytes;
      totalBytes += entry.sizes[width].bytes;
    }
  }

  if (options.report.images.total !== imageCount) {
    errors.push(
      `report images.total is ${options.report.images.total}, manifest has ${imageCount} images`,
    );
  }
  if (options.report.total.images !== imageCount) {
    errors.push(
      `report total.images is ${options.report.total.images}, manifest has ${imageCount} images`,
    );
  }
  if (options.report.total.files !== expectedFiles) {
    errors.push(
      `report total.files is ${options.report.total.files}, manifest expects ${expectedFiles}`,
    );
  }
  if (options.report.total.bytes !== totalBytes) {
    errors.push(
      `report total.bytes is ${options.report.total.bytes}, manifest totals ${totalBytes}`,
    );
  }

  for (const width of MEDIA_WIDTHS) {
    if (options.report.sizes[width].images !== imageCount) {
      errors.push(
        `report sizes.${width}.images is ${options.report.sizes[width].images}, ` +
          `manifest has ${imageCount} images`,
      );
    }
    if (options.report.sizes[width].bytes !== sizeTotals[width].bytes) {
      errors.push(
        `report sizes.${width}.bytes is ${options.report.sizes[width].bytes}, ` +
          `manifest totals ${sizeTotals[width].bytes}`,
      );
    }
  }

  if (options.observed) {
    if (options.observed.files !== expectedFiles) {
      errors.push(`verified ${options.observed.files} files, manifest expects ${expectedFiles}`);
    }
    if (options.observed.bytes !== totalBytes) {
      errors.push(`verified ${options.observed.bytes} bytes, manifest totals ${totalBytes}`);
    }
  }

  if (options.report.inventory.limit === null) {
    if (options.report.inventory.studioImages !== imageCount) {
      errors.push(
        `report inventory.studioImages is ${options.report.inventory.studioImages}, ` +
          `manifest has ${imageCount} images`,
      );
    }
  } else if (imageCount > options.report.inventory.studioImages) {
    errors.push(
      `manifest has ${imageCount} images, report inventory has ${options.report.inventory.studioImages}`,
    );
  }

  if (options.inventory) {
    if (options.report.inventory.studioImages !== options.inventory.images) {
      errors.push(
        `report inventory.studioImages is ${options.report.inventory.studioImages}, ` +
          `inventory has ${options.inventory.images}`,
      );
    }
    if (options.report.inventory.skus !== options.inventory.skus) {
      errors.push(
        `report inventory.skus is ${options.report.inventory.skus}, ` +
          `inventory has ${options.inventory.skus}`,
      );
    }
  }

  return errors;
}
