import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { format, resolveConfig } from "prettier";

import {
  buildCatalog,
  buildImportReport,
  CATALOG_FILE_NAMES,
  parseSizeGuideJson,
  parseTranslationsJson,
  renderSourceMarkdown,
} from "./catalog.ts";
import { parseInventoryCsv, parseProductsCsv } from "./csv.ts";
import { renderSeedSql } from "./seed-sql.ts";
import type { SourceFileInfo } from "./types.ts";

const DEFAULT_TRANSLATIONS = "data/translations/vi.json";
const DEFAULT_SIZE_GUIDE = "data/size-guides/demo-size-guide.json";
const DEFAULT_OUT = "data/catalog";
const DEFAULT_SEED_SQL = "supabase/seed.sql";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      inventory: { type: "string" },
      translations: { type: "string" },
      "size-guide": { type: "string" },
      out: { type: "string" },
      "seed-sql": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  const sourcePath = requireOption(values.source, "--source");
  const inventoryPath = requireOption(values.inventory, "--inventory");
  const translationsPath = resolve(values.translations ?? DEFAULT_TRANSLATIONS);
  const sizeGuidePath = resolve(values["size-guide"] ?? DEFAULT_SIZE_GUIDE);
  const outDir = resolve(values.out ?? DEFAULT_OUT);
  const seedSqlPath = resolve(values["seed-sql"] ?? DEFAULT_SEED_SQL);

  const sourceProducts = parseProductsCsv(readFileSync(sourcePath, "utf8"));
  const inventory = parseInventoryCsv(readFileSync(inventoryPath, "utf8"));
  const translations = parseTranslationsJson(readFileSync(translationsPath, "utf8"));
  const sizeGuide = parseSizeGuideJson(readFileSync(sizeGuidePath, "utf8"));

  const data = buildCatalog({
    products: sourceProducts,
    images: inventory.images,
    translations,
    sizeGuide,
  });

  const report = buildImportReport(data, sourceProducts, sizeGuide);
  const inputs = {
    products: sourceInfo(sourcePath, sourceProducts.length),
    inventory: sourceInfo(inventoryPath, inventory.totalRows),
    translations: sourceInfo(translationsPath, Object.keys(translations.products).length),
    sizeGuide: sourceInfo(sizeGuidePath, sizeGuide.labelMap.length),
  };

  mkdirSync(outDir, { recursive: true });

  const files: Record<string, unknown> = {
    [CATALOG_FILE_NAMES.products]: data.products,
    [CATALOG_FILE_NAMES.variants]: data.variants,
    [CATALOG_FILE_NAMES.images]: data.images,
    [CATALOG_FILE_NAMES.report]: report,
  };

  for (const [name, value] of Object.entries(files)) {
    const path = resolve(outDir, name);
    writeFileSync(path, await formatText(path, `${JSON.stringify(value, null, 2)}\n`, "json"));
  }

  const sourcePathOut = resolve(outDir, CATALOG_FILE_NAMES.source);
  writeFileSync(
    sourcePathOut,
    await formatText(sourcePathOut, renderSourceMarkdown(report, inputs), "markdown"),
  );

  mkdirSync(dirname(seedSqlPath), { recursive: true });
  writeFileSync(seedSqlPath, renderSeedSql(data));

  console.log(
    `Exported ${report.counts.products} products, ${report.counts.variants} variants, ` +
      `${report.counts.images} images.`,
  );
  console.log(
    `Wrote ${outDir}/${CATALOG_FILE_NAMES.products}, ${CATALOG_FILE_NAMES.variants}, ` +
      `${CATALOG_FILE_NAMES.images}, ${CATALOG_FILE_NAMES.source}, ` +
      `${CATALOG_FILE_NAMES.report}, and ${seedSqlPath}.`,
  );
  console.log(`Import report groups: ${report.anomalies.length}.`);
}

function requireOption(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required option ${name}`);
  }
  return resolve(value);
}

function sourceInfo(path: string, rows: number): SourceFileInfo {
  const contents = readFileSync(path);

  return {
    file: basename(path),
    rows,
    bytes: contents.length,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

async function formatText(
  path: string,
  text: string,
  parser: "json" | "markdown",
): Promise<string> {
  const config = await resolveConfig(path);
  return format(text, { ...(config ?? {}), parser });
}

await main();
