/**
 * Normalizes a catalog search term to the same shape as the unaccented
 * `search_text_all` column: lower case, no diacritics, and only letters,
 * digits, spaces, and hyphens. Vietnamese `đ` is folded to `d`.
 */
export function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, (character) => (character === "đ" ? "d" : "D"))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One product considered for the suggestion list, before its image resolves. */
export type SuggestionCandidate = {
  id: string;
  sku: string;
  name: string;
  priceVnd: number;
  inStock: boolean;
};

function matchRank(name: string, term: string): number {
  const normalized = normalizeSearchTerm(name);

  if (normalized === term) {
    return 0;
  }

  if (normalized.startsWith(term)) {
    return 1;
  }

  if (normalized.split(" ").some((word) => word.startsWith(term))) {
    return 2;
  }

  return normalized.includes(term) ? 3 : 4;
}

/**
 * Orders suggestion candidates by how directly the product name matches the
 * term: exact name, name prefix, word prefix, name substring, then matches
 * found elsewhere in the search text. In-stock products win ties, then
 * alphabetical order keeps the list stable.
 */
export function rankSuggestions<T extends SuggestionCandidate>(
  candidates: T[],
  rawTerm: string,
): T[] {
  const term = normalizeSearchTerm(rawTerm);

  return candidates
    .map((candidate) => ({ candidate, rank: matchRank(candidate.name, term) }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      if (left.candidate.inStock !== right.candidate.inStock) {
        return left.candidate.inStock ? -1 : 1;
      }

      return left.candidate.name.localeCompare(right.candidate.name);
    })
    .map(({ candidate }) => candidate);
}
