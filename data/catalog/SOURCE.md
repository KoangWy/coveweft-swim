# Catalog source

This directory holds the catalog snapshot used by the seed. The source package stays
outside this repository; the exporter receives its paths as command arguments.

- Source: SOBIE Drive, <https://drive.google.com/drive/folders/1FhaHd76Pto0hEG81Q50z_shC03xxLwku>
- Snapshot date: 2026-11-06
- Export command: `pnpm catalog:export --source <products.csv> --inventory <sobie-drive-inventory.csv>`

## Inputs

| Input                   | File                        | Rows |   Bytes | SHA-256                                                            |
| ----------------------- | --------------------------- | ---: | ------: | ------------------------------------------------------------------ |
| Products                | `products.csv`              |  475 |  476315 | `ea9088bf9544af982203c4c36eb9cbaa9b22c78a20b0fbd18391911bdf25d816` |
| Drive inventory         | `sobie-drive-inventory.csv` | 7126 | 2239500 | `efd9da4fa4be4979154281843e3a1bc65d4245eb504e17b98f76a01cd6aeeade` |
| Vietnamese translations | `vi.json`                   |  475 |  206328 | `7bd2c75e6044289d0304087d6a9e6971aabd05f8ed146ec1c47955ed511afd10` |
| Demo size guide         | `demo-size-guide.json`      |   28 |   12811 | `398a7ebd60e9dfb0d06b9ef077e8073fdeedf8ee4892b5ff65ef751e7460dc8f` |

Both CSV files are UTF-8 with a BOM. The exporter reads them with a CSV parser that
handles quoted commas, doubled quotes, and embedded newlines.

## Columns used

`products.csv`: `sku`, `article_id`, `product_name`, `product_type`, `category`,
`gender`, `collection`, `color`, `color_family`, `pattern`, `material`,
`fabric_desc`, `sleeve`, `neckline`, `fit`, `length`, `closure`, `lining`,
`features`, `season`, `brand`, `price_vnd`, `sizes`, `stock_qty`,
`stock_by_size`, `variant_sku_by_size`, `stock_status`, `description`,
`caption`, `studio_image_count`.

`sobie-drive-inventory.csv`: `id`, `name`, `type`, `group`, `folder_path`,
`path`, `sku`.

## Normalization

- `features` is split on `|`; empty values are dropped.
- `sizes`, `stock_by_size`, and `variant_sku_by_size` become `sizes`,
  `stockBySize`, and `variantSkuBySize`. The `sizes` entries are the source
  `option_label` values, preserved verbatim.
- `sizeGuideKeyBySize` is derived from `data/size-guides/demo-size-guide.json`.
  Garment variants use the `(gender, option_label)` entry in `labelMap`;
  accessory variants keep `null`. Every mapped key exists in the size guide
  table for the product's garment type.
- Studio images are selected from the inventory rows with `group = studio` and
  `type = image`. Positions are one-based by ascending source file name inside
  each SKU folder. `path` is the size-less media key `studio/<SKU>/<NN>`; the
  media pipeline appends `-<width>.webp`.
- `products.json`, `variants.json`, and `images.json` are sorted by SKU (and
  position for images) so the export is deterministic.
- English descriptions and captions stay in `products.json`. Vietnamese
  descriptions and captions are seeded into `product_translations` with
  `locale = 'vi'`; English falls back to the product row.

## Validation

The exporter fails when any of these checks fails:

- 475 products and 475 unique SKUs.
- 1541 variants and 1541 unique variant SKUs.
- Per product, `sizes`, `stockBySize`, and `variantSkuBySize` have the same
  keys, and the stock sums to `stockQty`.
- 3224 studio images with unique paths and Drive file IDs; every
  product has at least one image.
- Vietnamese translations cover every SKU and every attribute value (188).
- Every garment variant has a size guide key; every accessory variant has
  `null`.

## Seed

`supabase/seed.sql` is generated from these files. It runs as the database
owner during `supabase db reset`; `pnpm db:seed` loads the same rows through
the service role. Both paths insert the initial variant stock directly
because the client INSERT grant on `product_variants` excludes `stock`; later
stock changes go through `admin_adjust_stock` and are audited. Every
statement is idempotent (`ON CONFLICT DO NOTHING`), so a re-run keeps existing
stock and admin edits.

## Anomalies

Source anomalies are listed in `import-report.json`; the raw source is never
modified. The report records:

- 12 product names shared by 25 SKUs; the extra rows are kept instead of merged.
- 411 variants with zero stock across 183 products.
- 56 products with no stock in any variant.
- 106 variants with option labels that are not garment sizes, such as "Free size" or a dimension.
- 18 accessory variants with garment size labels; the size guide key stays null by rule.
- 7 products without feature values in the source.
- 1 product without the SOBIE brand label.
- 1 variant with an alias label that maps to the same size guide key as a canonical label.
