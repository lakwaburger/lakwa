-- ============================================================================
-- Photo uploads from the staff dashboard (menu photos, GCash QR).
-- Public bucket "site-images": anyone can view, only admins can upload / replace / delete.
-- Run AFTER 20261104000800_site_url_lakwaburger.sql. Safe to re-run.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload site images" on storage.objects;
create policy "Admins upload site images" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-images' and public.is_admin());

drop policy if exists "Admins update site images" on storage.objects;
create policy "Admins update site images" on storage.objects for update to authenticated
  using (bucket_id = 'site-images' and public.is_admin()) with check (bucket_id = 'site-images' and public.is_admin());

drop policy if exists "Admins delete site images" on storage.objects;
create policy "Admins delete site images" on storage.objects for delete to authenticated
  using (bucket_id = 'site-images' and public.is_admin());

-- Staff (not just admins) can list the bucket in the dashboard.
drop policy if exists "Staff list site images" on storage.objects;
create policy "Staff list site images" on storage.objects for select to authenticated
  using (bucket_id = 'site-images' and public.is_staff());
