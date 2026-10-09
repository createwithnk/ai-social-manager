-- Admin-only READ-ONLY review. This is not a deletion list or a public RPC.
-- Every publication snapshot is retained, including terminal/uncertain jobs.
-- Do not reuse the result for deletion: references can change after this query.
with inventory as (
  select o.id, o.bucket_id, o.name, o.created_at, o.updated_at,
    o.metadata->>'mimetype' as mime_type,
    case when coalesce(o.metadata->>'size','') ~ '^[0-9]{1,10}$'
      then (o.metadata->>'size')::bigint else null end as size_bytes,
    (select count(*) from public.posts p where p.media->>'path' = o.name) as post_references,
    (select count(*) from public.publication_jobs j where j.snapshot->'media'->>'path' = o.name) as job_references,
    exists(select 1 from auth.users u where u.id::text = split_part(o.name,'/',1)) as owner_exists
  from storage.objects o where o.bucket_id = 'post-media'
), reviewed as (
  select *, case
    when post_references > 0 or job_references > 0 then 'keep_referenced'
    when size_bytes = 0 or name ~ '(^|/)\.emptyFolderPlaceholder$' or right(name,1) = '/' then 'keep_placeholder'
    when name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,150}$'
      or not owner_exists or size_bytes is null or size_bytes not between 1 and 10485760
      or mime_type is null or mime_type not in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg')
      or created_at is null or updated_at is null or created_at > now() or updated_at > now() or updated_at < created_at
      then 'manual_review'
    when greatest(created_at,updated_at) > now() - interval '7 days' then 'keep_recent'
    else 'review_candidate'
  end as review_status from inventory
)
select id, bucket_id, name, mime_type, size_bytes, created_at, updated_at,
  post_references, job_references, owner_exists, review_status,
  false as deletion_authorized
from reviewed order by review_status, name, id;
