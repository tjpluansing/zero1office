-- =====================================================================
-- Provider quote requests and the insurer turnaround scorecard.
--
-- A quote request is one client need (e.g. "family of 4 HMO, 150k MBL")
-- that Ask Karla sends to several insurers. Each insurer asked gets one
-- row in quote_asks, so we can see who replied, how fast, and with what.
--
-- Who does what
--   Quinn (AI employee)  drafts the request email for each insurer.
--   Assistant            drafts requests, logs insurer replies.
--   Karla (agent)        sends requests to insurers and picks the quote
--                        that goes into the proposal (quotes.approve).
--
-- Chasing a slow insurer happens in the follow-up queue: sending can add a
-- "Quote from insurer" item per insurer, which Felix drafts chases for,
-- and logging the reply closes it. The scorecard counts those chases.
--
-- Only what is needed to get a quote is kept: a short description of the
-- need. Census files, names, birthdays and IDs go straight to the insurer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permissions: reuse the quotes.* page. Update the wording to match.
-- ---------------------------------------------------------------------
update public.permissions set description = 'See quote requests, insurer replies and the scorecard' where key = 'quotes.view';
update public.permissions set description = 'Draft quote requests' where key = 'quotes.create';
update public.permissions set description = 'Edit drafts, log insurer replies' where key = 'quotes.edit';
update public.permissions set description = 'Delete quote requests' where key = 'quotes.delete';
update public.permissions set description = 'Export quote requests and the scorecard' where key = 'quotes.export';
update public.permissions set description = 'Send requests to insurers, pick the quote for the proposal' where key = 'quotes.approve';

-- ---------------------------------------------------------------------
-- Settings (one row). Mirrored in src/lib/quotes.ts for the demo.
-- ---------------------------------------------------------------------
create table public.quote_settings (
  id            boolean primary key default true check (id),
  target_days   int not null default 2 check (target_days between 1 and 15),
  updated_at    timestamptz not null default now()
);
insert into public.quote_settings default values;

alter table public.quote_settings enable row level security;
revoke all on public.quote_settings from anon, authenticated;
grant select, update on public.quote_settings to authenticated;
create policy quote_settings_select on public.quote_settings for select to authenticated
  using (public.has_permission('quotes.view'));
create policy quote_settings_update on public.quote_settings for update to authenticated
  using (public.has_permission('quotes.approve') or public.has_permission('admin_settings.edit'))
  with check (public.has_permission('quotes.approve') or public.has_permission('admin_settings.edit'));

create or replace function public.quote_settings_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at := now();
  insert into audit_log (actor_id, actor_email, action, target_type, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()), 'quotes.settings_changed', 'quotes',
          jsonb_build_object('target_days', jsonb_build_array(old.target_days, new.target_days)));
  return new;
end;
$$;
create trigger quote_settings_audit before update on public.quote_settings
  for each row execute function public.quote_settings_audit();

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create sequence public.quote_request_no;

create table public.quote_requests (
  id            uuid primary key default gen_random_uuid(),
  ref_code      text not null unique
                  default 'QR-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.quote_request_no')::text, 4, '0'),
  client_id     uuid references public.clients(id) on delete set null,
  -- short label when the client is not in the masterlist yet, e.g. "Santos Bakery"
  account_label text check (length(account_label) <= 80),
  product_line  text not null default 'hmo'
                  check (product_line in ('hmo','group_hmo','life','preneed','nonlife')),
  needs         text not null check (length(btrim(needs)) between 5 and 600),
  headcount     int check (headcount between 1 and 10000),
  status        text not null default 'draft' check (status in ('draft','open','done','cancelled')),
  notes         text check (length(notes) <= 500),
  ghl_link      text check (ghl_link is null or ghl_link ~ '^https://'),
  sent_at       timestamptz,
  sent_by       uuid references auth.users(id) on delete set null,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  check (client_id is not null or account_label is not null)
);
create index quote_requests_status_idx on public.quote_requests (status, created_at desc);

