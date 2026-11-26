-- Quote requests + turnaround scorecard. Run with ./supabase/tests/run.sh quotes_test
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
 ('00000000-0000-0000-0000-00000000000b', 'karla@ask-karla.com', 'h', '{"z1_role":"agent","z1_full_name":"Karla"}'),
 ('00000000-0000-0000-0000-00000000000c', 'assistant@ask-karla.com', 'h', '{"z1_role":"assistant","z1_full_name":"Assistant"}'),
 ('00000000-0000-0000-0000-00000000000d', 'nobody@ask-karla.com', 'h', '{"z1_role":"no_access"}');
select set_config('app.trusted', 'on', false);
update profiles set policy_accepted_version = '2026-11-24', policy_accepted_at = now();
select set_config('app.trusted', '', false);
set request.jwt.claims = '{"aal":"aal2"}';
insert into public.clients (id, full_name, insurer) values
 ('00000000-0000-0000-0000-0000000000c1', 'Juan Dela Cruz', 'Maxicare');

select pg_temp.check(business_days_between('2026-11-27', '2026-11-30') = 1, 'Friday to Monday = 1 business day');
select pg_temp.check(business_days_between('2026-11-26', '2026-11-26') = 0, 'same day = 0');

-- ---------- assistant drafts ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';

insert into quote_requests (id, client_id, product_line, needs, headcount, status, sent_at)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'hmo',
        'Family of 4, ages 38/36/8/5, 150k MBL, semi-private room, Makati hospitals', 4, 'open', now());
select pg_temp.check((select status = 'draft' and sent_at is null and ref_code like 'QR-____-0001'
  from quote_requests where id = '00000000-0000-0000-0000-0000000000a1'), 'assistant can draft; starts as draft with a QR number');
select pg_temp.expect_error($$insert into quote_requests (account_label, needs) values ('Santos Bakery', 'Group HMO, TIN 123-456-789-000')$$,
  'Leave out ID');
select pg_temp.expect_error($$insert into quote_requests (needs) values ('Group HMO for 20')$$, 'check constraint');
select pg_temp.expect_error($$select send_quote_request('00000000-0000-0000-0000-0000000000a1', array['Maxicare'])$$,
  'Only Karla can send');
select pg_temp.expect_error($$insert into quote_asks (request_id, insurer, due_on) values ('00000000-0000-0000-0000-0000000000a1', 'Maxicare', current_date)$$,
  'permission denied');
select pg_temp.expect_error($$update quote_requests set status = 'open' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'Use Send');

-- ---------- Karla sends ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select count(*) as n from send_quote_request('00000000-0000-0000-0000-0000000000a1', array['Maxicare','Medicard','Intellicare', 'maxicare']) \gset
select pg_temp.check(:n = 3, 'Karla sends to 3 insurers (duplicates skipped)');
select pg_temp.check((select status = 'open' and sent_by = auth.uid() from quote_requests where id = '00000000-0000-0000-0000-0000000000a1'),
  'request is open and records who sent it');
select pg_temp.check((select count(*) = 3 from quote_asks a join followups f on f.id = a.followup_id
  where f.title = 'Quote from insurer' and f.party = 'insurer' and f.reference like 'QR-%' and f.due_on = a.due_on),
  'each insurer gets a follow-up item with the reply-by date');
select pg_temp.check((select bool_and(due_on = add_business_days(current_date, 2)) from quote_asks), 'reply-by = 2 business days');
select pg_temp.expect_error($$select send_quote_request('00000000-0000-0000-0000-0000000000a1', array['Medicard'])$$,
  'not been asked yet');
select count(*) as n from send_quote_request('00000000-0000-0000-0000-0000000000a1', array['KHL'], 'insurer_portal', false) \gset
select pg_temp.check(:n = 4 and (select followup_id is null from quote_asks where insurer = 'KHL'),
  'can add an insurer later, without a follow-up');

-- ---------- assistant logs replies ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_error($$select record_quote_reply((select id from quote_asks where insurer = 'Maxicare'), 'quoted')$$,
  'annual premium');
select pg_temp.expect_error($$select record_quote_reply((select id from quote_asks where insurer = 'Maxicare'), 'quoted', 1000, null, null, now() - interval '3 days')$$,
  'between the day it was sent');
select (record_quote_reply((select id from quote_asks where insurer = 'Maxicare'), 'quoted', 58400, 'MyMaxicare Gold', 'Includes dental')).id is not null as done \gset
select pg_temp.check((select a.status = 'quoted' and f.status = 'done' from quote_asks a join followups f on f.id = a.followup_id
  where a.insurer = 'Maxicare'), 'logging a quote closes the follow-up');
