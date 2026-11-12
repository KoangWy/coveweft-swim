import { SuggestProductsInput, suggestProducts } from "@/server/catalog";

/** Prefix search for the header suggestion panel; never cached by the browser. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const limit = params.get("limit");
  const parsed = SuggestProductsInput.safeParse({
    q: params.get("q") ?? "",
    limit: limit === null || limit === "" ? undefined : Number(limit),
  });

  if (!parsed.success) {
    return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const result = await suggestProducts(parsed.data);

  if (!result.ok) {
    return Response.json({ error: result.error.code }, { status: 503 });
  }

  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
