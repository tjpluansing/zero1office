-- Follow-up queue tests. Run with ./supabase/tests/run.sh followups_test
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

select pg_temp.check((select array_agg(permission_key order by permission_key) from role_permissions
  where role_id = 'assistant' and permission_key like 'followups.%')
  = array['followups.create','followups.edit','followups.view'], 'assistant preset: view, create, edit only');

-- ---------- assistant works the queue ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';

insert into followups (id, title, kind, party, client_id, insurer, channel, due_on)
values ('00000000-0000-0000-0000-0000000000f1', 'Signed MyMaxicare application form', 'signature', 'client',
        '00000000-0000-0000-0000-0000000000c1', 'Maxicare', 'viber', current_date + 5);
select pg_temp.check((select status = 'open' and attempts = 0 and assignee_id = auth.uid()
  from followups where id = '00000000-0000-0000-0000-0000000000f1'), 'assistant can add an item, assigned to self');
select pg_temp.check((select count(*) = 1 from followup_events where kind = 'created'), 'creation is on the timeline');

select pg_temp.expect_error($$insert into followups (title, party, client_id)
  values ('Valid ID 1234-5678-9012', 'client', '00000000-0000-0000-0000-0000000000c1')$$, 'Leave out ID');
select pg_temp.expect_error($$insert into followups (title, party) values ('Reply on application', 'insurer')$$,
  'check constraint');
select pg_temp.expect_error($$insert into followups (title, party, client_id, status)
  values ('Payment', 'client', '00000000-0000-0000-0000-0000000000c1', 'done')$$, 'start as open');

update followups set attempts = 9 where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.check((select attempts = 0 from followups where id = '00000000-0000-0000-0000-0000000000f1'),
  'attempt counter cannot be edited directly');

select (log_followup_chase('00000000-0000-0000-0000-0000000000f1', 'viber', null, true)).id is not null as done \gset
select pg_temp.check((select status = 'waiting' and attempts = 1 and next_chase_on > current_date
  and extract(isodow from next_chase_on) < 6
  from followups where id = '00000000-0000-0000-0000-0000000000f1'), 'logging a chase: waiting, next chase on a weekday');
select pg_temp.check((select details->>'drafted_by' = 'Felix' from followup_events where kind = 'chased'),
  'chase records that Felix drafted it');
select pg_temp.check((select count(*) = 0 from followup_events where kind = 'status'),
  'first chase does not add a separate status row');

select (log_followup_chase('00000000-0000-0000-0000-0000000000f1', 'email')).id is not null as done \gset
select (log_followup_chase('00000000-0000-0000-0000-0000000000f1', 'phone', 'Client says this week')).id is not null as done \gset
select pg_temp.check((select status = 'escalated' and attempts = 3 and escalation_reason like 'No reply after 3%'
  from followups where id = '00000000-0000-0000-0000-0000000000f1'), 'third chase with no reply escalates to Karla');

select pg_temp.expect_error($$select set_followup_status('00000000-0000-0000-0000-0000000000f1', 'waived', 'not needed')$$,
  'Only Karla');
select pg_temp.expect_error($$update followups set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'Only Karla');
with d as (delete from followups returning 1) select pg_temp.check((select count(*) = 0 from d),
  'assistant delete is blocked by RLS');
select pg_temp.expect_error($$select * from export_followups()$$, 'permission to export');
update followup_settings set max_attempts = 10;
select pg_temp.check((select max_attempts = 3 from followup_settings), 'assistant cannot change the chase rules');

select (set_followup_status('00000000-0000-0000-0000-0000000000f1', 'done', 'Form received on Viber, forwarded to Maxicare')).id is not null as done \gset
select pg_temp.check((select status = 'done' and closed_by = auth.uid() and closed_at is not null
  from followups where id = '00000000-0000-0000-0000-0000000000f1'), 'assistant can mark received');
select pg_temp.expect_error($$select log_followup_chase('00000000-0000-0000-0000-0000000000f1', 'email')$$, 'already closed');

-- insurer-side item, overdue
insert into followups (id, title, kind, party, insurer, due_on, next_chase_on)
values ('00000000-0000-0000-0000-0000000000f2', 'Maxicare reply on enrollment', 'insurer_reply', 'insurer',
        'Maxicare', current_date - 3, current_date - 1);
select pg_temp.check(escalate_overdue_followups() = 1, 'overdue sweep escalates items 2+ days past due');
select pg_temp.check((select status = 'escalated' and escalation_reason like '3 days past%'
  from followups where id = '00000000-0000-0000-0000-0000000000f2'), 'reason says how late it is');

-- ---------- Karla ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select (set_followup_status('00000000-0000-0000-0000-0000000000f2', 'waived', 'Maxicare confirmed by phone')).id is not null as done \gset
select pg_temp.check((select status = 'waived' from followups where id = '00000000-0000-0000-0000-0000000000f2'),
  'Karla can waive');
select pg_temp.check((select count(*) = 2 from export_followups()), 'Karla can export');
update followup_settings set chase_every_days = 3, max_attempts = 4;
select pg_temp.check((select chase_every_days = 3 and max_attempts = 4 from followup_settings), 'Karla can change the chase rules');
reset role;
select pg_temp.check((select count(*) = 1 from audit_log where action = 'followups.settings_changed'
  and details->'max_attempts' = '[3,4]'), 'rule changes are in the audit log');
set role authenticated;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_error($$select set_followup_status('00000000-0000-0000-0000-0000000000f2', 'open')$$,
  'Only Karla can reopen');

-- ---------- no access ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select count(*) = 0 from followups) and (select count(*) = 0 from followup_events),
  'users without the page see nothing');
select pg_temp.expect_error($$select log_followup_chase('00000000-0000-0000-0000-0000000000f2', 'email')$$,
  'permission');
reset role;

select pg_temp.check(add_business_days('2026-11-27', 1) = '2026-11-30', 'Friday + 1 business day = Monday');
select 'ALL FOLLOW-UP TESTS PASSED';
