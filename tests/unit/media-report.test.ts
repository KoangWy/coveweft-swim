import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { sha256 } from "../../scripts/media/files.ts";
import { MEDIA_WIDTHS, mediaPath, type MediaWidth } from "../../scripts/media/inventory.ts";
import type { ManifestEntry, SizeOutput, StudioManifest } from "../../scripts/media/manifest.ts";
import {
  crossCheckReport,
  emptySizeTotals,
  validateBuildReport,
  type BuildReport,
} from "../../scripts/media/report.ts";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const verifyScript = path.join(repoRoot, "scripts/media/verify.ts");
const temporaryDirectories: string[] = [];

function makeEntry(
  sku: string,
  position: number,
  driveFileId: string,
  baseBytes = 1000,
): ManifestEntry {
  const sizes = {} as Record<MediaWidth, SizeOutput>;
  for (const width of MEDIA_WIDTHS) {
    sizes[width] = {
      path: mediaPath(sku, position, width),
      width,
      height: Math.round(width * 1.5),
      bytes: baseBytes + width,
      sha256: "a".repeat(64),
    };
  }
  return { sku, position, driveFileId, sizes };
}

function makeManifest(entries: ManifestEntry[]): StudioManifest {
  return {
    version: 1,
    createdAt: "2026-11-06T00:00:00.000Z",
    imageCount: entries.length,
    entries,
  };
}

