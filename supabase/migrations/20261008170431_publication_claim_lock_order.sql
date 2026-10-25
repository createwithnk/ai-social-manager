-- Fix editor/worker lock inversion without enabling publishing or billing.
-- Editors and enqueue_publication lock the post before its queued job.
create or replace function private.service_claim_publication() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.publication_jobs;
begin
  if not coalesce((select publishing_enabled from private.launch_controls where singleton),false) then return null; end if;
  -- Another worker may already be reconciling a lost lease. Do not wait for it.
  with expired as (
    select id from public.publication_jobs where status='processing' and lease_until < now()
    for update skip locked
  )
  update public.publication_jobs q set status='uncertain',error_code='worker_lease_expired',lease_until=null
  from expired e where q.id=e.id;
  -- A deleted post cannot be dispatched; no post lock exists for an orphan.
  with orphaned as (
    select id from public.publication_jobs where status='queued' and post_id is null and due_at <= now()
    for update skip locked
  )
  update public.publication_jobs q set status='cancelled',error_code='approval_changed'
  from orphaned o where q.id=o.id;
  -- Lock the post first, and skip a row an editor or another worker holds.
  select q.* into j from public.publication_jobs q join public.posts p on p.id=q.post_id
  where q.status='queued' and q.due_at <= now()
  order by q.due_at,q.id for update of p skip locked limit 1;
  if j.id is null then return null; end if;
  -- Cancellation can lock just the job. Recheck its current state without waiting.
  select q.* into j from public.publication_jobs q
  where q.id=j.id and q.status='queued' and q.due_at <= now()
  for update skip locked;
  if j.id is null then return null; end if;
  perform 1 from public.posts where id=j.post_id and revision=j.post_revision and status in ('approved','scheduled');
  if not found then update public.publication_jobs set status='cancelled',error_code='approval_changed' where id=j.id; return null; end if;
  if not exists(select 1 from public.social_connections where id=j.connection_id and user_id=j.user_id and status='connected' and expires_at > now()) then
    update public.publication_jobs set status='failed',error_code='connection_expired' where id=j.id; return null;
  end if;
  update public.publication_jobs set status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1
  where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;
revoke all on function private.service_claim_publication() from public,anon,authenticated;
grant execute on function private.service_claim_publication() to service_role;
