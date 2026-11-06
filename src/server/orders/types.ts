import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShippingMethod,
} from "@/server/commerce/types";

export type OrderItem = {
  id: string;
  variantId: string | null;
  productId: string | null;
  sku: string;
  variantSku: string;
  productName: string;
  optionLabel: string;
  unitPriceVnd: number;
  quantity: number;
  lineTotalVnd: number;
};

export type PaymentAttempt = {
  id: string;
  outcome: "succeeded" | "failed";
  createdAt: string;
};

export type OrderEvent = {
  id: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  fromPaymentStatus: PaymentStatus | null;
  toPaymentStatus: PaymentStatus;
  actorRole: "customer" | "admin" | "system";
  reason: string | null;
  createdAt: string;
};

export type OrderSummary = {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  shippingMethod: ShippingMethod;
  shippingFeeVnd: number;
  itemsSubtotalVnd: number;
  totalVnd: number;
  paymentDueAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  items: OrderItem[];
};

export type OrderDetail = OrderSummary & {
  cancelledBy: string | null;
  paymentAttempts: PaymentAttempt[];
  events: OrderEvent[];
};

export type CustomerSummary = {
  id: string;
  fullName: string | null;
  phone: string | null;
  defaultAddress: string | null;
};

export type AdminOrderSummary = OrderSummary & {
  customer: CustomerSummary | null;
};

export type AdminOrderDetail = OrderDetail & {
  customer: CustomerSummary | null;
};

export type OrderList = {
  items: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type AdminOrderList = {
  items: AdminOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
