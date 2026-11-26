-- =====================================================================
-- Pre-launch hardening
--   1. Two-step verification (MFA) for sensitive permissions
--   2. Acceptable use & privacy agreement before any access
--      (NPC Circular 2023-06 Sec. 15)
--   3. Monthly access reviews (Sec. 13 / Sec. 19)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
create table public.policy_versions (
  version       text primary key,
  title         text not null,
  body_markdown text not null,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users(id) on delete set null
);

alter table public.auth_settings
  add column require_mfa_for_sensitive boolean not null default true,
  add column current_policy_version   text references public.policy_versions(version),
  add column access_review_days        int not null default 30;

alter table public.profiles
  add column policy_accepted_version text,
  add column policy_accepted_at      timestamptz;

-- Which permissions count as sensitive: user and settings administration,
-- and anything that takes data out of the app.
create or replace function public.is_sensitive_permission(p_key text)
returns boolean
language sql immutable
as $$
  select split_part(p_key, '.', 1) in ('admin_users', 'admin_settings')
      or split_part(p_key, '.', 2) = 'export';
$$;

-- ---------------------------------------------------------------------
-- Effective permissions now also require the current agreement
-- ---------------------------------------------------------------------
create or replace function public.effective_permissions(p_user uuid)
returns setof text
language sql stable security definer set search_path = public
as $$
  with s as (select current_policy_version from auth_settings),
  me as (
    select p.id, r.is_super, p.role_id
    from profiles p join roles r on r.id = p.role_id, s
    where p.id = p_user
      and p.status = 'active'
      and p.must_change_password = false
      and (s.current_policy_version is null
           or p.policy_accepted_version = s.current_policy_version)
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

-- What THIS session may do: sensitive keys need an MFA-verified (aal2) session.
create or replace function public.session_permissions()
returns setof text
language sql stable security definer set search_path = public
as $$
  select e from effective_permissions(auth.uid()) e
  where not is_sensitive_permission(e)
     or not (select require_mfa_for_sensitive from auth_settings)
     or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
$$;

create or replace function public.has_permission(p_key text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from session_permissions() e where e = p_key);
$$;

-- is_super_admin() is used by guards for "may manage a Super Admin".
-- Doing that from an unverified session is not allowed either.
create or replace function public.is_super_admin(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles p join roles r on r.id = p.role_id
    where p.id = p_user and r.is_super and p.status = 'active'
  )
  and (
    p_user is distinct from auth.uid()
    or not (select require_mfa_for_sensitive from auth_settings)
    or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );
$$;

create or replace function public.my_access()
returns jsonb
language sql stable security definer set search_path = public, auth
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
    'policy_required', case
        when s.current_policy_version is not null
         and p.policy_accepted_version is distinct from s.current_policy_version
        then s.current_policy_version end,
    'aal', coalesce(auth.jwt()->>'aal', 'aal1'),
    'mfa_enrolled', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
    'last_login_at', p.last_login_at,
    'idle_minutes', s.session_idle_minutes,
    'permissions', coalesce(
       (select jsonb_agg(e order by e) from session_permissions() e), '[]'::jsonb),
    -- permissions the user has but cannot use until they verify with MFA
    'mfa_locked', coalesce(
       (select jsonb_agg(e order by e) from effective_permissions(p.id) e
        where e not in (select * from session_permissions())), '[]'::jsonb)
  )
  from profiles p join roles r on r.id = p.role_id, auth_settings s
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Agreement
-- ---------------------------------------------------------------------
create or replace function public.current_policy()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select to_jsonb(v) - 'published_by'
  from policy_versions v join auth_settings s on s.current_policy_version = v.version;
$$;

create or replace function public.accept_policy(p_version text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_version is distinct from (select current_policy_version from auth_settings) then
    raise exception 'That agreement is out of date. Reload the page.' using errcode = '22023';
  end if;
  perform set_config('app.trusted', 'on', true);
  update profiles set policy_accepted_version = p_version, policy_accepted_at = now()
   where id = auth.uid();
  insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
  select auth.uid(), email, 'policy.accepted', 'policy', p_version, '{}'::jsonb
  from profiles where id = auth.uid();
end;
$$;

-- Publishing a new version makes everyone accept again.
create or replace function public.publish_policy(p_version text, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- From the Supabase SQL editor (no signed-in user) or as a Super Admin.
  if auth.uid() is not null and not is_super_admin() then
    raise exception 'Only a Super Admin can publish the agreement' using errcode = '42501';
  end if;
  insert into policy_versions (version, title, body_markdown, published_by)
  values (p_version, p_title, p_body, auth.uid());
  update auth_settings set current_policy_version = p_version;
  insert into audit_log (actor_id, actor_email, action, target_type, target_id)
  values (auth.uid(), (select email from profiles where id = auth.uid()),
          'policy.published', 'policy', p_version);
end;
$$;

-- ---------------------------------------------------------------------
-- Guard: the new profile columns are system-managed
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_policy_cols()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(current_setting('app.trusted', true), '') <> 'on'
     and auth.uid() is not null
     and (new.policy_accepted_version is distinct from old.policy_accepted_version
          or new.policy_accepted_at is distinct from old.policy_accepted_at) then
    raise exception 'Those fields are managed by the system' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_profile_policy_cols
  before update on public.profiles
  for each row execute function public.guard_profile_policy_cols();

-- ---------------------------------------------------------------------
-- Access reviews
-- ---------------------------------------------------------------------
create table public.access_reviews (
  id           bigint generated always as identity primary key,
  reviewed_at  timestamptz not null default now(),
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewer_email text,
  notes        text not null default '',
  snapshot     jsonb not null
);

create or replace function public.access_review_data()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not has_permission('admin_users.view') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'review_days', (select access_review_days from auth_settings),
    'last_review', (select to_jsonb(a) - 'snapshot' from access_reviews a order by reviewed_at desc limit 1),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'email', p.email, 'full_name', p.full_name, 'role_id', p.role_id,
        'status', p.status, 'last_login_at', p.last_login_at, 'created_at', p.created_at,
        'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
        'overrides', (select count(*) from user_permission_overrides o where o.user_id = p.id),
        'permissions', coalesce((select jsonb_agg(e order by e) from effective_permissions(p.id) e), '[]'::jsonb)
      ) order by p.full_name, p.email)
      from profiles p), '[]'::jsonb)
  );
