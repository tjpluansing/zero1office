-- =====================================================================
-- SOA collections tracker (Billing & SOA page)
--
-- Karla's bottlenecks 2 and 3: trace every statement of account (SOA)
-- from release to client payment, the provider's receipt and the CWT
-- certificate (BIR Form 2307), the commission disbursement, and the
-- receipt Karla issues to the provider for that disbursement.
--
--   soas           one row per SOA; its stage is worked out from its dates
--   disbursements  one commission payout from a provider, covering one or
--                  more SOAs, and Karla's receipt for it
--   soa_events     append-only timeline per SOA: stage changes, notes and
--                  follow-ups (anyone who can view billing may add a note)
--
-- Only routing and money details live here: account names, SOA numbers,
-- amounts and dates. Member lists and health details stay with the insurer.
--
-- Permissions (already in the catalog):
--   billing.view     see SOAs, disbursements, timeline; add notes/follow-ups
--   billing.create   add SOAs and disbursements, import
--   billing.edit     update SOAs and disbursements, link SOAs to payouts
--   billing.delete   delete SOAs and disbursements
--   billing.export   export (logged)
--   billing.approve  record Karla's receipt number and date
-- =====================================================================

create table public.disbursements (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null check (length(trim(provider)) > 0),
  received_on         date not null,
  reference           text,
  gross_amount        numeric(14,2) not null default 0 check (gross_amount >= 0),
  withholding_amount  numeric(14,2) not null default 0 check (withholding_amount >= 0),
  net_amount          numeric(14,2) generated always as (gross_amount - withholding_amount) stored,
  receipt_no          text,
  receipt_issued_on   date,
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at          timestamptz not null default now(),
  check ((receipt_no is null) = (receipt_issued_on is null))
);

create table public.soas (
  id                   uuid primary key default gen_random_uuid(),
  soa_no               text not null check (length(trim(soa_no)) > 0),
  provider             text not null check (length(trim(provider)) > 0),
  account_name         text not null check (length(trim(account_name)) > 0),
  client_id            uuid references public.clients(id) on delete set null,
  product              text,
  coverage_period      text,
  amount               numeric(14,2) not null check (amount >= 0),
  released_on          date,
  due_on               date,
  paid_on              date,
  paid_amount          numeric(14,2) check (paid_amount >= 0),
  payment_ref          text,
  provider_receipt_no  text,
  provider_receipt_on  date,
  cwt_applicable       boolean not null default false,
  cwt_amount           numeric(14,2) check (cwt_amount >= 0),
  form_2307_on         date,
  commission_rate      numeric(6,4) check (commission_rate >= 0 and commission_rate <= 1),
  commission_expected  numeric(14,2) check (commission_expected >= 0),
  disbursement_id      uuid references public.disbursements(id) on delete set null,
  commission_amount    numeric(14,2) check (commission_amount >= 0),
  closed_on            date,
  ghl_link             text check (ghl_link is null or ghl_link ~* '^https://'),
  notes                text,
  stage                text not null default 'draft' check (stage in (
                         'draft','awaiting_payment','awaiting_docs','awaiting_commission',
                         'receipt_due','receipt_issued','closed')),
  stage_changed_at     timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at           timestamptz not null default now(),
  unique (provider, soa_no)
);
create index soas_stage_idx on public.soas (stage);
create index soas_disbursement_idx on public.soas (disbursement_id);

create table public.soa_events (
  id           bigint generated always as identity primary key,
  soa_id       uuid not null references public.soas(id) on delete cascade,
  at           timestamptz not null default now(),
  actor_id     uuid default auth.uid(),
  actor_email  text,
  kind         text not null check (kind in ('stage','note','follow_up')),
  body         text not null check (length(body) between 1 and 2000)
);
create index soa_events_soa_idx on public.soa_events (soa_id, at desc);

