-- Catalog, translations, variants, images, and the single store settings row.
--
-- The catalog is imported from the normalised CSV export. Names, SKUs, and
-- brand labels stay in their source form; descriptions and captions have an
-- optional translation row per locale.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  article_id text,
  name text not null,
  product_type text not null,
  category text not null,
  gender text not null,
  collection text,
  color text,
  color_family text,
  pattern text,
  material text,
  fabric_desc text,
  sleeve text,
  neckline text,
  fit text,
  length text,
  closure text,
  lining text,
  features text[] not null default '{}',
  season text,
  brand text,
  price_vnd integer not null check (price_vnd >= 0),
  description text,
  caption text,
  is_active boolean not null default true,
  search_text text generated always as (
    public.immutable_unaccent(coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.products is
  'Normalised catalog rows. price_vnd is an integer VND amount.';

comment on column public.products.is_active is
  'False hides the product from the storefront without deleting order references.';

comment on column public.products.search_text is
  'Unaccented name and description used for diacritic-insensitive search.';

create index if not exists products_search_text_trgm_idx
  on public.products using gin (search_text extensions.gin_trgm_ops);

create index if not exists products_active_category_idx
  on public.products (is_active, category);

create index if not exists products_active_gender_idx
  on public.products (is_active, gender);

create index if not exists products_active_product_type_idx
  on public.products (is_active, product_type);

create index if not exists products_price_idx on public.products (price_vnd);

create index if not exists products_collection_idx
  on public.products (collection)
  where collection is not null;

create index if not exists products_material_idx
  on public.products (material)
  where material is not null;

create index if not exists products_season_idx
  on public.products (season)
  where season is not null;

create index if not exists products_features_gin_idx
  on public.products using gin (features);

create table if not exists public.product_translations (
  product_id uuid not null references public.products(id) on delete cascade,
  locale text not null check (locale in ('en', 'vi')),
  description text,
  caption text,
  search_text text generated always as (
    public.immutable_unaccent(coalesce(description, '') || ' ' || coalesce(caption, ''))
  ) stored,
  primary key (product_id, locale)
);

comment on table public.product_translations is
  'Localized product descriptions and captions. English falls back to products.';

create index if not exists product_translations_search_text_trgm_idx
  on public.product_translations using gin (search_text extensions.gin_trgm_ops);

create table if not exists public.attribute_translations (
  attribute text not null,
  value text not null,
  locale text not null check (locale in ('en', 'vi')),
  label text not null,
  primary key (attribute, value, locale)
);

comment on table public.attribute_translations is
  'Localized labels for catalog attribute values such as category or color.';

create index if not exists attribute_translations_locale_idx
  on public.attribute_translations (locale, attribute);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_sku text not null unique,
  option_label text not null,
  size_guide_key text,
  stock integer not null default 0 check (stock >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.product_variants is
  'Sellable option per product. option_label keeps the source label verbatim.';

comment on column public.product_variants.stock is
  'On-hand quantity. Only the order RPCs and admin_adjust_stock change it.';

create index if not exists product_variants_product_position_idx
  on public.product_variants (product_id, position);

create index if not exists product_variants_in_stock_idx
  on public.product_variants (product_id)
  where stock > 0;

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null default 'studio' check (kind in ('studio', 'community')),
  source text not null default 'release' check (source in ('release', 'upload')),
  path text not null,
  position integer not null default 0,
  drive_file_id text,
  created_at timestamptz not null default now(),
  constraint product_images_path_unique unique (product_id, kind, source, path)
);

comment on table public.product_images is
  'Studio images from the versioned media package and admin uploads.';

create index if not exists product_images_product_position_idx
  on public.product_images (product_id, kind, position);

create table if not exists public.store_settings (
  id smallint primary key default 1 check (id = 1),
  standard_shipping_fee_vnd integer not null default 30000
    check (standard_shipping_fee_vnd >= 0),
  express_shipping_fee_vnd integer not null default 50000
    check (express_shipping_fee_vnd >= 0),
  free_shipping_threshold_vnd integer not null default 500000
    check (free_shipping_threshold_vnd >= 0),
  payment_window_minutes integer not null default 30
    check (payment_window_minutes > 0),
  updated_at timestamptz not null default now()
);

comment on table public.store_settings is
  'Single row that is the source of truth for shipping fees and the payment window.';

insert into public.store_settings (id)
values (1)
on conflict (id) do nothing;

drop trigger if exists set_products_updated_at on public.products;

create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists set_product_variants_updated_at on public.product_variants;

create trigger set_product_variants_updated_at
before update on public.product_variants
for each row
execute function public.set_updated_at();

drop trigger if exists set_store_settings_updated_at on public.store_settings;

create trigger set_store_settings_updated_at
before update on public.store_settings
for each row
execute function public.set_updated_at();
