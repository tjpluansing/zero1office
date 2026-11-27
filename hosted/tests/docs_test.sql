\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin execute p_sql; raise exception 'EXPECTED ERROR (%), but statement succeeded: %', p_like, p_sql;
exception when others then if sqlerrm like 'EXPECTED ERROR%' then raise; end if;
  if sqlerrm not ilike '%' || p_like || '%' then raise exception 'Wrong error for %: got "%", wanted "%"', p_sql, sqlerrm, p_like; end if; end $$;
create or replace function pg_temp.check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'FAILED: %', p_what; end if; raise notice 'ok - %', p_what; end $$;

select pg_temp.check((select count(*) = 2 from app_docs where path like 'z1users/%'), 'Paolo and Karla are seeded');

set role authenticated;
-- a stranger with a gmail account sees nothing and writes nothing
set request.jwt.claims = '{"email":"someone@gmail.com"}';
select pg_temp.check((select count(*) = 0 from app_docs), 'outsiders read nothing');
select pg_temp.expect_error($$insert into app_docs (path, data) values ('files/x', '{}')$$, 'row-level security');

-- Paolo, Super Admin
set request.jwt.claims = '{"email":"Paolo@ask-karla.com"}';
select pg_temp.check(z1_admin(), 'Paolo is a Super Admin');
insert into app_docs (path, data) values ('meta/company', '{"name":"Ask Karla"}');
insert into app_docs (path, data) values ('z1users/sec_ask_karla_com', '{"email":"sec@ask-karla.com","name":"Maria","role":"Staff","status":"active","pages":["todo"],"pw":{"hash":"x"}}');
select pg_temp.check((select not (data ? 'pw') from app_docs where path = 'z1users/sec_ask_karla_com'), 'password hashes are never stored');
select pg_temp.expect_error($$insert into app_docs (path, data) values ('z1users/bad_gmail_com', '{"email":"bad@gmail.com"}')$$, 'ask-karla.com');
select pg_temp.expect_error($$insert into app_docs (path, data) values ('z1users/other', '{"email":"sec2@ask-karla.com"}')$$, 'matches');
insert into app_docs (path, data) values ('ls/zero1office-mock:v3/data/lists', '{"v":"[]"}');

-- Maria, Staff
set request.jwt.claims = '{"email":"sec@ask-karla.com"}';
select pg_temp.check(z1_member() and not z1_admin(), 'Maria is a member, not an admin');
select pg_temp.check((select count(*) >= 4 from app_docs), 'members read shared records');
update app_docs set data = data || '{"title":"Secretary","photo":"abc"}' where path = 'z1users/sec_ask_karla_com';
select pg_temp.check((select data->>'title' = 'Secretary' from app_docs where path = 'z1users/sec_ask_karla_com'), 'staff edit their own profile');
select pg_temp.expect_error($$update app_docs set data = data || '{"role":"Super Admin"}' where path = 'z1users/sec_ask_karla_com'$$, 'Only a Super Admin');
select pg_temp.expect_error($$update app_docs set data = data || '{"pages":["billing"]}' where path = 'z1users/sec_ask_karla_com'$$, 'Only a Super Admin');
select pg_temp.expect_error($$update app_docs set data = data || '{"name":"X"}' where path = 'z1users/paolo_ask_karla_com'$$, 'Only a Super Admin');
select pg_temp.expect_error($$update app_docs set data = '{"name":"Hacked"}' where path = 'meta/company'$$, 'Only a Super Admin');
update app_docs set data = '{"v":"[1]"}' where path = 'ls/zero1office-mock:v3/data/lists';
select pg_temp.check((select updated_by = 'sec@ask-karla.com' from app_docs where path = 'ls/zero1office-mock:v3/data/lists'), 'staff edit shared records, stamped with their email');

-- paused accounts lose access
set request.jwt.claims = '{"email":"paolo@ask-karla.com"}';
update app_docs set data = data || '{"status":"suspended"}' where path = 'z1users/sec_ask_karla_com';
set request.jwt.claims = '{"email":"sec@ask-karla.com"}';
select pg_temp.check((select count(*) = 0 from app_docs), 'paused accounts read nothing');

-- the last Super Admin stays
set request.jwt.claims = '{"email":"paolo@ask-karla.com"}';
update app_docs set data = data || '{"role":"Staff"}' where path = 'z1users/karla_ask_karla_com';
select pg_temp.expect_error($$update app_docs set data = data || '{"role":"Staff"}' where path = 'z1users/paolo_ask_karla_com'$$, 'at least one active Super Admin');
reset role;
\echo ALL HOSTED DOC TESTS PASSED
