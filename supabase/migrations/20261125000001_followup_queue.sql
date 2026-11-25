-- =====================================================================
-- Follow-up queue: pending requirements and replies that Ask Karla is
-- chasing from clients and insurers.
--
-- Who does what
--   Felix (AI employee)  drafts every chase message from the item's details.
--   Assistant            sends the draft, logs it, marks items received.
--   Karla (agent)        gets anything escalated, and is the one who can
--                        waive or cancel a requirement (followups.approve).
--
-- Data kept here is only what is needed to chase: a short description of
-- what is missing, who has it, and when we last asked. The documents
-- themselves (IDs, medical, payments) go straight to the insurer and are
-- never stored. Long digit runs (ID, card or account numbers) are refused.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permissions and presets
-- ---------------------------------------------------------------------
insert into public.permissions (key, page, page_label, action, description, sort) values
  ('followups.view',    'followups', 'Follow-ups', 'view',    'See the follow-up queue', 46),
  ('followups.create',  'followups', 'Follow-ups', 'create',  'Add pending items to chase', 47),
  ('followups.edit',    'followups', 'Follow-ups', 'edit',    'Log chases, mark received, escalate to Karla', 48),
  ('followups.delete',  'followups', 'Follow-ups', 'delete',  'Delete follow-up items', 49),
  ('followups.export',  'followups', 'Follow-ups', 'export',  'Export the follow-up queue', 49),
  ('followups.approve', 'followups', 'Follow-ups', 'approve', 'Waive or cancel a requirement, reopen a waived item', 49);

insert into public.role_permissions (role_id, permission_key)
select 'agent', key from public.permissions where page = 'followups';

insert into public.role_permissions (role_id, permission_key) values
  ('assistant', 'followups.view'), ('assistant', 'followups.create'), ('assistant', 'followups.edit');

update public.roles
   set description = 'Follows up pending items: works the follow-up queue, adds and updates clients, drafts quotes, sees billing status. No approvals, deletes, exports, reports or admin.'
 where id = 'assistant';

-- ---------------------------------------------------------------------
-- Settings (one row). Mirrored in src/lib/followups.ts for the demo.
-- ---------------------------------------------------------------------
create table public.followup_settings (
  id                      boolean primary key default true check (id),
  chase_every_days        int not null default 2 check (chase_every_days between 1 and 30),
  max_attempts            int not null default 3 check (max_attempts between 1 and 20),
  escalate_overdue_days   int not null default 2 check (escalate_overdue_days between 0 and 60),
  updated_at              timestamptz not null default now()
);
insert into public.followup_settings default values;

alter table public.followup_settings enable row level security;
revoke all on public.followup_settings from anon, authenticated;
grant select, update on public.followup_settings to authenticated;
create policy followup_settings_select on public.followup_settings for select to authenticated
  using (public.has_permission('followups.view'));
create policy followup_settings_update on public.followup_settings for update to authenticated
  using (public.has_permission('admin_settings.edit'))
  with check (public.has_permission('admin_settings.edit'));

-- ---------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------
create table public.followups (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (length(btrim(title)) between 3 and 140),
  kind               text not null default 'document'
                       check (kind in ('document','signature','payment','insurer_reply','client_reply','other')),
  -- who we are waiting on
  party              text not null default 'client' check (party in ('client','insurer')),
  client_id          uuid references public.clients(id) on delete set null,
  insurer            text check (length(insurer) <= 60),
  -- application / SOA / policy reference, as the insurer writes it
  reference          text check (length(reference) <= 40),
  channel            text not null default 'email'
                       check (channel in ('email','viber','messenger','phone','sms','insurer_portal')),
  status             text not null default 'open'
                       check (status in ('open','waiting','escalated','done','waived','cancelled')),
  due_on             date,
  next_chase_on      date not null default current_date,
  attempts           int  not null default 0 check (attempts >= 0),
  last_chased_at     timestamptz,
  escalation_reason  text check (length(escalation_reason) <= 200),
  felix_drafts       boolean not null default true,
  assignee_id        uuid references public.profiles(id) on delete set null default auth.uid(),
  notes              text check (length(notes) <= 500),
  ghl_link           text check (ghl_link is null or ghl_link ~ '^https://'),
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at         timestamptz not null default now(),
  closed_at          timestamptz,
  closed_by          uuid references auth.users(id) on delete set null,
  check (party = 'insurer' or client_id is not null or status in ('done','waived','cancelled')),
  check (party = 'client' or insurer is not null)
);
create index followups_open_idx on public.followups (next_chase_on) where status in ('open','waiting','escalated');
create index followups_client_idx on public.followups (client_id);

create table public.followup_events (
  id           bigint generated always as identity primary key,
  followup_id  uuid not null references public.followups(id) on delete cascade,
  at           timestamptz not null default now(),
  actor_id     uuid,
  actor_label  text not null,           -- 'Felix' or the user's email
  kind         text not null check (kind in ('created','chased','status','escalated','note','edited')),
  channel      text,
  note         text check (length(note) <= 500),
  details      jsonb not null default '{}'::jsonb
);
create index followup_events_item_idx on public.followup_events (followup_id, at desc);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.add_business_days(p_from date, p_days int)
returns date
language plpgsql immutable
as $$
declare
  d date := p_from;
  n int := 0;
