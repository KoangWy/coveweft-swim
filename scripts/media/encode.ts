import path from "node:path";

import sharp from "sharp";

import { ensureDir, sha256, writeFileAtomic } from "./files.ts";
import { MEDIA_WIDTHS, mediaPath, type MediaWidth } from "./inventory.ts";
import type { SizeOutput } from "./manifest.ts";

export const WEBP_QUALITY = 80;

export interface EncodeOptions {
  widths?: readonly MediaWidth[];
  quality?: number;
  /** Keep the source width when it is narrower than the requested size. */
  allowEnlargement?: boolean;
}

/**
 * Decode one original and export the fixed WebP widths. Sharp preserves the
 * aspect ratio, applies the EXIF orientation to the pixels, and drops EXIF,
 * XMP, IPTC, and GPS metadata because no metadata is carried into the output.
 */
export async function encodeStudioImage(
  input: Buffer,
  outDir: string,
  image: { sku: string; position: number },
  options: EncodeOptions = {},
): Promise<Record<MediaWidth, SizeOutput>> {
  const widths = options.widths ?? MEDIA_WIDTHS;
  const quality = options.quality ?? WEBP_QUALITY;

  const source = sharp(input, { failOn: "error", limitInputPixels: 64_000_000 });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Source image has no readable dimensions");
  }

  const sizes = {} as Record<MediaWidth, SizeOutput>;
  for (const width of widths) {
    const pipeline = sharp(input, { failOn: "error", limitInputPixels: 64_000_000 })
      .rotate()
      .resize({
        width,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality, effort: 4, smartSubsample: true });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const relativePath = mediaPath(image.sku, image.position, width);
    const absolutePath = path.join(outDir, ...relativePath.split("/"));

    await ensureDir(path.dirname(absolutePath));
    await writeFileAtomic(absolutePath, data);

    sizes[width] = {
      path: relativePath,
      width: info.width,
      height: info.height,
      bytes: data.length,
      sha256: sha256(data),
    };
  }

  return sizes;
}
