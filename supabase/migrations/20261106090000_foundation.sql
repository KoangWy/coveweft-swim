-- Shared extensions and helpers used by the schema.
--
-- Statements are written so the migration can be replayed on a database that
-- already contains the objects without losing data.

create schema if not exists extensions;

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() is only stable, so generated columns and trigram indexes need an
-- immutable wrapper. The dictionary is created by the extension in the
-- extensions schema.
create or replace function public.immutable_unaccent(value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value);
$$;

comment on function public.immutable_unaccent(text) is
  'Immutable wrapper around unaccent for generated columns and search indexes.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger that stamps updated_at with the transaction time.';
