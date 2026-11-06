-- Administrator dashboard aggregates.
--
-- PostgREST caps a response at 1000 rows, so the service must not sum an
-- unpaginated order list in JavaScript. This function computes every metric
-- with database aggregates in one call and checks the administrator role.

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_count integer;
  v_revenue_vnd bigint;
  v_orders_by_status jsonb;
  v_orders_by_payment_status jsonb;
  v_top_products jsonb;
  v_low_stock_variants jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    coalesce(
      sum(o.total_vnd) filter (
        where o.status = 'delivered'
          and o.payment_status = 'paid'
      ),
      0
    )::bigint
  into v_order_count, v_revenue_vnd
  from public.orders o;

  select jsonb_object_agg(s.status, coalesce(c.count, 0))
  into v_orders_by_status
  from (values ('pending'), ('confirmed'), ('shipping'), ('delivered'), ('cancelled'))
    as s(status)
  left join (
    select o.status, count(*)::integer as count
    from public.orders o
    group by o.status
  ) c on c.status = s.status;

  select jsonb_object_agg(s.payment_status, coalesce(c.count, 0))
  into v_orders_by_payment_status
  from (values ('unpaid'), ('paid'), ('refunded')) as s(payment_status)
  left join (
    select o.payment_status, count(*)::integer as count
    from public.orders o
    group by o.payment_status
  ) c on c.payment_status = s.payment_status;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', t.product_id,
        'sku', t.sku,
        'name', t.product_name,
        'quantity', t.quantity,
        'revenue_vnd', t.revenue_vnd
      )
      order by t.revenue_vnd desc, t.quantity desc, t.sku
    ),
    '[]'::jsonb
  )
  into v_top_products
  from (
    select
      oi.product_id,
      oi.sku,
      oi.product_name,
      sum(oi.quantity)::integer as quantity,
      sum(oi.line_total_vnd)::integer as revenue_vnd
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status = 'delivered'
      and o.payment_status = 'paid'
    group by oi.product_id, oi.sku, oi.product_name
    order by revenue_vnd desc, quantity desc, oi.sku
    limit 5
  ) t;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'variant_id', t.variant_id,
        'variant_sku', t.variant_sku,
        'product_name', t.product_name,
        'product_sku', t.product_sku,
        'option_label', t.option_label,
        'stock', t.stock
      )
      order by t.stock asc, t.variant_id
    ),
    '[]'::jsonb
  )
  into v_low_stock_variants
  from (
    select
      v.id as variant_id,
      v.variant_sku,
      p.name as product_name,
      p.sku as product_sku,
      v.option_label,
      v.stock
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.stock <= 5
    order by v.stock asc, v.id asc
    limit 10
  ) t;

  return jsonb_build_object(
    'demo_data', true,
    'revenue_vnd', v_revenue_vnd,
    'order_count', v_order_count,
    'orders_by_status', v_orders_by_status,
    'orders_by_payment_status', v_orders_by_payment_status,
    'top_products', v_top_products,
    'low_stock_variants', v_low_stock_variants,
    'low_stock_threshold', 5
  );
end;
$$;

comment on function public.admin_dashboard() is
  'Administrator dashboard aggregates computed in the database, beyond the PostgREST row cap.';

revoke all on function public.admin_dashboard() from public, anon, authenticated;
grant execute on function public.admin_dashboard() to authenticated;