-- One row per insurer asked.
create table public.quote_asks (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.quote_requests(id) on delete cascade,
  insurer        text not null check (length(btrim(insurer)) between 2 and 60),
  channel        text not null default 'email' check (channel in ('email','insurer_portal','viber','phone')),
  sent_at        timestamptz not null default now(),
  due_on         date not null,
  status         text not null default 'waiting' check (status in ('waiting','quoted','declined','withdrawn')),
  replied_at     timestamptz,
  annual_premium numeric(14,2) check (annual_premium >= 0),
  plan_name      text check (length(plan_name) <= 80),
  reply_notes    text check (length(reply_notes) <= 500),
  chosen         boolean not null default false,
  followup_id    uuid references public.followups(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (request_id, insurer),
  check (status in ('waiting','withdrawn') or replied_at is not null),
  check (status <> 'quoted' or annual_premium is not null),
  check (not chosen or status = 'quoted'),
  check (replied_at is null or replied_at >= sent_at)
);
create index quote_asks_insurer_idx on public.quote_asks (insurer, sent_at desc);
create unique index quote_asks_one_chosen on public.quote_asks (request_id) where chosen;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Business days from a to b (weekends skipped). Same day = 0.
create or replace function public.business_days_between(p_from date, p_to date)
returns int
language sql immutable
as $$
  select count(*)::int
    from generate_series(p_from + 1, p_to, interval '1 day') d
   where extract(isodow from d) < 6;
$$;

-- ---------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------
create or replace function public.quote_requests_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not followup_text_is_minimal(new.needs) or not followup_text_is_minimal(new.notes)
     or not followup_text_is_minimal(new.account_label) then
    raise exception 'Leave out ID, card, account and phone numbers. Keep those with the insurer.'
      using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.sent_at := null; new.sent_by := null; new.closed_at := null;
    new.created_by := auth.uid();
    return new;
  end if;
  -- Status, sending and closing only move through the functions below.
  if current_setting('app.quote_action', true) is distinct from 'on' then
    if new.status is distinct from old.status and not (old.status = 'draft' and new.status = 'cancelled') then
      raise exception 'Use Send, Pick or Cancel to change a request''s status' using errcode = '22023';
    end if;
    new.sent_at := old.sent_at; new.sent_by := old.sent_by; new.closed_at := old.closed_at;
    if old.status in ('done','cancelled') then
      raise exception 'This request is closed' using errcode = '22023';
    end if;
    if old.status = 'open' and new.product_line is distinct from old.product_line then
      raise exception 'The product cannot change after the request was sent' using errcode = '22023';
    end if;
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then new.closed_at := now(); end if;
  new.ref_code := old.ref_code;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
create trigger quote_requests_guard before insert or update on public.quote_requests
  for each row execute function public.quote_requests_guard();

-- quote_asks are written only by the functions below.
create or replace function public.quote_asks_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('app.quote_action', true) is distinct from 'on' then
    raise exception 'Use Send, Log reply or Pick to change insurer replies' using errcode = '42501';
  end if;
  if not followup_text_is_minimal(new.reply_notes) or not followup_text_is_minimal(new.plan_name) then
    raise exception 'Leave out ID, card, account and phone numbers. Keep those with the insurer.'
      using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger quote_asks_guard before insert or update on public.quote_asks
  for each row execute function public.quote_asks_guard();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.quote_requests enable row level security;
alter table public.quote_asks enable row level security;
revoke all on public.quote_requests, public.quote_asks from anon, authenticated;
grant select, insert, update, delete on public.quote_requests to authenticated;
grant select on public.quote_asks to authenticated;
grant usage on sequence public.quote_request_no to authenticated;

create policy quote_requests_select on public.quote_requests for select to authenticated
  using (public.has_permission('quotes.view'));
create policy quote_requests_insert on public.quote_requests for insert to authenticated
  with check (public.has_permission('quotes.create'));
create policy quote_requests_update on public.quote_requests for update to authenticated
  using (public.has_permission('quotes.edit'))
  with check (public.has_permission('quotes.edit'));
create policy quote_requests_delete on public.quote_requests for delete to authenticated
  using (public.has_permission('quotes.delete'));
create policy quote_asks_select on public.quote_asks for select to authenticated
  using (public.has_permission('quotes.view'));

-- ---------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------

-- Karla sends the request to one or more insurers (or adds insurers to a
-- request already out). Each insurer gets a reply-by date target_days
-- business days out, and optionally a follow-up item so Felix chases it.
create or replace function public.send_quote_request(
  p_id uuid, p_insurers text[], p_channel text default 'email', p_add_followups boolean default true)
returns setof public.quote_asks
language plpgsql security definer set search_path = public
as $$
declare
  r quote_requests;
  s quote_settings;
  v_ins text;
  v_due date;
  v_fid uuid;
  v_n int := 0;
begin
  if not has_permission('quotes.approve') then
    raise exception 'Only Karla can send quote requests to insurers' using errcode = '42501';
  end if;
  select * into r from quote_requests where id = p_id for update;
  if not found then raise exception 'Quote request not found' using errcode = 'P0002'; end if;
  if r.status not in ('draft','open') then
    raise exception 'This request is closed' using errcode = '22023';
  end if;
  if p_channel not in ('email','insurer_portal','viber','phone') then
    raise exception 'Unknown channel %', p_channel using errcode = '22023';
  end if;
  select * into s from quote_settings;
  v_due := add_business_days(current_date, s.target_days);

  perform set_config('app.quote_action', 'on', true);
  foreach v_ins in array coalesce(p_insurers, '{}') loop
    v_ins := btrim(v_ins);
    continue when v_ins = '' or exists (select 1 from quote_asks where request_id = p_id and lower(insurer) = lower(v_ins));
    v_fid := null;
    if p_add_followups and has_permission('followups.create') then
      insert into followups (title, kind, party, insurer, reference, channel, due_on, next_chase_on, notes)
      values ('Quote from insurer', 'insurer_reply', 'insurer', v_ins, r.ref_code,
              case when p_channel = 'insurer_portal' then 'insurer_portal' when p_channel = 'viber' then 'viber'
                   when p_channel = 'phone' then 'phone' else 'email' end,
              v_due, v_due, left(r.needs, 200))
      returning id into v_fid;
    end if;
    insert into quote_asks (request_id, insurer, channel, due_on, followup_id)
    values (p_id, v_ins, p_channel, v_due, v_fid);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    perform set_config('app.quote_action', '', true);
    raise exception 'Pick at least one insurer that has not been asked yet' using errcode = '22023';
  end if;
  update quote_requests set status = 'open',
         sent_at = coalesce(r.sent_at, now()), sent_by = coalesce(r.sent_by, auth.uid())
   where id = p_id;
  perform set_config('app.quote_action', '', true);
  return query select * from quote_asks where request_id = p_id order by sent_at, insurer;
end;
$$;

-- The insurer replied (quoted or declined), or undo back to waiting.
-- Closes (or reopens) the linked follow-up item.
create or replace function public.record_quote_reply(
  p_ask_id uuid, p_status text, p_annual_premium numeric default null, p_plan_name text default null,
  p_note text default null, p_replied_at timestamptz default null)
returns public.quote_asks
language plpgsql security definer set search_path = public
as $$
declare
  a quote_asks;
  r quote_requests;
  v_at timestamptz := coalesce(p_replied_at, now());
begin
  if not has_permission('quotes.edit') then
    raise exception 'You do not have permission to log insurer replies' using errcode = '42501';
  end if;
  if p_status not in ('quoted','declined','waiting') then
    raise exception 'Unknown reply %', p_status using errcode = '22023';
  end if;
  select * into a from quote_asks where id = p_ask_id for update;
  if not found then raise exception 'Insurer reply not found' using errcode = 'P0002'; end if;
  select * into r from quote_requests where id = a.request_id;
  if r.status <> 'open' then raise exception 'This request is closed' using errcode = '22023'; end if;
  if a.chosen then raise exception 'Karla already picked this quote' using errcode = '22023'; end if;
  if p_status = 'quoted' and p_annual_premium is null then
    raise exception 'Enter the annual premium the insurer quoted' using errcode = '22023';
  end if;
  if p_status <> 'waiting' and (v_at > now() + interval '5 minutes' or v_at < a.sent_at) then
    raise exception 'The reply date must be between the day it was sent and today' using errcode = '22023';
  end if;

  perform set_config('app.quote_action', 'on', true);
  update quote_asks set
    status = p_status,
    replied_at = case when p_status = 'waiting' then null else v_at end,
    annual_premium = case when p_status = 'quoted' then p_annual_premium end,
    plan_name = case when p_status = 'quoted' then nullif(btrim(p_plan_name), '') end,
    reply_notes = nullif(btrim(p_note), '')
  where id = p_ask_id
  returning * into a;
  perform set_config('app.quote_action', '', true);

  if a.followup_id is not null then
    if p_status = 'waiting' then
      update followups set status = 'open' where id = a.followup_id and status = 'done';
    else
      update followups set status = 'done'
       where id = a.followup_id and status in ('open','waiting','escalated');
    end if;
  end if;
  return a;
end;
$$;

-- Karla picks the quote that goes into the proposal. Closes the request;
-- insurers still waiting are withdrawn and their chases cancelled.
create or replace function public.choose_quote(p_ask_id uuid)
returns public.quote_requests
language plpgsql security definer set search_path = public
as $$
declare
  a quote_asks;
  r quote_requests;
begin
  if not has_permission('quotes.approve') then
    raise exception 'Only Karla can pick the quote for the proposal' using errcode = '42501';
  end if;
  select * into a from quote_asks where id = p_ask_id;
  if not found then raise exception 'Insurer reply not found' using errcode = 'P0002'; end if;
  if a.status <> 'quoted' then raise exception 'Only a quote the insurer sent can be picked' using errcode = '22023'; end if;
  select * into r from quote_requests where id = a.request_id for update;
  if r.status <> 'open' then raise exception 'This request is closed' using errcode = '22023'; end if;

  perform set_config('app.quote_action', 'on', true);
  update quote_asks set chosen = (id = p_ask_id) where request_id = a.request_id;
  update quote_asks set status = 'withdrawn' where request_id = a.request_id and status = 'waiting';
  update quote_requests set status = 'done', closed_at = now() where id = a.request_id returning * into r;
  perform set_config('app.quote_action', '', true);

  if has_permission('followups.approve') then
    update followups set status = 'cancelled'
     where id in (select followup_id from quote_asks where request_id = a.request_id and status = 'withdrawn')
       and status in ('open','waiting','escalated');
  end if;
  insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()), 'quotes.chosen', 'quote_request', r.id::text,
          jsonb_build_object('ref', r.ref_code, 'insurer', a.insurer));
  return r;
