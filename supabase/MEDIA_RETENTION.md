# Private media retention

The current implementation uploads to a private bucket, limits each object to 10 MB and the bucket to 80 objects (20 per user), uses random immutable paths, and does not grant user DELETE/overwrite permission. Removing or replacing an editor attachment clears the draft reference; it does not remove the stored bytes. Quotas still count those bytes/metadata, so a retention workflow is needed before public signup.

## Read-only inventory now available

Run `media-inventory.sql` only through the authorized administrator SQL interface. It reads storage metadata, all draft/approved/scheduled references and **every publication snapshot**, including queued, processing, published, failed, cancelled and uncertain records. A missing/deleted post does not make a snapshot's attachment safe to remove. It preserves referenced files and folder placeholders, excludes recent files for at least seven days from their last metadata update, and requires operator review for unknown size/MIME/path/owner/timestamps. Even a `review_candidate` has `deletion_authorized=false`.

This query does not read/download file bytes, request signed links, edit/delete metadata, change RLS, install a function, schedule a worker, or call Storage. Do not expose its cross-user results to the client or include full owner/path rows in public reports. The local suite verifies classification plus authenticated/anonymous denial. The 9 October hosted inventory contained one original zero-byte placeholder and no review candidates; it was retained.

## Complete before any automatic deletion

An age/reference query alone has a race: a draft can reference a candidate after inspection and before the Storage delete. The live schema has no tombstone/quarantine guard, so **no delete command is provided**.

1. Prepare an app-owned private quarantine/tombstone table with RLS default-deny, narrow service-only invoker/definer interfaces and an empty definer search path. Keep Storage's provider-owned schema read-only. Generate its migration with the Supabase CLI and reconcile the existing live migration history before application.
2. Serialize quarantine with every new/changed draft media reference and every job snapshot reference using the same per-object lock order. Reject a missing or quarantined attachment. Prove both interleavings on independent native PostgreSQL connections: a committed reference protects the file, and an earlier quarantine prevents a new reference. Do not infer concurrency safety from PGlite's single connection.
3. Quarantine only valid, aged, genuinely unreferenced objects from an exact owner/path review, store immutable object identity/version and a batch lease, and wait a further review grace period. Never quarantine placeholders or unknown/unowned metadata automatically. Prevent authenticated upload of a reused tombstoned path.
4. Require the approved server worker gate and constant-time authenticated operator/worker secret before external deletion. Recheck identity/version/references and the lease, delete exact object paths **through Supabase Storage's API**, verify the outcome, and retain the tombstone/audit outcome. Deleting a `storage.objects` row through SQL would leave backend bytes orphaned and is prohibited.
5. On network timeout, ambiguous Storage outcome, a lost lease or crash before finalization, record uncertainty and reconcile through actual Storage object lookup. Keep references blocked and do not release/reuse the path. A new worker must not blindly repeat an external delete against a replacement object.
6. Exercise real Storage upload/byte deletion in an isolated test project through its approved admin credential flow, including concurrent attach/quarantine, replay, incomplete batches and restart recovery. Never extract the production service key through SQL or put it in source/client/chat. No Cron schedule or production cleanup worker exists yet.

The owner has authorized continued development and cleanup of the disabled disposable Auth fixture when appropriate. That fixture is a separate account/session task, not permission to delete arbitrary user media. No automatic retention guarantee, Storage cleanup activation, or deletion is claimed by this inventory.

References: [Storage schema is read-only](https://supabase.com/docs/guides/storage/schema/design), [delete objects through Storage](https://supabase.com/docs/guides/storage/management/delete-objects), [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html), [application consistency](https://www.postgresql.org/docs/17/applevel-consistency.html).