end;
$$;

create or replace function public.complete_access_review(p_notes text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_snapshot jsonb;
begin
  if not has_permission('admin_users.edit') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_snapshot := access_review_data()->'users';
  insert into access_reviews (reviewed_by, reviewer_email, notes, snapshot)
  values (auth.uid(), (select email from profiles where id = auth.uid()), coalesce(p_notes, ''), v_snapshot);
  insert into audit_log (actor_id, actor_email, action, target_type, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()), 'access_review.completed',
          'access_review', jsonb_build_object('users', jsonb_array_length(v_snapshot), 'notes', p_notes));
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
alter table public.policy_versions enable row level security;
alter table public.access_reviews  enable row level security;
revoke all on public.policy_versions, public.access_reviews from anon, authenticated;
grant select on public.policy_versions to authenticated;
grant select on public.access_reviews to authenticated;
create policy policy_versions_read on public.policy_versions for select to authenticated using (true);
create policy access_reviews_read on public.access_reviews for select to authenticated
  using (public.has_permission('admin_users.view'));

revoke all on function public.session_permissions() from public, anon;
revoke all on function public.accept_policy(text) from public, anon;
revoke all on function public.publish_policy(text, text, text) from public, anon;
revoke all on function public.access_review_data() from public, anon;
revoke all on function public.complete_access_review(text) from public, anon;
grant execute on function public.session_permissions() to authenticated;
grant execute on function public.current_policy() to authenticated;
grant execute on function public.accept_policy(text) to authenticated;
grant execute on function public.publish_policy(text, text, text) to authenticated;
grant execute on function public.access_review_data() to authenticated;
grant execute on function public.complete_access_review(text) to authenticated;

-- ---------------------------------------------------------------------
-- First agreement (edit the wording before launch; publish a new
-- version from SQL with publish_policy() to make everyone re-accept)
-- ---------------------------------------------------------------------
insert into public.policy_versions (version, title, body_markdown) values (
  '2026-11-24',
  'Acceptable Use and Privacy Agreement',
$md$
By using zero1office you agree to the following. Ask Karla follows the Data Privacy Act of 2012 and the National Privacy Commission's rules on the security of personal data.

**1. Need to know.** Open, copy or export client information only when your current task needs it. Your access is set by your role and may be reviewed at any time.

**2. Your account is yours alone.** Do not share your password or two-step codes. Do not let anyone else use a session you are signed in to. Lock or sign out when you step away.

**3. Passwords.** Use at least 12 characters, letters and numbers, not used on any other site. Store it in the company password manager. Change it immediately if you think someone else knows it.

**4. Keep data inside approved tools.** Do not paste client names, contact details, policy or health information into personal email, personal chat apps, personal cloud storage or public AI tools. Use only tools approved by Ask Karla.

**5. Exports and downloads.** Export only what you need, keep files in the company OneDrive, and delete them once the task is done. Every export is logged.

**6. Documents stay with insurers.** Ask Karla passes applications and requirements between clients and insurers. Do not keep copies of IDs, medical or financial documents after they are submitted.

**7. Devices.** Use a device with a screen lock and current updates. Report a lost or stolen device to Paolo the same day.

**8. Report problems right away.** If you send something to the wrong person, see something suspicious, or think data was exposed, tell Paolo and the Data Protection Officer within 24 hours. Ask Karla must assess possible breaches quickly.

**9. Monitoring.** Sign-ins, changes and exports are recorded in an audit log that admins review.

**10. Consequences.** Breaking these rules can lead to loss of access and disciplinary action, and some breaches are offences under the Data Privacy Act.
$md$);
update public.auth_settings set current_policy_version = '2026-11-24';
