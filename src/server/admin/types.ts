import type { Locale } from "@/lib/locale";
import type { ProductDetail, ProductImage } from "@/server/catalog/types";
import type { OrderStatus, PaymentStatus } from "@/server/commerce/types";

export type AdminProductListItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  gender: string;
  productType: string;
  priceVnd: number;
  isActive: boolean;
  totalStock: number;
  variantCount: number;
  updatedAt: string;
  image: ProductImage | null;
};

export type AdminProductTranslation = {
  locale: Locale;
  description: string | null;
  caption: string | null;
};

export type AdminProductDetail = ProductDetail & {
  translations: AdminProductTranslation[];
};

export type AdminProductList = {
  items: AdminProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type AdminStockAdjustment = {
  variantId: string;
  variantSku: string;
  productId: string;
  stock: number;
};

export type AdminImageDeleteResult = {
  id: string;
  source: "release" | "upload";
  deleted: boolean;
  isVisible: boolean;
};

export type AdminDashboardTopProduct = {
  productId: string | null;
  sku: string;
  name: string;
  quantity: number;
  revenueVnd: number;
};

export type AdminDashboardLowStockVariant = {
  variantId: string;
  variantSku: string;
  productName: string;
  productSku: string;
  optionLabel: string;
  stock: number;
};

export type AdminDashboard = {
  /** The UI labels the dashboard as demo data; the flag travels with it. */
  demoData: true;
  revenueVnd: number;
  orderCount: number;
  ordersByStatus: Record<OrderStatus, number>;
  ordersByPaymentStatus: Record<PaymentStatus, number>;
  topProducts: AdminDashboardTopProduct[];
  lowStockVariants: AdminDashboardLowStockVariant[];
  lowStockThreshold: number;
};
