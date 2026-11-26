-- =====================================================================
-- Helpers for the admin-users Edge Function.
--
-- The Edge Function needs the service-role key for things only Supabase
-- Auth can do (create, invite, ban, delete, set a password). The service
-- role has no auth.uid(), so before each of those calls the function asks
-- the database, AS THE CALLER, whether the caller may do it. These checks
-- are the same rules the triggers apply to normal writes.
-- =====================================================================

create or replace function public.admin_precheck(p_user uuid, p_perm text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_target_super boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not has_permission(p_perm) then
    raise exception 'You do not have permission (%)', p_perm using errcode = '42501';
  end if;
  if p_user is null then
    return;
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot do this to your own account (self-lockout protection)'
      using errcode = '42501';
  end if;
  select r.is_super into v_target_super
    from profiles p join roles r on r.id = p.role_id where p.id = p_user;
  if v_target_super is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if v_target_super and not is_super_admin() then
    raise exception 'Only a Super Admin can manage a Super Admin' using errcode = '42501';
  end if;
  if v_target_super and p_perm in ('admin_users.delete')
     and active_super_admin_count(p_user) = 0 then
    raise exception 'At least one active Super Admin must remain' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_precheck_role(p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from roles where id = p_role) then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;
  if is_super_admin() then
    return;
  end if;
  if (select is_super from roles where id = p_role) then
    raise exception 'Only a Super Admin can grant the Super Admin role' using errcode = '42501';
  end if;
  if exists (select 1 from role_permissions rp where rp.role_id = p_role
             and not has_permission(rp.permission_key)) then
    raise exception 'You cannot assign a role with more access than you have' using errcode = '42501';
  end if;
end;
$$;

-- Service role only: flag a user to pick a new password at next sign-in.
create or replace function public.mark_password_reset(p_user uuid, p_actor uuid)
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  perform set_config('app.trusted', 'on', true);
  update profiles p
     set must_change_password = true,
         pw_marker = u.encrypted_password
    from auth.users u
   where u.id = p.id and p.id = p_user;
  insert into audit_log (actor_id, actor_email, action, target_type, target_id)
  values (p_actor, (select email from profiles where id = p_actor),
          'password.reset_by_admin', 'user', p_user::text);
end;
$$;

-- Service role only: record actions whose DB side runs without a user.
create or replace function public.audit_admin_action(p_actor uuid, p_action text, p_target uuid, p_details jsonb)
returns void
language sql security definer set search_path = public
as $$
  insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
  values (p_actor, (select email from profiles where id = p_actor), p_action, 'user',
          p_target::text, coalesce(p_details, '{}'::jsonb));
$$;

revoke all on function public.admin_precheck(uuid, text) from public, anon;
revoke all on function public.admin_precheck_role(text) from public, anon;
revoke all on function public.mark_password_reset(uuid, uuid) from public, anon, authenticated;
revoke all on function public.audit_admin_action(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_precheck(uuid, text) to authenticated;
grant execute on function public.admin_precheck_role(text) to authenticated;
grant execute on function public.mark_password_reset(uuid, uuid) to service_role;
grant execute on function public.audit_admin_action(uuid, text, uuid, jsonb) to service_role;
