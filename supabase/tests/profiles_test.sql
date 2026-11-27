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

-- ---------- fixtures ----------
insert into auth.users (id, email, encrypted_password, raw_app_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'paolo@ask-karla.com', 'h', '{"z1_role":"super_admin","z1_full_name":"Paolo"}'),
 ('00000000-0000-0000-0000-00000000000b', 'karla@ask-karla.com', 'h', '{"z1_role":"super_admin","z1_full_name":"Karla"}'),
 ('00000000-0000-0000-0000-00000000000c', 'assistant@ask-karla.com', 'h', '{"z1_role":"assistant","z1_full_name":"Assistant"}');

select pg_temp.check((select count(*) = 2 from profiles p join roles r on r.id = p.role_id where r.is_super),
  'Paolo and Karla are both Super Admins');
select pg_temp.expect_error(
  $$insert into auth.users (email) values ('karla.personal@gmail.com')$$, 'limited to ask-karla.com');

-- ---------- the assistant edits their own profile ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
update profiles set full_name = 'Maria Santos', job_title = 'Secretary', phone = '+63 917 000 0000' where id = auth.uid();
select pg_temp.check((select my_profile()->>'job_title' = 'Secretary' and my_profile()->>'phone' = '+63 917 000 0000'
  and my_profile()->>'full_name' = 'Maria Santos' and my_profile()->>'role_id' = 'assistant'), 'a person can edit their own name, title and mobile');
select pg_temp.expect_error($$update profiles set phone = 'call me maybe' where id = auth.uid()$$, 'check constraint');
select pg_temp.expect_error($$update profiles set job_title = repeat('x', 81) where id = auth.uid()$$, 'check constraint');
select pg_temp.expect_error($$update profiles set role_id = 'super_admin' where id = auth.uid()$$, 'own role');
update profiles set job_title = 'Boss' where email = 'karla@ask-karla.com';
reset role;
select pg_temp.check((select job_title = '' from profiles where email = 'karla@ask-karla.com'),
  'the assistant cannot edit someone else''s profile');
set role authenticated;
select pg_temp.check((select count(*) = 1 from profiles), 'the assistant sees only their own profile');

-- ---------- Karla (Super Admin) ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((my_profile()->>'is_super')::boolean, 'Karla''s profile says Super Admin');
set request.jwt.claim.sub = '';
select pg_temp.check(my_profile() is null, 'signed-out callers get no profile');
reset role;