begin
  while n < p_days loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end;
$$;

create or replace function public.followup_actor()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select email::text from profiles where id = auth.uid()), 'system');
$$;

-- Refuse ID, card, account or phone numbers in free text.
create or replace function public.followup_text_is_minimal(p text)
returns boolean
language sql immutable
as $$
  select p is null or p !~ '[0-9][0-9 -]{7,}[0-9]';
$$;

-- ---------------------------------------------------------------------
-- Guards: who may change what. RLS decides whether a row can be touched;
-- this trigger decides which transitions are allowed.
-- ---------------------------------------------------------------------
create or replace function public.followups_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_closed constant text[] := array['done','waived','cancelled'];
begin
  if not followup_text_is_minimal(new.title) or not followup_text_is_minimal(new.notes)
     or not followup_text_is_minimal(new.escalation_reason) then
    raise exception 'Leave out ID, card, account and phone numbers. Keep those with the insurer.'
      using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('open','waiting') then
      raise exception 'New follow-ups start as open' using errcode = '22023';
    end if;
    new.attempts := 0;
    new.last_chased_at := null;
    new.closed_at := null;
    new.closed_by := null;
    new.created_by := auth.uid();
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if new.status in ('waived','cancelled') and not has_permission('followups.approve') then
      raise exception 'Only Karla can waive or cancel a requirement. Escalate it instead.'
        using errcode = '42501';
    end if;
    if old.status in ('waived','cancelled') and not has_permission('followups.approve') then
      raise exception 'Only Karla can reopen a waived or cancelled item.' using errcode = '42501';
    end if;
    if new.status = any (v_closed) then
      new.closed_at := now();
      new.closed_by := auth.uid();
    else
      new.closed_at := null;
      new.closed_by := null;
    end if;
    if new.status <> 'escalated' and old.status = 'escalated' and new.status <> all (v_closed) then
      new.escalation_reason := null;
    end if;
  end if;

  -- Counters only move through log_followup_chase().
  if current_setting('app.followup_chase', true) is distinct from 'on' then
    new.attempts := old.attempts;
    new.last_chased_at := old.last_chased_at;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger followups_guard before insert or update on public.followups
  for each row execute function public.followups_guard();

-- Timeline entries for every insert / status change, so the history is
-- complete even when the table is edited directly.
create or replace function public.followups_history()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into followup_events (followup_id, actor_id, actor_label, kind, details)
    values (new.id, auth.uid(), followup_actor(), 'created',
            jsonb_build_object('title', new.title, 'party', new.party));
  elsif new.status is distinct from old.status
        and not (new.status = 'waiting' and current_setting('app.followup_chase', true) = 'on') then
    insert into followup_events (followup_id, actor_id, actor_label, kind, details)
    values (new.id, auth.uid(), followup_actor(),
            case when new.status = 'escalated' then 'escalated' else 'status' end,
            jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.escalation_reason));
  elsif (new.title, new.due_on, new.next_chase_on, new.channel, new.notes, new.assignee_id)
        is distinct from
        (old.title, old.due_on, old.next_chase_on, old.channel, old.notes, old.assignee_id)
        and current_setting('app.followup_chase', true) is distinct from 'on' then
    insert into followup_events (followup_id, actor_id, actor_label, kind)
    values (new.id, auth.uid(), followup_actor(), 'edited');
  end if;
  return null;
end;
$$;

create trigger followups_history after insert or update on public.followups
  for each row execute function public.followups_history();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.followups enable row level security;
alter table public.followup_events enable row level security;
revoke all on public.followups, public.followup_events from anon, authenticated;
grant select, insert, update, delete on public.followups to authenticated;
grant select on public.followup_events to authenticated;

create policy followups_select on public.followups for select to authenticated
  using (public.has_permission('followups.view'));
create policy followups_insert on public.followups for insert to authenticated
  with check (public.has_permission('followups.create'));
create policy followups_update on public.followups for update to authenticated
  using (public.has_permission('followups.edit'))
  with check (public.has_permission('followups.edit'));
create policy followups_delete on public.followups for delete to authenticated
  using (public.has_permission('followups.delete'));
create policy followup_events_select on public.followup_events for select to authenticated
  using (public.has_permission('followups.view'));

-- ---------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------

