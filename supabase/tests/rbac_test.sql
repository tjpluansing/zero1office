-- RBAC behaviour tests. Run with ./supabase/tests/run.sh (plain Postgres 15+).
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.expect_error(p_sql text, p_like text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'EXPECTED ERROR (%), but statement succeeded: %', p_like, p_sql;
exception when others then
  if sqlerrm like 'EXPECTED ERROR%' then raise; end if;
  if sqlerrm not ilike '%' || p_like || '%' then
    raise exception 'Wrong error for %: got "%", wanted "%"', p_sql, sqlerrm, p_like;
  end if;
end $$;

create or replace function pg_temp.check(p_ok boolean, p_what text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAILED: %', p_what; end if;
  raise notice 'ok - %', p_what;
end $$;
set client_min_messages = notice;

-- ---------- fixtures (as the service role / GoTrue) ----------
select pg_temp.expect_error(
  $$insert into auth.users (email) values ('someone@gmail.com')$$, 'limited to ask-karla.com');

insert into auth.users (id, email, encrypted_password, raw_app_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'paolo@ask-karla.com', 'hash-temp',
  '{"z1_role":"super_admin","z1_force_password_change":true,"z1_full_name":"Paolo"}'),
 ('00000000-0000-0000-0000-00000000000b', 'karla@ask-karla.com', 'h',
  '{"z1_role":"agent","z1_full_name":"Karla"}'),
 ('00000000-0000-0000-0000-00000000000c', 'assistant@ask-karla.com', 'h',
  '{"z1_role":"assistant","z1_full_name":"Assistant"}'),
 ('00000000-0000-0000-0000-00000000000d', 'stranger@ask-karla.com', null, '{}');

-- Karla and the assistant have already accepted the agreement and every
-- session below is MFA-verified unless a test says otherwise.
select set_config('app.trusted', 'on', false);
update profiles set policy_accepted_version = '2026-11-24', policy_accepted_at = now()
 where email in ('karla@ask-karla.com', 'assistant@ask-karla.com');
select set_config('app.trusted', '', false);
set request.jwt.claims = '{"aal":"aal2"}';

insert into public.clients (full_name, insurer) values ('Juan Dela Cruz', 'Maxicare'), ('Ana Reyes', 'FWD');

select pg_temp.check((select status = 'pending' and role_id = 'no_access' from profiles
  where email = 'stranger@ask-karla.com'), 'unknown Microsoft sign-in lands as pending / no access');

-- ---------- Paolo: forced password change ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select jsonb_array_length(my_access()->'permissions') = 0
  and (my_access()->>'must_change_password')::boolean), 'seeded admin has no access until password changed');
select pg_temp.expect_error($$select complete_password_change()$$, 'Choose a new password');
select pg_temp.expect_error($$update profiles set must_change_password = false where id = auth.uid()$$,
  'permission denied');
reset role;  -- GoTrue updates the hash
update auth.users set encrypted_password = 'hash-new' where email = 'paolo@ask-karla.com';
set role authenticated;
select complete_password_change();
select pg_temp.check((select jsonb_array_length(my_access()->'permissions') = 0
  and my_access()->>'policy_required' = '2026-11-24'), 'still no access until the agreement is accepted');
select pg_temp.expect_error($$update profiles set policy_accepted_version = '2026-11-24' where id = auth.uid()$$,
  'permission denied');
select pg_temp.expect_error($$select accept_policy('2020-01-01')$$, 'out of date');
select accept_policy('2026-11-24');
select pg_temp.check((select jsonb_array_length(my_access()->'permissions') = (select count(*) from permissions)),
  'after password change and agreement the Super Admin has every permission');

-- ---------- MFA for sensitive permissions ----------
set request.jwt.claims = '{"aal":"aal1"}';
select pg_temp.check(not has_permission('admin_users.view') and not has_permission('clients.export')
  and has_permission('clients.view'), 'without MFA: admin and export locked, normal pages open');
select pg_temp.check((select jsonb_array_length(my_access()->'mfa_locked') > 0), 'my_access lists what MFA unlocks');
select pg_temp.check((select count(*) = 1 from profiles), 'without MFA the user directory is hidden');
select pg_temp.expect_error($$select admin_precheck(null, 'admin_users.create')$$, 'do not have permission');
set request.jwt.claims = '{"aal":"aal2"}';
select pg_temp.check(has_permission('admin_users.view'), 'with MFA: admin unlocked');

-- ---------- Self-lockout protection ----------
select pg_temp.expect_error($$update profiles set role_id = 'agent' where id = auth.uid()$$, 'own role');
select pg_temp.expect_error($$update profiles set status = 'suspended' where id = auth.uid()$$, 'own role or status');
select pg_temp.expect_error($$insert into user_permission_overrides values (auth.uid(), 'admin_users.view', 'deny')$$,
  'own permissions');
select pg_temp.expect_error($$delete from profiles where id = auth.uid()$$, 'permission denied');
reset role; reset request.jwt.claim.sub;  -- back to the service role
select pg_temp.expect_error($$update profiles set role_id = 'agent' where email = 'paolo@ask-karla.com'$$,
  'At least one active Super Admin');
select pg_temp.expect_error($$delete from auth.users where email = 'paolo@ask-karla.com'$$,
  'At least one active Super Admin');

-- ---------- Assistant: page + feature enforcement ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select count(*) = 2 from clients), 'assistant can view clients');
insert into clients (full_name) values ('New Lead');
select pg_temp.check((select count(*) = 3 from clients), 'assistant can create clients');
with d as (delete from clients returning 1) select pg_temp.check((select count(*) = 0 from d),
  'assistant delete is silently blocked by RLS');
