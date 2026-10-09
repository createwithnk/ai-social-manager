-- Prepared locally with `supabase migration new media_quarantine`.
-- No gate is enabled, Storage record changed, worker scheduled or live migration applied.
alter table private.launch_controls add column media_retention_enabled boolean not null default false;
create table private.media_quarantine (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null unique,
  bucket_id text not null default 'post-media' check(bucket_id='post-media'),
  name text not null unique,
  owner_id uuid not null,
  object_version text not null,
  object_metadata jsonb not null,
  object_created_at timestamptz not null,
  object_updated_at timestamptz not null,
  quarantined_at timestamptz not null default now(),
  delete_after timestamptz not null default now()+interval '7 days',
  status text not null default 'quarantined' check(status in ('quarantined','deleting','deleted','uncertain')),
  lease_id uuid,
  lease_until timestamptz,
  dispatched_at timestamptz,
  deleted_at timestamptz,
  error_code text,
  check(name ~ ('^'||owner_id::text||'/[A-Za-z0-9][A-Za-z0-9._-]{0,150}$')),
  check(length(object_version) between 1 and 200),
  check(delete_after >= quarantined_at + interval '7 days')
);
create index media_quarantine_due_idx on private.media_quarantine(delete_after,id) where status='quarantined';
alter table private.media_quarantine enable row level security;
revoke all on private.media_quarantine from public,anon,authenticated,service_role;

-- One bounded bucket (80 objects) uses a single lock. Only READ COMMITTED is
-- supported so each VOLATILE function query after this lock sees committed refs.
create function private.media_retention_lock() returns void
language plpgsql volatile set search_path='' as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Media reference changes require READ COMMITTED';
  end if;
  perform pg_advisory_xact_lock(179021007);
