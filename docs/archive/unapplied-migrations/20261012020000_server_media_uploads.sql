-- Direct client uploads are removed: every new object must pass the Edge signature checks.
drop policy "AasiFlow media upload own folder" on storage.objects;

create table public.media_upload_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null unique,
  bytes integer not null check (bytes between 1 and 52428800),
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  created_at timestamptz not null default now()
);
create index media_upload_attempts_user_created_idx on public.media_upload_attempts(user_id, created_at);
alter table public.media_upload_attempts enable row level security;
revoke all on public.media_upload_attempts from public, anon, authenticated;
grant select on public.media_upload_attempts to authenticated;
create policy "Read own media attempts" on public.media_upload_attempts for select to authenticated using (auth.uid() = user_id);

create function public.reserve_media_upload(p_user_id uuid, p_bytes integer, p_extension text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt_id uuid := gen_random_uuid(); object_path text; stored_bytes bigint; pending_bytes bigint; attempts integer;
begin
  if p_bytes is null or p_bytes < 1 or p_bytes > 52428800 or p_extension is null or p_extension not in ('jpg','png','webp','mp4','webm') then
    raise exception 'Invalid media reservation' using errcode = '23514';
  end if;
  if p_extension in ('jpg','png','webp') and p_bytes > 10485760 then
    raise exception 'Image too large' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select count(*) into attempts from public.media_upload_attempts
    where user_id = p_user_id and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  if attempts >= 5 then return null; end if;
  select coalesce(sum(coalesce((metadata->>'size')::bigint, 52428800)),0) into stored_bytes from storage.objects
    where bucket_id = 'aasiflow-media' and (storage.foldername(name))[1] = p_user_id::text;
  select coalesce(sum(bytes),0) into pending_bytes from public.media_upload_attempts
    where user_id = p_user_id and status = 'pending' and created_at > now() - interval '1 hour';
  if stored_bytes + pending_bytes + p_bytes > 104857600 then return null; end if;
  object_path := p_user_id::text || '/' || attempt_id::text || '.' || p_extension;
  insert into public.media_upload_attempts(id,user_id,path,bytes) values(attempt_id,p_user_id,object_path,p_bytes);
  return jsonb_build_object('id', attempt_id, 'path', object_path);
end;
$$;
create function public.finish_media_upload(p_id uuid, p_succeeded boolean) returns void
language sql security definer set search_path = '' as $$
  update public.media_upload_attempts set status = case when p_succeeded then 'ready' else 'failed' end where id = p_id and status = 'pending';
$$;
revoke all on function public.reserve_media_upload(uuid,integer,text) from public, anon, authenticated;
revoke all on function public.finish_media_upload(uuid,boolean) from public, anon, authenticated;
grant execute on function public.reserve_media_upload(uuid,integer,text) to service_role;
grant execute on function public.finish_media_upload(uuid,boolean) to service_role;
