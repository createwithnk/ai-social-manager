alter table public.posts add column media jsonb;
alter table public.posts add constraint posts_media_owner check (
  media is null or (
    jsonb_typeof(media) = 'object'
    and media ?& array['path', 'name', 'type', 'size']
    and jsonb_typeof(media->'path') = 'string'
    and jsonb_typeof(media->'name') = 'string'
    and jsonb_typeof(media->'size') = 'number'
    and (media->>'size')::numeric > 0
    and (media->>'size')::numeric <= 26214400
    and split_part(media->>'path', '/', 1) = user_id::text
    and media->>'type' in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4')
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners upload private post media" on storage.objects
for insert to authenticated with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owners view private post media" on storage.objects
for select to authenticated using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owners delete private post media" on storage.objects
for delete to authenticated using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
