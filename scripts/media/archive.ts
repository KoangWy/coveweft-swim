import path from "node:path";
import { rm } from "node:fs/promises";

import { create as createTar } from "tar";

import { ensureDir, fileSize, hashFile, writeFileAtomic } from "./files.ts";

export interface ArchiveResult {
  path: string;
  bytes: number;
  sha256: string;
}

/**
 * Pack the exported `studio/` tree into the release archive. Entry order and
 * timestamps are fixed so the same build output produces the same archive.
 */
export async function createMediaArchive(options: {
  outDir: string;
  archivePath: string;
  files: string[];
}): Promise<ArchiveResult> {
  const { outDir, archivePath, files } = options;
  if (files.length === 0) {
    throw new Error("Cannot create a media archive without files");
  }

  await ensureDir(path.dirname(archivePath));
  await rm(archivePath, { force: true });

  const sorted = [...files].sort();
  await createTar(
    {
      cwd: outDir,
      file: archivePath,
      gzip: { level: 6 },
      portable: true,
      mtime: new Date(0),
    },
    sorted,
  );

  const bytes = await fileSize(archivePath);
  if (bytes === null) {
    throw new Error(`Archive was not written: ${archivePath}`);
  }

  return {
    path: archivePath,
    bytes,
    sha256: await hashFile(archivePath),
  };
}

export async function writeSha256Sidecar(archivePath: string, digest: string): Promise<void> {
  await writeFileAtomic(`${archivePath}.sha256`, `${digest}  ${path.basename(archivePath)}\n`);
}
