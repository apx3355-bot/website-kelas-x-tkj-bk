-- STEP 2: Fungsi pembantu, trigger updated_at, dan policy keamanan RLS
create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.can_manage() returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() in ('developer', 'wali_kelas')
$$;

create or replace function public.is_developer() returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'developer'
$$;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists member_profiles_updated_at on public.member_profiles;
create trigger member_profiles_updated_at before update on public.member_profiles for each row execute function public.set_updated_at();

drop trigger if exists class_info_updated_at on public.class_info;
create trigger class_info_updated_at before update on public.class_info for each row execute function public.set_updated_at();

drop trigger if exists class_structure_updated_at on public.class_structure;
create trigger class_structure_updated_at before update on public.class_structure for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.member_profiles enable row level security;
alter table public.announcements enable row level security;
alter table public.class_info enable row level security;
alter table public.class_schedule enable row level security;
alter table public.class_structure enable row level security;
alter table public.class_gallery enable row level security;

-- Hapus policy lama jika sudah ada agar tidak error duplicate
drop policy if exists "public reads users" on public.users;
drop policy if exists "public reads profiles" on public.member_profiles;
drop policy if exists "public reads active announcements" on public.announcements;
drop policy if exists "public reads class info" on public.class_info;
drop policy if exists "public reads schedule" on public.class_schedule;
drop policy if exists "public reads structure" on public.class_structure;
drop policy if exists "public reads gallery" on public.class_gallery;
drop policy if exists "users update own profile" on public.member_profiles;
drop policy if exists "managers update profiles" on public.member_profiles;
drop policy if exists "managers write announcements" on public.announcements;
drop policy if exists "managers update class info" on public.class_info;
drop policy if exists "managers update schedule" on public.class_schedule;
drop policy if exists "managers update structure" on public.class_structure;
drop policy if exists "managers write gallery" on public.class_gallery;

create policy "public reads users" on public.users for select using (true);
create policy "public reads profiles" on public.member_profiles for select using (true);
create policy "public reads active announcements" on public.announcements for select using (expires_at is null or expires_at > now());
create policy "public reads class info" on public.class_info for select using (true);
create policy "public reads schedule" on public.class_schedule for select using (true);
create policy "public reads structure" on public.class_structure for select using (true);
create policy "public reads gallery" on public.class_gallery for select using (true);
create policy "users update own profile" on public.member_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "managers update profiles" on public.member_profiles for update using (public.can_manage()) with check (public.can_manage());
create policy "managers write announcements" on public.announcements for all using (public.can_manage()) with check (public.can_manage());
create policy "managers update class info" on public.class_info for update using (public.can_manage()) with check (public.can_manage());
create policy "managers update schedule" on public.class_schedule for update using (public.can_manage()) with check (public.can_manage());
create policy "managers update structure" on public.class_structure for update using (public.can_manage()) with check (public.can_manage());
create policy "managers write gallery" on public.class_gallery for all using (public.can_manage()) with check (public.can_manage());
