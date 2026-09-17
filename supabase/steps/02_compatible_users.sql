-- STEP 2: RLS helpers for legacy public.users (id bigint, auth_user_id uuid).
create or replace function public.current_role() returns text language sql stable security definer set search_path = public as $$
  select role::text from public.users where auth_user_id = auth.uid() limit 1
$$;
create or replace function public.can_manage() returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() in ('developer', 'wali_kelas')
$$;
create or replace function public.is_developer() returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'developer'
$$;
alter table public.users enable row level security;
drop policy if exists "public reads users" on public.users;
create policy "public reads users" on public.users for select using (true);
