-- =====================================================================
-- Example business table wired to the permission matrix.
-- Copy this pattern for quotes, billing, reports, etc.
--
-- Ask Karla is a bridge between clients and insurers, so keep this table
-- to the minimum needed to route work (no medical or ID details).
-- =====================================================================

create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  company      text,
  email        citext,
  phone        text,
  insurer      text,
  product      text,
  status       text not null default 'lead' check (status in ('lead','applying','active','lapsed')),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now()
);

alter table public.clients enable row level security;
revoke all on public.clients from anon, authenticated;
grant select, insert, update, delete on public.clients to authenticated;

create policy clients_select on public.clients for select to authenticated
  using (public.has_permission('clients.view'));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.has_permission('clients.create'));
create policy clients_update on public.clients for update to authenticated
  using (public.has_permission('clients.edit'))
  with check (public.has_permission('clients.edit'));
create policy clients_delete on public.clients for delete to authenticated
  using (public.has_permission('clients.delete'));

-- Exports go through a function so "Export" is enforced by the server,
-- logged, and cannot be reproduced by someone who only has "View".
create or replace function public.export_clients()
returns setof public.clients
language plpgsql stable security definer set search_path = public
as $$
begin
  if not has_permission('clients.export') then
    raise exception 'You do not have permission to export clients' using errcode = '42501';
  end if;
  return query select * from clients order by full_name;
end;
$$;

-- Logging an export is a write, so it lives in its own (volatile) function.
create or replace function public.log_export(p_what text, p_rows int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not has_permission(p_what || '.export') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into audit_log (actor_id, actor_email, action, target_type, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()),
          'export', p_what, jsonb_build_object('rows', p_rows));
end;
$$;

create or replace function public.export_audit_log(p_since timestamptz default now() - interval '90 days')
returns setof public.audit_log
language plpgsql stable security definer set search_path = public
as $$
begin
  if not has_permission('audit_log.export') then
    raise exception 'You do not have permission to export the audit log' using errcode = '42501';
  end if;
  return query select * from audit_log where at >= p_since order by at desc;
end;
$$;

revoke all on function public.export_clients() from public, anon;
revoke all on function public.log_export(text, int) from public, anon;
revoke all on function public.export_audit_log(timestamptz) from public, anon;
grant execute on function public.export_clients() to authenticated;
grant execute on function public.log_export(text, int) to authenticated;
grant execute on function public.export_audit_log(timestamptz) to authenticated;
