import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  emptyCheckpoint,
  outputsMatchCheckpoint,
  parseCheckpoint,
  readCheckpoint,
  type CheckpointImage,
} from "../../scripts/media/checkpoint.ts";
import { sha256 } from "../../scripts/media/files.ts";
import { MEDIA_WIDTHS, mediaPath } from "../../scripts/media/inventory.ts";
import type { SizeOutput } from "../../scripts/media/manifest.ts";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "coveweft-media-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function entryFor(skus: {
  sku: string;
  position: number;
  files: Record<number, Buffer>;
}): CheckpointImage {
  const sizes = {} as Record<number, SizeOutput>;
  for (const width of MEDIA_WIDTHS) {
    const data = skus.files[width];
    sizes[width] = {
      path: mediaPath(skus.sku, skus.position, width),
      width,
      height: Math.round(width * 1.5),
      bytes: data.length,
      sha256: sha256(data),
    };
  }
  return {
    driveFileId: "drive-id",
    sku: skus.sku,
    position: skus.position,
    sourceName: `${skus.sku}_s01.jpg`,
    sourceBytes: 1000,
    sourceSha256: sha256("source"),
    sizes: sizes as CheckpointImage["sizes"],
  };
}

async function writeOutputs(
  directory: string,
  entry: CheckpointImage,
  files: Record<number, Buffer>,
): Promise<void> {
  for (const width of MEDIA_WIDTHS) {
    const output = entry.sizes[width];
    const absolutePath = path.join(directory, ...output.path.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, files[width]);
  }
}

describe("checkpoint reuse", () => {
  it("reuses an image only when every output matches size and hash", async () => {
    const directory = await temporaryDirectory();
    const files = {
      480: Buffer.from("small"),
      960: Buffer.from("medium-size"),
      1600: Buffer.from("large-output-data"),
    };
    const entry = entryFor({ sku: "A", position: 1, files });

    await writeOutputs(directory, entry, files);
    expect(await outputsMatchCheckpoint(entry, directory)).toBe(true);

    await writeFile(path.join(directory, ...entry.sizes[960].path.split("/")), "tampered");
    expect(await outputsMatchCheckpoint(entry, directory)).toBe(false);

    await rm(path.join(directory, ...entry.sizes[480].path.split("/")));
    expect(await outputsMatchCheckpoint(entry, directory)).toBe(false);
  });

  it("returns an empty checkpoint when the resume file does not exist", async () => {
    const directory = await temporaryDirectory();
    const checkpoint = await readCheckpoint(path.join(directory, "missing.json"));

    expect(checkpoint.entries).toEqual({});
    expect(checkpoint.version).toBe(emptyCheckpoint().version);
  });
});

describe("parseCheckpoint", () => {
  const files = {
    480: Buffer.from("small"),
    960: Buffer.from("medium-size"),
    1600: Buffer.from("large-output-data"),
  };

  it("accepts a checkpoint written by the pipeline", () => {
    const entry = entryFor({ sku: "A", position: 2, files });
    const checkpoint = parseCheckpoint({
      version: 1,
      updatedAt: "2026-11-06T00:00:00.000Z",
      entries: { [entry.driveFileId]: entry },
    });

    expect(checkpoint.entries[entry.driveFileId]).toMatchObject({ sku: "A", position: 2 });
  });

  it("rejects a path that does not follow the position convention", () => {
    const entry = entryFor({ sku: "A", position: 2, files });
    const broken = {
      ...entry,
      sizes: { ...entry.sizes, 480: { ...entry.sizes[480], path: "studio/A/99-480.webp" } },
    };

    expect(() =>
      parseCheckpoint({
        version: 1,
        updatedAt: "2026-11-06T00:00:00.000Z",
        entries: { [entry.driveFileId]: broken },
      }),
    ).toThrow(/unexpected path/);
  });

  it("rejects an invalid hash", () => {
    const entry = entryFor({ sku: "A", position: 2, files });
    const broken = {
      ...entry,
      sizes: { ...entry.sizes, 480: { ...entry.sizes[480], sha256: "not-a-hash" } },
    };

    expect(() =>
      parseCheckpoint({
        version: 1,
        updatedAt: "2026-11-06T00:00:00.000Z",
        entries: { [entry.driveFileId]: broken },
      }),
    ).toThrow(/invalid hash/);
  });
});
