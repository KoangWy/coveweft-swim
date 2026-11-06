import { z } from "zod";

import type { Locale } from "@/lib/locale";
import { formatVnd } from "@/lib/money";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import type { ToolDefinition } from "@/server/ai";
import { getSizeGuide } from "@/server/catalog/size-guide";
import type {
  ProductDetail,
  ProductImage,
  ProductList,
  ProductListItem,
  StoreSettings,
} from "@/server/catalog/types";
import type { Result } from "@/server/errors";

import { MeasurementsInput, recommendSize } from "./recommend-size";

/** Catalog reads the tools depend on. Every call is read-only. */
export type AssistantCatalog = {
  listProducts(input: unknown): Promise<Result<ProductList>>;
  getProductBySku(input: unknown): Promise<Result<ProductDetail>>;
  getStoreSettings(): Promise<Result<StoreSettings>>;
  /** Public URL of a product image, or `null` when media is not configured. */
  imageUrl(image: ProductImage): string | null;
};

/** A product card the widget renders. Built only from tool results. */
export type ProductCard = {
  sku: string;
  name: string;
  priceVnd: number;
  inStock: boolean;
  imageUrl: string | null;
  url: string;
};

/** State shared by the tools of one turn. */
export type ToolContext = {
  locale: Locale;
  catalog: AssistantCatalog;
  /** Products returned by tools in the current turn, by SKU. */
  cards: Map<string, ProductCard>;
};

const MAX_SEARCH_RESULTS = 8;
const MAX_VARIANTS = 40;
const MAX_ATTRIBUTES = 24;
const SUMMARY_CHARS = 200;
const DESCRIPTION_CHARS = 600;

const GENDERS = ["Women", "Men", "Kids", "Teen", "Baby", "Unisex"] as const;
const CATEGORIES = ["Full body", "Tops", "Bottoms", "Accessories"] as const;

const Sku = z.string().trim().min(1).max(64).describe("Product SKU from a tool result.");

const SearchProductsArgs = z
  .object({
    query: z
      .string()
      .trim()
      .max(120)
      .optional()
      .describe("Keywords in English or Vietnamese, for example 'rash guard' or 'đồ bơi'."),
    gender: z.array(z.enum(GENDERS)).min(1).max(6).optional(),
    category: z.enum(CATEGORIES).optional(),
    productType: z.string().trim().min(1).max(60).optional().describe("For example 'Swimsuit'."),
    minPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
    maxPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
    material: z.string().trim().min(1).max(60).optional(),
    features: z.array(z.string().trim().min(1).max(60)).max(5).optional(),
    size: z.string().trim().min(1).max(20).optional().describe("Variant label such as 'M'."),
    inStock: z.boolean().optional(),
    sort: z.enum(["newest", "price-asc", "price-desc", "name-asc"]).optional(),
    limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
  })
  .strict();

const SkuArgs = z.object({ sku: Sku }).strict();

const SizeGuideArgs = z
  .object({
    sku: Sku.optional(),
    group: z.enum(["women", "men", "kids", "teen", "baby"]).optional(),
    garment: z.enum(["tops", "bottoms", "full-body"]).optional(),
  })
  .strict();

const RecommendSizeArgs = z.object({ sku: Sku, measurements: MeasurementsInput }).strict();

const NoArgs = z.object({}).strict();

type ToolSpec = {
  description: string;
  args: z.ZodType;
  run: (args: never, context: ToolContext) => Promise<unknown>;
};

