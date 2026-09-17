-- STEP 3: Konfigurasi Storage Bucket 'class-media' dan akses upload
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-media', 'class-media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public reads class media" on storage.objects;
drop policy if exists "managers upload class media" on storage.objects;
drop policy if exists "owners upload profile media" on storage.objects;
drop policy if exists "owners update class media" on storage.objects;
drop policy if exists "owners delete class media" on storage.objects;

create policy "public reads class media" on storage.objects for select using (bucket_id = 'class-media');
create policy "managers upload class media" on storage.objects for insert with check (bucket_id = 'class-media' and public.can_manage());
create policy "owners upload profile media" on storage.objects for insert with check (bucket_id = 'class-media' and (public.can_manage() or name like 'profiles/' || auth.uid()::text || '/%'));
create policy "owners update class media" on storage.objects for update using (bucket_id = 'class-media' and (public.can_manage() or owner_id = auth.uid())) with check (bucket_id = 'class-media' and (public.can_manage() or owner_id = auth.uid()));
create policy "owners delete class media" on storage.objects for delete using (bucket_id = 'class-media' and (public.can_manage() or owner_id = auth.uid()));
