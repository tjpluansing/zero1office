-- Minimal stand-in for Supabase's auth schema so the migrations can be
-- tested on plain Postgres:  ./supabase/tests/run.sh
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  encrypted_password  text,
  raw_app_meta_data   jsonb default '{}'::jsonb,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  last_sign_in_at     timestamptz,
  created_at          timestamptz default now()
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create table auth.mfa_factors (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  status  text not null default 'verified'
);
