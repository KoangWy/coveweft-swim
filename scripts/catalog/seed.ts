import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadCatalogData, loadSizeGuide, validateCatalogData } from "./catalog.ts";
import type { CatalogData } from "./types.ts";

const CHUNK_SIZE = 500;
const PRODUCT_LOOKUP_CHUNK_SIZE = 100;

export type SeedSummary = {
  products: number;
  variants: number;
  images: number;
  productTranslations: number;
  attributeTranslations: number;
  storeSettings: number;
};

type ProductRow = {
  sku: string;
  article_id: string | null;
  name: string;
  product_type: string;
  category: string;
  gender: string;
  collection: string | null;
  color: string | null;
  color_family: string | null;
  pattern: string | null;
  material: string | null;
  fabric_desc: string | null;
  sleeve: string | null;
  neckline: string | null;
  fit: string | null;
  length: string | null;
  closure: string | null;
  lining: string | null;
  features: string[];
  season: string | null;
  brand: string | null;
  price_vnd: number;
  description: string;
  caption: string;
  is_active: boolean;
};

type PlannedVariant = {
  sku: string;
  variant_sku: string;
  option_label: string;
  size_guide_key: string | null;
  stock: number;
  position: number;
};

type PlannedImage = {
  sku: string;
  kind: "studio";
  source: "release";
  path: string;
  position: number;
  drive_file_id: string;
};

type PlannedProductTranslation = {
  sku: string;
  locale: "vi";
  description: string;
  caption: string;
};

type AttributeTranslationRow = {
  attribute: string;
  value: string;
  locale: "vi";
  label: string;
};

export type SeedPlan = {
  products: ProductRow[];
  variants: PlannedVariant[];
  images: PlannedImage[];
  productTranslations: PlannedProductTranslation[];
  attributeTranslations: AttributeTranslationRow[];
  storeSettings: { id: number }[];
};

export type SeedEnv = {
  url: string;
  secretKey: string;
};

/**
 * Loads the catalog into an existing database without overwriting rows.
 *
 * The service role keeps the table privileges that the RLS migration reserves
 * for trusted provisioning, so the initial stock can be inserted directly.
 * Every write uses `ON CONFLICT DO NOTHING`; stock and administrator edits
 * survive a re-run.
 */
export async function seedCatalog(
  client: SupabaseClient,
  data: CatalogData = loadCatalogData(),
  sizeGuide = loadSizeGuide(),
): Promise<SeedSummary> {
  validateCatalogData(data, { sizeGuide });

  const plan = buildSeedRows(data);

  await insertIgnore(client, "store_settings", plan.storeSettings, "id");
  await insertIgnore(client, "products", plan.products, "sku");

  const productIds = await loadProductIds(
    client,
    plan.products.map((product) => product.sku),
  );

  const requireProductId = (sku: string): string => {
    const id = productIds.get(sku);
    if (!id) {
      throw new Error(`Product ${sku} is missing after the seed insert`);
    }
    return id;
  };

  await insertIgnore(
    client,
    "product_variants",
    plan.variants.map(({ sku, ...variant }) => ({
      product_id: requireProductId(sku),
      ...variant,
    })),
    "variant_sku",
  );

  await insertIgnore(
    client,
    "product_images",
    plan.images.map(({ sku, ...image }) => ({
      product_id: requireProductId(sku),
      ...image,
    })),
    "product_id,kind,source,path",
  );

  await insertIgnore(
    client,
    "product_translations",
    plan.productTranslations.map(({ sku, ...translation }) => ({
      product_id: requireProductId(sku),
      ...translation,
    })),
    "product_id,locale",
  );

  await insertIgnore(
    client,
    "attribute_translations",
    plan.attributeTranslations,
    "attribute,value,locale",
  );

  return {
    products: plan.products.length,
    variants: plan.variants.length,
    images: plan.images.length,
    productTranslations: plan.productTranslations.length,
    attributeTranslations: plan.attributeTranslations.length,
    storeSettings: plan.storeSettings.length,
  };
}

