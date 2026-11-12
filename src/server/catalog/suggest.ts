import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDatabaseError } from "@/server/db/errors";
import { fail, ok, type Result } from "@/server/errors";
import { imageUrl } from "@/server/media";
import { parseInput, runService } from "@/server/result";

import { loadProductImages } from "./repository";
import { SuggestProductsInput } from "./schemas";
import { normalizeSearchTerm, rankSuggestions, type SuggestionCandidate } from "./search";
import type { ProductImage, ProductSuggestionList } from "./types";

/**
 * Candidates read before ranking. Reading more than the caller shows keeps
 * name matches from being pushed out by description-only matches.
 */
const MAX_SUGGESTION_CANDIDATES = 60;

type SuggestionRow = {
  id: string;
  sku: string;
  name: string;
  price_vnd: number;
  in_stock: boolean;
};

function thumbnailUrl(images: ProductImage[] | undefined): string | null {
  const image = images?.find((item) => item.kind === "studio") ?? images?.[0];

  return image ? imageUrl(image, 480) : null;
}

/**
 * Returns the best product matches for a partial search term, for the header
 * suggestion panel. The lookup uses the same unaccented `search_text_all`
 * column as the listing, so lowercase and unaccented input still matches the
 * catalog.
 */
export async function suggestProducts(input: unknown): Promise<Result<ProductSuggestionList>> {
  return runService(async () => {
    const parsed = parseInput(SuggestProductsInput, input);

    if (!parsed.ok) {
      return parsed;
    }

    const term = normalizeSearchTerm(parsed.data.q);

    if (!term) {
      return ok({ items: [], total: 0 });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error, count } = await supabase
      .from("catalog_products")
      .select("id, sku, name, price_vnd, in_stock", { count: "exact" })
      .ilike("search_text_all", `%${term}%`)
      .order("name", { ascending: true })
      .limit(MAX_SUGGESTION_CANDIDATES);

    if (error) {
      const mapped = mapDatabaseError(error);
      return fail(mapped.code, mapped.details);
    }

    const candidates: SuggestionCandidate[] = ((data ?? []) as SuggestionRow[]).map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      priceVnd: row.price_vnd,
      inStock: row.in_stock,
    }));
    const ranked = rankSuggestions(candidates, parsed.data.q).slice(0, parsed.data.limit);
    const images = await loadProductImages(
      supabase,
      ranked.map((candidate) => candidate.id),
      { includeHidden: false },
    );

    return ok({
      items: ranked.map((candidate) => ({
        ...candidate,
        imageUrl: thumbnailUrl(images.get(candidate.id)),
      })),
      total: count ?? candidates.length,
    });
  });
}
