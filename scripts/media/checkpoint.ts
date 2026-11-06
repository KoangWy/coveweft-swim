import path from "node:path";

import { fileSize, hashFile, isRecord, readJson, writeJsonAtomic } from "./files.ts";
import { MEDIA_WIDTHS, mediaPath, type MediaWidth } from "./inventory.ts";
import type { SizeOutput } from "./manifest.ts";

export const CHECKPOINT_VERSION = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface CheckpointImage {
  driveFileId: string;
  sku: string;
  position: number;
  sourceName: string;
  sourceBytes: number;
  sourceSha256: string;
  sizes: Record<MediaWidth, SizeOutput>;
}

export interface CheckpointFile {
  version: typeof CHECKPOINT_VERSION;
  updatedAt: string;
  entries: Record<string, CheckpointImage>;
}

export function emptyCheckpoint(): CheckpointFile {
  return {
    version: CHECKPOINT_VERSION,
    updatedAt: new Date().toISOString(),
    entries: {},
  };
}

export async function readCheckpoint(filePath: string): Promise<CheckpointFile> {
  try {
    const value = await readJson(filePath);
    return parseCheckpoint(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyCheckpoint();
    }
    throw error;
  }
}

export function parseCheckpoint(value: unknown): CheckpointFile {
  if (!isRecord(value)) {
    throw new Error("Checkpoint must be a JSON object");
  }
  if (value.version !== CHECKPOINT_VERSION) {
    throw new Error(`Checkpoint version must be ${CHECKPOINT_VERSION}`);
  }
  if (!isRecord(value.entries)) {
    throw new Error("Checkpoint entries must be an object");
  }

  const entries: Record<string, CheckpointImage> = {};
  for (const [driveFileId, rawEntry] of Object.entries(value.entries)) {
    const entry = parseCheckpointImage(driveFileId, rawEntry);
    entries[driveFileId] = entry;
  }

  return {
    version: CHECKPOINT_VERSION,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    entries,
  };
}

function parseCheckpointImage(driveFileId: string, value: unknown): CheckpointImage {
  if (!isRecord(value)) {
    throw new Error(`Checkpoint entry ${driveFileId} must be an object`);
  }
  const sku = value.sku;
  const position = value.position;
  if (typeof sku !== "string" || sku.length === 0) {
    throw new Error(`Checkpoint entry ${driveFileId} has an invalid sku`);
  }
  if (!Number.isInteger(position) || (position as number) < 1 || (position as number) > 99) {
    throw new Error(`Checkpoint entry ${driveFileId} has an invalid position`);
  }
  if (value.driveFileId !== driveFileId) {
    throw new Error(`Checkpoint entry ${driveFileId} has a mismatched driveFileId`);
  }
  if (!isRecord(value.sizes)) {
    throw new Error(`Checkpoint entry ${driveFileId} has invalid sizes`);
  }

  const sizes = {} as Record<MediaWidth, SizeOutput>;
  for (const width of MEDIA_WIDTHS) {
    const rawOutput = value.sizes[String(width)];
    if (!isRecord(rawOutput)) {
      throw new Error(`Checkpoint entry ${driveFileId} is missing size ${width}`);
    }
    const expectedPath = mediaPath(sku, position as number, width);
    if (rawOutput.path !== expectedPath) {
      throw new Error(`Checkpoint entry ${driveFileId} has an unexpected path for size ${width}`);
    }
    if (typeof rawOutput.sha256 !== "string" || !SHA256_PATTERN.test(rawOutput.sha256)) {
      throw new Error(`Checkpoint entry ${driveFileId} has an invalid hash for size ${width}`);
    }
    sizes[width] = {
      path: expectedPath,
      width: rawOutput.width as number,
      height: rawOutput.height as number,
      bytes: rawOutput.bytes as number,
      sha256: rawOutput.sha256,
    };
  }

  return {
    driveFileId,
    sku,
    position: position as number,
    sourceName: typeof value.sourceName === "string" ? value.sourceName : "",
    sourceBytes: Number.isInteger(value.sourceBytes) ? (value.sourceBytes as number) : 0,
    sourceSha256: typeof value.sourceSha256 === "string" ? value.sourceSha256 : "",
    sizes,
  };
}

export async function writeCheckpoint(filePath: string, checkpoint: CheckpointFile): Promise<void> {
  checkpoint.updatedAt = new Date().toISOString();
  await writeJsonAtomic(filePath, checkpoint);
}

/**
 * An output set is reusable only when all three files exist with the recorded
 * size and SHA-256. A mismatch sends the image through download and encoding
 * again, which keeps the manifest and the files on disk in sync.
 */
export async function outputsMatchCheckpoint(
  entry: CheckpointImage,
  outDir: string,
): Promise<boolean> {
  for (const width of MEDIA_WIDTHS) {
    const output = entry.sizes[width];
    const expectedPath = mediaPath(entry.sku, entry.position, width);
    if (output.path !== expectedPath) {
      return false;
    }

    const absolutePath = path.join(outDir, ...output.path.split("/"));
    const size = await fileSize(absolutePath);
    if (size !== output.bytes) {
      return false;
    }
    if ((await hashFile(absolutePath)) !== output.sha256) {
      return false;
    }
  }
  return true;
}
