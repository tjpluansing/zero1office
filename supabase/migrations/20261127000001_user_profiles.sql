-- My profile: each person keeps their own job title and mobile number.
-- Name, title and mobile are the only fields a person can change on their own row
-- (guard_profiles still blocks role and status changes on your own account).
alter table public.profiles
  add column job_title text not null default '' check (char_length(job_title) <= 80),
  add column phone     text not null default '' check (phone ~ '^[0-9+() -]{0,20}$');

alter table public.profiles
  add constraint profiles_full_name_len check (char_length(full_name) <= 80);

grant update (job_title, phone) on public.profiles to authenticated;

-- One call for the profile page: your row plus the pages you can open.
create or replace function public.my_profile()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'full_name', p.full_name,
    'job_title', p.job_title, 'phone', p.phone,
    'role_id', p.role_id, 'role_name', r.name, 'is_super', r.is_super,
    'last_login_at', p.last_login_at, 'created_at', p.created_at)
  from profiles p join roles r on r.id = p.role_id
  where p.id = auth.uid()
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
