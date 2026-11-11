import { z } from "zod";

import { imageSources } from "@/features/catalog/components/image-sources";
import { LocaleInput, listProducts } from "@/server/catalog";

const Input = z.object({
  locale: LocaleInput,
  ids: z.array(z.uuid()).max(500),
  page: z.number().int().min(1).max(100).default(1),
});

/** Reads current public product data; selections remain in the browser. */
export async function POST(request: Request): Promise<Response> {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const result = await listProducts({ ...parsed.data, pageSize: 24 });
  if (!result.ok) return Response.json({ error: result.error.code }, { status: 503 });
  const { items, facets, pageCount, total } = result.data;
  const labels = new Map(facets.productTypes.map((facet) => [facet.value, facet.label]));
  return Response.json(
    {
      items: items.map((product) => ({
        product,
        primary: imageSources(product.images[0]).medium,
        secondary: imageSources(product.images[1]).medium,
        locale: parsed.data.locale,
        typeLabel: labels.get(product.productType) ?? product.productType,
      })),
      pageCount,
      total,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
