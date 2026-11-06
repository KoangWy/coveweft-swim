import path from "node:path";
import { readFile } from "node:fs/promises";

import { createMediaArchive, writeSha256Sidecar } from "./archive.ts";
import {
  assertKnownOptions,
  optionalIntegerOption,
  optionalStringOption,
  parseCliArgs,
  requireStringOption,
} from "./args.ts";
import {
  outputsMatchCheckpoint,
  readCheckpoint,
  writeCheckpoint,
  type CheckpointFile,
  type CheckpointImage,
} from "./checkpoint.ts";
import { DownloadError, downloadDriveFile } from "./download.ts";
import { encodeStudioImage } from "./encode.ts";
import { ensureDir, formatBytes, formatDuration, toPosixPath, writeJsonAtomic } from "./files.ts";
import {
  MEDIA_WIDTHS,
  parseInventoryCsv,
  selectStudioImages,
  type StudioImage,
} from "./inventory.ts";
import { buildManifest, type StudioManifest } from "./manifest.ts";
import { runPool } from "./pool.ts";
import { emptySizeTotals, REPORT_VERSION, type BuildFailure, type BuildReport } from "./report.ts";

const HELP = `Studio media pipeline

Usage:
  pnpm media:build --inventory <inventory.csv> [options]

Options:
  --inventory <path>   SOBIE Drive inventory CSV (required)
  --out <dir>          Build output directory (default: .media-build)
  --limit <count>      Process the first N images and write preview metadata
  --concurrency <n>    Parallel downloads and encodes, 1-3 (default: 3)
  --checkpoint <path>  Resume file (default: <out>/checkpoint-studio-v1.json)
  --manifest <path>    Manifest output (default: data/media/manifest-studio-v1.json)
  --report <path>      Build report output (default: data/media/build-report-studio-v1.json)
  --archive <path>     Archive output (default: <out>/coveweft-media-studio-v1.tar.gz)
  --no-archive         Skip archive creation
  --help               Show this help

With --limit, metadata and the archive default to <out>/preview/ so a test run
never overwrites the committed full-build metadata.
`;

class CheckpointWriter {
  private readonly filePath: string;
  private readonly checkpoint: CheckpointFile;
  private saving: Promise<void> | null = null;
  private dirty = false;
  private failure: Error | null = null;

  constructor(filePath: string, checkpoint: CheckpointFile) {
    this.filePath = filePath;
    this.checkpoint = checkpoint;
  }

  request(): void {
    this.dirty = true;
    if (this.saving) {
      return;
    }
    this.saving = this.run();
  }

  async flush(): Promise<void> {
    await this.run();
  }

  get error(): Error | null {
    return this.failure;
  }