function truncate(text: string | null, max: number): string | null {
  if (!text) {
    return null;
  }

  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function productUrl(locale: Locale, sku: string): string {
  return `/${locale}/products/${encodeURIComponent(sku)}`;
}

function remember(context: ToolContext, product: ProductListItem): void {
  const image = product.images.find((candidate) => candidate.isVisible) ?? null;

  context.cards.set(product.sku, {
    sku: product.sku,
    name: product.name,
    priceVnd: product.priceVnd,
    inStock: product.inStock,
    imageUrl: image ? context.catalog.imageUrl(image) : null,
    url: productUrl(context.locale, product.sku),
  });
}

async function loadProduct(
  context: ToolContext,
  sku: string,
): Promise<{ product: ProductDetail } | { error: string }> {
  const result = await context.catalog.getProductBySku({ locale: context.locale, sku });

  if (!result.ok) {
    return { error: result.error.code === "NOT_FOUND" ? "product_not_found" : "unavailable" };
  }

  remember(context, result.data);

  return { product: result.data };
}

function policySections(locale: Locale, settings: StoreSettings) {
  const messages = locale === "vi" ? vi : en;
  const values: Record<string, string> = {
    threshold: formatVnd(settings.freeStandardShippingThresholdVnd, locale),
    expressFee: formatVnd(settings.expressShippingFeeVnd, locale),
    minutes: String(settings.paymentWindowMinutes),
  };
  const texts: string[] = [];

  function collect(value: unknown): void {
    if (typeof value === "string") {
      texts.push(value.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match));
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(collect);
    }
  }

  return Object.fromEntries(
    (["shipping", "payment", "returns"] as const).map((key) => {
      texts.length = 0;
      const page = messages.policies[key];
      collect(page.lead);
      collect(page.sections);

      return [key, [...texts]];
    }),
  );
}