-- ---------------------------------------------------------------------
-- Stage rules (one place, used by the trigger and the tests)
-- ---------------------------------------------------------------------
create or replace function public.soa_stage(s public.soas, receipt_issued boolean)
returns text language sql immutable as $$
  select case
    when s.closed_on is not null                          then 'closed'
    when s.disbursement_id is not null and receipt_issued then 'receipt_issued'
    when s.disbursement_id is not null                    then 'receipt_due'
    when s.released_on is null                            then 'draft'
    when s.paid_on is null                                then 'awaiting_payment'
    when s.provider_receipt_on is null
      or (s.cwt_applicable and s.form_2307_on is null)    then 'awaiting_docs'
    else 'awaiting_commission'
  end
$$;

create or replace function public.soa_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d disbursements;
begin
  new.soa_no := trim(new.soa_no);
  new.provider := trim(new.provider);
  new.account_name := trim(new.account_name);
  if new.commission_expected is null and new.commission_rate is not null then
    new.commission_expected := round(new.amount * new.commission_rate, 2);
  end if;
  if new.paid_on is not null and new.paid_amount is null then
    new.paid_amount := new.amount;
  end if;
  if new.disbursement_id is not null then
    select * into d from disbursements where id = new.disbursement_id;
    if lower(d.provider) <> lower(new.provider) then
      raise exception 'SOA % is from %, but this payout is from %', new.soa_no, new.provider, d.provider
        using errcode = '23514';
    end if;
    if new.commission_amount is null then
      new.commission_amount := new.commission_expected;
    end if;
  end if;
  new.stage := soa_stage(new, coalesce(d.receipt_issued_on is not null, false));
  -- stage, its timestamp and the creator are the server's to set
  if tg_op = 'INSERT' then
    new.stage_changed_at := now();
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.stage_changed_at := case when new.stage is distinct from old.stage then now() else old.stage_changed_at end;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger soas_before_write before insert or update on public.soas
  for each row execute function public.soa_before_write();

create or replace function public.soa_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  labels constant jsonb := '{"draft":"Draft","awaiting_payment":"SOA released, awaiting client payment",
    "awaiting_docs":"Paid, awaiting provider receipt / 2307","awaiting_commission":"Awaiting commission",
    "receipt_due":"Commission received, Karla''s receipt due","receipt_issued":"Receipt issued to provider",
    "closed":"Closed"}';
begin
  if tg_op = 'DELETE' then
    insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
    values (auth.uid(), (select email from profiles where id = auth.uid()), 'soa.deleted', 'soa', old.id::text,
            jsonb_build_object('soa_no', old.soa_no, 'provider', old.provider, 'amount', old.amount));
    return old;
  end if;
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into soa_events (soa_id, actor_id, actor_email, kind, body)
    values (new.id, auth.uid(), (select email from profiles where id = auth.uid()), 'stage', labels->>new.stage);
  end if;
  return new;
end $$;

create trigger soas_after_write after insert or update or delete on public.soas
  for each row execute function public.soa_after_write();

-- Karla's receipt is an approval: only billing.approve may record or change it.
create or replace function public.disbursement_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.provider := trim(new.provider);
  if (tg_op = 'INSERT' and new.receipt_no is not null)
     or (tg_op = 'UPDATE' and (new.receipt_no, new.receipt_issued_on) is distinct from (old.receipt_no, old.receipt_issued_on)) then
    if auth.uid() is not null and not has_permission('billing.approve') then
      raise exception 'Only someone with Billing approve (Karla) can record her receipt' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and lower(new.provider) <> lower(old.provider)
     and exists (select 1 from soas where disbursement_id = new.id) then
    raise exception 'Unlink the SOAs before changing this payout''s provider' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger disbursements_before_write before insert or update on public.disbursements
  for each row execute function public.disbursement_before_write();

