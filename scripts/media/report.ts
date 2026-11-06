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
