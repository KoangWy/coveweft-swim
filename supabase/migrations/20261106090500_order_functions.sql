-- Order, payment, expiry, and stock functions.
--
-- Every function that changes an order locks the order row or the affected
-- variant rows, re-checks its preconditions, and runs in a single transaction.
-- Errors use stable message codes so the service layer can map them to the
-- shared ErrorCode union.

create or replace function public.place_order(
  p_idempotency_key text,
  p_recipient_name text,
  p_recipient_phone text,
  p_shipping_address text,
  p_shipping_method text,
  p_payment_method text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders;
  v_existing public.orders;
  v_settings public.store_settings;
  v_now timestamptz := now();
  v_subtotal integer := 0;
  v_shipping_fee integer := 0;
  v_total integer := 0;
  v_cart_count integer := 0;
  v_unavailable uuid[] := array[]::uuid[];
  v_line record;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_idempotency_key is null
     or length(btrim(p_idempotency_key)) = 0
     or length(p_idempotency_key) > 100 then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'idempotency_key must be between 1 and 100 characters';
  end if;

  if p_recipient_name is null
     or length(btrim(p_recipient_name)) = 0
     or length(p_recipient_name) > 200 then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'recipient_name is invalid';
  end if;

  if p_recipient_phone is null
     or length(btrim(p_recipient_phone)) = 0
     or length(p_recipient_phone) > 30 then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'recipient_phone is invalid';
  end if;

  if p_shipping_address is null
     or length(btrim(p_shipping_address)) = 0
     or length(p_shipping_address) > 500 then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'shipping_address is invalid';
  end if;

  if p_shipping_method is null or p_shipping_method not in ('standard', 'express') then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'shipping_method is invalid';
  end if;

  if p_payment_method is null or p_payment_method not in ('cod', 'bank_transfer') then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'payment_method is invalid';
  end if;

  -- Fast path for a repeated request.
  select * into v_existing
  from public.orders
  where user_id = v_user_id
    and idempotency_key = btrim(p_idempotency_key);

  if found then
    return v_existing;
  end if;

  -- Lock cart rows, then variants, then products in stable id order. This
  -- serialises concurrent checkouts for one customer and avoids deadlocks when
  -- two customers compete for the last item.
  perform 1
  from public.cart_items
  where user_id = v_user_id
  order by variant_id
  for update;

  perform 1
  from public.product_variants
  where id in (
    select variant_id
    from public.cart_items
    where user_id = v_user_id
  )
  order by id
  for update;

  perform 1
  from public.products
  where id in (
    select v.product_id
    from public.product_variants v
    join public.cart_items c on c.variant_id = v.id
    where c.user_id = v_user_id
  )
  order by id
  for update;

  -- Re-check after the locks: a concurrent request with the same key may have
  -- committed while this one waited.
  select * into v_existing
  from public.orders
  where user_id = v_user_id
    and idempotency_key = btrim(p_idempotency_key);

  if found then
    return v_existing;
  end if;

  for v_line in
    select
      c.variant_id,
      c.quantity,
      v.stock,
      v.product_id,
      v.variant_sku,
      v.option_label,
      p.sku,
      p.name,
      p.price_vnd,
      p.is_active
    from public.cart_items c
    join public.product_variants v on v.id = c.variant_id
    join public.products p on p.id = v.product_id
    where c.user_id = v_user_id
    order by v.id
  loop
    v_cart_count := v_cart_count + 1;

    if not v_line.is_active or v_line.stock < v_line.quantity then
      v_unavailable := array_append(v_unavailable, v_line.variant_id);
    else
      v_subtotal := v_subtotal + (v_line.price_vnd * v_line.quantity);
    end if;
  end loop;

  if v_cart_count = 0 then
    raise exception 'CART_CHANGED'
      using errcode = 'P0001',
            detail = '{"reason":"empty"}';
  end if;

  if array_length(v_unavailable, 1) is not null then
    raise exception 'OUT_OF_STOCK'
      using errcode = 'P0001',
            detail = jsonb_build_object('variantIds', to_jsonb(v_unavailable))::text;
  end if;

  select * into v_settings from public.store_settings where id = 1;

  if not found then
    raise exception 'INTERNAL'
      using errcode = 'P0001',
            detail = 'store_settings row is missing';
  end if;

  if p_shipping_method = 'standard' then
    if v_subtotal >= v_settings.free_shipping_threshold_vnd then
      v_shipping_fee := 0;
    else
      v_shipping_fee := v_settings.standard_shipping_fee_vnd;
    end if;
  else
    v_shipping_fee := v_settings.express_shipping_fee_vnd;
  end if;

  v_total := v_subtotal + v_shipping_fee;

  insert into public.orders (
    user_id,
    idempotency_key,
    status,
    payment_method,
    payment_status,
    recipient_name,
    recipient_phone,
    shipping_address,
    shipping_method,
    shipping_fee_vnd,
    items_subtotal_vnd,
    total_vnd,
    payment_due_at,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    btrim(p_idempotency_key),
    'pending',
    p_payment_method,
    'unpaid',
    btrim(p_recipient_name),
    btrim(p_recipient_phone),
    btrim(p_shipping_address),
    p_shipping_method,
    v_shipping_fee,
    v_subtotal,
    v_total,
    case
      when p_payment_method = 'bank_transfer'
        then v_now + make_interval(mins => v_settings.payment_window_minutes)
      else null
    end,
    v_now,
    v_now
  )
  on conflict (user_id, idempotency_key) do nothing
  returning * into v_order;

  if not found then
    select * into v_order
    from public.orders
    where user_id = v_user_id
      and idempotency_key = btrim(p_idempotency_key);

    if not found then
      raise exception 'CONFLICT'
        using errcode = 'P0001',
              detail = 'The idempotency key is already in use';
    end if;

    return v_order;
  end if;

  insert into public.order_items (
    order_id,
    variant_id,
    product_id,
    sku,
    variant_sku,
    product_name,
    option_label,
    unit_price_vnd,
    quantity,
    created_at
  )
  select
    v_order.id,
    v.id,
    p.id,
    p.sku,
    v.variant_sku,
    p.name,
    v.option_label,
    p.price_vnd,
    c.quantity,
    v_now
  from public.cart_items c
  join public.product_variants v on v.id = c.variant_id
  join public.products p on p.id = v.product_id
  where c.user_id = v_user_id;

  update public.product_variants v
  set stock = v.stock - c.quantity,
      updated_at = v_now
  from public.cart_items c
  where c.user_id = v_user_id
    and v.id = c.variant_id;

  delete from public.cart_items where user_id = v_user_id;

  insert into public.order_events (
    order_id,
    from_status,
    to_status,
    from_payment_status,
    to_payment_status,
    actor_id,
    actor_role
  )
  values (
    v_order.id,
    null,
    'pending',
    null,
    'unpaid',
    v_user_id,
    'customer'
  );

  return v_order;
end;
$$;

comment on function public.place_order(text, text, text, text, text, text) is
  'Creates an order from the caller cart, deducts stock, and clears the cart.';

create or replace function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders;
  v_old_status text;
  v_old_payment_status text;
  v_item record;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  v_old_status := v_order.status;
  v_old_payment_status := v_order.payment_status;

  update public.orders
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_user_id,
      payment_status = case
        when v_order.payment_status = 'paid' then 'refunded'
        else v_order.payment_status
      end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  for v_item in
    select variant_id, quantity
    from public.order_items
    where order_id = v_order.id
      and variant_id is not null
    order by variant_id
  loop
    update public.product_variants
    set stock = stock + v_item.quantity,
        updated_at = now()
    where id = v_item.variant_id;
  end loop;

  insert into public.order_events (
    order_id,
    from_status,
    to_status,
    from_payment_status,
    to_payment_status,
    actor_id,
    actor_role
  )
  values (
    v_order.id,
    v_old_status,
    'cancelled',
    v_old_payment_status,
    v_order.payment_status,
    v_user_id,
    'customer'
  );

  return v_order;
end;
$$;

comment on function public.cancel_order(uuid) is
  'Cancels a pending order owned by the caller and restores its stock once.';

create or replace function public.record_payment_attempt(p_order_id uuid, p_outcome text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders;
  v_old_payment_status text;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_outcome is null or p_outcome not in ('succeeded', 'failed') then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'outcome is invalid';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_order.payment_method <> 'bank_transfer' then
    raise exception 'PAYMENT_NOT_ALLOWED'
      using errcode = 'P0001',
            detail = 'Only bank transfer orders accept simulated payments';
  end if;

  if v_order.payment_due_at is null or v_order.payment_due_at <= now() then
    raise exception 'PAYMENT_EXPIRED' using errcode = 'P0001';
  end if;

  if v_order.status <> 'pending' or v_order.payment_status <> 'unpaid' then
    raise exception 'PAYMENT_NOT_ALLOWED'
      using errcode = 'P0001',
            detail = 'The order is not waiting for a payment';
  end if;

  v_old_payment_status := v_order.payment_status;

  insert into public.payment_attempts (order_id, outcome, created_by)
  values (v_order.id, p_outcome, v_user_id);

  if p_outcome = 'succeeded' then
    update public.orders
    set payment_status = 'paid',
        updated_at = now()
    where id = v_order.id
    returning * into v_order;

    insert into public.order_events (
      order_id,
      from_status,
      to_status,
      from_payment_status,
      to_payment_status,
      actor_id,
      actor_role
    )
    values (
      v_order.id,
      v_order.status,
      v_order.status,
      v_old_payment_status,
      'paid',
      v_user_id,
      'customer'
    );
  end if;

  return v_order;
end;
$$;

comment on function public.record_payment_attempt(uuid, text) is
  'Records one simulated bank transfer attempt and marks a success as paid.';

create or replace function public.admin_transition_order(p_order_id uuid, p_action text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders;
  v_old_status text;
  v_old_payment_status text;
  v_item record;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  if not public.is_admin() then
    raise exception 'FORBIDDEN'
      using errcode = 'P0001',
            detail = 'Administrator role required';
  end if;

  if p_action is null or p_action not in ('confirm', 'ship', 'deliver', 'cancel') then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'action is invalid';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  v_old_status := v_order.status;
  v_old_payment_status := v_order.payment_status;

  if p_action = 'confirm' then
    if v_order.status <> 'pending' then
      raise exception 'ORDER_STATE_CONFLICT'
        using errcode = 'P0001',
              detail = 'confirm requires a pending order';
    end if;

    if v_order.payment_method = 'bank_transfer' and v_order.payment_status <> 'paid' then
      raise exception 'PAYMENT_NOT_ALLOWED'
        using errcode = 'P0001',
              detail = 'Bank transfer must be paid before confirmation';
    end if;

    update public.orders
    set status = 'confirmed',
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
  elsif p_action = 'ship' then
    if v_order.status <> 'confirmed' then
      raise exception 'ORDER_STATE_CONFLICT'
        using errcode = 'P0001',
              detail = 'ship requires a confirmed order';
    end if;

    update public.orders
    set status = 'shipping',
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
  elsif p_action = 'deliver' then
    if v_order.status <> 'shipping' then
      raise exception 'ORDER_STATE_CONFLICT'
        using errcode = 'P0001',
              detail = 'deliver requires a shipping order';
    end if;

    update public.orders
    set status = 'delivered',
        payment_status = case
          when v_order.payment_method = 'cod' and v_order.payment_status = 'unpaid' then 'paid'
          else v_order.payment_status
        end,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
  else
    if v_order.status not in ('pending', 'confirmed') then
      raise exception 'ORDER_STATE_CONFLICT'
        using errcode = 'P0001',
              detail = 'cancel requires a pending or confirmed order';
    end if;

    update public.orders
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = v_user_id,
        payment_status = case
          when v_order.payment_status = 'paid' then 'refunded'
          else v_order.payment_status
        end,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;

    for v_item in
      select variant_id, quantity
      from public.order_items
      where order_id = v_order.id
        and variant_id is not null
      order by variant_id
    loop
      update public.product_variants
      set stock = stock + v_item.quantity,
          updated_at = now()
      where id = v_item.variant_id;
    end loop;
  end if;

  insert into public.order_events (
    order_id,
    from_status,
    to_status,
    from_payment_status,
    to_payment_status,
    actor_id,
    actor_role
  )
  values (
    v_order.id,
    v_old_status,
    v_order.status,
    v_old_payment_status,
    v_order.payment_status,
    v_user_id,
    'admin'
  );

  return v_order;
end;
$$;

comment on function public.admin_transition_order(uuid, text) is
  'Applies an administrator order transition after re-checking the current state.';

create or replace function public.expire_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_item record;
  v_expired integer := 0;
begin
  for v_order in
    select *
    from public.orders
    where payment_method = 'bank_transfer'
      and status = 'pending'
      and payment_status = 'unpaid'
      and payment_due_at is not null
      and payment_due_at <= now()
    order by id
    for update skip locked
  loop
    if v_order.status <> 'pending'
       or v_order.payment_status <> 'unpaid'
       or v_order.payment_due_at is null
       or v_order.payment_due_at > now() then
      continue;
    end if;

    update public.orders
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = null,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;

    for v_item in
      select variant_id, quantity
      from public.order_items
      where order_id = v_order.id
        and variant_id is not null
      order by variant_id
    loop
      update public.product_variants
      set stock = stock + v_item.quantity,
          updated_at = now()
      where id = v_item.variant_id;
    end loop;

    insert into public.order_events (
      order_id,
      from_status,
      to_status,
      from_payment_status,
      to_payment_status,
      actor_id,
      actor_role,
      reason
    )
    values (
      v_order.id,
      'pending',
      'cancelled',
      'unpaid',
      'unpaid',
      null,
      'system',
      'payment_window_expired'
    );

    v_expired := v_expired + 1;
  end loop;

  return v_expired;
end;
$$;

comment on function public.expire_unpaid_orders() is
  'Cancels unpaid bank transfer orders past their payment deadline and restores stock.';

create or replace function public.admin_adjust_stock(
  p_variant_id uuid,
  p_delta integer default null,
  p_stock integer default null,
  p_reason text default null
)
returns public.product_variants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_variant public.product_variants;
  v_stock_before integer;
  v_new_stock integer;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  if not public.is_admin() then
    raise exception 'FORBIDDEN'
      using errcode = 'P0001',
            detail = 'Administrator role required';
  end if;

  if (p_delta is null) = (p_stock is null) then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'Provide exactly one of delta or stock';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 500 then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'reason is required';
  end if;

  select * into v_variant
  from public.product_variants
  where id = p_variant_id
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  v_stock_before := v_variant.stock;
  v_new_stock := coalesce(p_stock, v_stock_before + p_delta);

  if v_new_stock < 0 then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = 'stock cannot be negative';
  end if;

  update public.product_variants
  set stock = v_new_stock,
      updated_at = now()
  where id = v_variant.id
  returning * into v_variant;

  insert into public.stock_adjustments (
    variant_id,
    delta,
    stock_before,
    stock_after,
    reason,
    actor_id
  )
  values (
    v_variant.id,
    v_new_stock - v_stock_before,
    v_stock_before,
    v_new_stock,
    btrim(p_reason),
    v_user_id
  );

  return v_variant;
end;
$$;

comment on function public.admin_adjust_stock(uuid, integer, integer, text) is
  'Administrator stock adjustment by delta or absolute value, with an audit row.';

revoke all on function public.place_order(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.place_order(text, text, text, text, text, text)
  to anon, authenticated, service_role;

revoke all on function public.cancel_order(uuid) from public, anon, authenticated;
grant execute on function public.cancel_order(uuid) to anon, authenticated, service_role;

revoke all on function public.record_payment_attempt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_payment_attempt(uuid, text)
  to anon, authenticated, service_role;

revoke all on function public.admin_transition_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_transition_order(uuid, text)
  to anon, authenticated, service_role;

revoke all on function public.expire_unpaid_orders() from public, anon, authenticated;
grant execute on function public.expire_unpaid_orders() to service_role;

revoke all on function public.admin_adjust_stock(uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_stock(uuid, integer, integer, text)
  to anon, authenticated, service_role;
