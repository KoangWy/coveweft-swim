-- Customer and administrator profiles.
--
-- A profile is created from the auth user metadata. The trigger rejects a
-- sign-up that does not carry a privacy policy version and stores the consent
-- timestamp and version as evidence.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  full_name text,
  phone text,
  default_address text,
  privacy_consent_at timestamptz,
  privacy_policy_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_consent_check check (
    (privacy_consent_at is null) = (privacy_policy_version is null)
  )
);

comment on table public.profiles is
  'One row per auth user. role is customer unless an administrator is provisioned.';

comment on column public.profiles.privacy_consent_at is
  'Server timestamp of the privacy policy consent given at sign-up.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'True when the current request belongs to an administrator.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy_version text;
  v_full_name text;
  v_phone text;
  v_default_address text;
begin
  v_policy_version := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'privacy_policy_version', '')),
    ''
  );

  if v_policy_version is null then
    raise exception 'CONSENT_REQUIRED'
      using errcode = 'P0001',
            detail = 'privacy_policy_version is required to create an account';
  end if;

  v_full_name := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'fullName',
        ''
      )
    ),
    ''
  );
  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  v_default_address := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data ->> 'default_address',
        new.raw_user_meta_data ->> 'defaultAddress',
        ''
      )
    ),
    ''
  );

  insert into public.profiles (
    id,
    full_name,
    phone,
    default_address,
    privacy_consent_at,
    privacy_policy_version
  )
  values (
    new.id,
    v_full_name,
    v_phone,
    v_default_address,
    now(),
    v_policy_version
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'FORBIDDEN'
      using errcode = 'P0001',
            detail = 'Only administrators can change a profile role';
  end if;

  if (new.privacy_consent_at is distinct from old.privacy_consent_at
      or new.privacy_policy_version is distinct from old.privacy_policy_version)
     and auth.uid() is not null then
    raise exception 'FORBIDDEN'
      using errcode = 'P0001',
            detail = 'Consent evidence cannot be changed from a signed-in session';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;

create trigger protect_profile_fields
before update on public.profiles
for each row
execute function public.protect_profile_fields();

drop trigger if exists set_profiles_updated_at on public.profiles;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();