end; $$;
revoke all on function private.media_retention_lock() from public,anon,authenticated,service_role;
create function private.guard_media_reference(m jsonb,uid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare o storage.objects%rowtype;
begin
  if m is null then return; end if;
  if not private.valid_media(m,uid) then raise check_violation using message='Attachment is unavailable. Upload it again'; end if;
  perform private.media_retention_lock();
  if exists(select 1 from private.media_quarantine where name=m->>'path') then
    raise check_violation using message='Attachment is unavailable. Upload it again';
  end if;
  select * into o from storage.objects where bucket_id='post-media' and name=m->>'path';
  if not found or o.metadata->>'mimetype' is distinct from m->>'type'
      or o.metadata->>'size' is distinct from m->>'size' then
    raise check_violation using message='Attachment is unavailable. Upload it again';
  end if;
end; $$;
revoke all on function private.guard_media_reference(jsonb,uuid) from public,anon,authenticated,service_role;
create function private.guard_post_media_reference() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.media is distinct from old.media then
    perform private.guard_media_reference(new.media,new.user_id);
  end if;
  return new;
end; $$;
revoke all on function private.guard_post_media_reference() from public,anon,authenticated,service_role;
create trigger guard_post_media_reference before insert or update on public.posts
for each row execute function private.guard_post_media_reference();
create function private.guard_job_media_reference() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.snapshot->'media' is distinct from old.snapshot->'media' or new.user_id is distinct from old.user_id then
    perform private.guard_media_reference(nullif(new.snapshot->'media','null'::jsonb),new.user_id);
  end if;
  return new;
end; $$;
revoke all on function private.guard_job_media_reference() from public,anon,authenticated,service_role;
create trigger guard_job_media_reference before insert or update on public.publication_jobs
for each row execute function private.guard_job_media_reference();
create function private.media_path_available(object_name text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
  if not private.has_active_session() or auth.uid() is null or
     object_name !~ ('^'||auth.uid()::text||'/[A-Za-z0-9][A-Za-z0-9._-]{0,150}$') then return false; end if;
  perform private.media_retention_lock();
  return not exists(select 1 from private.media_quarantine where name=object_name);
end; $$;
revoke all on function private.media_path_available(text) from public,anon,service_role;
grant execute on function private.media_path_available(text) to authenticated;
alter policy "Upload own media" on storage.objects with check (
  bucket_id='post-media' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select private.media_upload_allowed()) and private.media_path_available(name)
);

create function private.service_media_retention_enabled() returns boolean
language sql volatile security definer set search_path='' as $$
  select media_retention_enabled from private.launch_controls where singleton;
$$;
revoke all on function private.service_media_retention_enabled() from public,anon,authenticated;
grant execute on function private.service_media_retention_enabled() to service_role;
create function public.service_media_retention_enabled() returns boolean
language sql volatile security invoker set search_path='' as $$ select private.service_media_retention_enabled(); $$;
revoke all on function public.service_media_retention_enabled() from public,anon,authenticated;
grant execute on function public.service_media_retention_enabled() to service_role;

create function private.service_quarantine_media(oid uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare o storage.objects%rowtype; uid uuid; q private.media_quarantine%rowtype;
begin
  if not private.service_media_retention_enabled() then return null; end if;
  perform private.media_retention_lock();
  select * into o from storage.objects where id=oid and bucket_id='post-media';
  if not found or o.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,150}$'
    or o.created_at is null or o.updated_at is null or o.updated_at < o.created_at
    or greatest(o.created_at,o.updated_at)>now()-interval '7 days'
    or o.version is null or length(o.version) not between 1 and 200
    or coalesce(o.metadata->>'size','') !~ '^[0-9]{1,8}$' then return null; end if;
  uid:=split_part(o.name,'/',1)::uuid;
  if not exists(select 1 from auth.users where id=uid)
    or not private.valid_media(jsonb_build_object('path',o.name,'name',split_part(o.name,'/',2),'type',o.metadata->>'mimetype','size',(o.metadata->>'size')::integer),uid)
    or exists(select 1 from public.posts where media->>'path'=o.name)
    or exists(select 1 from public.publication_jobs where snapshot->'media'->>'path'=o.name) then return null; end if;
  if not exists(select 1 from private.media_quarantine where object_id=oid)
    and (select count(*) from private.media_quarantine)>=10000 then raise exception 'Retention audit limit reached'; end if;
  insert into private.media_quarantine(object_id,name,owner_id,object_version,object_metadata,object_created_at,object_updated_at)
    values(o.id,o.name,uid,o.version,o.metadata,o.created_at,o.updated_at)
    on conflict do nothing;
  select * into q from private.media_quarantine where object_id=oid;
  if not found then return null; end if;
  return jsonb_build_object('id',q.id,'status',q.status,'delete_after',q.delete_after);
end; $$;
revoke all on function private.service_quarantine_media(uuid) from public,anon,authenticated;
grant execute on function private.service_quarantine_media(uuid) to service_role;
create function public.service_quarantine_media(oid uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.service_quarantine_media(oid); $$;
revoke all on function public.service_quarantine_media(uuid) from public,anon,authenticated;
grant execute on function public.service_quarantine_media(uuid) to service_role;

create function private.media_quarantine_identity_matches(q private.media_quarantine) returns boolean
language sql volatile security definer set search_path='' as $$
  select exists(select 1 from storage.objects o where o.id=q.object_id and o.bucket_id=q.bucket_id and o.name=q.name
    and o.version=q.object_version and o.metadata=q.object_metadata
    and o.created_at=q.object_created_at and o.updated_at=q.object_updated_at)
    and not exists(select 1 from public.posts p where p.media->>'path'=q.name)
    and not exists(select 1 from public.publication_jobs j where j.snapshot->'media'->>'path'=q.name);
$$;
revoke all on function private.media_quarantine_identity_matches(private.media_quarantine) from public,anon,authenticated,service_role;
create function private.service_claim_media_delete() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare q private.media_quarantine%rowtype;
begin
  if not private.service_media_retention_enabled() then return null; end if;
  perform private.media_retention_lock();
  update private.media_quarantine set status='uncertain',error_code='lease_expired'
    where status='deleting' and lease_until<=now();
  select * into q from private.media_quarantine where status='quarantined' and delete_after<=now()
    order by delete_after,id for update skip locked limit 1;
  if not found then return null; end if;
  if not private.media_quarantine_identity_matches(q) then
    update private.media_quarantine set status='uncertain',error_code='object_changed' where id=q.id;
    return null;
  end if;
  update private.media_quarantine set status='deleting',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes'
    where id=q.id returning * into q;
  return jsonb_build_object('id',q.id,'object_id',q.object_id,'bucket_id',q.bucket_id,'name',q.name,'owner_id',q.owner_id,'lease_id',q.lease_id);
end; $$;
revoke all on function private.service_claim_media_delete() from public,anon,authenticated;
grant execute on function private.service_claim_media_delete() to service_role;
create function public.service_claim_media_delete() returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.service_claim_media_delete(); $$;
revoke all on function public.service_claim_media_delete() from public,anon,authenticated;
grant execute on function public.service_claim_media_delete() to service_role;

create function private.service_begin_media_delete(qid uuid,lease uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare q private.media_quarantine%rowtype;
begin
  if not private.service_media_retention_enabled() then return false; end if;
  perform private.media_retention_lock();
  select * into q from private.media_quarantine where id=qid for update;
  if not found or q.status<>'deleting' or q.lease_id is distinct from lease or q.lease_until<=now() or q.dispatched_at is not null then return false; end if;
  if not private.media_quarantine_identity_matches(q) then
    update private.media_quarantine set status='uncertain',error_code='object_changed' where id=qid;
    return false;
  end if;
  update private.media_quarantine set dispatched_at=now() where id=qid;
  return true;
end; $$;
revoke all on function private.service_begin_media_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function private.service_begin_media_delete(uuid,uuid) to service_role;
create function public.service_begin_media_delete(qid uuid,lease uuid) returns boolean
language sql volatile security invoker set search_path='' as $$ select private.service_begin_media_delete(qid,lease); $$;
revoke all on function public.service_begin_media_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_begin_media_delete(uuid,uuid) to service_role;

create function private.service_finish_media_delete(qid uuid,lease uuid,deleted boolean) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare q private.media_quarantine%rowtype; verified boolean;
begin
  perform private.media_retention_lock();
  select * into q from private.media_quarantine where id=qid for update;
  if not found or q.lease_id is distinct from lease then return false; end if;
  if q.status='deleted' then return deleted; end if;
  if q.status<>'deleting' or q.dispatched_at is null or q.lease_until<=now() then return false; end if;
  verified:=deleted and not exists(select 1 from storage.objects where bucket_id=q.bucket_id and name=q.name);
  update private.media_quarantine set status=case when verified then 'deleted' else 'uncertain' end,
    deleted_at=case when verified then now() else null end,error_code=case when verified then null else 'storage_unconfirmed' end where id=qid;
  return verified;
end; $$;
revoke all on function private.service_finish_media_delete(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.service_finish_media_delete(uuid,uuid,boolean) to service_role;
create function public.service_finish_media_delete(qid uuid,lease uuid,deleted boolean) returns boolean
language sql volatile security invoker set search_path='' as $$ select private.service_finish_media_delete(qid,lease,deleted); $$;
revoke all on function public.service_finish_media_delete(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.service_finish_media_delete(uuid,uuid,boolean) to service_role;
