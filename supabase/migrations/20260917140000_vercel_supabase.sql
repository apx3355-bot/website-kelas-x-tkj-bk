-- Compatibility migration for legacy public.users: bigint id + auth_user_id uuid.
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role' and typnamespace = 'public'::regnamespace) then
    create type public.app_role as enum ('developer', 'wali_kelas', 'murid');
  end if;
end $$;

alter table public.users add column if not exists auth_user_id uuid;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists kelas text;
alter table public.users add column if not exists jabatan text;
alter table public.users add column if not exists foto text;
create unique index if not exists users_auth_user_id_key on public.users (auth_user_id) where auth_user_id is not null;

create table if not exists public.member_profiles (
  user_id bigint primary key references public.users(id) on delete cascade,
  nama_lengkap text not null,
  kelas text not null default 'X TKJ',
  jabatan text not null default '',
  bio text not null default '',
  photo_url text,
  updated_at timestamptz not null default now()
);
create table if not exists public.announcements (id bigint generated always as identity primary key, title text not null, content text not null, image_url text, expires_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.class_info (id smallint primary key default 1 check (id = 1), title text not null, content text not null, updated_at timestamptz not null default now());
insert into public.class_info (id, title, content) values (1, 'Satu Kelas, Satu Tim', 'Website ini dibuat sebagai pusat informasi digital KELAS X TKJ.') on conflict (id) do nothing;
create table if not exists public.class_schedule (day text primary key, subjects text not null default '');
insert into public.class_schedule (day, subjects) values ('Senin', 'Matematika • Bahasa Indonesia'), ('Selasa', 'Bahasa Inggris • Informatika'), ('Rabu', 'IPA • Pendidikan Jasmani'), ('Kamis', 'IPS • Bahasa Indonesia'), ('Jumat', 'Pendidikan Agama • Seni'), ('Sabtu', 'Kegiatan Kelas • Ekstrakurikuler') on conflict (day) do nothing;
create table if not exists public.class_structure (position text primary key, user_id bigint references public.users(id) on delete set null, updated_at timestamptz not null default now());
insert into public.class_structure (position) values ('wali_kelas'), ('ketua'), ('wakil'), ('sekretaris') on conflict do nothing;
create table if not exists public.class_gallery (id bigint generated always as identity primary key, title text not null, description text not null default '', photo_url text not null, uploaded_by bigint references public.users(id) on delete cascade, created_at timestamptz not null default now());

-- Pre-existing UUID-dependent tables from the old Step 1 can only be converted safely while empty.
do $$
declare table_name text; column_name text;
begin
  foreach table_name, column_name in array array[['member_profiles', 'user_id'], ['class_structure', 'user_id'], ['class_gallery', 'uploaded_by']]
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = table_name and column_name = column_name and data_type = 'uuid') then
      execute format('select count(*) = 0 from public.%I', table_name) into strict column_name;
      if column_name::boolean then
        execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_' || (case when table_name = 'class_gallery' then 'uploaded_by' else 'user_id' end) || '_fkey');
        execute format('alter table public.%I alter column %I type bigint using null', table_name, case when table_name = 'class_gallery' then 'uploaded_by' else 'user_id' end);
        execute format('alter table public.%I add constraint %I foreign key (%I) references public.users(id) on delete %s', table_name, table_name || '_' || (case when table_name = 'class_gallery' then 'uploaded_by' else 'user_id' end) || '_fkey', case when table_name = 'class_gallery' then 'uploaded_by' else 'user_id' end, case when table_name = 'class_structure' then 'set null' else 'cascade' end);
      else
        raise exception 'public.% has UUID rows; migrate its user references before this compatibility migration', table_name;
      end if;
    end if;
  end loop;
end $$;
