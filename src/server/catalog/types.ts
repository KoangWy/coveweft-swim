/**
 * Public catalog types returned by the catalog service. Amounts are integer
 * VND. Localized copy falls back to English when a translation is missing.
 */

export type StoreSettings = {
  standardShippingFeeVnd: number;
  expressShippingFeeVnd: number;
  /** Item subtotal (before shipping) at which Standard shipping becomes free. */
  freeStandardShippingThresholdVnd: number;
  /** Minutes a simulated bank transfer order stays payable after it is placed. */
  paymentWindowMinutes: number;
};

export type ProductImage = {
  id: string;
  kind: "studio" | "community";
  source: "release" | "upload";
  path: string;
  position: number;
  isVisible: boolean;
};

export type ProductVariant = {
  id: string;
  variantSku: string;
  optionLabel: string;
  sizeGuideKey: string | null;
  stock: number;
  position: number;
  inStock: boolean;
};

export type ProductAttribute = {
  /** Stable attribute key such as `material` or `features`. */
  key: string;
  /** Source value kept verbatim. */
  value: string;
  /** Localized label for the value, or the source value when none exists. */
  valueLabel: string;
};

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  priceVnd: number;
  category: string;
  gender: string;
  productType: string;
  material: string | null;
  color: string | null;
  features: string[];
  inStock: boolean;
  description: string | null;
  caption: string | null;
  images: ProductImage[];
};

export type ProductDetail = ProductListItem & {
  articleId: string | null;
  collection: string | null;
  colorFamily: string | null;
  pattern: string | null;
  fabricDesc: string | null;
  sleeve: string | null;
  neckline: string | null;
  fit: string | null;
  length: string | null;
  closure: string | null;
  lining: string | null;
  season: string | null;
  brand: string | null;
  isActive: boolean;
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  sizeGuide: SizeGuide | null;
};

export type ProductFacetValue = {
  value: string;
  label: string;
  count: number;
};

export type ProductFacets = {
  categories: ProductFacetValue[];
  genders: ProductFacetValue[];
  productTypes: ProductFacetValue[];
  materials: ProductFacetValue[];
  features: ProductFacetValue[];
  sizes: ProductFacetValue[];
  price: { minVnd: number; maxVnd: number };
};

export type ProductList = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: ProductFacets;
};

export type ProductSort = "newest" | "price-asc" | "price-desc" | "name-asc";

export type ProductSuggestion = {
  id: string;
  sku: string;
  name: string;
  priceVnd: number;
  inStock: boolean;
  /** Public URL of the thumbnail, or null when media is not configured. */
  imageUrl: string | null;
};

export type ProductSuggestionList = {
  items: ProductSuggestion[];
  total: number;
};

export type SizeGuideGarment = "tops" | "bottoms" | "full-body";

export type SizeGuideRow = {
  sizeGuideKey: string;
  label: string;
  /** Half-open measurement ranges in the unit declared by the guide. */
  ranges: Record<string, [number, number]>;
};

export type SizeGuide = {
  group: string;
  garment: SizeGuideGarment;
  unit: "cm";
  ageUnit: "months";
  notice: string;
  measurements: string[];
  rows: SizeGuideRow[];
  /** Size key to highlight, when the query asked for a specific size. */
  highlightKey: string | null;
};
