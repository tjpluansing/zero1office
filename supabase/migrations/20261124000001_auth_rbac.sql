-- =====================================================================
-- Zero1Office: authentication profiles + role-based access control (RBAC)
--
-- Model
--   permissions            catalog of "<page>.<action>" keys (e.g. clients.export)
--   roles                  presets (super_admin, agent, assistant, no_access)
--   role_permissions       which keys each preset grants
--   user_permission_overrides  per-user GRANT / DENY on top of the role
--   profiles               one row per auth.users row: role, status, flags
--   audit_log              append-only record of who changed what
--
-- Effective permissions = (role grants  ∪  user grants)  −  user denies,
-- then any action whose page has no ".view" is dropped. Super admins get
-- every key. Suspended / pending users and users who still have to change
-- a temporary password get nothing.
--
-- Every table below has row level security, and every policy calls
-- public.has_permission(). The browser hides menu items for convenience;
-- this file is what actually blocks access.
-- =====================================================================

create extension if not exists citext;

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
create table public.auth_settings (
  id                      boolean primary key default true check (id),
  allowed_email_domains   text[]  not null default array['ask-karla.com'],
  session_idle_minutes    int     not null default 30
);
insert into public.auth_settings default values;

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------
create table public.permissions (
  key          text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  page         text not null,
  page_label   text not null,
  action       text not null check (action in ('view','create','edit','delete','export','approve')),
  description  text not null,
  sort         int  not null default 0,
  unique (page, action)
);

create table public.roles (
  id           text primary key check (id ~ '^[a-z_]+$'),
  name         text not null,
  description  text not null default '',
  is_super     boolean not null default false,
  is_system    boolean not null default true,
  sort         int not null default 0
);

create table public.role_permissions (
  role_id         text not null references public.roles(id) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 citext not null unique,
  full_name             text not null default '',
  role_id               text not null default 'no_access' references public.roles(id),
  status                text not null default 'pending'
                          check (status in ('active','suspended','pending')),
  must_change_password  boolean not null default false,
  -- snapshot of auth.users.encrypted_password when a temp password was set;
  -- complete_password_change() only clears the flag once the hash differs.
  pw_marker             text,
  last_login_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null
);

create table public.user_permission_overrides (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  effect          text not null check (effect in ('grant','deny')),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null,
  primary key (user_id, permission_key)
);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  action       text not null,
  target_type  text not null,
  target_id    text,
  details      jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_target_idx on public.audit_log (target_type, target_id);

-- ---------------------------------------------------------------------
-- Core functions
-- ---------------------------------------------------------------------
create or replace function public.effective_permissions(p_user uuid)
returns setof text
language sql stable security definer set search_path = public
as $$
  with me as (
    select p.id, r.is_super, p.role_id
    from profiles p join roles r on r.id = p.role_id
    where p.id = p_user
      and p.status = 'active'
      and p.must_change_password = false
  ),
  raw as (
    select k.key from permissions k, me where me.is_super
    union
    select rp.permission_key from role_permissions rp join me on rp.role_id = me.role_id
    union
    select o.permission_key from user_permission_overrides o join me on o.user_id = me.id
      where o.effect = 'grant'
    except
    select o.permission_key from user_permission_overrides o join me on o.user_id = me.id
      where o.effect = 'deny' and not me.is_super
  )
  select raw.key
  from raw join permissions k on k.key = raw.key
  where k.action = 'view'
     or exists (select 1 from raw v where v.key = k.page || '.view');
$$;

create or replace function public.has_permission(p_key text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from effective_permissions(auth.uid()) e where e = p_key);
$$;

create or replace function public.is_super_admin(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles p join roles r on r.id = p.role_id
    where p.id = p_user and r.is_super and p.status = 'active'
  );
$$;