function makeReport(
  manifest: StudioManifest,
  options: { limit?: number | null; studioImages?: number; skus?: number } = {},
): BuildReport {
  const sizes = emptySizeTotals();
  let totalBytes = 0;
  for (const entry of manifest.entries) {
    for (const width of MEDIA_WIDTHS) {
      sizes[width].images += 1;
      sizes[width].bytes += entry.sizes[width].bytes;
      totalBytes += entry.sizes[width].bytes;
    }
  }

  return {
    version: 1,
    createdAt: "2026-11-06T00:00:00.000Z",
    status: "complete",
    durationMs: 1000,
    inventory: {
      file: "inventory.csv",
      studioImages: options.studioImages ?? manifest.imageCount,
      skus: options.skus ?? 1,
      limit: options.limit === undefined ? null : options.limit,
    },
    images: {
      total: manifest.imageCount,
      succeeded: manifest.imageCount,
      failed: 0,
      reused: 0,
      downloaded: manifest.imageCount,
    },
    source: { bytesDownloaded: 0 },
    sizes,
    total: {
      images: manifest.imageCount,
      files: manifest.imageCount * MEDIA_WIDTHS.length,
      bytes: totalBytes,
    },
    failures: [],
    manifest: "data/media/manifest-studio-v1.json",
    archive: null,
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "coveweft-report-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeImageOutputs(
  buildDir: string,
  sku: string,
  position: number,
  driveFileId: string,
): Promise<ManifestEntry> {
  const sizes = {} as Record<MediaWidth, SizeOutput>;
  for (const width of MEDIA_WIDTHS) {
    const data = await sharp({
      create: {
        width: 20,
        height: 30,
        channels: 3,
        background: { r: 10, g: 30, b: 60 },
      },
    })
      .webp()
      .toBuffer();
    const relativePath = mediaPath(sku, position, width);
    const absolutePath = path.join(buildDir, ...relativePath.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, data);
    sizes[width] = {
      path: relativePath,
      width: 20,
      height: 30,
      bytes: data.length,
      sha256: sha256(data),
    };
  }
  return { sku, position, driveFileId, sizes };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("validateBuildReport", () => {
  it("accepts a complete report and rejects failed or malformed reports", () => {
    const manifest = makeManifest([makeEntry("A", 1, "id-a")]);
    const report = makeReport(manifest);

    expect(validateBuildReport(report).report).not.toBeNull();

    const failed = {
      ...report,
      status: "failed",
      images: { ...report.images, failed: 1, succeeded: 0 },
    };
    const failedResult = validateBuildReport(failed);
    expect(failedResult.report).toBeNull();
    expect(failedResult.errors.join("\n")).toContain("status must be complete");

    const malformed = {
      ...report,
      sizes: { 480: report.sizes[480] },
    };
    const malformedResult = validateBuildReport(malformed);
    expect(malformedResult.report).toBeNull();
    expect(malformedResult.errors.join("\n")).toContain("sizes must contain exactly");
  });
});

describe("crossCheckReport", () => {
  it("accepts a manifest that matches the report totals", () => {
    const manifest = makeManifest([makeEntry("A", 1, "id-a"), makeEntry("B", 1, "id-b")]);
    const report = makeReport(manifest);

    expect(crossCheckReport({ report, manifest })).toEqual([]);
  });

  it("rejects a truncated manifest against the full report", () => {
    const fullManifest = makeManifest([makeEntry("A", 1, "id-a"), makeEntry("B", 1, "id-b")]);
    const truncatedManifest = {
      ...fullManifest,
      imageCount: 1,
      entries: [fullManifest.entries[0]],
    };
    const report = makeReport(fullManifest);

    const errors = crossCheckReport({ report, manifest: truncatedManifest });

    expect(errors).toEqual(
      expect.arrayContaining([
        "report images.total is 2, manifest has 1 images",
        "report total.images is 2, manifest has 1 images",
        "report total.files is 6, manifest expects 3",
        "report inventory.studioImages is 2, manifest has 1 images",
      ]),
    );
    expect(errors.some((error) => error.startsWith("report sizes.480.images is 2"))).toBe(true);
    expect(errors.some((error) => error.startsWith("report total.bytes is"))).toBe(true);
  });

  it("reports observed file and byte totals", () => {
    const manifest = makeManifest([makeEntry("A", 1, "id-a")]);
    const report = makeReport(manifest);

    const errors = crossCheckReport({
      report,
      manifest,
      observed: { files: 2, bytes: 1 },
    });

    expect(errors).toContain("verified 2 files, manifest expects 3");
    expect(errors.some((error) => error.startsWith("verified 1 bytes, manifest totals"))).toBe(
      true,
    );
  });

  it("allows a preview report to describe a subset but still checks its totals", () => {
    const manifest = makeManifest([makeEntry("A", 1, "id-a")]);
    const report = makeReport(manifest, { limit: 1, studioImages: 5, skus: 3 });

    expect(crossCheckReport({ report, manifest })).toEqual([]);
  });

  it("compares the report inventory with a supplied inventory summary", () => {
    const manifest = makeManifest([makeEntry("A", 1, "id-a")]);
    const report = makeReport(manifest);

    const errors = crossCheckReport({
      report,
      manifest,
      inventory: { images: 2, skus: 2 },
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "report inventory.studioImages is 1, inventory has 2",
        "report inventory.skus is 1, inventory has 2",
      ]),
    );
  });
});

describe("media:verify report regression", () => {
  it("fails a truncated manifest against a full report", async () => {
    const directory = await temporaryDirectory();
    const buildDir = path.join(directory, "build");
    const entry = await writeImageOutputs(buildDir, "A", 1, "id-a");
    const truncatedManifest = makeManifest([entry]);
    const fullReport = makeReport(makeManifest([entry, makeEntry("B", 1, "id-b", 2000)]));

    const manifestPath = path.join(directory, "manifest-truncated.json");
    const reportPath = path.join(directory, "build-report.json");
    await writeFile(manifestPath, `${JSON.stringify(truncatedManifest, null, 2)}\n`);
    await writeFile(reportPath, `${JSON.stringify(fullReport, null, 2)}\n`);

    let failure: { code?: number | string; stderr?: string } | null = null;
    try {
      await execFileAsync(
        process.execPath,
        [
          "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
          verifyScript,
          "--manifest",
          manifestPath,
          "--report",
          reportPath,
          "--out",
          buildDir,
        ],
        { cwd: repoRoot },
      );
    } catch (error) {
      failure = error as { code?: number | string; stderr?: string };
    }

    expect(failure?.code).toBe(1);
    expect(failure?.stderr).toContain("report images.total is 2, manifest has 1 images");
    expect(failure?.stderr).toContain("verification failed");
  });
});
