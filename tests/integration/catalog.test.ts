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

import { getProductBySku, getSizeGuide, getStoreSettings, listProducts } from "@/server/catalog";
import { imageUrl } from "@/server/media";
import { getStoreSettings as getUiStoreSettings } from "@/lib/store-settings";

import { createAdmin, createCustomer, createServiceClient, type TestUser } from "./support/clients";
import {
  createAttributeTranslation,
  createServiceProduct,
  deleteAttributeTranslation,
  deleteServiceProducts,
  deleteTestUsers,
  uniqueToken,
  type ServiceProductFixture,
} from "./support/service-fixtures";
import { integrationEnv } from "./support/env";
import { selectServiceClient } from "./support/service-context";

type StoreSettingsRow = {
  standard_shipping_fee_vnd: number;
  express_shipping_fee_vnd: number;
  free_shipping_threshold_vnd: number;
  payment_window_minutes: number;
};

describe("catalog service", () => {
  const service = createServiceClient();
  const token = uniqueToken("catalog");
  const categoryA = `SvcTops-${token}`;
  const categoryB = `SvcBottoms-${token}`;
  const categoryC = `SvcFull-${token}`;
  const materialA = `SvcNylon-${token}`;
  const materialB = `SvcPolyester-${token}`;
  const featureA = `SvcStretch-${token}`;
  const featureB = `SvcQuickDry-${token}`;

  let customer: TestUser;
  let admin: TestUser;
  let productA: ServiceProductFixture;
  let productB: ServiceProductFixture;
  let productC: ServiceProductFixture;
  let originalSettings: StoreSettingsRow;

  beforeAll(async () => {
    customer = await createCustomer(service, "catalog-customer");
    admin = await createAdmin(service, "catalog-admin");

    const settings = await service.from("store_settings").select("*").eq("id", 1).single();

    if (settings.error || !settings.data) {
      throw settings.error ?? new Error("Missing store settings row.");
    }

    originalSettings = settings.data as StoreSettingsRow;

    productA = await createServiceProduct(service, {
      token,
      name: `Sunrise Bikini ${token}`,
      productType: "Bikini top",
      category: categoryA,
      gender: "Women",
      material: materialA,
      priceVnd: 350_000,
      features: [featureA, featureB],
      description: `Red bikini top ${token}`,
      variants: [
        { label: "S", stock: 3, sizeGuideKey: "women-S" },
        { label: "M", stock: 0, sizeGuideKey: "women-M" },
      ],
      translations: [
        { locale: "vi", description: `Áo bikini ${token} màu đỏ`, caption: `Áo bikini ${token}` },
        { locale: "en", description: `Red bikini top ${token}` },
      ],
      images: [{ position: 1 }, { position: 2 }],
    });

    productB = await createServiceProduct(service, {
      token,
      name: `Ocean Boardshorts ${token}`,
      productType: "Board shorts",
      category: categoryB,
      gender: "Men",
      material: materialB,
      priceVnd: 450_000,
      features: [featureB],
      variants: [{ label: "M", stock: 5, sizeGuideKey: "men-M" }],
      translations: [{ locale: "vi", description: `Quần short bơi ${token}` }],
      images: [{ position: 1 }],
    });

    productC = await createServiceProduct(service, {
      token,
      name: `Hidden Suit ${token}`,
      productType: "Swimsuit",
      category: categoryC,
      gender: "Women",
      priceVnd: 500_000,
      isActive: false,
      variants: [{ label: "S", stock: 1, sizeGuideKey: "women-S" }],
      images: [{ position: 1 }],
    });

    for (const [attribute, value, label] of [
      ["category", categoryA, "Áo bơi thử"],
      ["category", categoryB, "Quần bơi thử"],
      ["category", categoryC, "Đồ bơi thử"],
      ["material", materialA, "Nylon thử"],
      ["material", materialB, "Polyester thử"],
      ["features", featureA, "Co giãn thử"],
      ["features", featureB, "Nhanh khô thử"],
    ] as const) {
      await createAttributeTranslation(service, { attribute, value, locale: "vi", label });
    }
  });

  afterAll(async () => {
    await deleteServiceProducts(service, [
      productA?.productId,
      productB?.productId,
      productC?.productId,
    ]);
    await deleteTestUsers(service, [customer?.id, admin?.id]);
    await deleteAttributeTranslation(service, {
      attribute: "category",
      value: categoryA,
      locale: "vi",
    });
    await deleteAttributeTranslation(service, {
      attribute: "category",
      value: categoryB,
      locale: "vi",
    });
    await deleteAttributeTranslation(service, {
      attribute: "category",
      value: categoryC,
      locale: "vi",
    });
    await deleteAttributeTranslation(service, {
      attribute: "material",
      value: materialA,
      locale: "vi",
    });
    await deleteAttributeTranslation(service, {
      attribute: "material",
      value: materialB,
      locale: "vi",
    });
    await deleteAttributeTranslation(service, {
      attribute: "features",
      value: featureA,
      locale: "vi",
    });
    await deleteAttributeTranslation(service, {
      attribute: "features",
      value: featureB,
      locale: "vi",
    });

    if (originalSettings) {
      await service.from("store_settings").update(originalSettings).eq("id", 1);
    }
  });

  it("lists only active products and counts them", async () => {
    selectServiceClient(customer.client);

    const result = await listProducts({ locale: "en", q: token });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.total).toBe(2);
      expect(result.data.items.map((item) => item.sku).sort()).toEqual(
        [productA.sku, productB.sku].sort(),
      );
      expect(result.data.items.some((item) => item.sku === productC.sku)).toBe(false);
    }
  });

  it("searches Vietnamese descriptions without diacritics", async () => {
    selectServiceClient(customer.client);

    const result = await listProducts({
      locale: "vi",
      q: "ao bikini",
      category: categoryA,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.total).toBe(1);
      expect(result.data.items[0]?.sku).toBe(productA.sku);
    }
  });

  it("applies catalog filters", async () => {
    selectServiceClient(customer.client);

    const byGender = await listProducts({ q: token, gender: "Men" });
    const byGenders = await listProducts({ q: token, gender: ["Men", "Women"] });
    const byPrice = await listProducts({ q: token, priceMin: 400_000, priceMax: 460_000 });
    const byMaterial = await listProducts({ q: token, material: materialB });
    const byFeature = await listProducts({ q: token, features: [featureB] });
    const bySize = await listProducts({ q: token, size: "M" });
    const inStock = await listProducts({ q: token, inStock: true });
    const outOfStock = await listProducts({ q: token, inStock: false });

    expect(byGender.ok && byGender.data.items.map((item) => item.sku)).toEqual([productB.sku]);
    expect(byGenders.ok && byGenders.data.total).toBe(2);
    expect(byPrice.ok && byPrice.data.items.map((item) => item.sku)).toEqual([productB.sku]);
    expect(byMaterial.ok && byMaterial.data.items.map((item) => item.sku)).toEqual([productB.sku]);
    expect(byFeature.ok && byFeature.data.total).toBe(2);
    expect(bySize.ok && bySize.data.items.map((item) => item.sku)).toEqual([productB.sku]);
    expect(inStock.ok && inStock.data.total).toBe(2);
    expect(outOfStock.ok && outOfStock.data.total).toBe(0);
  });

  it("sorts and paginates", async () => {
    selectServiceClient(customer.client);

    const sorted = await listProducts({ q: token, sort: "price-asc" });
    const page = await listProducts({ q: token, page: 1, pageSize: 1 });

    expect(sorted.ok && sorted.data.items.map((item) => item.sku)).toEqual([
      productA.sku,
      productB.sku,
    ]);
    expect(page.ok && page.data.items).toHaveLength(1);
    expect(page.ok && page.data.total).toBe(2);
    expect(page.ok && page.data.pageCount).toBe(2);
  });

  it("returns localized facets", async () => {
    selectServiceClient(customer.client);

    const result = await listProducts({ locale: "vi", q: token });

    expect(result.ok).toBe(true);

    if (result.ok) {
      const category = result.data.facets.categories.find((facet) => facet.value === categoryA);

      expect(category).toEqual({ value: categoryA, label: "Áo bơi thử", count: 1 });
      expect(result.data.facets.sizes.map((facet) => facet.value).sort()).toEqual(["M", "S"]);
      expect(result.data.facets.price).toEqual({ minVnd: 350_000, maxVnd: 450_000 });
    }
  });

  it("returns product details with translated attributes, variants, images, and size guide", async () => {
    selectServiceClient(customer.client);

    const english = await getProductBySku({ locale: "en", sku: productA.sku });
    const vietnamese = await getProductBySku({ locale: "vi", sku: productA.sku });

    expect(english.ok).toBe(true);
    expect(vietnamese.ok).toBe(true);

    if (english.ok && vietnamese.ok) {
      expect(english.data.name).toBe(`Sunrise Bikini ${token}`);
      expect(english.data.images).toHaveLength(2);
      expect(english.data.variants.map((variant) => variant.optionLabel)).toEqual(["S", "M"]);
      expect(english.data.variants.find((variant) => variant.optionLabel === "M")?.stock).toBe(0);
      expect(english.data.sizeGuide?.group).toBe("women");
      expect(english.data.sizeGuide?.garment).toBe("tops");
      expect(english.data.attributes.find((attribute) => attribute.key === "material")).toEqual({
        key: "material",
        value: materialA,
        valueLabel: materialA,
      });

      expect(vietnamese.data.description).toContain("Áo bikini");
      expect(
        vietnamese.data.attributes.find((attribute) => attribute.key === "category")?.valueLabel,
      ).toBe("Áo bơi thử");
    }
  });

  it("hides inactive products from customers and shows them to administrators", async () => {
    selectServiceClient(customer.client);
    const hidden = await getProductBySku({ locale: "en", sku: productC.sku });

    selectServiceClient(admin.client);
    const visible = await getProductBySku({ locale: "en", sku: productC.sku });

    expect(hidden).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
    expect(visible.ok).toBe(true);

    if (visible.ok) {
      expect(visible.data.isActive).toBe(false);
    }
  });

  it("returns a size guide by key and garment", async () => {
    const result = await getSizeGuide({ locale: "en", key: "women-M", garment: "tops" });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.highlightKey).toBe("women-M");
      expect(result.data.rows.some((row) => row.sizeGuideKey === "women-M")).toBe(true);
    }
  });

  it("reads store settings from the database and through the UI helper", async () => {
    await service
      .from("store_settings")
      .update({
        standard_shipping_fee_vnd: 31_000,
        express_shipping_fee_vnd: 51_000,
        free_shipping_threshold_vnd: 510_000,
        payment_window_minutes: 31,
      })
      .eq("id", 1);

    selectServiceClient(customer.client);
    const serviceResult = await getStoreSettings();
    const uiResult = await getUiStoreSettings();

    expect(serviceResult).toEqual({
      ok: true,
      data: {
        standardShippingFeeVnd: 31_000,
        expressShippingFeeVnd: 51_000,
        freeStandardShippingThresholdVnd: 510_000,
        paymentWindowMinutes: 31,
      },
    });
    expect(uiResult).toEqual({
      standardShippingFeeVnd: 31_000,
      expressShippingFeeVnd: 51_000,
      freeStandardShippingThresholdVnd: 510_000,
      paymentWindowMinutes: 31,
    });

    await service.from("store_settings").update(originalSettings).eq("id", 1);
  });

  it("builds release and upload image URLs", () => {
    expect(imageUrl({ source: "release", path: `studio/${productA.sku}/01` }, 480)).toBe(
      `https://media.example.test/studio-v1/studio/${productA.sku}/01-480.webp`,
    );
    expect(imageUrl({ source: "upload", path: "product/image.webp" }, 960)).toBe(
      `${integrationEnv.url}/storage/v1/object/public/product-uploads/product/image.webp`,
    );
  });
});
