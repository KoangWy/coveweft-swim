import type { SupabaseClient } from "@supabase/supabase-js";

import { requireData } from "./fixtures";

export type ServiceVariantOption = {
  label: string;
  stock: number;
  sizeGuideKey?: string | null;
};

export type ServiceProductOptions = {
  token?: string;
  sku?: string;
  name?: string;
  productType?: string;
  category?: string;
  gender?: string;
  material?: string | null;
  priceVnd?: number;
  isActive?: boolean;
  description?: string | null;
  caption?: string | null;
  features?: string[];
  variants?: ServiceVariantOption[];
  translations?: Array<{
    locale: "en" | "vi";
    description?: string | null;
    caption?: string | null;
  }>;
  images?: Array<{ position: number; path?: string; source?: "release" | "upload" }>;
};

export type ServiceProductFixture = {
  productId: string;
  sku: string;
  variantIds: string[];
  imageIds: string[];
};

let sequence = 0;

export function uniqueToken(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${sequence}`;
}

export async function createServiceProduct(
  service: SupabaseClient,
  options: ServiceProductOptions = {},
): Promise<ServiceProductFixture> {
  const token = options.token ?? uniqueToken("svc");
  sequence += 1;
  const sku = options.sku ?? `SVC-${token}-${sequence}`;
  const variants = options.variants ?? [{ label: "S", stock: 5 }];

  const product = requireData<{ id: string }>(
    await service
      .from("products")
      .insert({
        sku,
        name: options.name ?? `Service product ${token}`,
        product_type: options.productType ?? "Bikini top",
        category: options.category ?? "Tops",
        gender: options.gender ?? "Women",
        material: options.material ?? null,
        price_vnd: options.priceVnd ?? 200_000,
        is_active: options.isActive ?? true,
        description: options.description ?? null,
        caption: options.caption ?? null,
        features: options.features ?? [],
      })
      .select("id")
      .single(),
  );

  const variantIds: string[] = [];

  for (const [index, variant] of variants.entries()) {
    const inserted = requireData<{ id: string }>(
      await service
        .from("product_variants")
        .insert({
          product_id: product.id,
          variant_sku: `${sku}-${variant.label}`,
          option_label: variant.label,
          size_guide_key: variant.sizeGuideKey ?? null,
          stock: variant.stock,
          position: index,
        })
        .select("id")
        .single(),
    );

    variantIds.push(inserted.id);
  }

  if (options.translations && options.translations.length > 0) {
    const result = await service.from("product_translations").insert(
      options.translations.map((translation) => ({
        product_id: product.id,
        locale: translation.locale,
        description: translation.description ?? null,
        caption: translation.caption ?? null,
      })),
    );

    if (result.error) {
      throw result.error;
    }
  }

  const imageIds: string[] = [];
  const images = options.images ?? [{ position: 1 }, { position: 2 }];

  for (const image of images) {
    const inserted = requireData<{ id: string }>(
      await service
        .from("product_images")
        .insert({
          product_id: product.id,
          kind: "studio",
          source: image.source ?? "release",
          path: image.path ?? `studio/${sku}/${String(image.position).padStart(2, "0")}`,
          position: image.position,
        })
        .select("id")
        .single(),
    );

    imageIds.push(inserted.id);
  }

  return { productId: product.id, sku, variantIds, imageIds };
}

export async function deleteServiceProducts(
  service: SupabaseClient,
  productIds: Array<string | undefined>,
): Promise<void> {
  const ids = productIds.filter((id): id is string => typeof id === "string" && id.length > 0);

  if (ids.length === 0) {
    return;
  }

  const result = await service.from("products").delete().in("id", ids);

  if (result.error) {
    throw result.error;
  }
}

export async function deleteTestUsers(
  service: SupabaseClient,
  userIds: Array<string | undefined>,
): Promise<void> {
  for (const userId of userIds) {
    if (!userId) {
      continue;
    }

    const result = await service.auth.admin.deleteUser(userId);

    if (result.error && result.error.status !== 404) {
      throw result.error;
    }
  }
}

export async function createAttributeTranslation(
  service: SupabaseClient,
  input: { attribute: string; value: string; locale: "en" | "vi"; label: string },
): Promise<void> {
  const result = await service
    .from("attribute_translations")
    .upsert(input, { onConflict: "attribute,value,locale" });

  if (result.error) {
    throw result.error;
  }
}

export async function deleteAttributeTranslation(
  service: SupabaseClient,
  input: { attribute: string; value: string; locale: "en" | "vi" },
): Promise<void> {
  const result = await service
    .from("attribute_translations")
    .delete()
    .eq("attribute", input.attribute)
    .eq("value", input.value)
    .eq("locale", input.locale);

  if (result.error) {
    throw result.error;
  }
}

export async function findUserByEmail(service: SupabaseClient, email: string) {
  const normalized = email.toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalized);

    if (user) {
      return user;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }

  return null;
}
