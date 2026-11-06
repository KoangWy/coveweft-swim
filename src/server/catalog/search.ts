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
