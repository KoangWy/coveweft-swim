import { NextResponse } from "next/server";

import { adminUploadImage } from "@/server/admin";
import type { ErrorCode } from "@/server/errors";

const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

type Context = { params: Promise<{ id: string }> };

/**
 * Image upload entry point in the API layer. Server Actions cap request bodies
 * at 1 MB, while the media service accepts files up to 5 MB, so the upload
 * travels through this small boundary. The service still checks the
 * administrator role and all upload rules.
 */
export async function POST(request: Request, context: Context) {
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await context.params;
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", details: { reason: "missing_file" } } },
      { status: 400 },
    );
  }

  const result = await adminUploadImage({ productId: id, file });

  if (!result.ok) {
    return NextResponse.json(result, { status: STATUS[result.error.code] ?? 500 });
  }

  return NextResponse.json(result, { status: 201 });
}
