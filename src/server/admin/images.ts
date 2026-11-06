import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth/guard";
import type { ProductImage } from "@/server/catalog/types";
import { mapDatabaseError } from "@/server/db/errors";
import { throwDatabaseError } from "@/server/db/throw";
import { fail, ok, type Result } from "@/server/errors";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_UPLOADS_BUCKET,
  type AllowedImageType,
} from "@/server/media";
import { parseInput, runService } from "@/server/result";

import { AdminDeleteImageInput, AdminReorderImagesInput, AdminUploadImageInput } from "./schemas";
import type { AdminImageDeleteResult } from "./types";

type ImageRow = {
  id: string;
  product_id: string;
  kind: "studio" | "community";
  source: "release" | "upload";
  path: string;
  position: number;
  is_visible: boolean;
};

function mapImage(row: ImageRow): ProductImage {
  return {
    id: row.id,
    kind: row.kind,
    source: row.source,
    path: row.path,
    position: row.position,
    isVisible: row.is_visible,
  };
}

function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "studio" ? -1 : 1;
    }

    return left.position - right.position || left.id.localeCompare(right.id);
  });
}

/**
 * Uploads an administrator image to the `product-uploads` bucket and records
 * it as a `source = upload` row. The bucket is public for reads; writes use
 * the secret key after the caller role is checked.
 */
export async function adminUploadImage(input: unknown): Promise<Result<ProductImage>> {
  return runService(async () => {
    const parsed = parseInput(AdminUploadImageInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { data: product, error: productError } = await supabase
      .from("catalog_products")
      .select("id")
      .eq("id", parsed.data.productId)
      .maybeSingle();

    if (productError) {
      const mapped = mapDatabaseError(productError);
      return fail(mapped.code, mapped.details);
    }

    if (!product) {
      return fail("NOT_FOUND", { productId: parsed.data.productId });
    }

    const file = parsed.data.file;
    const contentType = file.type as AllowedImageType;

    if (!(contentType in ALLOWED_IMAGE_TYPES)) {
      return fail("VALIDATION_ERROR", { reason: "unsupported_image_type" });
    }

    if (file.size === 0) {
      return fail("VALIDATION_ERROR", { reason: "empty_image" });
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return fail("VALIDATION_ERROR", { reason: "image_too_large" });
    }

    let position = parsed.data.position;

    if (position === undefined) {
      const { data: last, error: lastError } = await supabase
        .from("product_images")
        .select("position")
        .eq("product_id", parsed.data.productId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastError) {
        const mapped = mapDatabaseError(lastError);
        return fail(mapped.code, mapped.details);
      }

      position = (last?.position ?? -1) + 1;
    }

    const path = `${parsed.data.productId}/${crypto.randomUUID()}.${
      ALLOWED_IMAGE_TYPES[contentType]
    }`;
    const storage = createSupabaseAdminClient().storage.from(PRODUCT_UPLOADS_BUCKET);
    const { error: uploadError } = await storage.upload(path, await file.arrayBuffer(), {
      contentType,
      upsert: false,
    });

    if (uploadError) {
      return fail("INTERNAL", { reason: "storage_upload_failed" });
    }

    const { data, error } = await supabase
      .from("product_images")
      .insert({
        product_id: parsed.data.productId,
        kind: "studio",
        source: "upload",
        path,
        position,
      })
      .select("id, product_id, kind, source, path, position, is_visible")
      .single();

    if (error) {
      await storage.remove([path]);
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    return ok(mapImage(data as ImageRow));
  });
}

/**
 * Deletes an uploaded image and its storage object. Release images are part of
 * the versioned media package, so deleting one only hides it.
 */
export async function adminDeleteImage(input: unknown): Promise<Result<AdminImageDeleteResult>> {
  return runService<AdminImageDeleteResult>(async () => {
    const parsed = parseInput(AdminDeleteImageInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { data, error } = await supabase
      .from("product_images")
      .select("id, product_id, kind, source, path, position, is_visible")
      .eq("id", parsed.data.imageId)
      .maybeSingle();

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    if (!data) {
      return fail("NOT_FOUND");
    }

    const image = data as ImageRow;

    if (image.source === "upload") {
      const storage = createSupabaseAdminClient().storage.from(PRODUCT_UPLOADS_BUCKET);
      const { error: removeError } = await storage.remove([image.path]);

      if (removeError) {
        return fail("INTERNAL", { reason: "storage_delete_failed" });
      }

      const { error: deleteError } = await supabase
        .from("product_images")
        .delete()
        .eq("id", image.id);

      if (deleteError) {
        throwDatabaseError(deleteError);
      }

      return ok({ id: image.id, source: image.source, deleted: true, isVisible: false });
    }

    const { error: hideError } = await supabase
      .from("product_images")
      .update({ is_visible: false })
      .eq("id", image.id);

    if (hideError) {
      throwDatabaseError(hideError);
    }

    return ok({ id: image.id, source: image.source, deleted: false, isVisible: false });
  });
}

/** Rewrites image positions in the supplied order. */
export async function adminReorderImages(input: unknown): Promise<Result<ProductImage[]>> {
  return runService(async () => {
    const parsed = parseInput(AdminReorderImagesInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const supabase = await createSupabaseServerClient();
    const admin = await requireAdmin(supabase);

    if (!admin.ok) {
      return admin;
    }

    const { data, error } = await supabase
      .from("product_images")
      .select("id, product_id, kind, source, path, position, is_visible")
      .eq("product_id", parsed.data.productId)
      .in("id", parsed.data.imageIds);

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    const rows = (data ?? []) as ImageRow[];

    if (rows.length !== parsed.data.imageIds.length) {
      return fail("NOT_FOUND", { reason: "image_set_mismatch" });
    }

    const results = await Promise.all(
      parsed.data.imageIds.map((imageId, index) =>
        supabase
          .from("product_images")
          .update({ position: index })
          .eq("id", imageId)
          .eq("product_id", parsed.data.productId),
      ),
    );

    for (const result of results) {
      if (result.error) {
        throwDatabaseError(result.error);
      }
    }

    const byId = new Map(rows.map((row) => [row.id, row] as const));

    return ok(
      sortImages(
        parsed.data.imageIds
          .map((imageId) => byId.get(imageId))
          .filter((row): row is ImageRow => row !== undefined)
          .map((row, index) => mapImage({ ...row, position: index })),
      ),
    );
  });
}
