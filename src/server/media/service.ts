import "server-only";

import { getMediaConfig, getServerEnv } from "@/lib/config/env";

import { PRODUCT_UPLOADS_BUCKET, type ImageSize, type MediaImage } from "./types";

const SIZE_SUFFIX = /-(480|960|1600)\.webp$/i;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Builds a release image URL from the media base URL and the base path stored
 * in `product_images.path` (`studio/<SKU>/<NN>`). A path that already carries
 * a size suffix is accepted and normalized.
 */
export function buildReleaseImageUrl(baseUrl: string, path: string, size: ImageSize): string {
  const basePath = path.replace(SIZE_SUFFIX, "");

  return `${trimTrailingSlash(baseUrl)}/${encodePath(basePath)}-${size}.webp`;
}

/** Builds the public URL of an administrator upload in the storage bucket. */
export function buildUploadImageUrl(supabaseUrl: string, bucket: string, path: string): string {
  return `${trimTrailingSlash(supabaseUrl)}/storage/v1/object/public/${encodeURIComponent(
    bucket,
  )}/${encodePath(path)}`;
}

/**
 * Returns the public URL for one image at one width. Release images need the
 * media configuration; without it the function returns `null` so the UI can
 * render a neutral placeholder. Upload images always resolve against the
 * public Supabase URL.
 */
export function imageUrl(image: MediaImage, size: ImageSize): string | null {
  if (image.source === "release") {
    const media = getMediaConfig();

    if (!media) {
      return null;
    }

    return buildReleaseImageUrl(media.baseUrl, image.path, size);
  }

  return buildUploadImageUrl(
    getServerEnv().NEXT_PUBLIC_SUPABASE_URL,
    PRODUCT_UPLOADS_BUCKET,
    image.path,
  );
}
