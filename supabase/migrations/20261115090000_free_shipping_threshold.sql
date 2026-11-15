-- Free Standard shipping from 400,000 VND, the same threshold as the brand's
-- own store.
--
-- The update only touches the row while it still holds the previous default,
-- so a threshold an operator already changed is kept. Orders placed earlier
-- keep the shipping fee saved on them.

alter table public.store_settings
  alter column free_shipping_threshold_vnd set default 400000;

update public.store_settings
set free_shipping_threshold_vnd = 400000
where id = 1
  and free_shipping_threshold_vnd = 500000;
