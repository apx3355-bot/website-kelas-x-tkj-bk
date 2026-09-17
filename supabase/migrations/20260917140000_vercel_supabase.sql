create extension if not exists pgcrypto;

create type public.app_role as enum ('developer', 'wali_kelas', 'murid');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_.-]{3,32}$'),
  role public.app_role not null default 'murid',
  nama text not null check (char_length(nama) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.member_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  nama_lengkap text not null check (char_length(nama_lengkap) between 1 and 120),
  kelas text not null default 'X TKJ' check (char_length(kelas) between 1 and 80),
  jabatan text not null default '' check (char_length(jabatan) <= 80),
  bio text not null default '',
  photo_url text,
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 10000),
  image_url text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.class_info (
  id smallint primary key default 1 check (id = 1),
  title text not null,
  content text not null,
  updated_at timestamptz not null default now()
);
insert into public.class_info (id, title, content) values (1, 'Satu Kelas, Satu Tim', 'Website ini dibuat sebagai pusat informasi digital KELAS X TKJ.') on conflict (id) do nothing;

create table public.class_schedule (
  day text primary key check (day in ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu')),
  subjects text not null default ''
);
insert into public.class_schedule (day, subjects) values
  ('Senin', 'Matematika • Bahasa Indonesia'), ('Selasa', 'Bahasa Inggris • Informatika'),
  ('Rabu', 'IPA • Pendidikan Jasmani'), ('Kamis', 'IPS • Bahasa Indonesia'),
  ('Jumat', 'Pendidikan Agama • Seni'), ('Sabtu', 'Kegiatan Kelas • Ekstrakurikuler')
on conflict (day) do nothing;

create table public.class_structure (
  position text primary key check (position in ('wali_kelas', 'ketua', 'wakil', 'sekretaris')),
  user_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.class_structure (position) values ('wali_kelas'), ('ketua'), ('wakil'), ('sekretaris') on conflict do nothing;

create table public.class_gallery (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  photo_url text not null,
  uploaded_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;
create or replace function public.can_manage() returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() in ('developer', 'wali_kelas')
$$;
create or replace function public.is_developer() returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'developer'
$$;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger member_profiles_updated_at before update on public.member_profiles for each row execute function public.set_updated_at();
create trigger class_info_updated_at before update on public.class_info for each row execute function public.set_updated_at();
create trigger class_structure_updated_at before update on public.class_structure for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.member_profiles enable row level security;
alter table public.announcements enable row level security;
alter table public.class_info enable row level security;
alter table public.class_schedule enable row level security;
alter table public.class_structure enable row level security;
alter table public.class_gallery enable row level security;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-media', 'class-media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "public reads class media" on storage.objects for select using (bucket_id = 'class-media');
create policy "managers upload class media" on storage.objects for insert with check (bucket_id = 'class-media' and public.can_manage());
create policy "owners upload profile media" on storage.objects for insert with check (bucket_id = 'class-media' and (public.can_manage() or name like 'profiles/' || auth.uid()::text || '/%'));
create policy "owners update class media" on storage.objects for update using (bucket_id = 'class-media' and (public.can_manage() or owner_id = auth.uid())) with check (bucket_id = 'class-media' and (public.can_manage() or owner_id = auth.uid()));
create policy "owners delete class media" on storage.objects for delete using (bucket_id = 'class-media' and (public.can_manage() or owner_id = auth.uid()));

create or replace function public.register_member(p_username text, p_nama text, p_kelas text, p_bio text default '') returns uuid language plpgsql security definer set search_path = public, auth as $$
declare new_user_id uuid; normalized_username text := lower(trim(p_username));
begin
  if char_length(trim(p_nama)) = 0 or char_length(trim(p_kelas)) = 0 or normalized_username !~ '^[a-z0-9_.-]{3,32}$' then raise exception 'Data pendaftaran tidak valid'; end if;
  if (select count(*) from public.users where role = 'murid') >= 30 then raise exception 'Kuota 30 anggota sudah penuh'; end if;
  if exists (select 1 from public.users where username = normalized_username) then raise exception 'Username sudah digunakan'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', normalized_username || '@members.local', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', normalized_username)) returning id into new_user_id;
  insert into public.users (id, username, role, nama) values (new_user_id, normalized_username, 'murid', trim(p_nama));
  insert into public.member_profiles (user_id, nama_lengkap, kelas, bio) values (new_user_id, trim(p_nama), trim(p_kelas), trim(p_bio));
  return new_user_id;
end $$;
revoke all on function public.register_member(text, text, text, text) from public, anon, authenticated;