-- What the browser loads after sign-in. Returns the profile even when the
-- permission list is empty, so the app can route to /change-password,
-- /pending or show "suspended".
create or replace function public.my_access()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'role_id', p.role_id,
    'role_name', r.name,
    'is_super', r.is_super and p.status = 'active',
    'status', p.status,
    'must_change_password', p.must_change_password,
    'last_login_at', p.last_login_at,
    'idle_minutes', (select session_idle_minutes from auth_settings),
    'permissions', coalesce(
       (select jsonb_agg(e order by e) from effective_permissions(p.id) e), '[]'::jsonb)
  )
  from profiles p join roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

-- Called by the browser right after supabase.auth.updateUser({password}).
create or replace function public.complete_password_change()
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_marker text;
  v_hash   text;
begin
  select pw_marker into v_marker from public.profiles where id = auth.uid();
  select encrypted_password into v_hash from auth.users where id = auth.uid();
  if v_hash is null then
    raise exception 'No password set' using errcode = '22023';
  end if;
  if v_marker is not null and v_marker = v_hash then
    raise exception 'Choose a new password first' using errcode = '22023';
  end if;
  perform set_config('app.trusted', 'on', true);
  update public.profiles
     set must_change_password = false, pw_marker = null, updated_at = now()
   where id = auth.uid();
  insert into public.audit_log (actor_id, actor_email, action, target_type, target_id)
  select auth.uid(), email, 'password.changed', 'user', id::text
  from public.profiles where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- auth.users hooks: create profile, keep last_login_at in sync
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_domains text[];
  v_meta    jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_role    text  := 'no_access';
  v_status  text  := 'pending';
  v_force   boolean := false;
