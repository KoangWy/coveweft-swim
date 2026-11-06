-- Cart, orders, order snapshots, payment attempts, order events, and stock
-- adjustments.
--
-- Orders, order items, payment attempts, and order events are written only by
-- the SECURITY DEFINER functions in the order functions migration. Clients
-- receive SELECT access through row level security and never write directly.

create table if not exists public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);

comment on table public.cart_items is
  'One row per customer and variant. Adding to the cart does not reserve stock.';

create index if not exists cart_items_user_idx on public.cart_items (user_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null
    check (length(idempotency_key) between 1 and 100),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'shipping', 'delivered', 'cancelled')),
  payment_method text not null
    check (payment_method in ('cod', 'bank_transfer')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'refunded')),
  recipient_name text not null check (length(btrim(recipient_name)) > 0),
  recipient_phone text not null check (length(btrim(recipient_phone)) > 0),
  shipping_address text not null check (length(btrim(shipping_address)) > 0),
  shipping_method text not null
    check (shipping_method in ('standard', 'express')),
  shipping_fee_vnd integer not null check (shipping_fee_vnd >= 0),
  items_subtotal_vnd integer not null check (items_subtotal_vnd >= 0),
  total_vnd integer not null check (total_vnd >= 0),
  payment_due_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_idempotency_key_unique unique (user_id, idempotency_key),
  constraint orders_total_check check (total_vnd = items_subtotal_vnd + shipping_fee_vnd),
  constraint orders_payment_due_check check (
    payment_due_at is null or payment_method = 'bank_transfer'
  ),
  constraint orders_cancelled_check check (
    (status = 'cancelled') = (cancelled_at is not null)
  )
);

comment on table public.orders is
  'Order header with a delivery and price snapshot. Written only by order RPCs.';

comment on column public.orders.payment_due_at is
  'Payment deadline for bank transfers. COD orders keep this null.';

comment on column public.orders.cancelled_by is
  'Customer or administrator who cancelled the order; null when the expiry job did.';

create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);

create index if not exists orders_status_created_idx
  on public.orders (status, created_at desc);

create index if not exists orders_expiry_idx
  on public.orders (payment_due_at)
  where payment_method = 'bank_transfer'
    and status = 'pending'
    and payment_status = 'unpaid'
    and payment_due_at is not null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  sku text not null,
  variant_sku text not null,
  product_name text not null,
  option_label text not null,
  unit_price_vnd integer not null check (unit_price_vnd >= 0),
  quantity integer not null check (quantity > 0),
  line_total_vnd integer generated always as (unit_price_vnd * quantity) stored,
  created_at timestamptz not null default now(),
  constraint order_items_order_variant_unique unique (order_id, variant_id)
);

comment on table public.order_items is
  'Immutable snapshot of the products, prices, and options in an order.';

create index if not exists order_items_order_idx on public.order_items (order_id);

create index if not exists order_items_variant_idx
  on public.order_items (variant_id)
  where variant_id is not null;

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  outcome text not null check (outcome in ('succeeded', 'failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.payment_attempts is
  'One row per simulated bank transfer attempt. Failed attempts do not change the order.';

create index if not exists payment_attempts_order_created_idx
  on public.payment_attempts (order_id, created_at);

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text
    check (from_status is null or from_status in ('pending', 'confirmed', 'shipping', 'delivered', 'cancelled')),
  to_status text not null
    check (to_status in ('pending', 'confirmed', 'shipping', 'delivered', 'cancelled')),
  from_payment_status text
    check (from_payment_status is null or from_payment_status in ('unpaid', 'paid', 'refunded')),
  to_payment_status text
    check (to_payment_status in ('unpaid', 'paid', 'refunded')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('customer', 'admin', 'system')),
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.order_events is
  'Append-only order state history for the customer timeline and the admin view.';

create index if not exists order_events_order_created_idx
  on public.order_events (order_id, created_at);

create table if not exists public.stock_adjustments (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  delta integer not null,
  stock_before integer not null check (stock_before >= 0),
  stock_after integer not null check (stock_after >= 0),
  reason text not null check (length(btrim(reason)) > 0),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.stock_adjustments is
  'Audit trail for manual stock changes made by administrators.';

create index if not exists stock_adjustments_variant_created_idx
  on public.stock_adjustments (variant_id, created_at desc);

drop trigger if exists set_cart_items_updated_at on public.cart_items;

create trigger set_cart_items_updated_at
before update on public.cart_items
for each row
execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;

create trigger set_orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();
