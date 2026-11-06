import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", async () => {
  const { serviceClientState } = await import("./support/service-context");

  return {
    createSupabaseServerClient: async () => {
      if (!serviceClientState.current) {
        throw new Error("No service client selected for this test.");
      }

      return serviceClientState.current;
    },
  };
});

import {
  adminAdjustStock,
  adminDashboard,
  adminDeleteImage,
  adminGetOrder,
  adminGetProduct,
  adminListOrders,
  adminListProducts,
  adminReorderImages,
  adminSetProductActive,
  adminTransitionOrder,
  adminUploadImage,
  adminUpsertProduct,
} from "@/server/admin";
import { addToCart } from "@/server/cart";
import { getProductBySku, listProducts } from "@/server/catalog";
import { placeOrder } from "@/server/checkout";
import { imageUrl } from "@/server/media";

import { createCustomer, createAdmin, createServiceClient, type TestUser } from "./support/clients";
import {
  createServiceProduct,
  deleteServiceProducts,
  deleteTestUsers,
  uniqueToken,
  type ServiceProductFixture,
} from "./support/service-fixtures";
import { selectServiceClient } from "./support/service-context";

type StoreSettingsRow = {
  standard_shipping_fee_vnd: number;
  express_shipping_fee_vnd: number;
  free_shipping_threshold_vnd: number;
  payment_window_minutes: number;
};

const recipient = {
  recipientName: "Demo Customer",
  recipientPhone: "0900000000",
  shippingAddress: "1 Demo Street, District 1",
};

