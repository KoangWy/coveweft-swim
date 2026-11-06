import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import sharp from "sharp";

import { assertKnownOptions, optionalStringOption, parseCliArgs } from "./args.ts";
import { fileSize, formatBytes, formatDuration, hashFile, isRecord, toPosixPath } from "./files.ts";
import { MEDIA_WIDTHS, parseInventoryCsv, selectStudioImages } from "./inventory.ts";
import { MAX_REPORTED_ERRORS, validateManifest } from "./manifest.ts";
import { runPool } from "./pool.ts";

const HELP = `Studio media verification

Usage:
  pnpm media:verify [options]

Options:
  --manifest <path>     Manifest to check (default: data/media/manifest-studio-v1.json)
  --out <dir>           Build output directory (default: .media-build)
  --report <path>       Build report (default: data/media/build-report-studio-v1.json)
  --inventory <path>    Compare the manifest with the source inventory
  --archive <path>      Verify this archive instead of the one named in the report
  --allow-partial       Accept a preview manifest that ends mid-SKU
  --require-archive     Fail when the archive is missing
  --help                Show this help

The command checks every size file against the manifest: existence, byte size,
SHA-256, width, height, WebP format, and stripped EXIF/XMP/IPTC metadata.
`;

interface VerificationCounters {
  files: number;
  bytes: number;
  errors: number;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), ["help", "allow-partial", "require-archive"]);
  assertKnownOptions(args, [
    "manifest",
    "out",
    "report",
    "inventory",
    "archive",
    "allow-partial",
    "require-archive",
    "help",
  ]);

  if (args.options.get("help") === true) {
    process.stdout.write(HELP);
    return;
  }

  const manifestPath = path.resolve(
    optionalStringOption(args, "manifest") ?? "data/media/manifest-studio-v1.json",
  );
  const outDir = path.resolve(optionalStringOption(args, "out") ?? ".media-build");
  const reportPath = path.resolve(
    optionalStringOption(args, "report") ?? "data/media/build-report-studio-v1.json",
  );
  const inventoryOption = optionalStringOption(args, "inventory");
  const archiveOption = optionalStringOption(args, "archive");
  const allowPartial = args.options.get("allow-partial") === true;
  const requireArchive = args.options.get("require-archive") === true;

  const startedAt = Date.now();
  const counters: VerificationCounters = { files: 0, bytes: 0, errors: 0 };
  const errors: string[] = [];

  const recordError = (message: string) => {
    counters.errors += 1;
    if (errors.length < MAX_REPORTED_ERRORS) {
      errors.push(message);
    }
  };

  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    process.stderr.write(
      `[media] cannot read manifest ${displayPath(manifestPath)}: ${describeError(error)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const validation = validateManifest(manifestValue, {
    requireContiguousPositions: !allowPartial,
  });
  if (!validation.manifest) {
    process.stderr.write(`[media] manifest ${displayPath(manifestPath)} is invalid:\n`);
    for (const error of validation.errors) {
      process.stderr.write(`  - ${error}\n`);
    }
    if (validation.errorCount > validation.errors.length) {
      process.stderr.write(
        `  ... and ${validation.errorCount - validation.errors.length} more error(s)\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  const manifest = validation.manifest;
  process.stderr.write(
    `[media] verifying ${manifest.imageCount} images against ${displayPath(outDir)}\n`,
  );

  if (inventoryOption) {
    if (allowPartial) {
      process.stderr.write("[media] inventory comparison skipped for a partial manifest\n");
    } else {
      const expected = selectStudioImages(
        parseInventoryCsv(await readFile(path.resolve(inventoryOption), "utf8")),
      );
      compareWithInventory(
        expected.map((image) => ({
          sku: image.sku,
          position: image.position,
          driveFileId: image.driveFileId,
        })),
        manifest.entries,
        recordError,
      );
    }
  }

  let checkedImages = 0;
  await runPool(manifest.entries, 4, async (entry) => {
    for (const width of MEDIA_WIDTHS) {
      const output = entry.sizes[width];
      const absolutePath = path.join(outDir, ...output.path.split("/"));

      let info: Awaited<ReturnType<typeof stat>>;
      try {
        info = await stat(absolutePath);
      } catch {
        recordError(`${output.path}: file is missing`);
        continue;
      }
      if (!info.isFile()) {
        recordError(`${output.path}: not a regular file`);
        continue;
      }

      counters.files += 1;
      counters.bytes += info.size;

      if (info.size !== output.bytes) {
        recordError(`${output.path}: size is ${info.size} bytes, manifest says ${output.bytes}`);
      }
      const digest = await hashFile(absolutePath);
      if (digest !== output.sha256) {
        recordError(`${output.path}: SHA-256 does not match the manifest`);
      }

      try {
        const metadata = await sharp(absolutePath).metadata();
        if (metadata.format !== "webp") {
          recordError(`${output.path}: format is ${metadata.format ?? "unknown"}, expected webp`);
        }
        if (metadata.width !== output.width || metadata.height !== output.height) {
          recordError(
            `${output.path}: dimensions are ${metadata.width ?? "?"}x${metadata.height ?? "?"}, ` +
              `manifest says ${output.width}x${output.height}`,
          );
        }
        const remaining = [
          metadata.exif ? "EXIF" : null,
          metadata.xmp ? "XMP" : null,
          metadata.iptc ? "IPTC" : null,
          metadata.orientation ? "orientation" : null,
        ].filter((field): field is string => field !== null);
        if (remaining.length > 0) {
          recordError(`${output.path}: metadata was not stripped (${remaining.join(", ")})`);
        }
      } catch (error) {
        recordError(`${output.path}: cannot be decoded (${describeError(error)})`);
      }
    }

    checkedImages += 1;
    if (checkedImages % 500 === 0) {
      process.stderr.write(`[media] checked ${checkedImages}/${manifest.imageCount} images\n`);
    }
  });

  await verifyReportAndArchive({
    reportPath,
    outDir,
    archiveOption,
    requireArchive,
    recordError,
  });

  const elapsed = Date.now() - startedAt;
  process.stdout.write(
    `Verified ${manifest.imageCount} images and ${counters.files} files ` +
      `(${formatBytes(counters.bytes)}) in ${formatDuration(elapsed)}.\n`,
  );

  if (counters.errors > 0) {
    process.stderr.write(`[media] ${counters.errors} verification error(s):\n`);
    for (const error of errors) {
      process.stderr.write(`  - ${error}\n`);
    }
    if (counters.errors > errors.length) {
      process.stderr.write(`  ... and ${counters.errors - errors.length} more\n`);
    }
    process.stderr.write("[media] verification failed\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[media] manifest and build output are consistent\n");
}

function compareWithInventory(
  expected: { sku: string; position: number; driveFileId: string }[],
  actual: { sku: string; position: number; driveFileId: string }[],
  recordError: (message: string) => void,
): void {
  if (expected.length !== actual.length) {
    recordError(`manifest has ${actual.length} images, inventory expects ${expected.length}`);
  }

  const length = Math.min(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    const expectedEntry = expected[index];
    const actualEntry = actual[index];
    if (
      expectedEntry.sku !== actualEntry.sku ||
      expectedEntry.position !== actualEntry.position ||
      expectedEntry.driveFileId !== actualEntry.driveFileId
    ) {
      recordError(
        `manifest entry ${index} is ${actualEntry.sku}/${actualEntry.position}/${actualEntry.driveFileId}, ` +
          `inventory expects ${expectedEntry.sku}/${expectedEntry.position}/${expectedEntry.driveFileId}`,
      );
    }
  }
}

async function verifyReportAndArchive(options: {
  reportPath: string;
  outDir: string;
  archiveOption: string | undefined;
  requireArchive: boolean;
  recordError: (message: string) => void;
}): Promise<void> {
  let reportValue: unknown = null;
  try {
    reportValue = JSON.parse(await readFile(options.reportPath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      options.recordError(`cannot read report ${displayPath(options.reportPath)}`);
    } else if (options.requireArchive) {
      options.recordError(`report is missing: ${displayPath(options.reportPath)}`);
    } else {
      process.stderr.write(
        `[media] report not found (${displayPath(options.reportPath)}); archive check skipped\n`,
      );
    }
  }

  const report = isRecord(reportValue) ? reportValue : null;
  if (report) {
    if (report.status !== "complete") {
      options.recordError(`report status is ${String(report.status)}, expected complete`);
    }
    if (isRecord(report.images) && report.images.failed !== 0) {
      options.recordError(`report lists ${String(report.images.failed)} failed images`);
    }
  }

  const reportArchive = report && isRecord(report.archive) ? report.archive : null;
  const reportArchiveFile =
    reportArchive && typeof reportArchive.file === "string" ? reportArchive.file : null;
  const archivePath = options.archiveOption
    ? path.resolve(options.archiveOption)
    : reportArchiveFile
      ? path.resolve(reportArchiveFile)
      : path.join(options.outDir, "coveweft-media-studio-v1.tar.gz");

  const archiveBytes = await fileSize(archivePath);
  if (archiveBytes === null) {
    if (options.archiveOption || options.requireArchive) {
      options.recordError(`archive is missing: ${displayPath(archivePath)}`);
    } else {
      process.stderr.write(
        `[media] archive not found (${displayPath(archivePath)}); archive check skipped\n`,
      );
    }
    return;
  }

  if (
    reportArchive &&
    typeof reportArchive.bytes === "number" &&
    reportArchive.bytes !== archiveBytes
  ) {
    options.recordError(
      `archive size is ${archiveBytes} bytes, report says ${reportArchive.bytes}`,
    );
  }

  const archiveDigest = await hashFile(archivePath);
  if (reportArchive && typeof reportArchive.sha256 === "string") {
    if (archiveDigest !== reportArchive.sha256) {
      options.recordError("archive SHA-256 does not match the report");
    }
  }

  try {
    const sidecar = (await readFile(`${archivePath}.sha256`, "utf8")).trim().split(/\s+/)[0];
    if (sidecar !== archiveDigest) {
      options.recordError("archive .sha256 sidecar does not match the archive");
    }
  } catch {
    options.recordError(`archive checksum file is missing: ${displayPath(archivePath)}.sha256`);
  }

  process.stderr.write(
    `[media] archive ${formatBytes(archiveBytes)} sha256 ${archiveDigest} verified\n`,
  );
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