select pg_temp.expect_error($$select * from export_clients()$$, 'permission to export');
select pg_temp.check((select count(*) = 1 from profiles), 'assistant only sees own profile');
select pg_temp.check((select count(*) = 0 from audit_log), 'assistant cannot read audit log');
select pg_temp.expect_error($$update profiles set role_id = 'agent' where id = auth.uid()$$, 'own role');
select pg_temp.expect_error($$update profiles set must_change_password = true where id = auth.uid()$$, 'permission denied');
update profiles set full_name = 'Assistant One' where id = auth.uid();
select pg_temp.check((select full_name = 'Assistant One' from profiles where id = auth.uid()), 'users can edit their own name');

-- ---------- Paolo edits the assistant's matrix ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into user_permission_overrides values
  ('00000000-0000-0000-0000-00000000000c', 'clients.view', 'deny'),
  ('00000000-0000-0000-0000-00000000000c', 'reports.export', 'grant');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select count(*) = 0 from clients), 'denying the page hides all rows');
select pg_temp.check(not has_permission('clients.create'), 'denying a page also drops its actions');
select pg_temp.check(has_permission('reports.export'), 'per-user grant works');

-- ---------- Delegated admin (Karla) cannot escalate ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into user_permission_overrides values
  ('00000000-0000-0000-0000-00000000000b', 'admin_users.view', 'grant'),
  ('00000000-0000-0000-0000-00000000000b', 'admin_users.edit', 'grant');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) = 4 from profiles), 'delegated admin sees the directory');
select pg_temp.expect_error($$insert into user_permission_overrides values
  ('00000000-0000-0000-0000-00000000000c', 'admin_settings.edit', 'grant')$$, 'do not have it');
insert into user_permission_overrides values ('00000000-0000-0000-0000-00000000000c', 'quotes.approve', 'grant');
select pg_temp.expect_error($$update profiles set role_id = 'super_admin' where email = 'assistant@ask-karla.com'$$,
  'Only a Super Admin');
select pg_temp.expect_error($$update profiles set status = 'suspended' where email = 'paolo@ask-karla.com'$$,
  'Only a Super Admin');
select pg_temp.expect_error($$insert into user_permission_overrides values
  ('00000000-0000-0000-0000-00000000000a', 'clients.view', 'deny')$$, 'Only a Super Admin');

-- ---------- Suspension ----------
update profiles set status = 'suspended' where email = 'assistant@ask-karla.com';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select jsonb_array_length(my_access()->'permissions') = 0), 'suspended user has no permissions');

-- ---------- Second super admin makes demotion possible ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update profiles set role_id = 'super_admin' where email = 'karla@ask-karla.com';
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';  -- Karla acts
update profiles set role_id = 'agent' where email = 'paolo@ask-karla.com';
update profiles set role_id = 'super_admin' where email = 'paolo@ask-karla.com';
select pg_temp.check(true, 'with two Super Admins one can be demoted');

-- ---------- Login + audit ----------
update auth.users set last_sign_in_at = now() where email = 'karla@ask-karla.com';
select pg_temp.check((select last_login_at is not null from profiles where email = 'karla@ask-karla.com'),
  'last login is recorded');
select pg_temp.check((select count(*) >= 10 from audit_log), 'audit log captured changes');
select pg_temp.check(exists (select 1 from audit_log where action = 'user.updated'
  and details ? 'role_id' and actor_email = 'paolo@ask-karla.com'), 'role change logged with actor and diff');

-- ---------- Edge Function prechecks ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_error($$select admin_precheck('00000000-0000-0000-0000-00000000000a', 'admin_users.delete')$$, 'own account');
select admin_precheck('00000000-0000-0000-0000-00000000000c', 'admin_users.delete');
select admin_precheck_role('super_admin');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_error($$select admin_precheck(null, 'admin_users.create')$$, 'do not have permission');
reset role; reset request.jwt.claim.sub;
update profiles set role_id = 'agent' where email = 'karla@ask-karla.com';
insert into user_permission_overrides values ('00000000-0000-0000-0000-00000000000b', 'admin_users.create', 'grant');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error($$select admin_precheck_role('super_admin')$$, 'Only a Super Admin');
select admin_precheck_role('assistant');
select pg_temp.expect_error($$select admin_precheck('00000000-0000-0000-0000-00000000000a', 'admin_users.edit')$$, 'Only a Super Admin');
select pg_temp.expect_error($$select mark_password_reset('00000000-0000-0000-0000-00000000000c', null)$$, 'permission denied');
select pg_temp.check(true, 'Edge Function prechecks enforce the same rules');
reset role;

-- ---------- Access review ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_error($$select access_review_data()$$, 'Not allowed');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select jsonb_array_length(access_review_data()->'users') = 4), 'review lists every user with permissions');
select complete_access_review('Monthly check, all good');
select pg_temp.check((select count(*) = 1 from access_reviews), 'review saved with snapshot');
select pg_temp.check((select access_review_data()->'last_review'->>'notes' = 'Monthly check, all good'), 'last review shown');

-- ---------- New agreement version forces re-acceptance ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_error($$select publish_policy('v2', 'x', 'y')$$, 'Only a Super Admin');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select publish_policy('2026-12-01', 'Acceptable Use and Privacy Agreement', 'Updated text');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select jsonb_array_length(my_access()->'permissions') = 0
  and my_access()->>'policy_required' = '2026-12-01'), 'publishing a new agreement pauses access until accepted');
select accept_policy('2026-12-01');
select pg_temp.check(has_permission('clients.view'), 'access returns after accepting');
reset role;

\echo ALL RBAC TESTS PASSED
