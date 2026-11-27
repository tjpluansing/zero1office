-- Zero1Office DEMO | LIVE switch (2026-11-27). Paste into Supabase > SQL Editor and run once. Safe to run again.
-- Lets people who are not signed in read the demo settings (on/off and which pages show), and nothing else.
-- Only Super Admins can change them (Settings > Demo mode in the app). The same lines are in supabase.sql.

create or replace function public.z1_demo() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('on', coalesce((data->>'on')::boolean, true), 'pages', data->'pages')
    from app_docs where path = 'meta/demo'
$$;
revoke all on function public.z1_demo() from public;
grant execute on function public.z1_demo() to anon, authenticated;

create or replace function public.z1_guard_demo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.z1_trusted', true) = 'on' then return coalesce(new, old); end if;
  if coalesce(new.path, old.path) = 'meta/demo' and not z1_admin() then
    raise exception 'Only a Super Admin can change the demo settings' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists z1_guard_demo on public.app_docs;
create trigger z1_guard_demo before insert or update or delete on public.app_docs
  for each row execute function public.z1_guard_demo();
