/** Normalised catalog records shared by the export, seed, and tests. */

export type CatalogProduct = {
  sku: string;
  articleId: string | null;
  name: string;
  productType: string;
  category: string;
  gender: string;
  collection: string | null;
  color: string | null;
  colorFamily: string | null;
  pattern: string | null;
  material: string | null;
  fabricDesc: string | null;
  sleeve: string | null;
  neckline: string | null;
  fit: string | null;
  length: string | null;
  closure: string | null;
  lining: string | null;
  features: string[];
  season: string | null;
  brand: string | null;
  priceVnd: number;
  description: string;
  caption: string;
  isActive: boolean;
};

export type CatalogVariantGroup = {
  sku: string;
  stockQty: number;
  sizes: string[];
  stockBySize: Record<string, number>;
  variantSkuBySize: Record<string, string>;
  sizeGuideKeyBySize: Record<string, string | null>;
};

export type CatalogImage = {
  sku: string;
  position: number;
  path: string;
  driveFileId: string;
};

export type ViTranslations = {
  locale: string;
  sourceLocale: string;
  method: string;
  createdAt: string;
  source: string;
  notice: string;
  attributes: Record<string, Record<string, string>>;
  products: Record<string, { description: string; caption: string }>;
};

export type CatalogData = {
  products: CatalogProduct[];
  variants: CatalogVariantGroup[];
  images: CatalogImage[];
  translations: ViTranslations;
};

export type SizeGuideLabel = {
  group: string;
  sourceLabel: string;
  sizeGuideKey: string;
};

export type SizeGuideRow = {
  sizeGuideKey: string;
  label: string;
  [measurement: string]: string | number | number[];
};

export type SizeGuideTable = {
  group: string;
  garment: "tops" | "bottoms" | "full-body";
  measurements: string[];
  rows: SizeGuideRow[];
};

export type SizeGuide = {
  name: string;
  method: string;
  createdAt: string;
  unit: string;
  ageUnit: string;
  notice: string;
  labelMap: SizeGuideLabel[];
  tables: SizeGuideTable[];
};

export type SourceProduct = {
  sku: string;
  articleId: string;
  name: string;
  productType: string;
  category: string;
  gender: string;
  collection: string;
  color: string;
  colorFamily: string;
  pattern: string;
  material: string;
  fabricDesc: string;
  sleeve: string;
  neckline: string;
  fit: string;
  length: string;
  closure: string;
  lining: string;
  features: string[];
  season: string;
  brand: string;
  priceVnd: number;
  sizes: string[];
  stockQty: number;
  stockBySize: Record<string, number>;
  variantSkuBySize: Record<string, string>;
  stockStatus: string;
  description: string;
  caption: string;
  studioImageCount: number;
};

export type ImportAnomaly = {
  code: string;
  summary: string;
  count: number;
  items: unknown[];
};

export type ImportCheck = {
  name: string;
  expected: number;
  actual: number;
};

export type ImportReport = {
  snapshotDate: string;
  source: Record<string, string>;
  counts: Record<string, number>;
  checks: ImportCheck[];
  anomalies: ImportAnomaly[];
};

export type CatalogSummary = {
  products: number;
  variants: number;
  images: number;
  productTranslations: number;
  attributeTranslations: number;
  garmentVariants: number;
  accessoryVariants: number;
};

export type SourceFileInfo = {
  file: string;
  rows: number;
  bytes: number;
  sha256: string;
};