const TOOLS: Record<string, ToolSpec> = {
  searchProducts: {
    description:
      "Search the active catalog with keywords and filters. Returns at most 8 products with SKU, price in VND, and stock status.",
    args: SearchProductsArgs,
    async run(args: z.infer<typeof SearchProductsArgs>, context) {
      const result = await context.catalog.listProducts({
        locale: context.locale,
        q: args.query,
        gender: args.gender,
        category: args.category,
        productType: args.productType,
        priceMin: args.minPriceVnd,
        priceMax: args.maxPriceVnd,
        material: args.material,
        features: args.features,
        size: args.size,
        inStock: args.inStock,
        sort: args.sort,
        pageSize: args.limit ?? 6,
      });

      if (!result.ok) {
        return {
          error: result.error.code === "VALIDATION_ERROR" ? "invalid_filters" : "unavailable",
        };
      }

      result.data.items.forEach((item) => remember(context, item));

      return {
        total: result.data.total,
        items: result.data.items.map((item) => ({
          sku: item.sku,
          name: item.name,
          priceVnd: item.priceVnd,
          gender: item.gender,
          category: item.category,
          productType: item.productType,
          material: item.material,
          color: item.color,
          features: item.features,
          inStock: item.inStock,
          summary: truncate(item.description, SUMMARY_CHARS),
        })),
      };
    },
  },
  getProductDetails: {
    description:
      "Get one product's description, attributes, price in VND, option labels, and whether a size guide applies.",
    args: SkuArgs,
    async run(args: z.infer<typeof SkuArgs>, context) {
      const loaded = await loadProduct(context, args.sku);

      if ("error" in loaded) {
        return loaded;
      }

      const { product } = loaded;

      return {
        sku: product.sku,
        name: product.name,
        priceVnd: product.priceVnd,
        inStock: product.inStock,
        gender: product.gender,
        category: product.category,
        productType: product.productType,
        description: truncate(product.description, DESCRIPTION_CHARS),
        attributes: product.attributes
          .slice(0, MAX_ATTRIBUTES)
          .map((attribute) => ({ key: attribute.key, value: attribute.valueLabel })),
        options: product.variants.map((variant) => variant.optionLabel),
        sizeGuide: product.sizeGuide
          ? { group: product.sizeGuide.group, garment: product.sizeGuide.garment }
          : null,
      };
    },
  },
  getAvailableVariants: {
    description: "List a product's variants with option label, variant SKU, and current stock.",
    args: SkuArgs,
    async run(args: z.infer<typeof SkuArgs>, context) {
      const loaded = await loadProduct(context, args.sku);

      if ("error" in loaded) {
        return loaded;
      }

      return {
        sku: loaded.product.sku,
        variants: loaded.product.variants.slice(0, MAX_VARIANTS).map((variant) => ({
          variantSku: variant.variantSku,
          optionLabel: variant.optionLabel,
          stock: variant.stock,
          inStock: variant.inStock,
        })),
      };
    },
  },
  getSizeGuide: {
    description:
      "Get the Demo Size Guide table (body measurement ranges in cm, age in months) for a product SKU, or for a group and garment.",
    args: SizeGuideArgs,
    async run(args: z.infer<typeof SizeGuideArgs>, context) {
      let group = args.group;
      let garment = args.garment;
      let offeredSizes: string[] | null = null;

      if (args.sku) {
        const loaded = await loadProduct(context, args.sku);

        if ("error" in loaded) {
          return loaded;
        }

        const guide = loaded.product.sizeGuide;

        if (!guide) {
          return { status: "not_applicable", reason: "no_size_guide" };
        }

        group = guide.group as typeof group;
        garment = guide.garment;
        offeredSizes = loaded.product.variants.map((variant) => variant.optionLabel);
      }

      if (!group) {
        return { error: "sku_or_group_required" };
      }

      const result = await getSizeGuide({ locale: context.locale, group, garment });

      if (!result.ok) {
        return { error: "size_guide_not_found" };
      }

      const table = result.data;

      return {
        name: "Demo Size Guide",
        notice: table.notice,
        group: table.group,
        garment: table.garment,
        unit: table.unit,
        ageUnit: table.ageUnit,
        measurements: table.measurements,
        rangesAreHalfOpen: true,
        rows: table.rows.map((row) => ({ label: row.label, ranges: row.ranges })),
        ...(offeredSizes ? { offeredSizes } : {}),
      };
    },
  },
  recommendSize: {
    description:
      "Recommend a size for a product from body measurements. The server decides; explain its result. Returns recommended, missing, no_fit, or not_applicable.",
    args: RecommendSizeArgs,
    async run(args: z.infer<typeof RecommendSizeArgs>, context) {
      const loaded = await loadProduct(context, args.sku);

      if ("error" in loaded) {
        return loaded;
      }

      return {
        sku: loaded.product.sku,
        ...(await recommendSize(loaded.product, args.measurements)),
      };
    },
  },
  getStorePolicies: {
    description:
      "Get the configured shipping fees, free-shipping threshold, payment methods, payment window, and the store's shipping, payment, and returns policies.",
    args: NoArgs,
    async run(_args: z.infer<typeof NoArgs>, context) {
      const result = await context.catalog.getStoreSettings();

      if (!result.ok) {
        return { error: "unavailable" };
      }

      const settings = result.data;

      return {
        currency: "VND",
        shipping: {
          standardFeeVnd: settings.standardShippingFeeVnd,
          expressFeeVnd: settings.expressShippingFeeVnd,
          freeStandardShippingThresholdVnd: settings.freeStandardShippingThresholdVnd,
        },
        paymentMethods: ["cod", "bank_transfer"],
        bankTransferWindowMinutes: settings.paymentWindowMinutes,
        policies: policySections(context.locale, settings),
      };
    },
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);

function toParameters(schema: z.ZodType): Record<string, unknown> {
  const parameters: Record<string, unknown> = { ...z.toJSONSchema(schema, { io: "input" }) };
  delete parameters.$schema;

  return parameters;
}

/** Tool definitions sent to the model. Built once on the server. */
export const TOOL_DEFINITIONS: ToolDefinition[] = Object.entries(TOOLS).map(([name, spec]) => ({
  name,
  description: spec.description,
  parameters: toParameters(spec.args),
}));

/**
 * Runs one tool call and returns its JSON result for the model. Arguments are
 * validated with the tool's schema; invalid arguments and unknown tools are
 * reported back to the model as data instead of failing the turn.
 */
export async function runTool(
  name: string,
  rawArguments: string,
  context: ToolContext,
): Promise<string> {
  const spec = TOOLS[name];
  let result: unknown;

  if (!spec) {
    result = { error: "unknown_tool" };
  } else {
    let parsedJson: unknown;

    try {
      parsedJson = rawArguments.trim() === "" ? {} : JSON.parse(rawArguments);
    } catch {
      parsedJson = undefined;
    }

    const args = spec.args.safeParse(parsedJson);

    if (!args.success) {
      result = {
        error: "invalid_arguments",
        issues: args.error.issues.slice(0, 5).map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
        })),
      };
    } else {
      try {
        result = await spec.run(args.data as never, context);
      } catch {
        result = { error: "unavailable" };
      }
    }
  }

  // Tool output is catalog data, never instructions.
  return JSON.stringify({ data: result });
}
