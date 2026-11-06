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

import { getProductBySku } from "@/server/catalog";

import { createCustomer, createServiceClient, type TestUser } from "./support/clients";
import {
  createServiceProduct,
  deleteServiceProducts,
  deleteTestUsers,
  uniqueToken,
  type ServiceProductFixture,
} from "./support/service-fixtures";
import { selectServiceClient } from "./support/service-context";

describe("catalog locale fallback", () => {
  const service = createServiceClient();
  const token = uniqueToken("fallback");
  let customer: TestUser;
  let withBase: ServiceProductFixture;
  let withoutBase: ServiceProductFixture;

  beforeAll(async () => {
    customer = await createCustomer(service, "fallback-customer");

    withBase = await createServiceProduct(service, {
      token,
      name: `Fallback with base ${token}`,
      description: "Base copy",
      caption: "Base caption",
      variants: [{ label: "S", stock: 1 }],
      translations: [
        { locale: "en", description: "English translation", caption: "English caption" },
      ],
      images: [],
    });

    withoutBase = await createServiceProduct(service, {
      token,
      name: `Fallback without base ${token}`,
      description: null,
      variants: [{ label: "S", stock: 1 }],
      translations: [{ locale: "en", description: "English only" }],
      images: [],
    });
  });

  afterAll(async () => {
    await deleteServiceProducts(service, [withBase?.productId, withoutBase?.productId]);
    await deleteTestUsers(service, [customer?.id]);
  });

  it("falls back to the English translation before the base copy", async () => {
    selectServiceClient(customer.client);

    const result = await getProductBySku({ locale: "vi", sku: withBase.sku });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.description).toBe("English translation");
      expect(result.data.caption).toBe("English caption");
    }
  });

  it("uses the English translation when the base copy is null", async () => {
    selectServiceClient(customer.client);

    const result = await getProductBySku({ locale: "vi", sku: withoutBase.sku });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.description).toBe("English only");
    }
  });
});