begin
  select allowed_email_domains into v_domains from public.auth_settings;
  if new.email is null
     or not (lower(split_part(new.email, '@', 2)) = any (select lower(unnest(v_domains)))) then
    raise exception 'Sign-in is limited to %', array_to_string(v_domains, ', ')
      using errcode = '42501';
  end if;

  -- raw_app_meta_data can only be written with the service role key
  -- (admin-users function / seed script), never by the user themselves.
  if v_meta ? 'z1_role' then
    v_role   := v_meta->>'z1_role';
    v_status := 'active';
    v_force  := coalesce((v_meta->>'z1_force_password_change')::boolean, false);
  end if;

  perform set_config('app.trusted', 'on', true);
  insert into public.profiles (id, email, full_name, role_id, status,
                               must_change_password, pw_marker, created_by)
  values (
    new.id, new.email,
    coalesce(v_meta->>'z1_full_name', new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name', ''),
    v_role, v_status, v_force,
    case when v_force then new.encrypted_password end,
    nullif(v_meta->>'z1_created_by', '')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.handle_auth_user_login()
returns trigger
language plpgsql security definer set search_path = public, auth
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    perform set_config('app.trusted', 'on', true);
    update public.profiles set last_login_at = new.last_sign_in_at where id = new.id;
    insert into public.audit_log (actor_id, actor_email, action, target_type, target_id)
    values (new.id, new.email, 'user.login', 'user', new.id::text);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute function public.handle_auth_user_login();

-- ---------------------------------------------------------------------
-- Guard rails (run for every write, including the service role)
-- ---------------------------------------------------------------------
create or replace function public.active_super_admin_count(p_excluding uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select count(*)::int from profiles p join roles r on r.id = p.role_id
  where r.is_super and p.status = 'active' and p.id <> p_excluding;
$$;

create or replace function public.guard_profiles()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_old_super boolean;
  v_new_super boolean;
  v_trusted   boolean := coalesce(current_setting('app.trusted', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    select is_super into v_old_super from roles where id = old.role_id;
    if v_actor = old.id then
      raise exception 'You cannot delete your own account' using errcode = '42501';
    end if;
    if v_old_super and old.status = 'active' and active_super_admin_count(old.id) = 0 then
      raise exception 'At least one active Super Admin must remain' using errcode = '42501';
    end if;
    if v_old_super and v_actor is not null and not is_super_admin(v_actor) then
      raise exception 'Only a Super Admin can delete a Super Admin' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  new.updated_at := now();
  select is_super into v_old_super from roles where id = old.role_id;
  select is_super into v_new_super from roles where id = new.role_id;

  if new.id <> old.id or new.email <> old.email then
    raise exception 'id and email cannot be changed here' using errcode = '42501';
  end if;

  if not v_trusted and (new.pw_marker is distinct from old.pw_marker
                        or new.last_login_at is distinct from old.last_login_at
                        or new.created_by is distinct from old.created_by) then
    raise exception 'Those fields are managed by the system' using errcode = '42501';
  end if;

  if v_actor is not null and v_actor = old.id and not v_trusted
     and (new.role_id <> old.role_id or new.status <> old.status) then
    raise exception 'You cannot change your own role or status (self-lockout protection)'
      using errcode = '42501';
  end if;

  if v_actor is not null and not is_super_admin(v_actor)
     and (v_old_super or v_new_super) and (new is distinct from old) then
    raise exception 'Only a Super Admin can change a Super Admin or grant that role'
      using errcode = '42501';
  end if;

  if v_old_super and old.status = 'active'
     and (not v_new_super or new.status <> 'active')
     and active_super_admin_count(old.id) = 0 then
    raise exception 'At least one active Super Admin must remain' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_profiles
  before update or delete on public.profiles
  for each row execute function public.guard_profiles();

create or replace function public.guard_overrides()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   public.user_permission_overrides := case when tg_op = 'DELETE' then old else new end;
begin
  if v_actor is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_row.user_id = v_actor then
    raise exception 'You cannot change your own permissions (self-lockout protection)'
      using errcode = '42501';
  end if;
  if not is_super_admin(v_actor) then
    if exists (select 1 from profiles p join roles r on r.id = p.role_id
               where p.id = v_row.user_id and r.is_super) then
      raise exception 'Only a Super Admin can change a Super Admin' using errcode = '42501';
    end if;
    -- No privilege escalation: you can only hand out what you have yourself.
    if tg_op <> 'DELETE' and new.effect = 'grant'
       and not has_permission(new.permission_key) then
      raise exception 'You cannot grant % because you do not have it', new.permission_key
        using errcode = '42501';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    new.updated_at := now();
    new.updated_by := v_actor;
    return new;
  end if;
  return old;
end;
$$;

create trigger guard_overrides
  before insert or update or delete on public.user_permission_overrides
  for each row execute function public.guard_overrides();

-- Non-super admins may only assign roles whose permissions they hold.
create or replace function public.guard_role_assignment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or is_super_admin(v_actor) or new.role_id = old.role_id then
    return new;
  end if;
  if exists (select 1 from role_permissions rp where rp.role_id = new.role_id
             and not has_permission(rp.permission_key)) then
    raise exception 'You cannot assign a role with more access than you have'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_role_assignment
  before update of role_id on public.profiles
  for each row execute function public.guard_role_assignment();

-- ---------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------
create or replace function public.audit_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_target text;
  v_details jsonb;
  v_action  text;
begin
  if tg_table_name = 'profiles' then
    v_target := coalesce(new.id, old.id)::text;
    if tg_op = 'INSERT' then
      v_action := 'user.created';
      v_details := jsonb_build_object('email', new.email, 'role', new.role_id, 'status', new.status);
    elsif tg_op = 'DELETE' then
      v_action := 'user.deleted';
      v_details := jsonb_build_object('email', old.email, 'role', old.role_id);
    else
      -- ignore pure bookkeeping updates
      if (to_jsonb(new) - 'updated_at' - 'last_login_at')
         = (to_jsonb(old) - 'updated_at' - 'last_login_at') then
        return new;
      end if;
      v_action := 'user.updated';
      select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
        into v_details
      from jsonb_each(to_jsonb(new) - 'updated_at' - 'pw_marker' - 'last_login_at') n
      join jsonb_each(to_jsonb(old)) o using (key)
      where n.value is distinct from o.value;
      v_details := coalesce(v_details, '{}'::jsonb) || jsonb_build_object('email', new.email);
    end if;
    insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
    values (auth.uid(), (select email from profiles where id = auth.uid()),
            v_action, 'user', v_target, v_details);
  elsif tg_table_name = 'user_permission_overrides' then
    insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
    values (auth.uid(), (select email from profiles where id = auth.uid()),
            'permission.' || lower(tg_op), 'user',
            coalesce(new.user_id, old.user_id)::text,
            jsonb_build_object('permission', coalesce(new.permission_key, old.permission_key),
                               'from', old.effect, 'to', new.effect));
  elsif tg_table_name = 'role_permissions' then
    insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
    values (auth.uid(), (select email from profiles where id = auth.uid()),
            'role_permission.' || lower(tg_op), 'role',
            coalesce(new.role_id, old.role_id),
            jsonb_build_object('permission', coalesce(new.permission_key, old.permission_key)));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_write();
create trigger audit_overrides after insert or update or delete on public.user_permission_overrides
  for each row execute function public.audit_write();
create trigger audit_role_permissions after insert or delete on public.role_permissions
  for each row execute function public.audit_write();

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.auth_settings             enable row level security;
alter table public.permissions               enable row level security;
alter table public.roles                     enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.profiles                  enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.audit_log                 enable row level security;

revoke all on public.auth_settings, public.permissions, public.roles, public.role_permissions,
              public.profiles, public.user_permission_overrides, public.audit_log
  from anon, authenticated;

grant select on public.permissions, public.roles, public.role_permissions to authenticated;
grant select on public.auth_settings to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, role_id, status) on public.profiles to authenticated;
grant select, insert, update, delete on public.user_permission_overrides to authenticated;
grant insert, delete on public.role_permissions to authenticated;
grant update (allowed_email_domains, session_idle_minutes) on public.auth_settings to authenticated;
grant select on public.audit_log to authenticated;

create policy catalog_read on public.permissions for select to authenticated using (true);
create policy roles_read on public.roles for select to authenticated using (true);
create policy role_perms_read on public.role_permissions for select to authenticated using (true);
create policy role_perms_write on public.role_permissions for insert to authenticated
  with check (public.is_super_admin());
create policy role_perms_delete on public.role_permissions for delete to authenticated
  using (public.is_super_admin());

create policy settings_read on public.auth_settings for select to authenticated
  using (public.has_permission('admin_settings.view'));
create policy settings_write on public.auth_settings for update to authenticated
  using (public.has_permission('admin_settings.edit'))
  with check (public.has_permission('admin_settings.edit'));

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('admin_users.view'));
create policy profiles_update on public.profiles for update to authenticated
  using (public.has_permission('admin_users.edit'))
  with check (public.has_permission('admin_users.edit'));
create policy profiles_update_self_name on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- (guard_profiles blocks role/status changes on your own row)

create policy overrides_read on public.user_permission_overrides for select to authenticated
  using (user_id = auth.uid() or public.has_permission('admin_users.view'));
create policy overrides_insert on public.user_permission_overrides for insert to authenticated
  with check (public.has_permission('admin_users.edit'));
create policy overrides_update on public.user_permission_overrides for update to authenticated
  using (public.has_permission('admin_users.edit'))
  with check (public.has_permission('admin_users.edit'));
create policy overrides_delete on public.user_permission_overrides for delete to authenticated
  using (public.has_permission('admin_users.edit'));

create policy audit_read on public.audit_log for select to authenticated
  using (public.has_permission('audit_log.view'));

revoke all on function public.effective_permissions(uuid) from public, anon, authenticated;
revoke all on function public.active_super_admin_count(uuid) from public, anon, authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.my_access() to authenticated;
grant execute on function public.complete_password_change() to authenticated;

-- An admin may read another user's effective list, nobody else may.
create or replace function public.user_effective_permissions(p_user uuid)
returns setof text
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_user <> auth.uid() and not has_permission('admin_users.view') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select * from effective_permissions(p_user);
end;
$$;
grant execute on function public.user_effective_permissions(uuid) to authenticated;
revoke execute on function public.effective_permissions(uuid) from authenticated;
revoke execute on function public.complete_password_change() from anon;

-- =====================================================================
-- Seed: catalog and role presets
-- =====================================================================
insert into public.permissions (key, page, page_label, action, description, sort) values
  ('dashboard.view',       'dashboard',      'Dashboard',            'view',    'Open the dashboard', 10),
  ('clients.view',         'clients',        'Client Masterlist',    'view',    'See clients', 20),
  ('clients.create',       'clients',        'Client Masterlist',    'create',  'Add clients', 21),
  ('clients.edit',         'clients',        'Client Masterlist',    'edit',    'Edit clients', 22),
  ('clients.delete',       'clients',        'Client Masterlist',    'delete',  'Delete clients', 23),
  ('clients.export',       'clients',        'Client Masterlist',    'export',  'Export the client list', 24),
  ('quotes.view',          'quotes',         'Quoting & Proposals',  'view',    'See quotes and proposals', 30),
  ('quotes.create',        'quotes',         'Quoting & Proposals',  'create',  'Draft quotes', 31),
  ('quotes.edit',          'quotes',         'Quoting & Proposals',  'edit',    'Edit quotes', 32),
  ('quotes.delete',        'quotes',         'Quoting & Proposals',  'delete',  'Delete quotes', 33),
  ('quotes.export',        'quotes',         'Quoting & Proposals',  'export',  'Export quotes / PDFs', 34),
  ('quotes.approve',       'quotes',         'Quoting & Proposals',  'approve', 'Approve a quote before it goes to a client', 35),
  ('billing.view',         'billing',        'Billing & SOA',        'view',    'See billing and statements of account', 40),
  ('billing.create',       'billing',        'Billing & SOA',        'create',  'Create statements', 41),
  ('billing.edit',         'billing',        'Billing & SOA',        'edit',    'Edit statements', 42),
  ('billing.delete',       'billing',        'Billing & SOA',        'delete',  'Delete statements', 43),
  ('billing.export',       'billing',        'Billing & SOA',        'export',  'Export statements', 44),
  ('billing.approve',      'billing',        'Billing & SOA',        'approve', 'Approve a statement before sending', 45),
  ('reports.view',         'reports',        'Reports',              'view',    'See reports', 50),
  ('reports.export',       'reports',        'Reports',              'export',  'Export reports', 51),
  ('admin_users.view',     'admin_users',    'Manage Users',         'view',    'See the user directory', 60),
  ('admin_users.create',   'admin_users',    'Manage Users',         'create',  'Invite or create users', 61),
  ('admin_users.edit',     'admin_users',    'Manage Users',         'edit',    'Change roles, permissions, suspend', 62),
  ('admin_users.delete',   'admin_users',    'Manage Users',         'delete',  'Delete users', 63),
  ('admin_settings.view',  'admin_settings', 'Admin Settings',       'view',    'See app settings', 70),
  ('admin_settings.edit',  'admin_settings', 'Admin Settings',       'edit',    'Change app settings', 71),
  ('audit_log.view',       'audit_log',      'Audit Log',            'view',    'See the audit log', 80),
  ('audit_log.export',     'audit_log',      'Audit Log',            'export',  'Export the audit log', 81);

insert into public.roles (id, name, description, is_super, sort) values
  ('super_admin', 'Super Admin', 'Everything, including users and settings. Cannot be locked out.', true, 10),
  ('agent',       'Agent',       'Licensed agent: all client, quoting, billing and report work, including approvals.', false, 20),
  ('assistant',   'Assistant',   'Day-to-day encoding: view and update clients and quotes, no approvals, deletes or exports.', false, 30),
  ('no_access',   'No access',   'Signed in but waiting for an admin to grant access.', false, 99);

insert into public.role_permissions (role_id, permission_key)
select 'agent', key from public.permissions
where page in ('dashboard','clients','quotes','billing','reports')
   or key = 'audit_log.view';

insert into public.role_permissions (role_id, permission_key) values
  ('assistant','dashboard.view'),
  ('assistant','clients.view'), ('assistant','clients.create'), ('assistant','clients.edit'),
  ('assistant','quotes.view'),  ('assistant','quotes.create'),  ('assistant','quotes.edit'),
  ('assistant','billing.view'),
  ('assistant','reports.view');
