-- Row level security and explicit grants.
--
-- Catalog and settings are readable by everyone; profiles, carts, orders, and
-- payment history are scoped to their owner. Administrators read everything and
-- write catalog rows. Orders, stock, and payment rows never accept direct
-- writes from a client: the order functions are the only writers.

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_translations enable row level security;
alter table public.attribute_translations enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.store_settings enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.order_events enable row level security;
alter table public.stock_adjustments enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or public.is_admin());

drop policy if exists profiles_update_own_or_admin on public.profiles;

create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (id = (select auth.uid()) or public.is_admin())
with check (id = (select auth.uid()) or public.is_admin());

drop policy if exists products_select_public on public.products;

create policy products_select_public
on public.products
for select
to anon, authenticated
using (is_active or public.is_admin());

drop policy if exists products_admin_insert on public.products;

create policy products_admin_insert
on public.products
for insert
to authenticated
with check (public.is_admin());

drop policy if exists products_admin_update on public.products;

create policy products_admin_update
on public.products
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists products_admin_delete on public.products;

create policy products_admin_delete
on public.products
for delete
to authenticated
using (public.is_admin());

drop policy if exists product_translations_select_public on public.product_translations;

create policy product_translations_select_public
on public.product_translations
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_id
      and (p.is_active or public.is_admin())
  )
);

drop policy if exists product_translations_admin_insert on public.product_translations;

create policy product_translations_admin_insert
on public.product_translations
for insert
to authenticated
with check (public.is_admin());

drop policy if exists product_translations_admin_update on public.product_translations;

create policy product_translations_admin_update
on public.product_translations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists product_translations_admin_delete on public.product_translations;

create policy product_translations_admin_delete
on public.product_translations
for delete
to authenticated
using (public.is_admin());

drop policy if exists attribute_translations_select_public on public.attribute_translations;

create policy attribute_translations_select_public
on public.attribute_translations
for select
to anon, authenticated
using (true);

drop policy if exists attribute_translations_admin_insert on public.attribute_translations;

create policy attribute_translations_admin_insert
on public.attribute_translations
for insert
to authenticated
with check (public.is_admin());

drop policy if exists attribute_translations_admin_update on public.attribute_translations;

create policy attribute_translations_admin_update
on public.attribute_translations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists attribute_translations_admin_delete on public.attribute_translations;

create policy attribute_translations_admin_delete
on public.attribute_translations
for delete
to authenticated
using (public.is_admin());

drop policy if exists product_variants_select_public on public.product_variants;

create policy product_variants_select_public
on public.product_variants
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_id
      and (p.is_active or public.is_admin())
  )
);

drop policy if exists product_variants_admin_insert on public.product_variants;

create policy product_variants_admin_insert
on public.product_variants
for insert
to authenticated
with check (public.is_admin());

drop policy if exists product_variants_admin_update on public.product_variants;

create policy product_variants_admin_update
on public.product_variants
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists product_variants_admin_delete on public.product_variants;

create policy product_variants_admin_delete
on public.product_variants
for delete
to authenticated
using (public.is_admin());

drop policy if exists product_images_select_public on public.product_images;

create policy product_images_select_public
on public.product_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_id
      and (p.is_active or public.is_admin())
  )
);

drop policy if exists product_images_admin_insert on public.product_images;

create policy product_images_admin_insert
on public.product_images
for insert
to authenticated
with check (public.is_admin());

drop policy if exists product_images_admin_update on public.product_images;

create policy product_images_admin_update
on public.product_images
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists product_images_admin_delete on public.product_images;

create policy product_images_admin_delete
on public.product_images
for delete
to authenticated
using (public.is_admin());

drop policy if exists store_settings_select_public on public.store_settings;

create policy store_settings_select_public
on public.store_settings
for select
to anon, authenticated
using (true);

drop policy if exists store_settings_admin_update on public.store_settings;

create policy store_settings_admin_update
on public.store_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists cart_items_select_own on public.cart_items;

create policy cart_items_select_own
on public.cart_items
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists cart_items_insert_own on public.cart_items;

create policy cart_items_insert_own
on public.cart_items
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists cart_items_update_own on public.cart_items;

create policy cart_items_update_own
on public.cart_items
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists cart_items_delete_own on public.cart_items;

create policy cart_items_delete_own
on public.cart_items
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists orders_select_own_or_admin on public.orders;

create policy orders_select_own_or_admin
on public.orders
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists order_items_select_own_or_admin on public.order_items;

create policy order_items_select_own_or_admin
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and (o.user_id = (select auth.uid()) or public.is_admin())
  )
);

drop policy if exists payment_attempts_select_own_or_admin on public.payment_attempts;

create policy payment_attempts_select_own_or_admin
on public.payment_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and (o.user_id = (select auth.uid()) or public.is_admin())
  )
);

drop policy if exists order_events_select_own_or_admin on public.order_events;

create policy order_events_select_own_or_admin
on public.order_events
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and (o.user_id = (select auth.uid()) or public.is_admin())
  )
);

drop policy if exists stock_adjustments_select_admin on public.stock_adjustments;

create policy stock_adjustments_select_admin
on public.stock_adjustments
for select
to authenticated
using (public.is_admin());

-- Explicit table grants. Supabase exposes new public tables to the Data API by
-- default, so revoke everything first and grant only what each role needs.

revoke all on table
  public.profiles,
  public.products,
  public.product_translations,
  public.attribute_translations,
  public.product_variants,
  public.product_images,
  public.store_settings,
  public.cart_items,
  public.orders,
  public.order_items,
  public.payment_attempts,
  public.order_events,
  public.stock_adjustments
from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

grant select on table
  public.products,
  public.product_translations,
  public.attribute_translations,
  public.product_variants,
  public.product_images,
  public.store_settings
to anon, authenticated;

grant select on table public.profiles to authenticated;

grant update (full_name, phone, default_address, updated_at)
on table public.profiles
to authenticated;

grant insert, update, delete on table
  public.products,
  public.product_translations,
  public.attribute_translations,
  public.product_images
to authenticated;

grant insert, delete on table public.product_variants to authenticated;

grant update (option_label, size_guide_key, position, updated_at)
on table public.product_variants
to authenticated;

grant update on table public.store_settings to authenticated;

grant select, insert, update, delete on table public.cart_items to authenticated;

grant select on table
  public.orders,
  public.order_items,
  public.payment_attempts,
  public.order_events,
  public.stock_adjustments
to authenticated;

-- Function grants. Trigger functions are not callable by API roles.

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated, service_role;

revoke all on function public.immutable_unaccent(text) from public, anon, authenticated;
grant execute on function public.immutable_unaccent(text) to anon, authenticated, service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_fields() from public, anon, authenticated;