export function buildSeedRows(data: CatalogData): SeedPlan {
  const products: ProductRow[] = data.products.map((product) => ({
    sku: product.sku,
    article_id: product.articleId,
    name: product.name,
    product_type: product.productType,
    category: product.category,
    gender: product.gender,
    collection: product.collection,
    color: product.color,
    color_family: product.colorFamily,
    pattern: product.pattern,
    material: product.material,
    fabric_desc: product.fabricDesc,
    sleeve: product.sleeve,
    neckline: product.neckline,
    fit: product.fit,
    length: product.length,
    closure: product.closure,
    lining: product.lining,
    features: product.features,
    season: product.season,
    brand: product.brand,
    price_vnd: product.priceVnd,
    description: product.description,
    caption: product.caption,
    is_active: product.isActive,
  }));

  const variants: PlannedVariant[] = [];
  for (const group of data.variants) {
    group.sizes.forEach((size, index) => {
      variants.push({
        sku: group.sku,
        variant_sku: group.variantSkuBySize[size] ?? "",
        option_label: size,
        size_guide_key: group.sizeGuideKeyBySize[size] ?? null,
        stock: group.stockBySize[size] ?? 0,
        position: index + 1,
      });
    });
  }

  const images: PlannedImage[] = data.images.map((image) => ({
    sku: image.sku,
    kind: "studio",
    source: "release",
    path: image.path,
    position: image.position,
    drive_file_id: image.driveFileId,
  }));

  const productTranslations: PlannedProductTranslation[] = Object.entries(
    data.translations.products,
  ).map(([sku, translation]) => ({
    sku,
    locale: "vi",
    description: translation.description,
    caption: translation.caption,
  }));

  const attributeTranslations: AttributeTranslationRow[] = Object.entries(
    data.translations.attributes,
  ).flatMap(([attribute, values]) =>
    Object.entries(values).map(([value, label]) => ({
      attribute,
      value,
      locale: "vi" as const,
      label,
    })),
  );

  return {
    products,
    variants,
    images,
    productTranslations,
    attributeTranslations,
    storeSettings: [{ id: 1 }],
  };
}

export function resolveSeedEnv(root = process.cwd()): SeedEnv {
  const fileEnv = readLocalEnv(root);
  const read = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = process.env[key] ?? fileEnv[key];
      if (value) {
        return value;
      }
    }
    return undefined;
  };

  let url = read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL_INTERNAL");
  let secretKey = read("SUPABASE_SECRET_KEY");

  if (!secretKey) {
    const status = readSupabaseStatus(root);
    url = url ?? status.API_URL;
    secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  }

  url = url ?? "http://127.0.0.1:54321";

  if (!secretKey) {
    throw new Error(
      "Could not resolve the Supabase secret key. Start the local stack with " +
        "`supabase start` and copy the secret key into .env.local, or export " +
        "SUPABASE_SECRET_KEY before running `pnpm db:seed`.",
    );
  }

  return { url, secretKey };
}

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function readLocalEnv(root: string): Record<string, string> {
  const path = resolve(root, ".env.local");

  if (!existsSync(path)) {
    return {};
  }

  return parseEnvFile(readFileSync(path, "utf8"));
}

function readSupabaseStatus(root: string): Record<string, string> {
  const attempts: [string, string[]][] = [
    ["supabase", ["status", "-o", "env"]],
    ["pnpm", ["dlx", "supabase", "status", "-o", "env"]],
  ];

  for (const [command, args] of attempts) {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });

    if (result.status === 0 && result.stdout) {
      return parseEnvFile(result.stdout);
    }
  }

  return {};
}

async function loadProductIds(
  client: SupabaseClient,
  skus: string[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (let index = 0; index < skus.length; index += PRODUCT_LOOKUP_CHUNK_SIZE) {
    const chunk = skus.slice(index, index + PRODUCT_LOOKUP_CHUNK_SIZE);
    const { data, error } = await client.from("products").select("id,sku").in("sku", chunk);

    if (error) {
      throw new Error(`Could not read product IDs: ${error.message}`);
    }

    for (const row of (data ?? []) as { id: string; sku: string }[]) {
      ids.set(row.sku, row.id);
    }
  }

  return ids;
}

type UpsertBuilder = {
  upsert: (
    values: Record<string, unknown>[],
    options: { onConflict: string; ignoreDuplicates: boolean },
  ) => PromiseLike<{ error: { message: string } | null }>;
};

async function insertIgnore(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    const builder = client.from(table) as unknown as UpsertBuilder;
    const { error } = await builder.upsert(chunk, { onConflict, ignoreDuplicates: true });

    if (error) {
      throw new Error(`Could not seed ${table}: ${error.message}`);
    }
  }
}

async function main(): Promise<void> {
  const env = resolveSeedEnv();
  const client = createClient(env.url, env.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const summary = await seedCatalog(client);

  console.log(
    `Catalog seed complete: ${summary.products} products, ${summary.variants} variants, ` +
      `${summary.images} images, ${summary.productTranslations} product translations, ` +
      `${summary.attributeTranslations} attribute translations.`,
  );
  console.log("Existing rows were left unchanged.");
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main();
}