  private async run(): Promise<void> {
    if (this.saving) {
      return this.saving;
    }
    this.saving = (async () => {
      try {
        while (this.dirty) {
          this.dirty = false;
          await writeCheckpoint(this.filePath, this.checkpoint);
          if (this.dirty) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      } catch (error) {
        this.failure = error instanceof Error ? error : new Error(String(error));
      } finally {
        this.saving = null;
      }
    })();
    return this.saving;
  }
}

interface BuildCounters {
  succeeded: number;
  failed: number;
  reused: number;
  downloaded: number;
  bytesDownloaded: number;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), ["no-archive", "help"]);
  assertKnownOptions(args, [
    "inventory",
    "out",
    "limit",
    "concurrency",
    "checkpoint",
    "manifest",
    "report",
    "archive",
    "no-archive",
    "help",
  ]);

  if (args.options.get("help") === true) {
    process.stdout.write(HELP);
    return;
  }

  const inventoryPath = path.resolve(requireStringOption(args, "inventory"));
  const outDir = path.resolve(optionalStringOption(args, "out") ?? ".media-build");
  const limit = optionalIntegerOption(args, "limit", { min: 1 });
  const concurrency = optionalIntegerOption(args, "concurrency", { min: 1, max: 3 }) ?? 3;
  const checkpointPath = path.resolve(
    optionalStringOption(args, "checkpoint") ?? path.join(outDir, "checkpoint-studio-v1.json"),
  );
  const archiveDisabled = args.options.get("no-archive") === true;
  const archiveOverride = optionalStringOption(args, "archive");
  if (archiveDisabled && archiveOverride) {
    throw new Error("Use either --archive or --no-archive, not both");
  }

  const preview = limit !== undefined;
  const metadataDir = preview ? path.join(outDir, "preview") : path.resolve("data/media");
  const manifestPath = path.resolve(
    optionalStringOption(args, "manifest") ?? path.join(metadataDir, "manifest-studio-v1.json"),
  );
  const reportPath = path.resolve(
    optionalStringOption(args, "report") ?? path.join(metadataDir, "build-report-studio-v1.json"),
  );
  const archivePath = path.resolve(
    archiveOverride ??
      path.join(preview ? path.join(outDir, "preview") : outDir, "coveweft-media-studio-v1.tar.gz"),
  );

  const startedAt = Date.now();
  const inventoryText = await readFile(inventoryPath, "utf8").catch((error: unknown) => {
    throw new Error(`Cannot read inventory CSV at ${inventoryPath}: ${describeError(error)}`);
  });
  const rows = parseInventoryCsv(inventoryText);
  const allImages = selectStudioImages(rows);
  if (allImages.length === 0) {
    throw new Error("No studio images found in the inventory CSV");
  }

  const images = limit === undefined ? allImages : allImages.slice(0, limit);
  if (limit !== undefined && limit > allImages.length) {
    process.stderr.write(
      `[media] --limit ${limit} is larger than the inventory; using ${allImages.length} images\n`,
    );
  }

  const skuCount = new Set(allImages.map((image) => image.sku)).size;
  process.stderr.write(
    `[media] ${images.length} of ${allImages.length} studio images (${skuCount} SKUs); ` +
      `concurrency ${concurrency}; output ${outDir}\n`,
  );

  const checkpoint = await readCheckpoint(checkpointPath);
  const writer = new CheckpointWriter(checkpointPath, checkpoint);
  const results = new Map<string, CheckpointImage>();
  const counters: BuildCounters = {
    succeeded: 0,
    failed: 0,
    reused: 0,
    downloaded: 0,
    bytesDownloaded: 0,
  };
  const failures: BuildFailure[] = [];

  let interrupted = false;
  const handleInterrupt = () => {
    if (interrupted) {
      process.stderr.write("\n[media] second interrupt; exiting now\n");
      process.exit(130);
    }
    interrupted = true;
    process.stderr.write(
      "\n[media] interrupt received; finishing in-flight images and saving the checkpoint (Ctrl+C again to exit now)\n",
    );
  };
  process.on("SIGINT", handleInterrupt);

  let lastLogAt = Date.now();
  let lastLoggedCount = 0;
  let retryEvents = 0;

  const logProgress = (force = false) => {
    const done = counters.succeeded + counters.failed;
    const now = Date.now();
    if (!force && done - lastLoggedCount < 25 && now - lastLogAt < 30_000) {
      return;
    }
    lastLoggedCount = done;
    lastLogAt = now;
    const elapsedSeconds = Math.max(1, (now - startedAt) / 1000);
    const rate = done / elapsedSeconds;
    const eta = rate > 0 ? ((images.length - done) / rate) * 1000 : null;
    const percent = images.length === 0 ? 100 : (done / images.length) * 100;
    process.stderr.write(
      `[media] ${done}/${images.length} images (${percent.toFixed(1)}%) | ` +
        `downloaded ${counters.downloaded} | reused ${counters.reused} | failed ${counters.failed} | ` +
        `${rate.toFixed(2)} img/s | ETA ${eta === null ? "unknown" : formatDuration(eta)}\n`,
    );
  };

  const processImage = async (image: StudioImage): Promise<void> => {
    const cached = checkpoint.entries[image.driveFileId];
    try {
      if (
        cached &&
        cached.sku === image.sku &&
        cached.position === image.position &&
        (await outputsMatchCheckpoint(cached, outDir))
      ) {
        results.set(image.driveFileId, cached);
        counters.reused += 1;
        counters.succeeded += 1;
        logProgress();
        return;
      }

      const download = await downloadDriveFile(image.driveFileId, {
        onRetry: (info) => {
          retryEvents += 1;
          if (retryEvents <= 20 || retryEvents % 100 === 0) {
            process.stderr.write(
              `[media] retry ${info.driveFileId} attempt ${info.attempt}/${info.attempts}: ` +
                `${info.reason} (waiting ${info.delayMs} ms)\n`,
            );
          }
        },
      });
      counters.downloaded += 1;
      counters.bytesDownloaded += download.bytes;

      const sizes = await encodeStudioImage(download.data, outDir, image);
      const entry: CheckpointImage = {
        driveFileId: image.driveFileId,
        sku: image.sku,
        position: image.position,
        sourceName: image.sourceName,
        sourceBytes: download.bytes,
        sourceSha256: download.sha256,
        sizes,
      };

      checkpoint.entries[image.driveFileId] = entry;
      results.set(image.driveFileId, entry);
      writer.request();
      counters.succeeded += 1;
    } catch (error) {
      counters.failed += 1;
      const failure: BuildFailure = {
        driveFileId: image.driveFileId,
        sku: image.sku,
        position: image.position,
        sourceName: image.sourceName,
        attempts: error instanceof DownloadError ? error.attempts : 1,
        reason: describeError(error),
      };
      failures.push(failure);
      process.stderr.write(
        `[media] failed ${image.sku} ${String(image.position).padStart(2, "0")} ` +
          `(${image.driveFileId}): ${failure.reason}\n`,
      );
    }
    logProgress();
  };

  await runPool(images, concurrency, async (image) => {
    if (interrupted || writer.error) {
      return;
    }
    await processImage(image);
  });

  process.off("SIGINT", handleInterrupt);
  await writer.flush();
  const createdAt = new Date().toISOString();

  if (writer.error) {
    throw new Error(`Cannot write checkpoint ${checkpointPath}: ${describeError(writer.error)}`);
  }

  failures.sort((left, right) =>
    left.sku === right.sku ? left.position - right.position : left.sku < right.sku ? -1 : 1,
  );

  if (interrupted || counters.failed > 0) {
    await writePartialArtifacts({
      outDir,
      images,
      results,
      counters,
      failures,
      createdAt,
      startedAt,
      status: interrupted ? "interrupted" : "failed",
      inventoryName: path.basename(inventoryPath),
      allImageCount: allImages.length,
      skuCount,
      limit: limit ?? null,
    });
    process.stderr.write(
      `[media] ${counters.succeeded} images ready, ${counters.failed} failed. ` +
        `Run the same command again to resume; completed images are reused.\n`,
    );
    process.exitCode = interrupted ? 130 : 1;
    return;
  }

  const manifest = buildManifest(images, results, createdAt);
  const sizeTotals = emptySizeTotals();
  let totalBytes = 0;
  for (const entry of manifest.entries) {
    for (const width of MEDIA_WIDTHS) {
      const output = entry.sizes[width];
      sizeTotals[width].images += 1;
      sizeTotals[width].bytes += output.bytes;
      totalBytes += output.bytes;
    }
  }

  let archiveInfo: BuildReport["archive"] = null;
  if (!archiveDisabled) {
    process.stderr.write(`[media] creating archive ${archivePath}\n`);
    const archive = await createMediaArchive({
      outDir,
      archivePath,
      files: manifest.entries.flatMap((entry) =>
        MEDIA_WIDTHS.map((width) => entry.sizes[width].path),
      ),
    });
    await writeSha256Sidecar(archive.path, archive.sha256);
    archiveInfo = {
      file: displayPath(archive.path),
      bytes: archive.bytes,
      sha256: archive.sha256,
    };
    process.stderr.write(
      `[media] archive ${formatBytes(archive.bytes)} sha256 ${archive.sha256}\n`,
    );
  }

  const report = buildReport({
    manifest,
    createdAt,
    startedAt,
    counters,
    failures,
    sizeTotals,
    totalBytes,
    inventoryName: path.basename(inventoryPath),
    allImageCount: allImages.length,
    skuCount,
    limit: limit ?? null,
    manifestPath,
    archiveInfo,
  });

  await ensureDir(path.dirname(manifestPath));
  await writeJsonAtomic(manifestPath, manifest);
  await ensureDir(path.dirname(reportPath));
  await writeJsonAtomic(reportPath, report);

  const totalFiles = manifest.imageCount * MEDIA_WIDTHS.length;
  process.stdout.write(
    `Built ${manifest.imageCount} studio images (${totalFiles} files, ${formatBytes(totalBytes)}) ` +
      `in ${formatDuration(Date.now() - startedAt)}.\n` +
      `Manifest: ${displayPath(manifestPath)}\n` +
      `Report: ${displayPath(reportPath)}\n` +
      (archiveInfo ? `Archive: ${archiveInfo.file} (${formatBytes(archiveInfo.bytes)})\n` : "") +
      `Verify with: pnpm media:verify${preview ? " --allow-partial" : ""}\n`,
  );
}

