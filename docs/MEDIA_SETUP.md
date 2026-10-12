# Private media setup — not deployed

The library supports JPEG/PNG/WebP images up to 10 MiB and MP4/WebM videos up to 50 MiB. The private `aasiflow-media` bucket has exact MIME restrictions and a 50 MiB bucket cap. The `upload-media` Edge Function verifies an email-authenticated user, reads a bounded binary body, validates media signatures, and reserves owner-specific capacity before a server-only upload.

Apply migrations in order only on the owner-confirmed project, after release approval. The final migration removes direct authenticated upload permission; old clients must use the new function. Existing objects and read/delete permissions remain owner-scoped by path. Supabase's actual byte limits and any other existing Storage policies must be audited on the confirmed project.

Required server environment: built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the same exact `ALLOWED_ORIGINS` used by the generator. Keep gateway JWT verification enabled and verify preflight behavior in the actual runtime. Never copy the service-role key into Vite, Git, logs or chat.

Each verified user is limited to five upload attempts per UTC day and 100 MiB of stored plus pending media. Failed storage attempts still count toward daily attempts; malformed inputs do not. Database reservations use a per-user transaction lock and account for pending uploads so overlapping requests cannot over-reserve capacity. Pending entries conservatively expire after one hour if completion tracking fails. Refresh the library before retrying uncertain uploads. Missing legacy object-size metadata counts as 50 MiB, avoiding an optimistic allowance.

The client supplies no storage path or user ID to the function. Database reservations derive opaque filenames from the verified user. Objects cannot be replaced with upsert. The library previews via five-minute signed URLs, which are bearer credentials: never log or share them. User-confirmed deletion is performed through owner-scoped Storage access; usage calculation reads actual remaining objects.

Signature validation checks known headers; it does not decode every image/video container, validate codecs, or scan malware. Add a quarantine/scanning pipeline and monitor abuse before public uploads. No customer files, live Storage settings, or remote migrations were changed during local testing.

See Supabase's [private bucket model](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [file limits](https://supabase.com/docs/guides/storage/uploads/file-limits) for runtime controls that still need hosted verification.
