import type { Locale } from "@/lib/locale";
import { SHOP_CATEGORIES, type ShopCategory } from "@/lib/site";

export const SHOP_SORTS = ["newest", "price-asc", "price-desc", "name-asc"] as const;

export type ShopSort = (typeof SHOP_SORTS)[number];

export const SHOP_PAGE_SIZE = 24;

/**
 * Filter state of the shop listing. It lives entirely in the URL so a
 * filtered listing can be shared, bookmarked, and opened in either language.
 */
export type ShopQuery = {
  q?: string;
  group?: ShopCategory;
  category?: string;
  gender?: string;
  type?: string;
  material?: string;
  size?: string;
  features: string[];
  priceMin?: number;
  priceMax?: number;
  inStock: boolean;
  sort: ShopSort;
  page: number;
};

export type ShopSearchParams = Record<string, string | string[] | undefined>;

/** Catalog filters behind each header category. Kids covers every child size range. */
const GROUP_FILTERS: Record<ShopCategory, { gender?: string | string[]; category?: string }> = {
  women: { gender: "Women" },
  men: { gender: "Men" },
  kids: { gender: ["Kids", "Baby", "Teen"] },
  accessories: { category: "Accessories" },
};

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

function all(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function amount(value: string | string[] | undefined): number | undefined {
  const raw = first(value);
  if (raw === undefined || !/^\d{1,10}$/.test(raw)) {
    return undefined;
  }
  const parsed = Number(raw);
  return parsed <= 2_147_483_647 ? parsed : undefined;
}

/** Reads the shop filters from the URL, ignoring values that do not parse. */
export function parseShopQuery(params: ShopSearchParams): ShopQuery {
  const group = first(params.group);
  const sort = first(params.sort);
  const page = amount(params.page);
  let priceMin = amount(params.min);
  let priceMax = amount(params.max);

  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
    [priceMin, priceMax] = [priceMax, priceMin];
  }

  return {
    q: first(params.q),
    group: (SHOP_CATEGORIES as readonly string[]).includes(group ?? "")
      ? (group as ShopCategory)
      : undefined,
    category: first(params.category),
    gender: first(params.gender),
    type: first(params.type),
    material: first(params.material),
    size: first(params.size),
    features: all(params.feature),
    priceMin,
    priceMax,
    inStock: first(params.inStock) === "1",
    sort: (SHOP_SORTS as readonly string[]).includes(sort ?? "") ? (sort as ShopSort) : "newest",
    page: page && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** Serializes the filters, leaving out defaults so URLs stay short. */
export function shopSearchParams(query: ShopQuery): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  };

  set("q", query.q);
  set("group", query.group);
  set("category", query.category);
  set("gender", query.gender);
  set("type", query.type);
  set("material", query.material);
  set("size", query.size);
  for (const feature of query.features) {
    params.append("feature", feature);
  }
  set("min", query.priceMin);
  set("max", query.priceMax);
  if (query.inStock) {
    params.set("inStock", "1");
  }
  if (query.sort !== "newest") {
    params.set("sort", query.sort);
  }
  if (query.page > 1) {
    params.set("page", String(query.page));
  }

  return params;
}

/**
 * Locale-free href of the listing with some filters changed. Any change other
 * than the page number starts again from page 1.
 */
export function shopHref(query: ShopQuery, changes: Partial<ShopQuery> = {}): string {
  const next: ShopQuery = { ...query, page: 1, ...changes };
  const search = shopSearchParams(next).toString();
  return search ? `/shop?${search}` : "/shop";
}

/** True when any filter or search narrows the listing. */
export function hasActiveFilters(query: ShopQuery): boolean {
  return Boolean(
    query.q ||
    query.group ||
    query.category ||
    query.gender ||
    query.type ||
    query.material ||
    query.size ||
    query.features.length > 0 ||
    query.priceMin !== undefined ||
    query.priceMax !== undefined ||
    query.inStock,
  );
}

/** Input for the catalog `listProducts` service. */
export function toListProductsInput(query: ShopQuery, locale: Locale) {
  const groupFilter = query.group ? GROUP_FILTERS[query.group] : {};

  return {
    locale,
    q: query.q,
    category: query.category ?? groupFilter.category,
    gender: query.gender ?? groupFilter.gender,
    productType: query.type,
    material: query.material,
    size: query.size,
    features: query.features.length > 0 ? query.features : undefined,
    priceMin: query.priceMin,
    priceMax: query.priceMax,
    inStock: query.inStock ? true : undefined,
    sort: query.sort,
    page: query.page,
    pageSize: SHOP_PAGE_SIZE,
  };
}
