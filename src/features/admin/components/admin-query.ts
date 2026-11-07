import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/server/commerce/types";

export const ADMIN_PRODUCT_PAGE_SIZE = 20;
export const ADMIN_ORDER_PAGE_SIZE = 20;

export type AdminProductStatusFilter = "all" | "active" | "hidden";
export type AdminStockFilter = "all" | "in" | "low" | "out";

/** Product list filters. They live in the URL so a filtered list can be shared. */
export type AdminProductQuery = {
  q?: string;
  category?: string;
  productType?: string;
  status: AdminProductStatusFilter;
  stock: AdminStockFilter;
  page: number;
};

export type AdminQueryParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | undefined {
  return value !== undefined && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function pageNumber(value: string | string[] | undefined): number {
  const raw = first(value);
  if (raw === undefined || !/^\d{1,5}$/.test(raw)) {
    return 1;
  }
  const page = Number(raw);
  return page >= 1 && page <= 10_000 ? page : 1;
}

/** Reads product filters from the URL, ignoring values that do not parse. */
export function parseAdminProductQuery(params: AdminQueryParams): AdminProductQuery {
  return {
    q: first(params.q),
    category: first(params.category),
    productType: first(params.type),
    status: oneOf(["all", "active", "hidden"] as const, first(params.status)) ?? "all",
    stock: oneOf(["all", "in", "low", "out"] as const, first(params.stock)) ?? "all",
    page: pageNumber(params.page),
  };
}

/** Locale-free product list URL, starting at page 1 for every non-page change. */
export function adminProductHref(
  query: AdminProductQuery,
  changes: Partial<AdminProductQuery> = {},
): string {
  const resetPage = Object.keys(changes).some((key) => key !== "page");
  const next: AdminProductQuery = {
    ...query,
    ...(resetPage ? { page: 1 } : {}),
    ...changes,
  };
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  };

  set("q", next.q);
  set("category", next.category);
  set("type", next.productType);
  if (next.status !== "all") set("status", next.status);
  if (next.stock !== "all") set("stock", next.stock);
  if (next.page > 1) set("page", String(next.page));

  const search = params.toString();
  return search ? `/admin/products?${search}` : "/admin/products";
}

/** Input for the admin `adminListProducts` service. */
export function toAdminListProductsInput(query: AdminProductQuery) {
  return {
    q: query.q,
    category: query.category,
    productType: query.productType,
    isActive: query.status === "all" ? undefined : query.status === "active",
    stockState: query.stock === "all" ? undefined : query.stock,
    page: query.page,
    pageSize: ADMIN_PRODUCT_PAGE_SIZE,
  };
}

/** Order list filters. Empty selections mean "any". */
export type AdminOrderQuery = {
  q?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  page: number;
};

/** Reads order filters from the URL, ignoring values that do not parse. */
export function parseAdminOrderQuery(params: AdminQueryParams): AdminOrderQuery {
  return {
    q: first(params.q),
    status: oneOf(ORDER_STATUSES, first(params.status)),
    paymentStatus: oneOf(PAYMENT_STATUSES, first(params.paymentStatus)),
    paymentMethod: oneOf(PAYMENT_METHODS, first(params.paymentMethod)),
    page: pageNumber(params.page),
  };
}

/** Locale-free order list URL, starting at page 1 for every non-page change. */
export function adminOrderHref(
  query: AdminOrderQuery,
  changes: Partial<AdminOrderQuery> = {},
): string {
  const resetPage = Object.keys(changes).some((key) => key !== "page");
  const next: AdminOrderQuery = {
    ...query,
    ...(resetPage ? { page: 1 } : {}),
    ...changes,
  };
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  };

  set("q", next.q);
  set("status", next.status);
  set("paymentStatus", next.paymentStatus);
  set("paymentMethod", next.paymentMethod);
  if (next.page > 1) set("page", String(next.page));

  const search = params.toString();
  return search ? `/admin/orders?${search}` : "/admin/orders";
}

/** Input for the admin `adminListOrders` service. */
export function toAdminListOrdersInput(query: AdminOrderQuery) {
  return {
    q: query.q,
    status: query.status,
    paymentStatus: query.paymentStatus,
    paymentMethod: query.paymentMethod,
    page: query.page,
    pageSize: ADMIN_ORDER_PAGE_SIZE,
  };
}

/** True when any order filter narrows the list. */
export function hasActiveOrderFilters(query: AdminOrderQuery): boolean {
  return Boolean(query.q || query.status || query.paymentStatus || query.paymentMethod);
}

/** True when any product filter narrows the list. */
export function hasActiveProductFilters(query: AdminProductQuery): boolean {
  return Boolean(
    query.q ||
    query.category ||
    query.productType ||
    query.status !== "all" ||
    query.stock !== "all",
  );
}
