revoke all on public.posts from anon, public;
revoke truncate, references, trigger on public.posts from authenticated;
grant select, insert, update, delete on public.posts to authenticated;
alter policy "Users can read their own posts" on public.posts using ((select auth.uid()) = user_id);
alter policy "Users can create their own posts" on public.posts with check ((select auth.uid()) = user_id);
alter policy "Users can update their own posts" on public.posts using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can delete their own posts" on public.posts using ((select auth.uid()) = user_id);
alter table public.posts add column if not exists media jsonb;
alter table public.posts add column if not exists language text not null default 'English';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 10485760, array['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "Read own media" on storage.objects for select to authenticated using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own media" on storage.objects for insert to authenticated with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- An atomic daily quota prevents concurrent requests from bypassing the limit.
create table public.ai_usage (user_id uuid references auth.users(id) on delete cascade, day date not null, calls integer not null default 0, primary key(user_id, day));
alter table public.ai_usage enable row level security;
create policy "Read own usage" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_usage from public, anon, authenticated;
grant select on public.ai_usage to authenticated;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.consume_ai_quota() returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then return false; end if;
  insert into public.ai_usage (user_id, day, calls) values (auth.uid(), (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1 where public.ai_usage.calls < 20
  returning calls into n;
  return n is not null;
end; $$;
revoke all on function private.consume_ai_quota() from public, anon;
grant execute on function private.consume_ai_quota() to authenticated;
create or replace function public.consume_ai_quota() returns boolean
language sql security invoker set search_path = '' as $$
  select private.consume_ai_quota();
$$;
revoke all on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;

-- Existing legacy rows are tolerated; all new writes must obey these checks.
alter table public.posts add constraint post_schedule_consistency check ((status = 'scheduled' and scheduled_for is not null) or (status <> 'scheduled' and scheduled_for is null)) not valid;
alter table public.posts add constraint post_media_owner check (media is null or (jsonb_typeof(media) = 'object' and media ? 'path' and split_part(media->>'path', '/', 1) = user_id::text)) not valid;
create or replace function public.guard_post_edit() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'scheduled' and (tg_op = 'INSERT' or new.scheduled_for is distinct from old.scheduled_for or old.status <> 'scheduled') and new.scheduled_for <= now() then
    raise exception 'Choose a future schedule';
  end if;
  if tg_op = 'UPDATE' and old.status in ('approved','scheduled') and
    (new.caption, new.hashtags, new.idea, new.platform, new.tone, new.media, new.language) is distinct from
    (old.caption, old.hashtags, old.idea, old.platform, old.tone, old.media, old.language) then
    new.status := 'draft'; new.scheduled_for := null;
  end if;
  return new;
end; $$;
create trigger guard_post_edit before insert or update on public.posts for each row execute function public.guard_post_edit();
