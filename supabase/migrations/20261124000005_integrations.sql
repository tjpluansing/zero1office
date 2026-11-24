-- =====================================================================
-- Integrations (Admin → Integrations)
--
-- One row per outside service. Non-secret settings live in `config`;
-- the API key / client secret lives in Supabase Vault (encrypted at rest)
-- and is never sent back to the browser. Only the server (Edge Functions,
-- service role) can read it, to test the connection or sync.
--
-- Permissions: integrations.view / integrations.edit. Both are sensitive,
-- so they need a two-step-verified session, and only Super Admins have
-- them by default.
-- =====================================================================

insert into public.permissions (key, page, page_label, action, description, sort) values
  ('integrations.view', 'integrations', 'Integrations', 'view', 'See connected services and their status', 75),
  ('integrations.edit', 'integrations', 'Integrations', 'edit', 'Connect, change keys, test or disconnect services', 76);

create or replace function public.is_sensitive_permission(p_key text)
returns boolean
language sql immutable
as $$
  select split_part(p_key, '.', 1) in ('admin_users', 'admin_settings', 'integrations')
      or split_part(p_key, '.', 2) = 'export';
$$;

create table public.integrations (
  id              text primary key check (id in ('ghl', 'm365', 'anthropic')),
  name            text not null,
  enabled         boolean not null default false,
  config          jsonb not null default '{}'::jsonb,
  secret_id       uuid,                 -- vault.secrets.id
  secret_hint     text,                 -- last 4 characters, for "•••• abcd"
  status          text not null default 'not_connected'
                    check (status in ('not_connected', 'untested', 'connected', 'error', 'paused')),
  last_tested_at  timestamptz,
  last_test_ok    boolean,
  last_error      text,
  last_details    jsonb not null default '{}'::jsonb,
  secret_set_at   timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

insert into public.integrations (id, name) values
  ('ghl', 'GoHighLevel'),
  ('m365', 'Microsoft 365'),
  ('anthropic', 'Claude API');

-- Which config keys each service accepts (anything else is rejected).
create or replace function public.integration_allowed_keys(p_id text)
returns text[]
language sql immutable
as $$
  select case p_id
    when 'ghl'       then array['location_id', 'sync_contacts', 'sync_conversations', 'webhook_enabled']
    when 'm365'      then array['tenant_id', 'client_id', 'mailbox', 'send_email', 'read_calendar']
    when 'anthropic' then array['default_model', 'monthly_budget_usd']
  end;
$$;

create or replace function public.integration_save(
  p_id text, p_config jsonb, p_secret text default null, p_enabled boolean default null)
returns void
language plpgsql security definer set search_path = public, vault
as $$
declare
  v_row     integrations;
  v_bad     text[];
  v_changed text[];
  v_secret  text := nullif(trim(coalesce(p_secret, '')), '');
begin
  if not has_permission('integrations.edit') then
    raise exception 'You do not have permission to change integrations' using errcode = '42501';
  end if;
  select * into v_row from integrations where id = p_id for update;
  if not found then
    raise exception 'Unknown integration %', p_id using errcode = '22023';
  end if;

  select array_agg(k) into v_bad
  from jsonb_object_keys(coalesce(p_config, '{}'::jsonb)) k
  where not (k = any (integration_allowed_keys(p_id)));
  if v_bad is not null then
    raise exception 'Unknown setting(s): %', array_to_string(v_bad, ', ') using errcode = '22023';
  end if;
  if v_secret is not null and length(v_secret) < 16 then
    raise exception 'That key looks too short. Paste the whole value.' using errcode = '22023';
  end if;

  select array_agg(k) into v_changed
  from (select key k from jsonb_each(coalesce(p_config, '{}'::jsonb))
        where v_row.config->key is distinct from value) c;

  if v_secret is not null then
    if v_row.secret_id is null then
      v_row.secret_id := vault.create_secret(v_secret, 'integration_' || p_id,
                                             'zero1office ' || v_row.name || ' key');
    else
      perform vault.update_secret(v_row.secret_id, v_secret);
    end if;
  end if;

  update integrations set
    config        = coalesce(p_config, config),
    enabled       = coalesce(p_enabled, enabled),
    secret_id     = v_row.secret_id,
    secret_hint   = case when v_secret is not null then right(v_secret, 4) else secret_hint end,
    secret_set_at = case when v_secret is not null then now() else secret_set_at end,
    -- new credentials or settings must be tested again
    status        = case
                      when v_row.secret_id is null then 'not_connected'
                      when coalesce(p_enabled, enabled) = false then 'paused'
                      when v_secret is not null or v_changed is not null then 'untested'
                      when status = 'paused' then 'untested'
                      else status end,
    last_error    = case when v_secret is not null or v_changed is not null
                         then 'Not tested since the last change' else last_error end,
    updated_at    = now(),
    updated_by    = auth.uid()
  where id = p_id;

  insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()), 'integration.updated',
          'integration', p_id,
          jsonb_build_object('settings_changed', coalesce(to_jsonb(v_changed), '[]'::jsonb),
                             'key_replaced', v_secret is not null,
                             'enabled', p_enabled));
