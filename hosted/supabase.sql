-- Zero1Office on app.ask-karla.com: everything the app stores, behind sign-in.
-- Paste this whole file into Supabase > SQL Editor and run it once. Safe to run again.
--
-- The app keeps its records as documents (path -> JSON), the same shape it used on claude.ai.
-- Only people with an active account in Settings > Users (document z1users/<email key>) can read or write.
-- Accounts, roles and the company profile can be changed only by Super Admins; people can edit their own
-- name, title, mobile and photo.

create table if not exists public.app_docs (
  path        text primary key check (path ~ '^[A-Za-z0-9_:.-]+(/[A-Za-z0-9_:.-]+)*$' and char_length(path) <= 300),
  parent      text generated always as (regexp_replace(path, '/[^/]+$', '')) stored,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists app_docs_parent on public.app_docs (parent);

create or replace function public.z1_key(p_email text) returns text
language sql immutable as $$ select regexp_replace(lower(coalesce(p_email, '')), '[^a-z0-9]', '_', 'g') $$;

create or replace function public.z1_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt()->>'email', '')) $$;

create or replace function public.z1_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select data from app_docs where path = 'z1users/' || z1_key(z1_email())
$$;

create or replace function public.z1_member() returns boolean
language sql stable security definer set search_path = public as $$
  select z1_email() like '%@ask-karla.com'
     and coalesce(z1_me()->>'status', '') <> 'suspended'
     and z1_me() is not null
$$;

create or replace function public.z1_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select z1_member() and z1_me()->>'role' = 'Super Admin'
$$;

-- Who may change accounts and the company profile.
create or replace function public.z1_guard_docs() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_path text := coalesce(new.path, old.path);
  v_own  text := 'z1users/' || z1_key(z1_email());
  v_supers int;
begin
  if current_setting('app.z1_trusted', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op <> 'DELETE' then
    new.updated_at := now();
    new.updated_by := z1_email();
  end if;
  if v_path like 'z1users/%' then
    if tg_op <> 'DELETE' then
      if lower(coalesce(new.data->>'email', '')) not like '%@ask-karla.com'
         or 'z1users/' || z1_key(new.data->>'email') <> new.path then
        raise exception 'Accounts need an @ask-karla.com email that matches the record' using errcode = '42501';
      end if;
      new.data := new.data - 'pw';  -- passwords are kept by Supabase Auth, never in this table
    end if;
    if not z1_admin() then
      if tg_op <> 'UPDATE' or v_path <> v_own
         or (new.data->'role') is distinct from (old.data->'role')
         or (new.data->'pages') is distinct from (old.data->'pages')
         or (new.data->'status') is distinct from (old.data->'status')
         or (new.data->'email') is distinct from (old.data->'email') then
        raise exception 'Only a Super Admin can change accounts' using errcode = '42501';
      end if;
    else
      -- never leave the office without an active Super Admin
      select count(*) into v_supers from app_docs
       where path like 'z1users/%' and data->>'role' = 'Super Admin' and coalesce(data->>'status', '') <> 'suspended'
         and path <> v_path;
      if v_supers = 0 and (tg_op = 'DELETE' or new.data->>'role' <> 'Super Admin' or coalesce(new.data->>'status', '') = 'suspended') then
        raise exception 'Keep at least one active Super Admin' using errcode = '42501';
      end if;
    end if;
  elsif v_path = 'meta/company' and not z1_admin() then
    raise exception 'Only a Super Admin can change the company profile' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists z1_guard_docs on public.app_docs;
create trigger z1_guard_docs before insert or update or delete on public.app_docs
  for each row execute function public.z1_guard_docs();

alter table public.app_docs enable row level security;
drop policy if exists app_docs_read on public.app_docs;
drop policy if exists app_docs_write on public.app_docs;
create policy app_docs_read on public.app_docs for select to authenticated using (public.z1_member());
create policy app_docs_write on public.app_docs for all to authenticated using (public.z1_member()) with check (public.z1_member());
revoke all on public.app_docs from anon;
grant select, insert, update, delete on public.app_docs to authenticated;
grant execute on function public.z1_member(), public.z1_admin() to authenticated;

-- DEMO | LIVE: people who aren't signed in may read the demo settings (meta/demo) and nothing else.

create or replace function public.z1_demo() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('on', coalesce((data->>'on')::boolean, true), 'pages', data->'pages')
    from app_docs where path = 'meta/demo'
$$;
revoke all on function public.z1_demo() from public;
grant execute on function public.z1_demo() to anon, authenticated;

create or replace function public.z1_guard_demo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.z1_trusted', true) = 'on' then return coalesce(new, old); end if;
  if coalesce(new.path, old.path) = 'meta/demo' and not z1_admin() then
    raise exception 'Only a Super Admin can change the demo settings' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists z1_guard_demo on public.app_docs;
create trigger z1_guard_demo before insert or update or delete on public.app_docs
  for each row execute function public.z1_guard_demo();

-- Live updates between people
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'app_docs') then
    alter publication supabase_realtime add table public.app_docs;
  end if;
end $$;

-- Files, photos and the logo: a private bucket, signed-in members only.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('files', 'files', false, 20971520) on conflict (id) do nothing;
    drop policy if exists z1_files_read on storage.objects;
    drop policy if exists z1_files_add on storage.objects;
    drop policy if exists z1_files_remove on storage.objects;
    create policy z1_files_read on storage.objects for select to authenticated using (bucket_id = 'files' and public.z1_member());
    create policy z1_files_add on storage.objects for insert to authenticated with check (bucket_id = 'files' and public.z1_member());
    create policy z1_files_remove on storage.objects for delete to authenticated using (bucket_id = 'files' and public.z1_member());
  end if;
end $$;

-- The two Super Admins. Each signs in with Microsoft or with a password set from Settings > Users.
select set_config('app.z1_trusted', 'on', false);
insert into public.app_docs (path, data) values
  ('z1users/paolo_ask_karla_com', jsonb_build_object('email', 'paolo@ask-karla.com', 'name', 'Paolo', 'title', '', 'phone', '', 'photo', '',
     'role', 'Super Admin', 'status', 'active', 'pages', '[]'::jsonb, 'mustChange', false, 'created', now()::text, 'lastLogin', '')),
  ('z1users/karla_ask_karla_com', jsonb_build_object('email', 'karla@ask-karla.com', 'name', 'Karla', 'title', 'Licensed agent', 'phone', '', 'photo', '',
     'role', 'Super Admin', 'status', 'active', 'pages', '[]'::jsonb, 'mustChange', false, 'created', now()::text, 'lastLogin', ''))
on conflict (path) do nothing;
select set_config('app.z1_trusted', '', false);