-- When the receipt is recorded or removed, move the linked SOAs' stages.
create or replace function public.disbursement_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
    values (auth.uid(), (select email from profiles where id = auth.uid()), 'disbursement.deleted', 'disbursement',
            old.id::text, jsonb_build_object('provider', old.provider, 'gross', old.gross_amount, 'receipt_no', old.receipt_no));
    return old;
  end if;
  if new.receipt_issued_on is distinct from old.receipt_issued_on then
    update soas set updated_at = now() where disbursement_id = new.id;
  end if;
  return new;
end $$;

create trigger disbursements_after_update after update on public.disbursements
  for each row execute function public.disbursement_after_write();
create trigger disbursements_after_delete after delete on public.disbursements
  for each row execute function public.disbursement_after_write();

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.soas          enable row level security;
alter table public.disbursements enable row level security;
alter table public.soa_events    enable row level security;
revoke all on public.soas, public.disbursements, public.soa_events from anon, authenticated;
grant select, insert, update, delete on public.soas, public.disbursements to authenticated;
grant select, insert on public.soa_events to authenticated;

create policy soas_select on public.soas for select to authenticated using (has_permission('billing.view'));
create policy soas_insert on public.soas for insert to authenticated with check (has_permission('billing.create'));
create policy soas_update on public.soas for update to authenticated
  using (has_permission('billing.edit')) with check (has_permission('billing.edit'));
create policy soas_delete on public.soas for delete to authenticated using (has_permission('billing.delete'));

create policy disb_select on public.disbursements for select to authenticated using (has_permission('billing.view'));
create policy disb_insert on public.disbursements for insert to authenticated with check (has_permission('billing.create'));
create policy disb_update on public.disbursements for update to authenticated
  using (has_permission('billing.edit') or has_permission('billing.approve'))
  with check (has_permission('billing.edit') or has_permission('billing.approve'));
create policy disb_delete on public.disbursements for delete to authenticated using (has_permission('billing.delete'));

create policy soa_events_select on public.soa_events for select to authenticated using (has_permission('billing.view'));
-- people add notes and follow-ups as themselves; stage rows come from the trigger
create policy soa_events_insert on public.soa_events for insert to authenticated
  with check (has_permission('billing.view') and kind in ('note','follow_up') and actor_id = auth.uid());

create or replace function public.soa_event_fill()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.at := now();
  new.actor_email := (select email from profiles where id = new.actor_id);
  return new;
end $$;
create trigger soa_events_fill before insert on public.soa_events
  for each row execute function public.soa_event_fill();

-- ---------------------------------------------------------------------
-- Export (enforced and logged on the server, like clients)
-- ---------------------------------------------------------------------
create or replace function public.export_soas()
returns table (
  soa_no text, provider text, account_name text, product text, coverage_period text, amount numeric,
  released_on date, due_on date, paid_on date, paid_amount numeric, payment_ref text,
  provider_receipt_no text, provider_receipt_on date, cwt_applicable boolean, cwt_amount numeric,
  form_2307_on date, commission_rate numeric, commission_expected numeric, commission_amount numeric,
  disbursement_ref text, karla_receipt_no text, karla_receipt_on date, closed_on date, stage text, notes text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not has_permission('billing.export') then
    raise exception 'You do not have permission to export billing' using errcode = '42501';
  end if;
  return query
    select s.soa_no, s.provider, s.account_name, s.product, s.coverage_period, s.amount,
           s.released_on, s.due_on, s.paid_on, s.paid_amount, s.payment_ref,
           s.provider_receipt_no, s.provider_receipt_on, s.cwt_applicable, s.cwt_amount,
           s.form_2307_on, s.commission_rate, s.commission_expected, s.commission_amount,
           d.reference, d.receipt_no, d.receipt_issued_on, s.closed_on, s.stage, s.notes
      from soas s left join disbursements d on d.id = s.disbursement_id
     order by s.provider, s.released_on nulls last, s.soa_no;
end $$;

revoke all on function public.export_soas() from public, anon;
grant execute on function public.export_soas() to authenticated;
revoke all on function public.soa_stage(public.soas, boolean) from public, anon;