async function writePartialArtifacts(options: {
  outDir: string;
  images: StudioImage[];
  results: Map<string, CheckpointImage>;
  counters: BuildCounters;
  failures: BuildFailure[];
  createdAt: string;
  startedAt: number;
  status: "failed" | "interrupted";
  inventoryName: string;
  allImageCount: number;
  skuCount: number;
  limit: number | null;
}): Promise<void> {
  const successfulImages = options.images.filter((image) => options.results.has(image.driveFileId));
  const manifest =
    successfulImages.length > 0
      ? buildManifest(successfulImages, options.results, options.createdAt)
      : null;

  const sizeTotals = emptySizeTotals();
  let totalBytes = 0;
  for (const entry of options.results.values()) {
    for (const width of MEDIA_WIDTHS) {
      sizeTotals[width].images += 1;
      sizeTotals[width].bytes += entry.sizes[width].bytes;
      totalBytes += entry.sizes[width].bytes;
    }
  }

  const report: BuildReport = {
    version: REPORT_VERSION,
    createdAt: options.createdAt,
    status: options.status,
    durationMs: Date.now() - options.startedAt,
    inventory: {
      file: options.inventoryName,
      studioImages: options.allImageCount,
      skus: options.skuCount,
      limit: options.limit,
    },
    images: {
      total: options.images.length,
      succeeded: options.counters.succeeded,
      failed: options.counters.failed,
      reused: options.counters.reused,
      downloaded: options.counters.downloaded,
    },
    source: { bytesDownloaded: options.counters.bytesDownloaded },
    sizes: sizeTotals,
    total: {
      images: options.results.size,
      files: options.results.size * MEDIA_WIDTHS.length,
      bytes: totalBytes,
    },
    failures: options.failures,
    manifest: null,
    archive: null,
  };

  const manifestPath = path.join(options.outDir, "manifest-partial.json");
  const reportPath = path.join(options.outDir, "build-report-partial.json");
  if (manifest) {
    await writeJsonAtomic(manifestPath, manifest);
  }
  await writeJsonAtomic(reportPath, report);
  process.stderr.write(`[media] partial report: ${displayPath(reportPath)}\n`);
}