end;
$$;

-- Cancel a request. Drafts: anyone who can edit. Sent requests: Karla.
create or replace function public.cancel_quote_request(p_id uuid)
returns public.quote_requests
language plpgsql security definer set search_path = public
as $$
declare
  r quote_requests;
begin
  select * into r from quote_requests where id = p_id for update;
  if not found then raise exception 'Quote request not found' using errcode = 'P0002'; end if;
  if not has_permission(case when r.status = 'draft' then 'quotes.edit' else 'quotes.approve' end) then
    raise exception 'Only Karla can cancel a request that was already sent' using errcode = '42501';
  end if;
  if r.status not in ('draft','open') then raise exception 'This request is closed' using errcode = '22023'; end if;
  perform set_config('app.quote_action', 'on', true);
  update quote_asks set status = 'withdrawn' where request_id = p_id and status = 'waiting';
  update quote_requests set status = 'cancelled', closed_at = now() where id = p_id returning * into r;
  perform set_config('app.quote_action', '', true);
  if has_permission('followups.approve') then
    update followups set status = 'cancelled'
     where id in (select followup_id from quote_asks where request_id = p_id and status = 'withdrawn')
       and status in ('open','waiting','escalated');
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------
-- Scorecard: how each insurer answers our quote requests.
--   p_days          look back this many days (by the date we asked)
--   p_product_line  optional filter
-- turnaround = business days from asking to the reply (same day = 0)
-- on_time    = replied by the reply-by date
-- chases     = follow-ups the assistant sent for that ask
-- ---------------------------------------------------------------------
create or replace function public.quote_scorecard(p_days int default 90, p_product_line text default null)
returns table (
  insurer text, asked int, replied int, quoted int, declined int, waiting int, overdue int,
  median_days numeric, avg_days numeric, on_time int, on_time_pct numeric, reply_pct numeric,
  chases int, chosen int, score int, grade text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not has_permission('quotes.view') then
    raise exception 'You do not have permission to see the scorecard' using errcode = '42501';
  end if;
  return query
  with base as (
    select a.*,
           case when a.replied_at is not null
                then business_days_between((a.sent_at at time zone 'Asia/Manila')::date,
                                           (a.replied_at at time zone 'Asia/Manila')::date) end as tat,
           coalesce(f.attempts, 0) as n_chases
      from quote_asks a
      join quote_requests q on q.id = a.request_id
      left join followups f on f.id = a.followup_id
     where a.sent_at >= now() - make_interval(days => greatest(p_days, 1))
       and (p_product_line is null or q.product_line = p_product_line)
       and a.status <> 'withdrawn'
  ), agg as (
    select b.insurer,
           count(*)::int as asked,
           count(*) filter (where b.status in ('quoted','declined'))::int as replied,
           count(*) filter (where b.status = 'quoted')::int as quoted,
           count(*) filter (where b.status = 'declined')::int as declined,
           count(*) filter (where b.status = 'waiting')::int as waiting,
           count(*) filter (where b.status = 'waiting' and b.due_on < current_date)::int as overdue,
           percentile_cont(0.5) within group (order by b.tat) as median_days,
           avg(b.tat) as avg_days,
           count(*) filter (where b.replied_at is not null
                            and (b.replied_at at time zone 'Asia/Manila')::date <= b.due_on)::int as on_time,
           -- asks that count for on-time: replied, or still waiting past the date
           count(*) filter (where b.replied_at is not null or b.due_on < current_date)::int as judged,
           sum(b.n_chases)::int as chases,
           count(*) filter (where b.chosen)::int as chosen
      from base b
     group by b.insurer
  )
  select g.insurer, g.asked, g.replied, g.quoted, g.declined, g.waiting, g.overdue,
         round(g.median_days::numeric, 1), round(g.avg_days::numeric, 1),
         g.on_time,
         case when g.judged > 0 then round(100.0 * g.on_time / g.judged) end,
         round(100.0 * g.replied / g.asked),
         g.chases, g.chosen,
         case when g.asked >= 3 and g.judged > 0
              then round(60.0 * g.on_time / g.judged + 40.0 * g.replied / g.asked)::int end,
         case when g.asked < 3 or g.judged = 0 then null
              when 60.0 * g.on_time / g.judged + 40.0 * g.replied / g.asked >= 85 then 'A'
              when 60.0 * g.on_time / g.judged + 40.0 * g.replied / g.asked >= 70 then 'B'
              when 60.0 * g.on_time / g.judged + 40.0 * g.replied / g.asked >= 50 then 'C'
              else 'D' end
    from agg g
   order by 15 desc nulls last, g.median_days nulls last, g.insurer;
end;
$$;

create or replace function public.export_quote_requests()
returns table (
  ref_code text, account text, product_line text, needs text, request_status text, insurer text, channel text,
  sent_at timestamptz, due_on date, reply text, replied_at timestamptz, turnaround_days int,
  annual_premium numeric, plan_name text, chosen boolean)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not has_permission('quotes.export') then
    raise exception 'You do not have permission to export quote requests' using errcode = '42501';
  end if;
  return query
  select q.ref_code, coalesce(c.full_name, q.account_label), q.product_line, q.needs, q.status, a.insurer, a.channel,
         a.sent_at, a.due_on, a.status, a.replied_at,
         case when a.replied_at is not null
              then business_days_between((a.sent_at at time zone 'Asia/Manila')::date,
                                         (a.replied_at at time zone 'Asia/Manila')::date) end,
         a.annual_premium, a.plan_name, a.chosen
    from quote_requests q
    left join clients c on c.id = q.client_id
    left join quote_asks a on a.request_id = q.id
   order by q.created_at desc, a.insurer;
end;
$$;

revoke all on function public.send_quote_request(uuid, text[], text, boolean) from public, anon;
revoke all on function public.record_quote_reply(uuid, text, numeric, text, text, timestamptz) from public, anon;
revoke all on function public.choose_quote(uuid) from public, anon;
revoke all on function public.cancel_quote_request(uuid) from public, anon;
revoke all on function public.quote_scorecard(int, text) from public, anon;
revoke all on function public.export_quote_requests() from public, anon;
grant execute on function public.send_quote_request(uuid, text[], text, boolean) to authenticated;
grant execute on function public.record_quote_reply(uuid, text, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.choose_quote(uuid) to authenticated;
grant execute on function public.cancel_quote_request(uuid) to authenticated;
grant execute on function public.quote_scorecard(int, text) to authenticated;
grant execute on function public.export_quote_requests() to authenticated;
