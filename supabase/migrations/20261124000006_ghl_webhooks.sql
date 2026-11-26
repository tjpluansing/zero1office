-- =====================================================================
-- GoHighLevel webhooks, sync log and retry queue
--
-- GHL → Edge Function `ghl-webhook` → integration_events (inbox) →
-- process_integration_events() → clients.
--
-- * Every delivery is checked before it is stored: GHL's Ed25519
--   signature (X-GHL-Signature) or our own webhook secret header for
--   GHL Workflow "Custom Webhook" actions. Only a SHA-256 hash of that
--   secret is kept; the secret itself is shown once to the admin.
-- * Each event is stored once (idempotency key), so GHL re-sending the
--   same event never creates a duplicate client.
-- * Failures retry with growing waits (1, 4, 16, 64 min, 4 h, 6 h) and
--   then stop as "failed" so someone can look and press Retry.
-- * Raw payloads hold client details, so the browser never reads them,
--   and they are blanked after 30 days and deleted after 180.
-- =====================================================================

-- ---------- Clients: link to the GHL contact ----------
alter table public.clients
  add column ghl_contact_id text unique,
  add column source text not null default 'manual' check (source in ('manual', 'ghl', 'import'));

-- ---------- Webhook secret (hash only) ----------
alter table public.integrations
  add column webhook_secret_hash   text,
  add column webhook_secret_hint   text,
  add column webhook_secret_set_at timestamptz,
  add column last_event_at         timestamptz;

grant select (webhook_secret_hint, webhook_secret_set_at, last_event_at) on public.integrations to authenticated;

-- ---------- Event inbox / retry queue ----------
create table public.integration_events (
  id               bigint generated always as identity primary key,
  integration_id   text not null references public.integrations(id),
  event_id         text not null,                       -- idempotency key
  event_type       text not null,
  summary          text,                                -- short, no full details
  verified_by      text not null check (verified_by in ('ghl_signature', 'webhook_secret', 'test')),
  payload          jsonb not null,
  status           text not null default 'pending'
                     check (status in ('pending', 'retrying', 'done', 'ignored', 'failed')),
  attempts         int not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  result           text,                                -- what happened, e.g. "Added client"
  client_id        uuid references public.clients(id) on delete set null,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  unique (integration_id, event_id)
);
create index integration_events_queue_idx on public.integration_events (next_attempt_at)
  where status in ('pending', 'retrying');
create index integration_events_recent_idx on public.integration_events (integration_id, received_at desc);

