-- Zero1Office: AI brain settings (Paolo, 2026-11-27: connect different AIs such as ChatGPT).
-- Settings > AI brain saves app_docs meta/ai {provider, models}. Everyone signed in may read it (the z1-ai function
-- reads it as the caller); only a Super Admin may change it. Run once in Supabase > SQL Editor.
create or replace function public.z1_guard_ai() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.z1_trusted', true) = 'on' then return coalesce(new, old); end if;
  if coalesce(new.path, old.path) = 'meta/ai' and not z1_admin() then
    raise exception 'Only a Super Admin can change the AI brain' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists z1_guard_ai on public.app_docs;
create trigger z1_guard_ai before insert or update or delete on public.app_docs
  for each row execute function public.z1_guard_ai();
