import type { ProductImage } from "@/server/catalog/types";

/** A cart line problem the UI must show next to the line. */
export type CartIssueCode = "PRODUCT_UNAVAILABLE" | "OUT_OF_STOCK";

export type CartIssue = {
  variantId: string;
  code: CartIssueCode;
  /** Present for `OUT_OF_STOCK`: the quantity that can still be bought. */
  availableStock?: number;
};

export type CartLine = {
  variantId: string;
  quantity: number;
  productId: string | null;
  sku: string | null;
  productName: string | null;
  variantSku: string | null;
  optionLabel: string | null;
  sizeGuideKey: string | null;
  unitPriceVnd: number | null;
  lineTotalVnd: number;
  stock: number | null;
  image: ProductImage | null;
  issues: CartIssueCode[];
};

export type Cart = {
  items: CartLine[];
  issues: CartIssue[];
  itemCount: number;
  subtotalVnd: number;
};