-- One row per processing pass that did any work.
create table public.integration_runs (
  id              bigint generated always as identity primary key,
  integration_id  text not null references public.integrations(id),
  trigger         text not null check (trigger in ('webhook', 'schedule', 'manual')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  processed       int not null default 0,
  succeeded       int not null default 0,
  ignored         int not null default 0,
  will_retry      int not null default 0,
  failed          int not null default 0
);
create index integration_runs_recent_idx on public.integration_runs (integration_id, started_at desc);

create or replace function public.integration_max_attempts() returns int
language sql immutable as $$ select 6 $$;

-- ---------- Server: store a verified delivery ----------
create or replace function public.ghl_ingest_event(p_event_id text, p_payload jsonb, p_verified_by text)
returns bigint      -- the new event id, or null if it was already received
language plpgsql security definer set search_path = public
as $$
declare
  v_type  text := coalesce(nullif(p_payload->>'type', ''),
                           case when p_payload ? 'contact_id' then 'ContactUpsert' else 'Unknown' end);
  v_first text := coalesce(p_payload->>'firstName', p_payload->>'first_name');
  v_last  text := coalesce(p_payload->>'lastName', p_payload->>'last_name');
  v_id    bigint;
begin
  insert into integration_events (integration_id, event_id, event_type, summary, verified_by, payload)
  values ('ghl',
          coalesce(nullif(p_event_id, ''), encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex')),
          left(v_type, 60),
          -- first name and last initial only, so the log is safe to show
          nullif(trim(coalesce(v_first, split_part(coalesce(p_payload->>'full_name', p_payload->>'name', ''), ' ', 1), '')
                      || ' ' || coalesce(left(v_last, 1) || '.', '')), ''),
          p_verified_by, p_payload)
  on conflict (integration_id, event_id) do nothing
  returning id into v_id;
  update integrations set last_event_at = now() where id = 'ghl';
  return v_id;
end;
$$;

-- ---------- Apply one GHL event (raises on failure) ----------
-- Error code 22023 = the event itself is unusable: stop, don't retry.
create or replace function public.ghl_apply_event(p_event public.integration_events)
returns table (outcome text, client uuid)
language plpgsql security definer set search_path = public
as $$
declare
  p        jsonb := p_event.payload;
  cfg      jsonb;
  v_loc    text := coalesce(p->>'locationId', p->>'location_id', p#>>'{location,id}');
  v_cid    text := coalesce(p->>'contact_id', p->>'contactId', case when p->>'type' like 'Contact%' then p->>'id' end);
  v_first  text := nullif(trim(coalesce(p->>'firstName', p->>'first_name', '')), '');
  v_last   text := nullif(trim(coalesce(p->>'lastName', p->>'last_name', '')), '');
  v_name   text;   -- for a new client: falls back to email or phone
  v_real   text;   -- an actual name, the only thing allowed to overwrite one
  v_email  text := nullif(lower(trim(coalesce(p->>'email', ''))), '');
  v_phone  text := nullif(trim(coalesce(p->>'phone', '')), '');
  v_co     text := nullif(trim(coalesce(p->>'companyName', p->>'company_name', '')), '');
  v_client uuid;
  v_new    boolean;
begin
  select config into cfg from integrations where id = 'ghl';
  if coalesce(cfg->>'location_id', '') <> '' and v_loc is not null and v_loc <> cfg->>'location_id' then
    return query select 'ignored: from another GHL sub-account', null::uuid; return;
  end if;
  if p_event.event_type not in ('ContactCreate', 'ContactUpdate', 'ContactUpsert', 'ContactDelete') then
    return query select 'ignored: not handled yet', null::uuid; return;
  end if;
  if coalesce((cfg->>'sync_contacts')::boolean, false) = false then
    return query select 'ignored: contact sync is off', null::uuid; return;
  end if;
  if v_cid is null then
    raise exception 'No contact ID in the event' using errcode = '22023';
  end if;
  if p_event.event_type = 'ContactDelete' then
    -- Never delete a client because of GHL; Karla decides.
    select id into v_client from clients where ghl_contact_id = v_cid;
    return query select 'ignored: deleted in GHL, client kept here', v_client; return;
  end if;

  v_real := coalesce(nullif(trim(concat_ws(' ', v_first, v_last)), ''),
                     nullif(trim(coalesce(p->>'full_name', p->>'name', p->>'contactName', '')), ''));
  v_name := coalesce(v_real, v_email, v_phone);
  if v_name is null then
    raise exception 'Contact has no name, email or phone' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    v_email := null;
  end if;

  insert into clients (full_name, company, email, phone, ghl_contact_id, source, created_by)
  values (left(v_name, 200), left(v_co, 200), v_email, left(v_phone, 40), v_cid, 'ghl', null)
  on conflict (ghl_contact_id) do update set
    full_name  = coalesce(left(v_real, 200), clients.full_name),
    company    = coalesce(left(v_co, 200), clients.company),
    email      = coalesce(v_email, clients.email),
    phone      = coalesce(left(v_phone, 40), clients.phone),
    updated_at = now()
  returning id, (xmax = 0) into v_client, v_new;

  return query select case when v_new then 'Added client' else 'Updated client' end, v_client;
end;
$$;

-- ---------- Process the queue ----------
create or replace function public.process_integration_events(p_limit int default 50, p_trigger text default 'schedule')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  e        integration_events;
  v_run    bigint;
  v_out    text;
  v_client uuid;
  n_ok int := 0; n_ign int := 0; n_retry int := 0; n_fail int := 0;
  v_paused boolean;
begin
  select not enabled into v_paused from integrations where id = 'ghl';
  if v_paused then
    return jsonb_build_object('processed', 0, 'paused', true);
  end if;

  for e in
    select * from integration_events
     where status in ('pending', 'retrying') and next_attempt_at <= now()
     order by received_at
     limit greatest(1, least(p_limit, 500))
     for update skip locked
  loop
    if v_run is null then
      insert into integration_runs (integration_id, trigger) values ('ghl', p_trigger) returning id into v_run;
    end if;
    begin
      select outcome, client into v_out, v_client from ghl_apply_event(e);
      update integration_events set
        status = case when v_out like 'ignored:%' then 'ignored' else 'done' end,
        result = v_out, client_id = v_client, attempts = attempts + 1,
        last_error = null, processed_at = now()
      where id = e.id;
      if v_out like 'ignored:%' then n_ign := n_ign + 1; else n_ok := n_ok + 1; end if;
    exception when others then
      if sqlstate = '22023' or e.attempts + 1 >= integration_max_attempts() then
        update integration_events set status = 'failed', attempts = attempts + 1,
               last_error = left(sqlerrm, 300), processed_at = now()
         where id = e.id;
        n_fail := n_fail + 1;
      else
        update integration_events set status = 'retrying', attempts = attempts + 1,
               last_error = left(sqlerrm, 300),
               next_attempt_at = now() + least(interval '1 minute' * power(4, e.attempts), interval '6 hours')
         where id = e.id;
        n_retry := n_retry + 1;
      end if;
    end;
  end loop;

  if v_run is not null then
    update integration_runs set finished_at = now(), processed = n_ok + n_ign + n_retry + n_fail,
           succeeded = n_ok, ignored = n_ign, will_retry = n_retry, failed = n_fail
     where id = v_run;
  end if;
  return jsonb_build_object('processed', n_ok + n_ign + n_retry + n_fail, 'succeeded', n_ok,
                            'ignored', n_ign, 'will_retry', n_retry, 'failed', n_fail);
end;
$$;

-- ---------- Admin: retry a failed event ----------
create or replace function public.integration_retry_event(p_event bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
begin
  if not has_permission('integrations.edit') then
    raise exception 'You do not have permission to change integrations' using errcode = '42501';
  end if;
  select status into v_status from integration_events where id = p_event for update;
  if v_status is null then
    raise exception 'Event not found' using errcode = '22023';
  end if;
  if v_status not in ('failed', 'retrying') then
    raise exception 'Only failed or waiting events can be retried' using errcode = '22023';
  end if;
  update integration_events set status = 'pending', next_attempt_at = now(),
         attempts = case when status = 'failed' then 0 else attempts end
   where id = p_event;
  insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()), 'integration.event_retried',
          'integration', 'ghl', jsonb_build_object('event', p_event, 'integration', 'ghl'));
  return process_integration_events(50, 'manual');
end;
$$;

-- ---------- Admin: create / replace the webhook secret ----------
-- Returns the secret once. Only its hash is stored.
create or replace function public.integration_new_webhook_secret(p_id text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_secret text := 'whsec_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not has_permission('integrations.edit') then
    raise exception 'You do not have permission to change integrations' using errcode = '42501';
  end if;
  if p_id <> 'ghl' then
    raise exception 'Webhooks are only available for GoHighLevel' using errcode = '22023';
  end if;
  update integrations set
    webhook_secret_hash   = encode(sha256(convert_to(v_secret, 'UTF8')), 'hex'),
    webhook_secret_hint   = right(v_secret, 4),
    webhook_secret_set_at = now(),
    updated_at = now(), updated_by = auth.uid()
  where id = p_id;
  insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()), 'integration.webhook_secret',
          'integration', p_id, jsonb_build_object('integration', p_id));
  return v_secret;
end;
$$;

-- ---------- Server: check a delivered webhook secret ----------
create or replace function public.integration_check_webhook_secret(p_id text, p_secret text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select webhook_secret_hash is not null
     and webhook_secret_hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex')
  from integrations where id = p_id;
$$;

-- ---------- Retention ----------
create or replace function public.purge_integration_events()
returns void
language sql security definer set search_path = public
as $$
  update integration_events set payload = '{}'::jsonb
   where status in ('done', 'ignored', 'failed') and received_at < now() - interval '30 days' and payload <> '{}'::jsonb;
  delete from integration_events where received_at < now() - interval '180 days';
  delete from integration_runs where started_at < now() - interval '180 days';
$$;

-- ---------- Access ----------
alter table public.integration_events enable row level security;
alter table public.integration_runs enable row level security;
revoke all on public.integration_events, public.integration_runs from anon, authenticated;
-- No `payload` for the browser: it holds the client's details.
grant select (id, integration_id, event_id, event_type, summary, verified_by, status, attempts, next_attempt_at,
              last_error, result, client_id, received_at, processed_at)
  on public.integration_events to authenticated;
grant select on public.integration_runs to authenticated;
create policy integration_events_read on public.integration_events for select to authenticated
  using (public.has_permission('integrations.view'));
create policy integration_runs_read on public.integration_runs for select to authenticated
  using (public.has_permission('integrations.view'));

revoke all on function public.ghl_ingest_event(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.ghl_apply_event(public.integration_events) from public, anon, authenticated;
revoke all on function public.process_integration_events(int, text) from public, anon, authenticated;
revoke all on function public.integration_check_webhook_secret(text, text) from public, anon, authenticated;
revoke all on function public.purge_integration_events() from public, anon, authenticated;
revoke all on function public.integration_retry_event(bigint) from public, anon;
revoke all on function public.integration_new_webhook_secret(text) from public, anon;
grant execute on function public.ghl_ingest_event(text, jsonb, text) to service_role;
grant execute on function public.process_integration_events(int, text) to service_role;
grant execute on function public.integration_check_webhook_secret(text, text) to service_role;
grant execute on function public.purge_integration_events() to service_role;
grant execute on function public.integration_retry_event(bigint) to authenticated;
grant execute on function public.integration_new_webhook_secret(text) to authenticated;
