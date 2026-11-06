-- Shopping Assistant usage quotas.
--
-- The database keeps only counters: no conversation text, no measurements.
-- One accepted question consumes one unit; tool calls and provider failover do
-- not consume more. The limits and the time zone come from the server
-- configuration, so the functions accept them as arguments and are callable
-- only by the service role. Customers can neither read the counters nor call
-- the functions with limits of their own choosing.

create table public.ai_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  questions integer not null default 0 check (questions >= 0),
  primary key (user_id, day)
);

comment on table public.ai_usage_daily is
  'Accepted assistant questions per user and quota day. Counters only.';

create table public.ai_usage_minute (
  user_id uuid not null references auth.users (id) on delete cascade,
  minute timestamptz not null,
  questions integer not null default 0 check (questions >= 0),
  primary key (user_id, minute)
);

comment on table public.ai_usage_minute is
  'Accepted assistant questions per user and clock minute. Rows older than one hour are pruned.';

create table public.ai_usage_global (
  day date primary key,
  questions integer not null default 0 check (questions >= 0)
);

comment on table public.ai_usage_global is
  'Accepted assistant questions across all users per quota day.';

alter table public.ai_usage_daily enable row level security;
alter table public.ai_usage_minute enable row level security;
alter table public.ai_usage_global enable row level security;

revoke all on public.ai_usage_daily, public.ai_usage_minute, public.ai_usage_global
  from public, anon, authenticated;

create or replace function public.ai_quota_validate(
  p_user_id uuid,
  p_user_day_limit integer,
  p_user_minute_limit integer,
  p_global_day_limit integer,
  p_time_zone text
)
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  if coalesce(p_user_day_limit, 0) < 1
     or coalesce(p_user_minute_limit, 0) < 1
     or coalesce(p_global_day_limit, 0) < 1
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'VALIDATION_ERROR'
      using errcode = 'P0001',
            detail = jsonb_build_object('reason', 'quota_settings')::text;
  end if;

  return (now() at time zone p_time_zone)::date;
end;
$$;

revoke all on function public.ai_quota_validate(uuid, integer, integer, integer, text)
  from public, anon, authenticated;

-- Consumes one question for a user when every limit allows it. The global row
-- is locked first, so concurrent requests are serialized and the counters can
-- never pass a limit. A rejected request changes nothing.
create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_user_day_limit integer,
  p_user_minute_limit integer,
  p_global_day_limit integer,
  p_time_zone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := public.ai_quota_validate(
    p_user_id, p_user_day_limit, p_user_minute_limit, p_global_day_limit, p_time_zone
  );
  v_minute timestamptz := date_trunc('minute', now());
  v_global integer;
  v_user_day integer;
  v_user_minute integer;
begin
  insert into public.ai_usage_global (day) values (v_day) on conflict (day) do nothing;

  select g.questions into v_global
  from public.ai_usage_global g
  where g.day = v_day
  for update;

  insert into public.ai_usage_daily (user_id, day) values (p_user_id, v_day)
  on conflict (user_id, day) do nothing;

  select d.questions into v_user_day
  from public.ai_usage_daily d
  where d.user_id = p_user_id and d.day = v_day
  for update;

  insert into public.ai_usage_minute (user_id, minute) values (p_user_id, v_minute)
  on conflict (user_id, minute) do nothing;

  select m.questions into v_user_minute
  from public.ai_usage_minute m
  where m.user_id = p_user_id and m.minute = v_minute
  for update;

  if v_global >= p_global_day_limit then
    return jsonb_build_object(
      'allowed', false, 'reason', 'global',
      'remainingToday', greatest(p_user_day_limit - v_user_day, 0)
    );
  end if;

  if v_user_day >= p_user_day_limit then
    return jsonb_build_object('allowed', false, 'reason', 'user_day', 'remainingToday', 0);
  end if;

  if v_user_minute >= p_user_minute_limit then
    return jsonb_build_object(
      'allowed', false, 'reason', 'user_minute',
      'remainingToday', p_user_day_limit - v_user_day
    );
  end if;

  update public.ai_usage_global set questions = questions + 1 where day = v_day;
  update public.ai_usage_daily set questions = questions + 1
  where user_id = p_user_id and day = v_day;
  update public.ai_usage_minute set questions = questions + 1
  where user_id = p_user_id and minute = v_minute;

  delete from public.ai_usage_minute
  where user_id = p_user_id and minute < now() - interval '1 hour';

  return jsonb_build_object(
    'allowed', true, 'reason', null,
    'remainingToday', p_user_day_limit - v_user_day - 1
  );
end;
$$;

comment on function public.consume_ai_quota(uuid, integer, integer, integer, text) is
  'Atomically consumes one assistant question for a user within the daily, per-minute, and global limits.';

revoke all on function public.consume_ai_quota(uuid, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, integer, integer, text)
  to service_role;

-- Reads the remaining questions for a user without consuming one.
create or replace function public.get_ai_quota(
  p_user_id uuid,
  p_user_day_limit integer,
  p_user_minute_limit integer,
  p_global_day_limit integer,
  p_time_zone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := public.ai_quota_validate(
    p_user_id, p_user_day_limit, p_user_minute_limit, p_global_day_limit, p_time_zone
  );
  v_global integer;
  v_user_day integer;
begin
  select coalesce((select g.questions from public.ai_usage_global g where g.day = v_day), 0)
  into v_global;

  select coalesce(
    (select d.questions from public.ai_usage_daily d
     where d.user_id = p_user_id and d.day = v_day),
    0
  )
  into v_user_day;

  return jsonb_build_object(
    'remainingToday', greatest(p_user_day_limit - v_user_day, 0),
    'globalPaused', v_global >= p_global_day_limit
  );
end;
$$;

comment on function public.get_ai_quota(uuid, integer, integer, integer, text) is
  'Returns the remaining assistant questions for a user today and whether the global limit is reached.';

revoke all on function public.get_ai_quota(uuid, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.get_ai_quota(uuid, integer, integer, integer, text)
  to service_role;
