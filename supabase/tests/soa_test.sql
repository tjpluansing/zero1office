-- SOA collections tracker tests. Run with ./supabase/tests/run.sh
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

insert into auth.users (id, email, encrypted_password, raw_app_meta_data) values
 ('00000000-0000-0000-0000-00000000000b', 'karla@ask-karla.com', 'h', '{"z1_role":"agent","z1_full_name":"Karla"}'),
 ('00000000-0000-0000-0000-00000000000c', 'assistant@ask-karla.com', 'h', '{"z1_role":"assistant","z1_full_name":"Assistant"}');
\o /dev/null
select set_config('app.trusted', 'on', false);
update profiles set policy_accepted_version = '2026-11-24', policy_accepted_at = now();
select set_config('app.trusted', '', false);
\o
set request.jwt.claims = '{"aal":"aal2"}';

-- ---------- Karla (agent): full billing ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';

insert into soas (soa_no, provider, account_name, amount, commission_rate)
values ('MX-1001', 'Maxicare', 'Dela Cruz Trading', 100000, 0.10);
select pg_temp.check((select stage = 'draft' and commission_expected = 10000 from soas where soa_no = 'MX-1001'),
  'new SOA without a release date is a draft; expected commission computed from rate');

update soas set released_on = '2026-10-01', due_on = '2026-10-31' where soa_no = 'MX-1001';
select pg_temp.check((select stage = 'awaiting_payment' from soas where soa_no = 'MX-1001'), 'released SOA awaits payment');

update soas set stage = 'closed' where soa_no = 'MX-1001';
select pg_temp.check((select stage = 'awaiting_payment' from soas where soa_no = 'MX-1001'),
  'stage cannot be set directly, the server works it out');

update soas set paid_on = '2026-10-20', cwt_applicable = true where soa_no = 'MX-1001';
select pg_temp.check((select stage = 'awaiting_docs' and paid_amount = 100000 from soas where soa_no = 'MX-1001'),
  'paid SOA waits for receipt / 2307; paid amount defaults to the SOA amount');

update soas set provider_receipt_on = '2026-10-22', provider_receipt_no = 'OR-555' where soa_no = 'MX-1001';
select pg_temp.check((select stage = 'awaiting_docs' from soas where soa_no = 'MX-1001'),
  'with CWT, the 2307 is still needed');
update soas set form_2307_on = '2026-10-25' where soa_no = 'MX-1001';
select pg_temp.check((select stage = 'awaiting_commission' from soas where soa_no = 'MX-1001'),
  'receipt and 2307 in: awaiting commission');

insert into soas (soa_no, provider, account_name, amount, released_on, paid_on, provider_receipt_on)
values ('MC-2001', 'Medicard', 'Santos Bakery', 50000, '2026-10-01', '2026-10-05', '2026-10-06');
select pg_temp.expect_error($$insert into soas (soa_no, provider, account_name, amount) values ('MX-1001', 'Maxicare', 'Dup', 1)$$,
  'duplicate key');

insert into disbursements (provider, received_on, reference, gross_amount, withholding_amount)
values ('Maxicare', '2026-11-10', 'DV-9001', 10000, 1000);
select pg_temp.check((select net_amount = 9000 from disbursements where reference = 'DV-9001'), 'net = gross - withholding');

select pg_temp.expect_error($$update soas set disbursement_id = (select id from disbursements where reference = 'DV-9001')
  where soa_no = 'MC-2001'$$, 'is from Medicard');

update soas set disbursement_id = (select id from disbursements where reference = 'DV-9001') where soa_no = 'MX-1001';
select pg_temp.check((select stage = 'receipt_due' and commission_amount = 10000 from soas where soa_no = 'MX-1001'),
  'linked to a payout: Karla''s receipt is due; commission defaults to expected');

update disbursements set receipt_no = 'KR-0001', receipt_issued_on = '2026-11-11' where reference = 'DV-9001';
select pg_temp.check((select stage = 'receipt_issued' from soas where soa_no = 'MX-1001'),
  'recording Karla''s receipt moves the linked SOAs');

update soas set closed_on = '2026-11-12' where soa_no = 'MX-1001';
select pg_temp.check((select stage = 'closed' from soas where soa_no = 'MX-1001'), 'closed');

select pg_temp.check((select array_agg(body order by id) = array[
  'Draft','SOA released, awaiting client payment','Paid, awaiting provider receipt / 2307','Awaiting commission',
  'Commission received, Karla''s receipt due','Receipt issued to provider','Closed']
  from soa_events where soa_id = (select id from soas where soa_no = 'MX-1001') and kind = 'stage'),
  'every stage change is on the timeline');

select pg_temp.check((select count(*) = 2 from export_soas()), 'Karla can export');

-- ---------- Assistant: view + follow-ups only ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select count(*) = 2 from soas), 'assistant sees SOAs');
insert into soa_events (soa_id, kind, body)
values ((select id from soas where soa_no = 'MC-2001'), 'follow_up', 'Emailed Santos Bakery for the 2307');
select pg_temp.check((select actor_email = 'assistant@ask-karla.com' from soa_events where kind = 'follow_up'),
  'assistant logs a follow-up under their own name');
select pg_temp.expect_error($$insert into soa_events (soa_id, kind, body)
  values ((select id from soas where soa_no = 'MC-2001'), 'stage', 'Closed')$$, 'row-level security');
select pg_temp.expect_error($$insert into soas (soa_no, provider, account_name, amount) values ('X', 'FWD', 'X', 1)$$,
  'row-level security');
with u as (update soas set notes = 'x' returning 1) select pg_temp.check((select count(*) = 0 from u),
  'assistant edits are blocked');
select pg_temp.expect_error($$select * from export_soas()$$, 'permission to export');
select pg_temp.check((select count(*) = 0 from soa_events where kind = 'note'), 'no stray notes');

-- ---------- Receipt needs billing.approve ----------
reset role; reset request.jwt.claim.sub;
insert into role_permissions values ('assistant', 'billing.edit');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
update disbursements set notes = 'checked' where reference = 'DV-9001';
select pg_temp.check((select notes = 'checked' from disbursements where reference = 'DV-9001'), 'editor can update a payout');
select pg_temp.expect_error($$update disbursements set receipt_no = 'KR-9', receipt_issued_on = '2026-11-12'
  where reference = 'DV-9001'$$, 'Only someone with Billing approve');

reset role;
select pg_temp.check((select count(*) = 0 from soas where stage <> soa_stage(soas, exists (
  select 1 from disbursements d where d.id = soas.disbursement_id and d.receipt_issued_on is not null))),
  'stored stages match the rules');
\echo ALL SOA TESTS PASSED