end;
$$;

create or replace function public.integration_disconnect(p_id text)
returns void
language plpgsql security definer set search_path = public, vault
as $$
declare
  v_secret uuid;
begin
  if not has_permission('integrations.edit') then
    raise exception 'You do not have permission to change integrations' using errcode = '42501';
  end if;
  select secret_id into v_secret from integrations where id = p_id;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  update integrations set secret_id = null, secret_hint = null, secret_set_at = null, enabled = false,
         status = 'not_connected', last_error = null, last_test_ok = null, updated_at = now(),
         updated_by = auth.uid()
   where id = p_id;
  insert into audit_log (actor_id, actor_email, action, target_type, target_id)
  values (auth.uid(), (select email from profiles where id = auth.uid()), 'integration.disconnected',
          'integration', p_id);
end;
$$;

-- Server only: read the decrypted key.
create or replace function public.integration_secret(p_id text)
returns text
language sql stable security definer set search_path = public, vault
as $$
  select ds.decrypted_secret
  from integrations i join vault.decrypted_secrets ds on ds.id = i.secret_id
  where i.id = p_id;
$$;

-- Server only: record a connection test.
create or replace function public.integration_record_test(
  p_id text, p_actor uuid, p_ok boolean, p_error text, p_details jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update integrations set
    last_tested_at = now(), last_test_ok = p_ok, last_error = case when p_ok then null else p_error end,
    last_details = coalesce(p_details, '{}'::jsonb),
    status = case when not enabled then 'paused' when p_ok then 'connected' else 'error' end
  where id = p_id;
  insert into audit_log (actor_id, actor_email, action, target_type, target_id, details)
  values (p_actor, (select email from profiles where id = p_actor), 'integration.tested', 'integration', p_id,
          jsonb_build_object('ok', p_ok, 'error', p_error));
end;
$$;

alter table public.integrations enable row level security;
revoke all on public.integrations from anon, authenticated;
grant select (id, name, enabled, config, secret_hint, status, last_tested_at, last_test_ok, last_error,
              last_details, secret_set_at, updated_at, updated_by)
  on public.integrations to authenticated;
create policy integrations_read on public.integrations for select to authenticated
  using (public.has_permission('integrations.view'));

revoke all on function public.integration_save(text, jsonb, text, boolean) from public, anon;
revoke all on function public.integration_disconnect(text) from public, anon;
revoke all on function public.integration_secret(text) from public, anon, authenticated;
revoke all on function public.integration_record_test(text, uuid, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.integration_save(text, jsonb, text, boolean) to authenticated;
grant execute on function public.integration_disconnect(text) to authenticated;
grant execute on function public.integration_secret(text) to service_role;
grant execute on function public.integration_record_test(text, uuid, boolean, text, jsonb) to service_role;
