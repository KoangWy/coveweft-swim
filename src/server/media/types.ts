/** Image widths published by the versioned studio media package. */
export const IMAGE_SIZES = [480, 960, 1600] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

/** The fields of a `product_images` row that determine its public URL. */
export type MediaImage = {
  source: "release" | "upload";
  path: string;
};

export const PRODUCT_UPLOADS_BUCKET = "product-uploads";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;
