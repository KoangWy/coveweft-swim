-- Catalog search view, image visibility, and the administrator upload bucket.
--
-- The view exposes one row per product with localized copy, a combined
-- unaccented search text, and stock summaries. It runs with the invoker's
-- rights so the catalog row level security policies still apply. The upload
-- bucket is public for reads; writes go through the secret key in the admin
-- service and never through a browser session.

alter table public.product_images
  add column if not exists is_visible boolean not null default true;

comment on column public.product_images.is_visible is
  'False hides an image from the storefront without deleting its metadata.';

-- The original image policy only checked the parent product. Visibility is an
-- authorization boundary, not just a service filter, so hidden rows must not
-- be readable by anonymous or customer clients. Administrators still see them.
drop policy if exists product_images_select_public on public.product_images;

create policy product_images_select_public
on public.product_images
for select
to anon, authenticated
using (
  (is_visible or public.is_admin())
  and exists (
    select 1
    from public.products p
    where p.id = product_id
      and (p.is_active or public.is_admin())
  )
);

create or replace view public.catalog_products
with (security_invoker = true)
as
select
  p.id,
  p.sku,
  p.article_id,
  p.name,
  p.product_type,
  p.category,
  p.gender,
  p.collection,
  p.color,
  p.color_family,
  p.pattern,
  p.material,
  p.fabric_desc,
  p.sleeve,
  p.neckline,
  p.fit,
  p.length,
  p.closure,
  p.lining,
  p.features,
  p.season,
  p.brand,
  p.price_vnd,
  p.description,
  p.caption,
  p.is_active,
  p.search_text,
  p.created_at,
  p.updated_at,
  coalesce(pt_en.description, p.description) as description_en,
  coalesce(pt_en.caption, p.caption) as caption_en,
  coalesce(pt_vi.description, pt_en.description, p.description) as description_vi,
  coalesce(pt_vi.caption, pt_en.caption, p.caption) as caption_vi,
  public.immutable_unaccent(
    concat_ws(
      ' ',
      p.name,
      p.description,
      p.caption,
      pt_en.description,
      pt_en.caption,
      pt_vi.description,
      pt_vi.caption
    )
  ) as search_text_all,
  exists (
    select 1
    from public.product_variants v
    where v.product_id = p.id
      and v.stock > 0
  ) as in_stock,
  coalesce(
    (
      select array_agg(distinct v.option_label)
      from public.product_variants v
      where v.product_id = p.id
    ),
    array[]::text[]
  ) as variant_labels,
  coalesce(
    (
      select array_agg(distinct v.option_label)
      from public.product_variants v
      where v.product_id = p.id
        and v.stock > 0
    ),
    array[]::text[]
  ) as available_variant_labels,
  coalesce(
    (
      select sum(v.stock)
      from public.product_variants v
      where v.product_id = p.id
    ),
    0
  )::integer as total_stock,
  (
    select count(*)
    from public.product_variants v
    where v.product_id = p.id
  )::integer as variant_count
from public.products p
left join public.product_translations pt_en
  on pt_en.product_id = p.id
  and pt_en.locale = 'en'
left join public.product_translations pt_vi
  on pt_vi.product_id = p.id
  and pt_vi.locale = 'vi';

comment on view public.catalog_products is
  'Catalog rows with localized copy, combined unaccented search text, and stock summaries.';

grant select on public.catalog_products to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-uploads',
  'product-uploads',
  true,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
