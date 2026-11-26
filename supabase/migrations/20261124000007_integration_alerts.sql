-- =====================================================================
-- Integration alerts and key reminders
--
-- One place decides what is wrong with the connected services:
--   * a connection test failed (or the daily health check found it broken)
--   * GHL updates failed, or are stuck retrying for over an hour
--   * webhooks are on but nothing has arrived for 7 days
--   * a key is older than 90 days (rotate), or the Microsoft client
--     secret expires within 30 days / has expired
-- The app shows these as a banner and on Admin → Integrations. The daily
-- health check (Edge Function `integrations`, action "health") emails the
-- Super Admins about new alerts, at most once a day per alert.
-- =====================================================================

-- Microsoft client secrets expire (12 or 24 months); store the date.
create or replace function public.integration_allowed_keys(p_id text)
returns text[]
language sql immutable
as $$
  select case p_id
    when 'ghl'       then array['location_id', 'sync_contacts', 'sync_conversations', 'webhook_enabled']
    when 'm365'      then array['tenant_id', 'client_id', 'mailbox', 'send_email', 'read_calendar', 'secret_expires_on']
    when 'anthropic' then array['default_model', 'monthly_budget_usd']
  end;
$$;

-- Server-side rules, no permission check (callers check).
create or replace function public.integration_alerts_compute()
returns table (alert_key text, integration_id text, severity text, title text, detail text)
language sql stable security definer set search_path = public
as $$
  -- broken connection
  select 'error:' || i.id, i.id, 'red', i.name || ' is not working',
         coalesce(i.last_error, 'The last connection test failed.')
    from integrations i where i.enabled and i.status = 'error'
  union all
  -- key age
  select 'key_age:' || i.id, i.id, 'amber', 'Time to replace the ' || i.name || ' key',
         'The key was saved ' || (current_date - i.secret_set_at::date) || ' days ago. Replace keys every 90 days.'
    from integrations i
   where i.secret_id is not null and i.secret_set_at < now() - interval '90 days'
  union all
  -- Microsoft secret expiry
  select 'expiry:m365', i.id,
         case when (i.config->>'secret_expires_on')::date <= current_date then 'red' else 'amber' end,
         case when (i.config->>'secret_expires_on')::date <= current_date
              then 'The Microsoft 365 client secret has expired'
              else 'The Microsoft 365 client secret expires in '
                   || ((i.config->>'secret_expires_on')::date - current_date) || ' days' end,
         'Create a new secret in Entra ID, paste it on the Microsoft 365 card and update the expiry date.'
    from integrations i
   where i.id = 'm365' and i.secret_id is not null
     and coalesce(i.config->>'secret_expires_on', '') ~ '^\d{4}-\d{2}-\d{2}$'
     and (i.config->>'secret_expires_on')::date <= current_date + 30
  union all
  -- failed GHL updates in the last 7 days
  select 'sync_failed:ghl', 'ghl', 'red',
         count(*) || ' GoHighLevel update' || case when count(*) = 1 then '' else 's' end || ' failed',
         'Open the sync log, fix the cause and press Retry now.'
    from integration_events e
   where e.status = 'failed' and e.processed_at > now() - interval '7 days'
  having count(*) > 0
  union all
  -- retries stuck for over an hour
  select 'sync_stuck:ghl', 'ghl', 'amber',
         count(*) || ' GoHighLevel update' || case when count(*) = 1 then ' is' else 's are' end || ' still retrying',
         'They have been failing for over an hour. Check the sync log.'
    from integration_events e
   where e.status = 'retrying' and e.received_at < now() - interval '1 hour'
  having count(*) > 0
  union all
  -- webhooks quiet
  select 'webhook_quiet:ghl', i.id, 'amber', 'No updates from GoHighLevel for 7 days',
         'Webhooks are on but nothing has arrived. Check that the GHL workflow is published and the secret matches.'
    from integrations i
   where i.id = 'ghl' and i.enabled and coalesce((i.config->>'webhook_enabled')::boolean, false)
     and i.webhook_secret_set_at < now() - interval '7 days'
     and coalesce(i.last_event_at, '-infinity') < now() - interval '7 days';
$$;

-- For the app: only people who can see integrations get alerts.
create or replace function public.integration_alerts()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when has_permission('integrations.view') then
    coalesce((select jsonb_agg(to_jsonb(a) order by a.severity desc, a.alert_key)
              from integration_alerts_compute() a), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

-- Remembers which alerts were emailed, so each is sent at most once a day.
create table public.integration_alert_state (
  alert_key        text primary key,
  first_seen       timestamptz not null default now(),
  last_notified_at timestamptz,
  resolved_at      timestamptz
);
alter table public.integration_alert_state enable row level security;
revoke all on public.integration_alert_state from anon, authenticated;

-- Server (daily health check): which alerts to email now, and to whom.
create or replace function public.integration_alerts_to_notify()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_due jsonb;
begin
  create temp table _now on commit drop as select * from integration_alerts_compute();

  -- resolved alerts
  update integration_alert_state s set resolved_at = now()
   where s.resolved_at is null and not exists (select 1 from _now n where n.alert_key = s.alert_key);
  -- new or returning alerts
  insert into integration_alert_state (alert_key) select alert_key from _now
  on conflict (alert_key) do update set
    resolved_at = null,
    first_seen = case when integration_alert_state.resolved_at is not null then now() else integration_alert_state.first_seen end,
    last_notified_at = case when integration_alert_state.resolved_at is not null then null else integration_alert_state.last_notified_at end;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.severity desc), '[]'::jsonb) into v_due
    from _now n join integration_alert_state s using (alert_key)
   where s.last_notified_at is null or s.last_notified_at < now() - interval '23 hours';

  update integration_alert_state s set last_notified_at = now()
   where s.alert_key in (select x->>'alert_key' from jsonb_array_elements(v_due) x);

  return jsonb_build_object(
    'alerts', v_due,
    'recipients', coalesce((select jsonb_agg(p.email order by p.email)
                              from profiles p join roles r on r.id = p.role_id
                             where r.is_super and p.status = 'active'), '[]'::jsonb));
end;
$$;

revoke all on function public.integration_alerts_compute() from public, anon, authenticated;
revoke all on function public.integration_alerts_to_notify() from public, anon, authenticated;
revoke all on function public.integration_alerts() from public, anon;
grant execute on function public.integration_alerts() to authenticated;
grant execute on function public.integration_alerts_to_notify() to service_role;