function buildReport(options: {
  manifest: StudioManifest;
  createdAt: string;
  startedAt: number;
  counters: BuildCounters;
  failures: BuildFailure[];
  sizeTotals: ReturnType<typeof emptySizeTotals>;
  totalBytes: number;
  inventoryName: string;
  allImageCount: number;
  skuCount: number;
  limit: number | null;
  manifestPath: string;
  archiveInfo: BuildReport["archive"];
}): BuildReport {
  return {
    version: REPORT_VERSION,
    createdAt: options.createdAt,
    status: "complete",
    durationMs: Date.now() - options.startedAt,
    inventory: {
      file: options.inventoryName,
      studioImages: options.allImageCount,
      skus: options.skuCount,
      limit: options.limit,
    },
    images: {
      total: options.manifest.imageCount,
      succeeded: options.counters.succeeded,
      failed: options.counters.failed,
      reused: options.counters.reused,
      downloaded: options.counters.downloaded,
    },
    source: { bytesDownloaded: options.counters.bytesDownloaded },
    sizes: options.sizeTotals,
    total: {
      images: options.manifest.imageCount,
      files: options.manifest.imageCount * MEDIA_WIDTHS.length,
      bytes: options.totalBytes,
    },
    failures: options.failures,
    manifest: displayPath(options.manifestPath),
    archive: options.archiveInfo,
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim().slice(0, 300);
  }
  return String(error).slice(0, 300);
}

function displayPath(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  return relative && !relative.startsWith("..") ? toPosixPath(relative) : path.basename(filePath);
}

await main().catch((error: unknown) => {
  process.stderr.write(`[media] ${describeError(error)}\n`);
  process.exitCode = 1;
});
