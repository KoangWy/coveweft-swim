-- Atomic cart accumulation.
--
-- The service must not read the old quantity and write an absolute value in
-- separate requests: concurrent calls would lose increments. This function
-- locks the variant row, accumulates with ON CONFLICT DO UPDATE, and checks
-- the combined quantity against the stock and the per-line cap in the same
-- transaction. It is scoped to auth.uid() and never accepts a user id.

create or replace function public.add_cart_item(
  p_variant_id uuid,
  p_quantity integer
)
returns public.cart_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_variant public.product_variants;
  v_product public.products;
  v_item public.cart_items;
  v_max_quantity constant integer := 99;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > v_max_quantity then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'reason', 'quantity',
              'max', v_max_quantity
            )::text;
  end if;

  -- Existence check without a lock. The cart row lock below comes first so the
  -- lock order matches place_order (cart rows, then variants) and a concurrent
  -- checkout cannot deadlock with an addition.
  perform 1
  from public.product_variants v
  where v.id = p_variant_id;

  if not found then
    raise exception 'NOT_FOUND'
      using errcode = 'P0001',
            detail = jsonb_build_object('variantId', p_variant_id)::text;
  end if;

  insert into public.cart_items as c (user_id, variant_id, quantity)
  values (v_user_id, p_variant_id, p_quantity)
  on conflict (user_id, variant_id) do update
    set quantity = c.quantity + excluded.quantity
  returning * into v_item;

  if v_item.quantity > v_max_quantity then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'reason', 'quantity_limit',
              'max', v_max_quantity
            )::text;
  end if;

  -- Lock the variant after the cart row. The stock read is stable for the rest
  -- of the transaction and follows the same order as the order RPCs.
  select v.* into v_variant
  from public.product_variants v
  where v.id = p_variant_id
  for update;

  if not found then
    raise exception 'NOT_FOUND'
      using errcode = 'P0001',
            detail = jsonb_build_object('variantId', p_variant_id)::text;
  end if;

  select p.* into v_product
  from public.products p
  where p.id = v_variant.product_id;

  if not found or not v_product.is_active then
    raise exception 'NOT_FOUND'
      using errcode = 'P0001',
            detail = jsonb_build_object('variantId', p_variant_id)::text;
  end if;

  if v_item.quantity > v_variant.stock then
    raise exception 'OUT_OF_STOCK'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'variantId', p_variant_id,
              'availableStock', v_variant.stock,
              'requestedQuantity', v_item.quantity
            )::text;
  end if;

  return v_item;
end;
$$;

comment on function public.add_cart_item(uuid, integer) is
  'Atomically adds a quantity to the caller cart, capped and checked against stock.';

revoke all on function public.add_cart_item(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_cart_item(uuid, integer) to authenticated;