-- The assistant sent a chase (usually Felix's draft). Bumps the attempt
-- count, schedules the next chase, and escalates to Karla when the item
-- has been chased max_attempts times.
create or replace function public.log_followup_chase(
  p_id uuid, p_channel text, p_note text default null, p_from_felix boolean default true)
returns public.followups
language plpgsql security definer set search_path = public
as $$
declare
  s followup_settings;
  f followups;
begin
  if not has_permission('followups.edit') then
    raise exception 'You do not have permission to log follow-ups' using errcode = '42501';
  end if;
  if not followup_text_is_minimal(p_note) then
    raise exception 'Leave out ID, card, account and phone numbers. Keep those with the insurer.'
      using errcode = '22023';
  end if;
  select * into s from followup_settings;
  select * into f from followups where id = p_id for update;
  if not found then raise exception 'Follow-up not found' using errcode = 'P0002'; end if;
  if f.status in ('done','waived','cancelled') then
    raise exception 'This item is already closed' using errcode = '22023';
  end if;

  perform set_config('app.followup_chase', 'on', true);
  update followups set
    attempts       = f.attempts + 1,
    last_chased_at = now(),
    channel        = coalesce(p_channel, f.channel),
    next_chase_on  = add_business_days(current_date, s.chase_every_days),
    status         = case
                       when f.status = 'escalated' then 'escalated'
                       when f.attempts + 1 >= s.max_attempts then 'escalated'
                       else 'waiting' end,
    escalation_reason = case
                       when f.status = 'escalated' then f.escalation_reason
                       when f.attempts + 1 >= s.max_attempts
                         then format('No reply after %s follow-ups', f.attempts + 1)
                       else f.escalation_reason end
  where id = p_id
  returning * into f;
  perform set_config('app.followup_chase', '', true);

  insert into followup_events (followup_id, actor_id, actor_label, kind, channel, note, details)
  values (p_id, auth.uid(), followup_actor(), 'chased', coalesce(p_channel, f.channel), p_note,
          jsonb_build_object('attempt', f.attempts, 'drafted_by', case when p_from_felix then 'Felix' end));
  return f;
end;
$$;

-- Status change with an optional note (received, escalate, waive, reopen).
create or replace function public.set_followup_status(p_id uuid, p_status text, p_note text default null)
returns public.followups
language plpgsql security definer set search_path = public
as $$
declare
  f followups;
begin
  if not has_permission('followups.edit') then
    raise exception 'You do not have permission to update follow-ups' using errcode = '42501';
  end if;
  if not followup_text_is_minimal(p_note) then
    raise exception 'Leave out ID, card, account and phone numbers. Keep those with the insurer.'
      using errcode = '22023';
  end if;
  update followups set
    status = p_status,
    escalation_reason = case when p_status = 'escalated' then coalesce(nullif(btrim(p_note), ''), 'Escalated by ' || followup_actor())
                             else escalation_reason end,
    next_chase_on = case when p_status in ('open','waiting') and next_chase_on < current_date
                         then current_date else next_chase_on end
  where id = p_id
  returning * into f;
  if not found then raise exception 'Follow-up not found' using errcode = 'P0002'; end if;
  if nullif(btrim(p_note), '') is not null and p_status <> 'escalated' then
    insert into followup_events (followup_id, actor_id, actor_label, kind, note)
    values (p_id, auth.uid(), followup_actor(), 'note', p_note);
  end if;
  return f;
end;
$$;

create or replace function public.add_followup_note(p_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not has_permission('followups.edit') then
    raise exception 'You do not have permission to update follow-ups' using errcode = '42501';
  end if;
  if not followup_text_is_minimal(p_note) then
    raise exception 'Leave out ID, card, account and phone numbers. Keep those with the insurer.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from followups where id = p_id) then
    raise exception 'Follow-up not found' using errcode = 'P0002';
  end if;
  insert into followup_events (followup_id, actor_id, actor_label, kind, note)
  values (p_id, auth.uid(), followup_actor(), 'note', left(p_note, 500));
end;
$$;

-- Escalates items that are past their due date by escalate_overdue_days.
-- Meant for a daily schedule (pg_cron, step 7); also safe to call by hand.
create or replace function public.escalate_overdue_followups()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  s followup_settings;
  n int;
begin
  if auth.uid() is not null and not has_permission('followups.edit') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into s from followup_settings;
  update followups
     set status = 'escalated',
         escalation_reason = format('%s days past the due date', current_date - due_on)
   where status in ('open','waiting')
     and due_on is not null
     and current_date - due_on >= s.escalate_overdue_days;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.export_followups()
returns setof public.followups
language plpgsql stable security definer set search_path = public
as $$
begin
  if not has_permission('followups.export') then
    raise exception 'You do not have permission to export follow-ups' using errcode = '42501';
  end if;
  return query select * from followups order by next_chase_on, created_at;
end;
$$;

revoke all on function public.log_followup_chase(uuid, text, text, boolean) from public, anon;
revoke all on function public.set_followup_status(uuid, text, text) from public, anon;
revoke all on function public.add_followup_note(uuid, text) from public, anon;
revoke all on function public.escalate_overdue_followups() from public, anon;
revoke all on function public.export_followups() from public, anon;
grant execute on function public.log_followup_chase(uuid, text, text, boolean) to authenticated;
grant execute on function public.set_followup_status(uuid, text, text) to authenticated;
grant execute on function public.add_followup_note(uuid, text) to authenticated;
grant execute on function public.escalate_overdue_followups() to authenticated, service_role;
grant execute on function public.export_followups() to authenticated;
