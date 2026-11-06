import "server-only";

import { cache } from "react";

import type { Locale } from "@/lib/locale";
import { getProductBySku } from "@/server/catalog";

/**
 * Product lookup shared by `generateMetadata` and the page in one request, so
 * the catalog is queried once.
 */
export const loadProduct = cache((locale: Locale, sku: string) => getProductBySku({ locale, sku }));