select (record_quote_reply((select id from quote_asks where insurer = 'Medicard'), 'declined', null, null, 'Outside their area')).id is not null as done \gset
select (record_quote_reply((select id from quote_asks where insurer = 'Medicard'), 'waiting')).id is not null as done \gset
select pg_temp.check((select a.status = 'waiting' and a.replied_at is null and f.status = 'open'
  from quote_asks a join followups f on f.id = a.followup_id where a.insurer = 'Medicard'), 'undo puts it back to waiting and reopens the chase');
select (record_quote_reply((select id from quote_asks where insurer = 'Medicard'), 'quoted', 61000, 'Medicard Prima')).id is not null as done \gset
select pg_temp.expect_error($$select choose_quote((select id from quote_asks where insurer = 'Maxicare'))$$, 'Only Karla');
select pg_temp.expect_error($$select cancel_quote_request('00000000-0000-0000-0000-0000000000a1')$$, 'Only Karla');

-- scorecard sees replies
select pg_temp.check((select quoted = 1 and replied = 1 and median_days = 0 and on_time = 1 and asked = 1
  from quote_scorecard(90) where insurer = 'Maxicare'), 'scorecard: same-day quote is on time, 0 days');
select pg_temp.check((select waiting = 1 and replied = 0 and on_time_pct is null and grade is null
  from quote_scorecard(90) where insurer = 'Intellicare'), 'scorecard: still waiting, not yet judged');

-- ---------- Karla picks ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select (choose_quote((select id from quote_asks where insurer = 'Maxicare'))).status = 'done' as ok \gset
select pg_temp.check(:'ok'::boolean, 'Karla picks a quote; request is done');
select pg_temp.check((select status = 'withdrawn' from quote_asks where insurer = 'Intellicare')
  and (select f.status = 'cancelled' from quote_asks a join followups f on f.id = a.followup_id where a.insurer = 'Intellicare'),
  'insurers still waiting are withdrawn and their chases cancelled');
select pg_temp.check((select count(*) = 1 from quote_asks where chosen), 'one chosen quote');
select pg_temp.expect_error($$select record_quote_reply((select id from quote_asks where insurer = 'KHL'), 'declined')$$, 'closed');
select pg_temp.check((select count(*) = 2 from quote_scorecard(90)), 'withdrawn asks are left out of the scorecard');
select pg_temp.check((select count(*) = 4 from export_quote_requests()), 'Karla can export');

-- ---------- grades: build history directly as the table owner ----------
reset role;
select set_config('app.quote_action', 'on', false) is not null as x \gset
insert into quote_requests (id, account_label, product_line, needs)
select ('00000000-0000-0000-0000-0000000000b' || g)::uuid, 'Santos Bakery', 'group_hmo', 'Group HMO for 25 staff'
  from generate_series(1, 3) g;
-- Slow: replies 15 days late every time. Fast: replies a day after asking.
insert into quote_asks (request_id, insurer, sent_at, due_on, status, replied_at, annual_premium)
select r.id, i.name, now() - interval '20 days', (now() - interval '20 days')::date + 2, 'quoted',
       case i.name when 'Slow' then now() - interval '5 days' else now() - interval '19 days' end, 1000
  from quote_requests r cross join (values ('Slow'), ('Fast')) i(name)
 where r.account_label = 'Santos Bakery';
select set_config('app.quote_action', '', false) is not null as x \gset

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select grade = 'A' and score = 100 and on_time_pct = 100 from quote_scorecard(90) where insurer = 'Fast'),
  'always on time and always replies = A');
select pg_temp.check((select grade = 'D' and on_time = 0 and median_days >= 10 from quote_scorecard(90) where insurer = 'Slow'),
  'always late = D, median turnaround shows the delay');
select pg_temp.check((select insurer from quote_scorecard(90) limit 1) = 'Fast', 'best insurer is listed first');
select pg_temp.check((select count(*) = 2 from quote_scorecard(90, 'group_hmo')), 'product filter');
select pg_temp.check((select count(*) = 0 from quote_scorecard(10, 'group_hmo')), 'period filter');
select pg_temp.expect_error($$select * from export_quote_requests()$$, 'permission to export');
update quote_settings set target_days = 5;
select pg_temp.check((select target_days = 2 from quote_settings), 'assistant cannot change the reply-by target');
with d as (delete from quote_requests returning 1) select pg_temp.check((select count(*) = 0 from d),
  'assistant delete is blocked by RLS');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update quote_settings set target_days = 3;
select pg_temp.check((select target_days = 3 from quote_settings), 'Karla can change the reply-by target');

-- ---------- no access ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select count(*) = 0 from quote_requests) and (select count(*) = 0 from quote_asks),
  'users without the page see nothing');
select pg_temp.expect_error($$select * from quote_scorecard()$$, 'permission');
reset role;
select pg_temp.check((select count(*) = 1 from audit_log where action = 'quotes.chosen'), 'picks are in the audit log');
select 'ALL QUOTE TESTS PASSED';
