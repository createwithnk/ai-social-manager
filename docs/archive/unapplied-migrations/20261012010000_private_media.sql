-- Private media only. Do not modify an unrelated pre-existing bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aasiflow-media', 'aasiflow-media', false, 52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm']);

create policy "AasiFlow media read own folder" on storage.objects for select
to authenticated using (bucket_id = 'aasiflow-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "AasiFlow media upload own folder" on storage.objects for insert
to authenticated with check (bucket_id = 'aasiflow-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "AasiFlow media delete own folder" on storage.objects for delete
to authenticated using (bucket_id = 'aasiflow-media' and (storage.foldername(name))[1] = auth.uid()::text);
-- No UPDATE/upsert policy: existing objects cannot be silently replaced or moved.