describe("admin service", () => {
  const service = createServiceClient();
  const token = uniqueToken("admin");
  let admin: TestUser;
  let customer: TestUser;
  let product: ServiceProductFixture;
  let originalSettings: StoreSettingsRow;
  let orderSequence = 0;

  function nextKey() {
    orderSequence += 1;
    return `admin-${token}-${orderSequence}`;
  }

  async function place(quantity: number, paymentMethod: "cod" | "bank_transfer") {
    selectServiceClient(customer.client);
    await addToCart({ variantId: product.variantIds[0], quantity });

    const result = await placeOrder({
      idempotencyKey: nextKey(),
      ...recipient,
      shippingMethod: "standard",
      paymentMethod,
    });

    if (!result.ok) {
      throw new Error(`Could not place the order: ${result.error.code}`);
    }

    return result.data;
  }

  beforeAll(async () => {
    admin = await createAdmin(service, "admin-service");
    customer = await createCustomer(service, "admin-customer");
    product = await createServiceProduct(service, {
      token,
      name: `Admin product ${token}`,
      priceVnd: 900_000,
      variants: [
        { label: "S", stock: 2, sizeGuideKey: "women-S" },
        { label: "M", stock: 10, sizeGuideKey: "women-M" },
      ],
      translations: [
        { locale: "en", description: `Admin product ${token} in English` },
        { locale: "vi", description: `Sản phẩm quản trị ${token}` },
      ],
      images: [{ position: 1 }, { position: 2 }, { position: 3 }],
    });

    const settings = await service.from("store_settings").select("*").eq("id", 1).single();

    if (settings.error || !settings.data) {
      throw settings.error ?? new Error("Missing store settings row.");
    }

    originalSettings = settings.data as StoreSettingsRow;
  });

  afterAll(async () => {
    const storage = service.storage.from("product-uploads");
    const listed = await storage.list(product.productId);

    if (!listed.error && listed.data.length > 0) {
      await storage.remove(listed.data.map((file) => `${product.productId}/${file.name}`));
    }

    await deleteServiceProducts(service, [product?.productId]);
    await deleteTestUsers(service, [admin?.id, customer?.id]);

    if (originalSettings) {
      await service.from("store_settings").update(originalSettings).eq("id", 1);
    }
  });

  it("rejects customer access to admin services", async () => {
    selectServiceClient(customer.client);

    const list = await adminListProducts({});
    const hide = await adminSetProductActive({ id: product.productId, isActive: false });
    const dashboard = await adminDashboard();

    expect(list).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
    expect(hide).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
    expect(dashboard).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("lists and searches products for administrators", async () => {
    selectServiceClient(admin.client);

    const result = await adminListProducts({ q: token });
    const inactive = await adminListProducts({ q: token, isActive: false });
    const inStock = await adminListProducts({ q: token, stockState: "in" });

    expect(result.ok).toBe(true);

    if (result.ok) {
      const item = result.data.items.find((candidate) => candidate.id === product.productId);

      expect(item?.isActive).toBe(true);
      expect(item?.totalStock).toBe(12);
      expect(item?.variantCount).toBe(2);
      expect(item?.image).not.toBeNull();
    }

    expect(inactive.ok && inactive.data.total).toBe(0);
    expect(inStock.ok && inStock.data.total).toBe(1);
  });

  it("returns translations and hidden images to the admin editor", async () => {
    await service
      .from("product_images")
      .update({ is_visible: false })
      .eq("id", product.imageIds[2]);

    selectServiceClient(admin.client);
    const adminDetail = await adminGetProduct({ id: product.productId });

    selectServiceClient(customer.client);
    const storefront = await getProductBySku({ locale: "en", sku: product.sku });

    expect(adminDetail.ok).toBe(true);

    if (adminDetail.ok) {
      expect(adminDetail.data.translations).toHaveLength(2);
      expect(
        adminDetail.data.translations.find((row) => row.locale === "vi")?.description,
      ).toContain("Sản phẩm quản trị");
      expect(adminDetail.data.images).toHaveLength(3);
      expect(adminDetail.data.images.filter((image) => !image.isVisible)).toHaveLength(1);
    }

    expect(storefront.ok).toBe(true);

    if (storefront.ok) {
      expect(storefront.data.images).toHaveLength(2);
    }

    await service.from("product_images").update({ is_visible: true }).eq("id", product.imageIds[2]);
  });

  it("creates, updates, and rejects duplicate products", async () => {
    selectServiceClient(admin.client);
    const sku = `ADMIN-${token}-NEW`;

    const created = await adminUpsertProduct({
      sku,
      name: `Created ${token}`,
      productType: "Bikini top",
      category: "Tops",
      gender: "Women",
      priceVnd: 250_000,
      description: "Created through the admin service",
      translations: [{ locale: "vi", description: "Tạo qua dịch vụ quản trị" }],
    });

    expect(created.ok).toBe(true);

    if (!created.ok) {
      return;
    }

    expect(created.data.sku).toBe(sku);
    expect(created.data.priceVnd).toBe(250_000);
    expect(created.data.translations.find((row) => row.locale === "vi")?.description).toBe(
      "Tạo qua dịch vụ quản trị",
    );

    const updated = await adminUpsertProduct({
      id: created.data.id,
      priceVnd: 260_000,
      name: `Created ${token} updated`,
    });

    expect(updated.ok && updated.data.priceVnd).toBe(260_000);
    expect(updated.ok && updated.data.name).toBe(`Created ${token} updated`);

    const duplicate = await adminUpsertProduct({
      sku,
      name: "Duplicate",
      productType: "Bikini top",
      category: "Tops",
      gender: "Women",
      priceVnd: 100_000,
    });

    expect(duplicate.ok).toBe(false);

    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe("CONFLICT");
    }

    await deleteServiceProducts(service, [created.data.id]);
  });

  it("hides a product from the storefront and lists it for administrators", async () => {
    selectServiceClient(admin.client);
    const hidden = await adminSetProductActive({ id: product.productId, isActive: false });

    expect(hidden.ok).toBe(true);

    if (hidden.ok) {
      expect(hidden.data.isActive).toBe(false);
    }

    selectServiceClient(customer.client);
    const storefront = await listProducts({ q: token });

    selectServiceClient(admin.client);
    const adminList = await adminListProducts({ q: token, isActive: false });

    expect(storefront.ok && storefront.data.total).toBe(0);
    expect(adminList.ok && adminList.data.total).toBe(1);

    await adminSetProductActive({ id: product.productId, isActive: true });
  });

  it("adjusts stock through the audited function", async () => {
    selectServiceClient(admin.client);

    const added = await adminAdjustStock({
      variantId: product.variantIds[0],
      delta: 5,
      reason: "Delivered stock",
    });

    expect(added.ok && added.data.stock).toBe(7);

    const counted = await adminAdjustStock({
      variantId: product.variantIds[0],
      stock: 3,
      reason: "Stock count",
    });

    expect(counted.ok && counted.data.stock).toBe(3);

    const negative = await adminAdjustStock({
      variantId: product.variantIds[0],
      delta: -100,
      reason: "Too many",
    });

    expect(negative.ok).toBe(false);

    if (!negative.ok) {
      expect(negative.error.code).toBe("VALIDATION_ERROR");
    }

    const adjustments = await service
      .from("stock_adjustments")
      .select("id")
      .eq("variant_id", product.variantIds[0]);

    expect(adjustments.data?.length).toBeGreaterThanOrEqual(2);

    selectServiceClient(customer.client);
    const forbidden = await adminAdjustStock({
      variantId: product.variantIds[0],
      delta: 1,
      reason: "Not allowed",
    });

    expect(forbidden).toEqual({ ok: false, error: { code: "FORBIDDEN" } });

    selectServiceClient(admin.client);
    await adminAdjustStock({
      variantId: product.variantIds[0],
      stock: 2,
      reason: "Reset for dashboard",
    });
  });

  it("uploads, reorders, and deletes images", async () => {
    selectServiceClient(admin.client);

    const file = new File([new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0])], "upload.webp", {
      type: "image/webp",
    });
    const uploaded = await adminUploadImage({ productId: product.productId, file });

    expect(uploaded.ok).toBe(true);

    if (!uploaded.ok) {
      return;
    }

    expect(uploaded.data.source).toBe("upload");
    expect(uploaded.data.path.startsWith(product.productId)).toBe(true);
    expect(imageUrl({ source: uploaded.data.source, path: uploaded.data.path }, 480)).toContain(
      "/storage/v1/object/public/product-uploads/",
    );

    const stored = await service.storage.from("product-uploads").list(product.productId);
    expect(stored.data?.some((entry) => uploaded.data.path.endsWith(entry.name))).toBe(true);

    const reordered = await adminReorderImages({
      productId: product.productId,
      imageIds: [uploaded.data.id, ...product.imageIds],
    });

    expect(reordered.ok).toBe(true);

    if (reordered.ok) {
      expect(reordered.data.map((image) => image.id)).toEqual([
        uploaded.data.id,
        ...product.imageIds,
      ]);
      expect(reordered.data.map((image) => image.position)).toEqual([0, 1, 2, 3]);
    }

    const deleted = await adminDeleteImage({ imageId: uploaded.data.id });

    expect(deleted).toEqual({
      ok: true,
      data: { id: uploaded.data.id, source: "upload", deleted: true, isVisible: false },
    });

    const afterDelete = await service.storage.from("product-uploads").list(product.productId);
    expect(afterDelete.data?.some((entry) => uploaded.data.path.endsWith(entry.name))).toBe(false);

    const hiddenRelease = await adminDeleteImage({ imageId: product.imageIds[0] });

    expect(hiddenRelease).toEqual({
      ok: true,
      data: { id: product.imageIds[0], source: "release", deleted: false, isVisible: false },
    });

    const stillThere = await service
      .from("product_images")
      .select("id, is_visible")
      .eq("id", product.imageIds[0])
      .single();

    expect(stillThere.data).toEqual({ id: product.imageIds[0], is_visible: false });

    await service
      .from("product_images")
      .update({ is_visible: true, position: 0 })
      .eq("id", product.imageIds[0]);
  });

  it("lists orders, returns details, and applies valid transitions", async () => {
    const order = await place(1, "cod");

    selectServiceClient(admin.client);
    const list = await adminListOrders({ q: recipient.recipientName });
    const detail = await adminGetOrder({ id: order.id });

    expect(list.ok && list.data.items.some((item) => item.id === order.id)).toBe(true);
    expect(detail.ok).toBe(true);

    if (detail.ok) {
      expect(detail.data.customer?.fullName).toBe("Test admin-customer");
      expect(detail.data.items).toHaveLength(1);
    }

    const confirmed = await adminTransitionOrder({ orderId: order.id, action: "confirm" });
    const shipped = await adminTransitionOrder({ orderId: order.id, action: "ship" });
    const delivered = await adminTransitionOrder({ orderId: order.id, action: "deliver" });

    expect(confirmed.ok && confirmed.data.status).toBe("confirmed");
    expect(shipped.ok && shipped.data.status).toBe("shipping");
    expect(delivered.ok && delivered.data.status).toBe("delivered");
    expect(delivered.ok && delivered.data.paymentStatus).toBe("paid");

    const conflict = await adminTransitionOrder({ orderId: order.id, action: "confirm" });

    expect(conflict.ok).toBe(false);

    if (!conflict.ok) {
      expect(conflict.error.code).toBe("ORDER_STATE_CONFLICT");
    }
  });

  it("blocks confirming an unpaid bank transfer and allows cancelling it", async () => {
    const order = await place(1, "bank_transfer");

    selectServiceClient(admin.client);
    const blocked = await adminTransitionOrder({ orderId: order.id, action: "confirm" });

    expect(blocked.ok).toBe(false);

    if (!blocked.ok) {
      expect(blocked.error.code).toBe("PAYMENT_NOT_ALLOWED");
    }

    const cancelled = await adminTransitionOrder({ orderId: order.id, action: "cancel" });

    expect(cancelled.ok && cancelled.data.status).toBe("cancelled");
  });

  it("builds the demo dashboard from real orders", async () => {
    selectServiceClient(admin.client);
    const result = await adminDashboard();

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.demoData).toBe(true);
      expect(result.data.revenueVnd).toBeGreaterThanOrEqual(900_000);
      expect(result.data.ordersByStatus.delivered).toBeGreaterThanOrEqual(1);
      expect(result.data.topProducts.some((item) => item.sku === product.sku)).toBe(true);
      expect(
        result.data.lowStockVariants.some((item) => item.variantId === product.variantIds[0]),
      ).toBe(true);
      expect(result.data.lowStockThreshold).toBe(5);
    }
  });
});
